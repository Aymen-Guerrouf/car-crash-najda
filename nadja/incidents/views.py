"""HTTP endpoints (plan §5.3)."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from realtime.broadcast import broadcast

from ai import tasks as ai_tasks
from django.conf import settings

from . import lifecycle, photos, services
from .dedup import find_open_incident_near
from .enums import OPEN_STATUSES
from .models import Incident, Report
from .serializers import (
    DispatchSerializer,
    IncidentDetailSerializer,
    NearbyCheckSerializer,
    ResolveSerializer,
    IncidentSummarySerializer,
    ReportCreateSerializer,
    ReportUpdateSerializer,
)

ReportResultSerializer = inline_serializer(
    "ReportResult",
    {
        "report_id": serializers.UUIDField(),
        "incident_id": serializers.UUIDField(),
        "short_id": serializers.CharField(),
        "merged": serializers.BooleanField(help_text="true if added to an already existing incident"),
        "worst_triage": serializers.CharField(),
        "hospital": inline_serializer(
            "ReportResultHospital",
            {"id": serializers.IntegerField(), "name": serializers.CharField(), "eta_min": serializers.IntegerField(allow_null=True)},
            allow_null=True,
        ),
    },
)


@extend_schema(
    tags=["system"],
    parameters=[OpenApiParameter("warm", OpenApiTypes.INT, description="Any value: warm-up probe (Phase 5)")],
    responses=inline_serializer("Health", {"ok": serializers.BooleanField(), "time": serializers.DateTimeField()}),
)
@api_view(["GET"])
def health(request):
    """Liveness + warm-up probe: GET /api/health/ (plan §5.3).

    `?warm=1` (used 2 min before the demo) will pre-heat the AI provider
    connection in Phase 5.
    """
    payload = {"ok": True, "time": timezone.now().isoformat()}
    if "warm" in request.query_params:
        ai_tasks.warm_async()  # loads the model in the background; never blocks the probe
        payload["warm"] = True
        payload["ai_provider"] = settings.AI_PROVIDER or None
    return Response(payload)


@extend_schema(
    tags=["system"],
    request=inline_serializer("PingIn", {"from": serializers.CharField(required=False)}),
    responses=inline_serializer("PingOut", {"ok": serializers.BooleanField()}),
)
@api_view(["POST"])
def ping(request):
    """Phase 0 end-to-end test: the phone taps "Ping" and every dashboard
    client connected to /ws/dashboard/ receives a `ping` event."""
    source = request.data.get("from", "phone") if isinstance(request.data, dict) else "phone"
    broadcast("ping", {"from": source})
    return Response({"ok": True})


class ReportCreateView(APIView):
    @extend_schema(
        tags=["reports"],
        summary="Submit a report (SOS)",
        description=(
            "Idempotent on `client_id`: a retry returns the same result (200, no new broadcast). "
            "A new `short_id` creates an incident; an existing one adds a report to it (`merged: true`). "
            "Broadcasts `incident.created|updated` and `report.created` on the dashboard websocket."
        ),
        request=ReportCreateSerializer,
        responses={
            201: ReportResultSerializer,
            200: OpenApiResponse(ReportResultSerializer, description="Retry of an already stored client_id"),
            400: OpenApiResponse(description='{"error":"validation_error","detail":{...}}'),
        },
    )
    def post(self, request):
        serializer = ReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result, created = services.create_or_merge_report(serializer.validated_data)
        return Response(result, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ReportDetailView(APIView):
    @extend_schema(
        tags=["reports"],
        summary="Live update of a report",
        description="Partial update of triage, answers, flags, victim_counts, body_pain. Re-aggregates the incident and broadcasts `incident.updated`.",
        request=ReportUpdateSerializer,
        responses={200: ReportResultSerializer, 404: OpenApiResponse(description="Unknown report")},
    )
    def patch(self, request, pk):
        report = get_object_or_404(Report.objects.select_related("incident"), pk=pk)
        serializer = ReportUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if "answers" in data:
            data["answers"] = [dict(a) for a in data["answers"]]
        return Response(services.update_report(report, data))


class IncidentListView(APIView):
    @extend_schema(
        tags=["incidents"],
        summary="List incidents",
        description="`?open=1` keeps NEW / VALIDATED / DISPATCHED only. Used by the dashboard on load and after a websocket reconnect.",
        parameters=[OpenApiParameter("open", OpenApiTypes.INT, description="1 = only open incidents")],
        responses=IncidentSummarySerializer(many=True),
    )
    def get(self, request):
        qs = Incident.objects.select_related("hospital").prefetch_related("reports")
        if request.query_params.get("open") in ("1", "true", "True"):
            qs = qs.filter(status__in=OPEN_STATUSES)
        return Response(IncidentSummarySerializer(qs, many=True).data)


class IncidentDetailView(APIView):
    @extend_schema(
        tags=["incidents"],
        summary="Incident detail (dashboard)",
        responses={200: IncidentDetailSerializer, 404: OpenApiResponse(description="Unknown incident")},
    )
    def get(self, request, pk):
        incident = get_object_or_404(Incident.objects.select_related("hospital").prefetch_related("reports"), pk=pk)
        return Response(IncidentDetailSerializer(incident).data)


class IncidentByShortView(APIView):
    @extend_schema(
        tags=["incidents"],
        summary="Incident detail by short_id (mobile status screen)",
        responses={200: IncidentDetailSerializer, 404: OpenApiResponse(description="Unknown short_id")},
    )
    def get(self, request, short_id):
        incident = services.find_incident_by_short_id(short_id)
        if incident is None:
            return Response({"error": "not_found", "detail": "No incident with this short_id."}, status=404)
        return Response(IncidentDetailSerializer(incident).data)


class ProfilePhotoView(APIView):
    parser_classes = [MultiPartParser]

    @extend_schema(
        tags=["profile"],
        summary="Upload a profile picture",
        description=(
            "Multipart field `photo` (JPEG/PNG/WEBP, max 2 MB). Stored on Cloudinary as a 400x400 face-centred "
            "square. Put the returned `url` in `profile.photo_url` of `POST /api/reports/`. "
            "503 `cloudinary_not_configured` if the CLOUDINARY_* env vars are empty."
        ),
        request={"multipart/form-data": {
            "type": "object", "properties": {"photo": {"type": "string", "format": "binary"}}, "required": ["photo"],
        }},
        responses={
            201: inline_serializer("ProfilePhotoOut", {"url": serializers.URLField(), "public_id": serializers.CharField()}),
            400: OpenApiResponse(description="missing_photo / invalid_image"),
            413: OpenApiResponse(description="photo_too_large"),
            502: OpenApiResponse(description="upload_failed"),
            503: OpenApiResponse(description="cloudinary_not_configured"),
        },
    )
    def post(self, request):
        upload = request.FILES.get("photo")
        if upload is None:
            return Response({"error": "missing_photo", "detail": "Multipart field 'photo' is required."}, status=400)
        try:
            result = photos.upload_profile_photo(upload.read())
        except photos.PhotoError as e:
            return Response({"error": e.code, "detail": e.detail}, status=e.status)
        return Response(result, status=status.HTTP_201_CREATED)


class ReportProfilePhotoView(APIView):
    parser_classes = [MultiPartParser]

    @extend_schema(
        tags=["reports"],
        summary="Attach a photo to a victim's report (dashboard)",
        description=(
            "Multipart field `photo` (JPEG/PNG/WEBP, max 2 MB). Uploaded like `/api/profile-photo/`, then stored as "
            "`profile.photo_url` of this report so it shows on the incident and on the victim badge."
        ),
        request={"multipart/form-data": {
            "type": "object", "properties": {"photo": {"type": "string", "format": "binary"}}, "required": ["photo"],
        }},
        responses={
            201: inline_serializer("ReportPhotoOut", {"url": serializers.URLField()}),
            400: OpenApiResponse(description="missing_photo / invalid_image"),
            404: OpenApiResponse(description="Unknown report"),
            413: OpenApiResponse(description="photo_too_large"),
            502: OpenApiResponse(description="upload_failed"),
            503: OpenApiResponse(description="cloudinary_not_configured"),
        },
    )
    def post(self, request, pk):
        report = get_object_or_404(Report.objects.select_related("incident"), pk=pk)
        upload = request.FILES.get("photo")
        if upload is None:
            return Response({"error": "missing_photo", "detail": "Multipart field 'photo' is required."}, status=400)
        try:
            result = photos.upload_profile_photo(upload.read())
        except photos.PhotoError as e:
            return Response({"error": e.code, "detail": e.detail}, status=e.status)
        services.set_report_photo(report, result["url"])
        return Response({"url": result["url"]}, status=status.HTTP_201_CREATED)


class NearbyCheckView(APIView):
    @extend_schema(
        tags=["incidents"],
        summary="Is there already an open incident here? (witness duplicate prompt)",
        description="Open incident within 300 m created in the last 10 min (plan §8.4); the closest one, or `null`.",
        request=NearbyCheckSerializer,
        responses=inline_serializer(
            "NearbyCheckResult",
            {
                "incident": inline_serializer(
                    "NearbyIncident",
                    {"short_id": serializers.CharField(), "worst_triage": serializers.CharField(),
                     "created_at": serializers.DateTimeField()},
                    allow_null=True,
                )
            },
        ),
    )
    def post(self, request):
        serializer = NearbyCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        found = find_open_incident_near(serializer.validated_data["lat"], serializer.validated_data["lng"])
        if found is None:
            return Response({"incident": None})
        return Response(
            {"incident": {"short_id": found.short_id, "worst_triage": found.worst_triage, "created_at": found.created_at}}
        )


def _lifecycle_response(action, incident):
    try:
        incident = action()
    except lifecycle.LifecycleError as e:
        return Response({"error": e.code, "detail": e.detail}, status=e.status)
    incident = Incident.objects.select_related("hospital").prefetch_related("reports").get(pk=incident.pk)
    return Response(IncidentDetailSerializer(incident).data)


class IncidentDispatchView(APIView):
    @extend_schema(
        tags=["incidents"],
        summary="Validate & dispatch",
        description=(
            "Operator picks a hospital (default: the recommended one). Sets DISPATCHED, keeps the operator's "
            "hospital from now on, pushes `status.updated` to the reporter phone(s), `incident.updated` to the "
            "dashboard, and texts reporters who wrote by SMS. Idempotent for the same hospital. "
            "409 if RESOLVED/CANCELLED."
        ),
        request=DispatchSerializer,
        responses={200: IncidentDetailSerializer, 404: OpenApiResponse(description="Unknown incident or hospital"),
                   409: OpenApiResponse(description="invalid_state")},
    )
    def post(self, request, pk):
        incident = get_object_or_404(Incident.objects.select_related("hospital"), pk=pk)
        serializer = DispatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return _lifecycle_response(
            lambda: lifecycle.dispatch(incident, serializer.validated_data.get("hospital_id")), incident
        )


class IncidentResolveView(APIView):
    @extend_schema(
        tags=["incidents"],
        summary="Resolve an incident",
        description="`by`: OPERATOR (dashboard) or REPORTER (phone 'Situation resolved'). Idempotent. Pushes `status.updated` + `incident.updated`.",
        request=ResolveSerializer,
        responses={200: IncidentDetailSerializer, 404: OpenApiResponse(description="Unknown incident"),
                   409: OpenApiResponse(description="invalid_state (CANCELLED)")},
    )
    def post(self, request, pk):
        incident = get_object_or_404(Incident.objects.select_related("hospital"), pk=pk)
        serializer = ResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return _lifecycle_response(lambda: lifecycle.resolve(incident, serializer.validated_data["by"]), incident)
