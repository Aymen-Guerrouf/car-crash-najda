"""Operator / reporter actions on an incident: dispatch and resolve (plan §5.3, Phase 4)."""

from django.db import transaction
from django.utils import timezone

from ai import tasks as ai_tasks
from hospitals.geo import haversine_km
from hospitals.models import Hospital
from hospitals.recommend import estimate_eta_min
from realtime.broadcast import broadcast, broadcast_to_incident
from sms import gateway
from sms.models import SmsLog

from .enums import IncidentStatus
from .models import Incident, Report
from .serializers import IncidentSummarySerializer


class LifecycleError(Exception):
    def __init__(self, code: str, detail: str, status: int):
        super().__init__(detail)
        self.code, self.detail, self.status = code, detail, status


def phone_groups(incident: Incident) -> list[str]:
    """Every short_id a phone may be listening on: the canonical one + ids of merged phones."""
    ids = {incident.short_id}
    ids.update(
        Report.objects.filter(incident=incident).exclude(reported_short_id="").values_list("reported_short_id", flat=True)
    )
    return sorted(ids)


def status_payload(incident: Incident, message_fr: str, message_ar: str) -> dict:
    h = incident.hospital
    return {
        "status": incident.status,
        "hospital": {"name": h.name, "phone": h.phone} if h else None,
        "eta_min": incident.eta_min,
        "message_fr": message_fr,
        "message_ar": message_ar,
    }


def _notify(incident: Incident, message_fr: str, message_ar: str) -> None:
    payload = status_payload(incident, message_fr, message_ar)
    for short_id in phone_groups(incident):
        broadcast_to_incident(short_id, "status.updated", payload)
    broadcast("incident.updated", IncidentSummarySerializer(incident).data)


def dispatch(incident: Incident, hospital_id: int | None) -> Incident:
    if incident.status in (IncidentStatus.RESOLVED, IncidentStatus.CANCELLED):
        raise LifecycleError("invalid_state", f"Incident is {incident.status}.", 409)

    if hospital_id is None:
        hospital = incident.hospital
        if hospital is None:
            raise LifecycleError("no_hospital", "No hospital recommended yet; send hospital_id.", 400)
    else:
        hospital = Hospital.objects.filter(pk=hospital_id, active=True).first()
        if hospital is None:
            raise LifecycleError("hospital_not_found", f"No active hospital {hospital_id}.", 404)

    if incident.status == IncidentStatus.DISPATCHED and incident.hospital_id == hospital.id:
        return incident  # idempotent: double click on "Validate & dispatch"

    with transaction.atomic():
        if incident.hospital_id != hospital.id:
            incident.eta_min = estimate_eta_min(haversine_km(incident.lat, incident.lng, hospital.lat, hospital.lng))
            incident.hospital_reason = f"Operator choice · {incident.eta_min} min · {hospital.beds_available} beds"
        incident.hospital = hospital
        incident.status = IncidentStatus.DISPATCHED
        incident.dispatched_at = timezone.now()
        incident.save()
    incident.refresh_from_db()

    _notify(
        incident,
        # The ambulance goes to the accident; the hospital is where the patient will be taken
        f"Ambulance en route vers le lieu de l'accident. Hôpital de destination : {hospital.name}.",
        f"سيارة الإسعاف في الطريق إلى مكان الحادث. المستشفى المقصود: {hospital.name}.",
    )
    _sms_dispatch(incident, hospital)
    ai_tasks.start_brief(incident.id)  # the brief now carries the chosen hospital + ETA
    return incident


def _sms_dispatch(incident: Incident, hospital: Hospital) -> None:
    """Reporters who wrote by SMS get the news by SMS too (they have no websocket)."""
    seen = set()
    for log in SmsLog.objects.filter(incident=incident, direction="IN", error="").order_by("at"):
        if log.phone and log.phone not in seen:
            seen.add(log.phone)
            own_id = (log.parsed or {}).get("short_id", incident.short_id)
            gateway.send_sms(
                log.phone,
                f"GH {own_id}: Ambulance en route vers le lieu de l'accident. Hopital: {hospital.short_name}.",
                incident=incident,
            )


def resolve(incident: Incident, by: str) -> Incident:
    if incident.status == IncidentStatus.RESOLVED:
        return incident  # idempotent
    if incident.status == IncidentStatus.CANCELLED:
        raise LifecycleError("invalid_state", "Incident is CANCELLED.", 409)
    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = timezone.now()
    incident.save()
    incident.refresh_from_db()
    who_fr, who_ar = ("par le régulateur", "من طرف المنظم") if by == "OPERATOR" else ("par le déclarant", "من طرف المبلّغ")
    _notify(incident, f"Situation terminée {who_fr}.", f"انتهى الوضع {who_ar}.")
    return incident
