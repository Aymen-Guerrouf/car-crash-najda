"""Outgoing SMS through the Android gateway (plan §7 Phase 3, backend step 4).

Targets the open-source "SMS Gateway for Android" local/cloud API:
    POST {SMS_GATEWAY_API_URL}   (HTTP Basic auth: SMS_GATEWAY_USER / SMS_GATEWAY_PASS)
    {"textMessage": {"text": "<text>"}, "phoneNumbers": ["+213..."]}   (older apps: {"message": ...})
    plus "simNumber": N when SMS_GATEWAY_SIM_NUMBER is set (dual-SIM phone).
Any other gateway only needs `_post()` adapted.
"""

import logging
import re
import unicodedata

import httpx
from django.conf import settings

from realtime.broadcast import broadcast

from .models import SmsLog
from .serializers import SmsLogSerializer

logger = logging.getLogger(__name__)
TIMEOUT_S = 5


def to_gsm_ascii(text: str) -> str:
    """Accents stripped, anything non printable-ASCII dropped (keeps the SMS a single GSM-7 message)."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^\x20-\x7e]", "", text)


def _post(phone: str, text: str) -> None:
    auth = (settings.SMS_GATEWAY_USER, settings.SMS_GATEWAY_PASS) if settings.SMS_GATEWAY_USER else None
    # Current app versions take `textMessage.text`; older ones only know the flat `message` field.
    bodies = (
        {"textMessage": {"text": text}, "phoneNumbers": [phone]},
        {"message": text, "phoneNumbers": [phone]},
    )
    sim = getattr(settings, "SMS_GATEWAY_SIM_NUMBER", 0)
    if sim:
        bodies = tuple({**b, "simNumber": sim} for b in bodies)  # pick the SIM that has credit
    for i, body in enumerate(bodies):
        response = httpx.post(settings.SMS_GATEWAY_API_URL, json=body, auth=auth, timeout=TIMEOUT_S)
        if i == 0 and response.status_code in (400, 422):
            continue  # body not understood: retry once with the older format
        response.raise_for_status()
        return


def send_sms(phone: str, text: str, incident=None) -> SmsLog:
    """Send `text` to `phone`; always records an OUT SmsLog (with `error` on failure) and
    broadcasts `sms.sent`. Never raises: a failing gateway must not break the alert pipeline."""
    text = to_gsm_ascii(text)
    error = ""
    if not settings.SMS_GATEWAY_API_URL:
        error = "gateway_not_configured"
    else:
        try:
            _post(phone, text)
        except Exception as exc:
            logger.warning("SMS gateway send failed: %s", exc)
            error = f"gateway_error: {exc}"[:200]
    log = SmsLog.objects.create(direction=SmsLog.Direction.OUT, phone=phone, raw=text, error=error, incident=incident)
    broadcast("sms.sent", SmsLogSerializer(log).data)
    return log


def build_ack(incident) -> str:
    """ASCII-only confirmation (plan §5.5), always < 160 chars."""
    hospital = incident.hospital
    if hospital and incident.eta_min is not None:
        head = f"GH OK {incident.short_id}: {hospital.short_name}, ETA {incident.eta_min} min."
    else:
        head = f"GH OK {incident.short_id}: alerte recue."
    return to_gsm_ascii(f"{head} Ambulance alertee. Appelez le 14 si besoin.")
