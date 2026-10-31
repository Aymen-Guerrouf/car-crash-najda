"""Core alert loop (plan §7 Phase 1, step 4)."""

from django.db import IntegrityError, transaction

from hospitals.recommend import recommend_hospital
from ai import tasks as ai_tasks
from ai.schemas import is_usable
from realtime.broadcast import broadcast

from . import dedup, triage as triage_rules
from .enums import TRIAGE_SEVERITY, Flag, IncidentStatus, Triage
from .models import Incident, Report
from .serializers import IncidentSummarySerializer, ReportSerializer

MCI_THRESHOLD = 5


def aggregate_incident(incident: Incident) -> None:
    """Recompute worst triage, max counts, union of flags, MCI from all reports."""
    reports = list(incident.reports.all())
    triages = [r.triage for r in reports] or [Triage.UNKNOWN]
    incident.worst_triage = max(triages, key=lambda t: TRIAGE_SEVERITY[t])

    counts = {"RED": 0, "YELLOW": 0, "GREEN": 0}
    flags: list[str] = []
    for r in reports:
        for k in counts:
            counts[k] = max(counts[k], (r.victim_counts or {}).get(k, 0))
        for f in r.flags or []:
            if f not in flags:
                flags.append(f)
    # A lone victim report with no explicit counts still means one person.
    if sum(counts.values()) == 0 and reports and incident.worst_triage != Triage.UNKNOWN:
        counts[incident.worst_triage] = 1
    incident.victim_counts = counts
    incident.is_mci = sum(counts.values()) >= MCI_THRESHOLD
    if incident.is_mci and Flag.MCI not in flags:
        flags.append(Flag.MCI)
    incident.flags = flags

    # Injuries only come from confident photo analyses (plan §9.2: low confidence is never used).
    injuries: list[str] = []
    for r in reports:
        if is_usable(r.ai_vision):
            for i in r.ai_vision.get("likely_injuries", []):
                if i not in injuries:
                    injuries.append(i)
    incident.injuries = injuries


def apply_recommendation(incident: Incident) -> None:
    if incident.status == IncidentStatus.DISPATCHED:
        return  # the operator's dispatch choice is never overridden by the automatic recommendation
    rec = recommend_hospital(incident)
    if rec is None:
        incident.hospital = None
        incident.hospital_reason = ""
        incident.alternatives = []
        incident.eta_min = None
        return
    incident.hospital = rec["hospital"]
    incident.hospital_reason = rec["reason"]
    incident.alternatives = rec["alternatives"]
    incident.eta_min = rec["eta_min"]


def response_for(report: Report, merged: bool) -> dict:
    incident = report.incident
    hospital = incident.hospital
    return {
        "report_id": str(report.id),
        "incident_id": str(incident.id),
        "short_id": incident.short_id,
        "merged": merged,
        "worst_triage": incident.worst_triage,
        "hospital": (
            {"id": hospital.id, "name": hospital.name, "eta_min": incident.eta_min} if hospital else None
        ),
    }


def find_incident_by_short_id(short_id: str) -> Incident | None:
    """The incident with this short_id, or the one a phone's (merged) short_id was attached to."""
    short_id = short_id.upper()
    incident = Incident.objects.filter(short_id=short_id).first()
    if incident:
        return incident
    alias = Report.objects.select_related("incident").filter(reported_short_id=short_id).first()
    return alias.incident if alias else None


def _report_fields(payload: dict) -> dict:
    keys = (
        "role", "channel", "triage", "answers", "flags", "victim_counts", "profile",
        "body_pain", "lat", "lng", "accuracy_m", "location_note", "device_created_at",
    )
    fields = {k: payload[k] for k in keys if k in payload}
    fields["answers"] = [dict(a) for a in fields.get("answers", [])]
    fields["triage"], fields["flags"], fields["answers_code"] = triage_rules.reconcile(
        fields["role"], fields.get("triage", Triage.UNKNOWN), fields["answers"], fields.get("flags", [])
    )
    return fields


