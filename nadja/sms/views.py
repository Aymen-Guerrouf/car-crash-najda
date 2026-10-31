import hmac

from django.conf import settings
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import SmsLog
from .serializers import SmsLogSerializer


def token_ok(token: str) -> bool:
    expected = settings.SMS_WEBHOOK_TOKEN
    return bool(expected) and hmac.compare_digest(token.encode(), expected.encode())


class SmsWebhookView(APIView):
    authentication_classes: list = []  # the secret token in the URL is the credential
    permission_classes: list = []

    @extend_schema(
        tags=["sms"],
        summary="Android gateway webhook (SMS received)",
        description=(
            "Configure the gateway app's 'SMS received' webhook to this URL. 403 if the token is wrong or "
            "`SMS_WEBHOOK_TOKEN` is unset. Accepts JSON (`{phoneNumber, message}`, optionally nested under "
            "`payload`) or form data. Always 200 once authenticated, even if the SMS is not a valid GH1 message "
            "(the problem is stored in `SmsLog.error`) so the gateway never retries forever."
        ),
        request=OpenApiTypes.OBJECT,
        responses={
            200: inline_serializer(
                "SmsWebhookResult",
                {"ok": serializers.BooleanField(), "short_id": serializers.CharField(required=False),
                 "merged": serializers.BooleanField(required=False), "error": serializers.CharField(required=False)},
            ),
            403: OpenApiResponse(description="Bad token"),
        },
    )
    def post(self, request, token):
        if not token_ok(token):
            return Response({"error": "forbidden", "detail": "Bad webhook token."}, status=403)
        raw = request.body.decode("utf-8", errors="replace")
        return Response(services.process_incoming(raw))


class SmsLogListView(APIView):
    @extend_schema(
        tags=["sms"],
        summary="SMS log (raw | decoded), newest first",
        parameters=[OpenApiParameter("limit", OpenApiTypes.INT, description="1-200, default 50")],
        responses=SmsLogSerializer(many=True),
    )
    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 50))
        except ValueError:
            return Response({"error": "validation_error", "detail": {"limit": "Must be an integer."}}, status=400)
        limit = max(1, min(limit, 200))
        logs = SmsLog.objects.select_related("incident")[:limit]
        return Response(SmsLogSerializer(logs, many=True).data)
