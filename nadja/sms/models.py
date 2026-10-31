from django.db import models


class SmsLog(models.Model):
    class Direction(models.TextChoices):
        IN = "IN"
        OUT = "OUT"

    direction = models.CharField(max_length=3, choices=Direction.choices)
    phone = models.CharField(max_length=32)
    raw = models.TextField()
    parsed = models.JSONField(null=True, blank=True)
    error = models.CharField(max_length=200, blank=True)
    incident = models.ForeignKey(
        "incidents.Incident", null=True, blank=True, on_delete=models.SET_NULL, related_name="sms_logs"
    )
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-at"]

    def __str__(self):
        return f"{self.direction} {self.phone}"