def create_or_merge_report(payload: dict) -> tuple[dict, bool]:
    """Returns (response_dict, created). `payload` is validated ReportCreateSerializer data.

    1. same client_id -> return the existing report (idempotent retry, no broadcast)
    2. incident by short_id, created if missing
    3. create Report, aggregate, recommend hospital
    4. broadcast incident.created|updated + report.created
    """
    existing = Report.objects.select_related("incident__hospital").filter(client_id=payload["client_id"]).first()
    if existing:
        return response_for(existing, merged=False), False

    try:
        with transaction.atomic():
            incident = find_incident_by_short_id(payload["short_id"])
            if incident is None and not payload.get("force_new"):
                incident = dedup.find_open_incident_near(payload["lat"], payload["lng"])  # plan §8.4
            incident_created = False
            if incident is None:
                incident, incident_created = Incident.objects.get_or_create(
                    short_id=payload["short_id"],
                    defaults={
                        "lat": payload["lat"],
                        "lng": payload["lng"],
                        "accuracy_m": payload.get("accuracy_m"),
                        "location_note": payload.get("location_note", ""),
                    },
                )
            report = Report.objects.create(
                client_id=payload["client_id"],
                incident=incident,
                reported_short_id=payload["short_id"],
                **_report_fields(payload),
            )
            if not incident_created:
                _improve_location(incident, payload)
                _reopen_if_closed(incident)
            aggregate_incident(incident)
            apply_recommendation(incident)
            incident.save()
    except IntegrityError:
        # Lost a race on client_id: the other request already stored it.
        existing = Report.objects.select_related("incident__hospital").get(client_id=payload["client_id"])
        return response_for(existing, merged=False), False

    incident.refresh_from_db()
    broadcast(
        "incident.created" if incident_created else "incident.updated",
        IncidentSummarySerializer(incident).data,
    )
    broadcast("report.created", {"incident_id": str(incident.id), "report": ReportSerializer(report).data})
    ai_tasks.start_brief(incident.id)
    return response_for(report, merged=not incident_created), True


def update_report(report: Report, data: dict) -> dict:
    """PATCH: live updates of triage fields, then re-aggregate and rebroadcast."""
    with transaction.atomic():
        for field, value in data.items():
            setattr(report, field, value)
        report.triage, report.flags, report.answers_code = triage_rules.reconcile(
            report.role, report.triage, report.answers, report.flags
        )
        report.save()
        incident = report.incident
        aggregate_incident(incident)
        apply_recommendation(incident)
        incident.save()
    incident.refresh_from_db()
    broadcast("incident.updated", IncidentSummarySerializer(incident).data)
    ai_tasks.start_brief(incident.id)
    return response_for(report, merged=False)


def set_report_photo(report: Report, url: str) -> dict:
    """Operator adds (or replaces) the victim's photo on a report; the dashboard refreshes through the websocket."""
    profile = dict(report.profile or {})
    profile["photo_url"] = url
    report.profile = profile
    report.save(update_fields=["profile"])
    incident = report.incident
    broadcast("incident.updated", IncidentSummarySerializer(incident).data)
    return profile


def _reopen_if_closed(incident: Incident) -> None:
    """A new report on a RESOLVED/CANCELLED incident must not vanish from the
    dashboard's open list: reopen it so an operator sees it again."""
    if incident.status in (IncidentStatus.RESOLVED, IncidentStatus.CANCELLED):
        incident.status = IncidentStatus.NEW
        incident.resolved_at = None


def _improve_location(incident: Incident, payload: dict) -> None:
    """Keep the most accurate GPS fix (plan §5.2: 'updated by better GPS accuracy')."""
    new_acc = payload.get("accuracy_m")
    if new_acc is None:
        return
    if incident.accuracy_m is None or new_acc < incident.accuracy_m:
        incident.lat, incident.lng, incident.accuracy_m = payload["lat"], payload["lng"], new_acc
    if payload.get("location_note") and not incident.location_note:
        incident.location_note = payload["location_note"]

