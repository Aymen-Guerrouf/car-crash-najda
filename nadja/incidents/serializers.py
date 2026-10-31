"""Serializers (plan §5.2 / §5.3)."""

import json
import re

from rest_framework import serializers

from hospitals.models import Hospital

from . import photos
from .enums import Capability, Channel, Flag, Injury, Role, Triage
from .models import Incident, Report
from .triage import ANSWER_VALUES, QUESTION_CODES

SHORT_ID_RE = re.compile(r"^[0-9A-Za-z]{6}$")
COUNT_KEYS = ("RED", "YELLOW", "GREEN")
MAX_PROFILE_JSON_CHARS = 2000


class HospitalSerializer(serializers.ModelSerializer):
    capabilities = serializers.ListField(child=serializers.ChoiceField(choices=Capability.choices))

    class Meta:
        model = Hospital
        fields = ["id", "name", "short_name", "lat", "lng", "phone", "capabilities", "beds_available", "active"]


class HospitalBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = ["id", "name", "short_name", "lat", "lng", "phone"]


def validate_victim_counts(value):
    if not isinstance(value, dict):
        raise serializers.ValidationError("Must be an object like {RED, YELLOW, GREEN}.")
    unknown = set(value) - set(COUNT_KEYS)
    if unknown:
        raise serializers.ValidationError(f"Unknown keys: {sorted(unknown)}")
    out = {}
    for key in COUNT_KEYS:
        n = value.get(key, 0)
        if isinstance(n, bool) or not isinstance(n, int) or n < 0 or n > 999:
            raise serializers.ValidationError(f"{key} must be an integer between 0 and 999.")
        out[key] = n
    return out


class AnswerSerializer(serializers.Serializer):
    q = serializers.ChoiceField(choices=sorted(QUESTION_CODES), help_text="Question id (plan §8.2)")
    v = serializers.ChoiceField(choices=ANSWER_VALUES)
    at = serializers.IntegerField(required=False)

    def validate(self, attrs):
        # PATCH runs with partial=True, which would make q/v optional in nested answers too.
        missing = [f for f in ("q", "v") if f not in attrs]
        if missing:
            raise serializers.ValidationError({f: "This field is required." for f in missing})
        return attrs


class ReportFieldsMixin(serializers.Serializer):
    """Fields a phone may send on create and later patch (live updates)."""

    triage = serializers.ChoiceField(choices=Triage.choices, required=False)
    answers = AnswerSerializer(many=True, required=False, max_length=len(QUESTION_CODES) * 3)
    flags = serializers.ListField(
        child=serializers.ChoiceField(choices=Flag.choices), required=False, max_length=len(Flag.choices)
    )
    victim_counts = serializers.JSONField(required=False)
    body_pain = serializers.ListField(
        child=serializers.ChoiceField(choices=Injury.choices), required=False, max_length=len(Injury.choices)
    )

    def validate_victim_counts(self, value):
        return validate_victim_counts(value)


class ReportCreateSerializer(ReportFieldsMixin):
    client_id = serializers.UUIDField()
    short_id = serializers.CharField(max_length=6)
    force_new = serializers.BooleanField(
        default=False, help_text="true = 'It's a different accident': skip duplicate detection (plan §8.4)"
    )
    role = serializers.ChoiceField(choices=Role.choices)
    channel = serializers.ChoiceField(choices=Channel.choices, default=Channel.HTTP)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    accuracy_m = serializers.FloatField(required=False, allow_null=True, min_value=0)
    location_note = serializers.CharField(max_length=140, required=False, allow_blank=True)
    profile = serializers.JSONField(required=False, allow_null=True)
    device_created_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_short_id(self, value):
        if not SHORT_ID_RE.match(value):
            raise serializers.ValidationError("Must be 6 alphanumeric characters.")
        return value.upper()

    def validate_profile(self, value):
        if value is not None and not isinstance(value, dict):
            raise serializers.ValidationError("Must be an object or null.")
        if value is not None and len(json.dumps(value)) > MAX_PROFILE_JSON_CHARS:
            raise serializers.ValidationError("Profile too large.")
        for key in ("condition_other", "allergy_other"):  # free text typed under "other": keep it a short string
            if (value or {}).get(key) is not None and not (isinstance(value[key], str) and len(value[key]) <= 60):
                raise serializers.ValidationError(f"{key} must be a string of at most 60 characters.")
        url = (value or {}).get("photo_url")
        if url is not None and not (isinstance(url, str) and url.startswith(photos.allowed_photo_prefix())):
            raise serializers.ValidationError("photo_url must be a Cloudinary URL from /api/profile-photo/.")
        return value


class ReportUpdateSerializer(ReportFieldsMixin):
    """PATCH /reports/{id}/ — partial update of the triage fields only."""


class ReportSerializer(serializers.ModelSerializer):
    incident_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Report
        fields = [
            "id", "client_id", "incident_id", "role", "channel", "triage", "answers", "answers_code",
            "flags", "victim_counts", "profile", "body_pain", "lat", "lng", "accuracy_m",
            "location_note", "photo", "ai_vision", "ai_vision_ms", "device_created_at", "received_at",
        ]


class IncidentSummarySerializer(serializers.ModelSerializer):
    hospital = HospitalBriefSerializer(read_only=True)
    report_count = serializers.SerializerMethodField(help_text="Number of reports ('3 reports' badge)")
    channels = serializers.SerializerMethodField(help_text="Distinct report channels, e.g. ['SMS','HTTP'] (ChannelBadge)")

    def get_report_count(self, obj) -> int:
        return len(obj.reports.all())

    def get_channels(self, obj) -> list[str]:
        # iterate in Python so a prefetch_related("reports") is used (no N+1 on the list endpoint)
        return sorted({r.channel for r in obj.reports.all()})

    class Meta:
        model = Incident
        fields = [
            "id", "short_id", "status", "lat", "lng", "accuracy_m", "location_note", "worst_triage",
            "victim_counts", "flags", "is_mci", "injuries", "hospital", "hospital_reason",
            "alternatives", "eta_min", "er_brief", "er_brief_source", "channels", "report_count", "dispatched_at",
            "resolved_at", "created_at", "updated_at",
        ]


class IncidentDetailSerializer(IncidentSummarySerializer):
    reports = ReportSerializer(many=True, read_only=True)

    class Meta(IncidentSummarySerializer.Meta):
        fields = IncidentSummarySerializer.Meta.fields + ["reports"]


class NearbyCheckSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)


class DispatchSerializer(serializers.Serializer):
    hospital_id = serializers.IntegerField(
        required=False, help_text="Defaults to the currently recommended hospital"
    )


class ResolveSerializer(serializers.Serializer):
    by = serializers.ChoiceField(choices=["OPERATOR", "REPORTER"])
