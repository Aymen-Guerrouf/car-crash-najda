import hmac
import json
import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import ReviewStatus, SensorReading

logger = logging.getLogger(__name__)


def device_token_ok(token: str | None) -> bool:
    """Compare the X-Device-Token header with SENSOR_DEVICE_TOKEN. Unset setting = every device refused."""
    expected = settings.SENSOR_DEVICE_TOKEN
    return bool(expected) and bool(token) and hmac.compare_digest(token.encode(), expected.encode())


def _error(code: str, detail, status: int) -> Response:
    return Response({"success": False, "error": code, "detail": detail}, status=status)


class SensorReadingView(APIView):
    # The device token header is the credential (separate from any user auth). No session auth -> no CSRF.
    authentication_classes: list = []
    permission_classes: list = []

    @extend_schema(
        tags=["sensors"],
        summary="ESP32 / Wokwi accelerometer reading",
        description=(
            "Header `X-Device-Token` must equal `SENSOR_DEVICE_TOKEN` (401 otherwise). Only `source` "
            "`WOKWI_SIMULATOR` is accepted. A reading over `SENSOR_COLLISION_THRESHOLD_G` is stored as an "
            "unverified possible collision (review_status PENDING) and broadcast; it never creates an incident."
        ),
        parameters=[OpenApiParameter("X-Device-Token", OpenApiTypes.STR, OpenApiParameter.HEADER, required=True)],
        request=inline_serializer(
            "SensorReadingIn",
            {
                "device_id": serializers.CharField(),
                "source": serializers.ChoiceField(choices=["WOKWI_SIMULATOR"]),
                "sequence": serializers.IntegerField(min_value=1),
                "acceleration": inline_serializer(
                    "Acceleration",
                    {"x": serializers.FloatField(), "y": serializers.FloatField(), "z": serializers.FloatField()},
                ),
                "unit": serializers.ChoiceField(choices=["m/s2"]),
            },
        ),
        responses={
            201: inline_serializer(
                "SensorReadingResult",
                {
                    "success": serializers.BooleanField(),
                    "message": serializers.CharField(),
                    "device_id": serializers.CharField(),
                    "sequence": serializers.IntegerField(),
                    "possible_collision": serializers.BooleanField(),
                },
            ),
            400: OpenApiResponse(description="Malformed JSON or invalid payload"),
            401: OpenApiResponse(description="Missing or invalid device token"),
        },
    )
    def post(self, request):
        if not device_token_ok(request.headers.get("X-Device-Token")):
            logger.warning("sensor reading refused: bad or missing device token from %s", request.META.get("REMOTE_ADDR"))
            return _error("unauthorized", "Missing or invalid device token.", 401)
        try:
            data = json.loads(request.body)
        except (ValueError, UnicodeDecodeError):
            return _error("invalid_json", "Body must be valid JSON.", 400)
        try:
            clean = services.validate(data)
        except services.ReadingInvalid as e:
            return _error("validation_error", e.errors, 400)
        try:
            reading = services.ingest(clean)
        except Exception:
            logger.exception("sensor reading processing failed (device %s)", clean["device_id"])
            return _error("server_error", "Could not process the reading.", 500)
        return Response(
            {
                "success": True,
                "message": "Sensor reading received successfully",
                "device_id": reading.device_id,
                "sequence": reading.sequence,
                "possible_collision": reading.possible_collision,
            },
            status=201,
        )


class PossibleCollisionListView(APIView):
    @extend_schema(
        tags=["sensors"],
        summary="Possible collisions (newest first) for the operator review list",
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, enum=ReviewStatus.values, description="Filter, e.g. PENDING"),
            OpenApiParameter("limit", OpenApiTypes.INT, description="1-200, default 50"),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        qs = SensorReading.objects.filter(possible_collision=True)
        status = request.query_params.get("status")
        if status:
            if status not in ReviewStatus.values:
                return Response({"error": "validation_error", "detail": {"status": f"One of {ReviewStatus.values}."}}, status=400)
            qs = qs.filter(review_status=status)
        try:
            limit = max(1, min(int(request.query_params.get("limit", 50)), 200))
        except ValueError:
            return Response({"error": "validation_error", "detail": {"limit": "Must be an integer."}}, status=400)
        return Response([services.reading_payload(r) for r in qs[:limit]])


class PossibleCollisionReviewView(APIView):
    @extend_schema(
        tags=["sensors"],
        summary="Operator validates or rejects a possible collision",
        description="Only changes the review status. Does NOT create an incident, dispatch, or send any SMS.",
        request=inline_serializer("CollisionReviewIn", {"decision": serializers.ChoiceField(choices=["VALIDATE", "REJECT"])}),
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request, pk):
        reading = get_object_or_404(SensorReading, pk=pk)
        decision = request.data.get("decision") if isinstance(request.data, dict) else None
        try:
            reading = services.review(reading, decision)
        except services.ReviewError as e:
            return Response({"error": e.code, "detail": e.detail}, status=e.status)
        return Response(services.reading_payload(reading))
