from rest_framework import serializers

from .models import SmsLog


class SmsLogSerializer(serializers.ModelSerializer):
    incident_id = serializers.UUIDField(read_only=True)
    short_id = serializers.CharField(source="incident.short_id", read_only=True, default=None)

    class Meta:
        model = SmsLog
        fields = ["id", "direction", "phone", "raw", "parsed", "error", "incident_id", "short_id", "at"]
