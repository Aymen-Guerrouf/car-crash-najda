"""Incident / Report (plan §5.2)."""

import uuid

from django.db import models

from .enums import BriefSource, Channel, IncidentStatus, Role, Triage


def default_victim_counts():
    return {"RED": 0, "YELLOW": 0, "GREEN": 0}


class Incident(models.Model):
    """One real-world accident (may have several reports)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    short_id = models.CharField(max_length=6, unique=True, db_index=True)
    status = models.CharField(max_length=12, choices=IncidentStatus.choices, default=IncidentStatus.NEW)
    lat = models.FloatField()
    lng = models.FloatField()
    accuracy_m = models.FloatField(null=True, blank=True)
    location_note = models.CharField(max_length=140, blank=True)
    worst_triage = models.CharField(max_length=8, choices=Triage.choices, default=Triage.UNKNOWN)
    victim_counts = models.JSONField(default=default_victim_counts)
    flags = models.JSONField(default=list)
    is_mci = models.BooleanField(default=False)
    injuries = models.JSONField(default=list)
    hospital = models.ForeignKey(
        "hospitals.Hospital", null=True, blank=True, on_delete=models.SET_NULL, related_name="incidents"
    )
    hospital_reason = models.CharField(max_length=200, blank=True)
    alternatives = models.JSONField(default=list)
    eta_min = models.IntegerField(null=True, blank=True)
    er_brief = models.TextField(blank=True)
    er_brief_source = models.CharField(max_length=8, choices=BriefSource.choices, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.short_id} ({self.worst_triage})"


class Report(models.Model):
    """One submission from one phone."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_id = models.UUIDField(unique=True)
    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="reports")
    # short_id as generated on the sending phone. Differs from incident.short_id when the report was
    # merged into another incident by duplicate detection; lets later updates from that phone still match.
    reported_short_id = models.CharField(max_length=6, blank=True, db_index=True)
    role = models.CharField(max_length=10, choices=Role.choices)
    channel = models.CharField(max_length=4, choices=Channel.choices, default=Channel.HTTP)
    triage = models.CharField(max_length=8, choices=Triage.choices, default=Triage.UNKNOWN)
    answers = models.JSONField(default=list)
    answers_code = models.CharField(max_length=40, blank=True)
    flags = models.JSONField(default=list)
    victim_counts = models.JSONField(default=default_victim_counts)
    profile = models.JSONField(null=True, blank=True)
    body_pain = models.JSONField(default=list)
    lat = models.FloatField()
    lng = models.FloatField()
    accuracy_m = models.FloatField(null=True, blank=True)
    location_note = models.CharField(max_length=140, blank=True)
    photo = models.ImageField(upload_to="photos/", null=True, blank=True)
    ai_vision = models.JSONField(null=True, blank=True)
    ai_vision_ms = models.IntegerField(null=True, blank=True)
    device_created_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["received_at"]

    def __str__(self):
        return f"{self.incident.short_id}/{self.role}/{self.triage}"
