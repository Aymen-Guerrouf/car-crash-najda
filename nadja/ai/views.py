import statistics
import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from incidents import photos
from incidents.models import Report

from . import tasks
from .models import AiCall

EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


class ReportPhotoView(APIView):
    parser_classes = [MultiPartParser]

    @extend_schema(
        tags=["ai"],
        summary="Upload the scene photo of a report (starts the AI analysis)",
        description=(
            "Multipart field `photo` (JPEG/PNG/WEBP, <= 300 KB; the app sends ~1024 px JPEG q0.5). Returns 202 at "
            "once; analysis runs in the background and arrives as websocket events `ai.vision.done` / "
            "`ai.vision.failed`, then `ai.brief.chunk` / `ai.brief.done`. Uploading again replaces the photo."
        ),
        request={"multipart/form-data": {
            "type": "object", "properties": {"photo": {"type": "string", "format": "binary"}}, "required": ["photo"],
        }},
        responses={
            202: inline_serializer("ReportPhotoOut", {"status": serializers.CharField()}),
            400: OpenApiResponse(description="missing_photo / invalid_image"),
            404: OpenApiResponse(description="Unknown report"),
            413: OpenApiResponse(description="photo_too_large"),
        },
    )
    def post(self, request, pk):
        report = get_object_or_404(Report, pk=pk)
        upload = request.FILES.get("photo")
        if upload is None:
            return Response({"error": "missing_photo", "detail": "Multipart field 'photo' is required."}, status=400)
        data = upload.read()
        try:
            fmt = photos.validate_image(data, settings.AI_PHOTO_MAX_BYTES)
        except photos.PhotoError as e:
            return Response({"error": e.code, "detail": e.detail}, status=e.status)
        if report.photo:
            report.photo.delete(save=False)
        report.photo.save(f"{uuid.uuid4().hex}.{EXTENSIONS[fmt]}", ContentFile(data), save=True)
        tasks.start_vision(report.id)
        return Response({"status": "processing"}, status=202)


def _percentile(values: list[int], q: float) -> int | None:
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(round(q * (len(values) - 1))))]


def _stats(values: list[int], name: str) -> dict:
    return {
        f"{name}_p50": int(statistics.median(values)) if values else None,
        f"{name}_p95": _percentile(values, 0.95),
        f"{name}_count": len(values),
    }


class MetricsView(APIView):
    @extend_schema(
        tags=["ai"],
        summary="Latency metrics (dashboard latency strip)",
        description=(
            "alert = received_at - device_created_at (HTTP reports with a device clock, 0..1h); vision / brief first "
            "token / brief total from successful AI calls; `brief_template_rate` = share of briefs that fell back."
        ),
        responses=inline_serializer("Metrics", {
            "alert_ms_p50": serializers.IntegerField(allow_null=True),
            "vision_ms_p50": serializers.IntegerField(allow_null=True),
            "brief_first_token_ms_p50": serializers.IntegerField(allow_null=True),
        }),
    )
    def get(self, request):
        alert = [
            int((r - d).total_seconds() * 1000)
            for r, d in Report.objects.filter(device_created_at__isnull=False).values_list("received_at", "device_created_at")
        ]
        alert = [a for a in alert if 0 <= a <= 3_600_000]
        vision = list(AiCall.objects.filter(kind="VISION", ok=True).values_list("ms", flat=True))
        brief_ok = AiCall.objects.filter(kind="BRIEF", ok=True)
        first = list(brief_ok.exclude(first_token_ms=None).values_list("first_token_ms", flat=True))
        total = list(brief_ok.exclude(ms=None).values_list("ms", flat=True))
        briefs = AiCall.objects.filter(kind="BRIEF").count()
        vision_failed = AiCall.objects.filter(kind="VISION", ok=False).count()
        return Response({
            **_stats(alert, "alert_ms"),
            **_stats(vision, "vision_ms"),
            **_stats(first, "brief_first_token_ms"),
            **_stats(total, "brief_total_ms"),
            "brief_template_rate": round(AiCall.objects.filter(kind="BRIEF", ok=False).count() / briefs, 3) if briefs else None,
            "vision_failed_count": vision_failed,
        })
