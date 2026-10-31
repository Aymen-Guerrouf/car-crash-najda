"""Incoming SMS pipeline (plan §7 Phase 3, backend step 3)."""

import json
import logging
import uuid
from urllib.parse import parse_qsl

from django.conf import settings

from incidents.models import Incident
from incidents.services import create_or_merge_report
from realtime.broadcast import broadcast

from . import gateway
from .codec import SmsDecodeError, decode_sms, photo_url_from_ref
from .models import SmsLog
from .serializers import SmsLogSerializer

logger = logging.getLogger(__name__)

# Keys different gateway apps use for the sender number / the text.
PHONE_KEYS = ("phoneNumber", "phone_number", "phone", "from", "sender", "address", "number", "originatingAddress")
MESSAGE_KEYS = ("message", "text", "body", "content", "msg")
SMS_NAMESPACE = uuid.UUID("6f1c0b0e-6a57-4a0b-9b3a-1f6f2c9a7d21")


def parse_body(raw: str) -> dict | None:
    """JSON object or form-encoded body -> dict (None if neither)."""
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except ValueError:
        pass
    pairs = dict(parse_qsl(raw))
    return pairs or None


def extract_sms(data: dict | None) -> tuple[str, str] | None:
    """Find (phone, message) in a gateway payload: top level, or nested under
    `payload`/`data`/`message` (capcom6 'sms:received' puts them under `payload`)."""
    if not isinstance(data, dict):
        return None
    for nested in ("payload", "data"):
        if isinstance(data.get(nested), dict):
            found = extract_sms(data[nested])
            if found:
                return found
    phone = next((str(data[k]) for k in PHONE_KEYS if data.get(k)), None)
    message = next((data[k] for k in MESSAGE_KEYS if isinstance(data.get(k), str) and data[k].strip()), None)
    if phone is None or message is None:
        return None
    return phone, message


def _log(**kw) -> SmsLog:
    log = SmsLog.objects.create(direction=SmsLog.Direction.IN, **kw)
    return log


def _announce(log: SmsLog) -> None:
    log.refresh_from_db()
    broadcast("sms.received", SmsLogSerializer(log).data)


def process_incoming(raw_body: str) -> dict:
    """Decode one gateway webhook delivery. Always returns a small result dict (HTTP 200
    either way so the gateway does not retry forever); problems are recorded in SmsLog.error."""
    logger.info("SMS webhook body: %s", raw_body[:500])
    extracted = extract_sms(parse_body(raw_body))
    if extracted is None:
        log = _log(phone="", raw=raw_body[:1000], error="unparseable_gateway_payload")
        _announce(log)
        return {"ok": False, "error": "unparseable_gateway_payload"}
    phone, message = extracted

    try:
        decoded = decode_sms(message)
    except SmsDecodeError as e:
        log = _log(phone=phone, raw=message, error=e.code)
        _announce(log)
        return {"ok": False, "error": e.code}

    # Same gateway delivery twice -> same client_id -> the pipeline returns the stored report.
    client_id = uuid.uuid5(SMS_NAMESPACE, decoded["short_id"] + message.strip())
    report = {**decoded, "channel": "SMS", "client_id": client_id, "force_new": True}
    profile = dict(decoded["profile"]) if decoded.get("profile") else None
    if profile and profile.get("photo_ref"):  # the picture travels as a short reference; rebuild our own Cloudinary URL
        ref = profile.pop("photo_ref")
        if settings.CLOUDINARY_CLOUD_NAME:
            profile["photo_url"] = photo_url_from_ref(ref, settings.CLOUDINARY_CLOUD_NAME)
        report["profile"] = profile
    result, _ = create_or_merge_report(report)
    incident = Incident.objects.select_related("hospital").get(id=result["incident_id"])

    log = _log(phone=phone, raw=message, parsed=decoded, incident=incident)
    _announce(log)
    gateway.send_sms(phone, gateway.build_ack(incident), incident=incident)
    return {"ok": True, "short_id": incident.short_id, "merged": result["merged"]}
