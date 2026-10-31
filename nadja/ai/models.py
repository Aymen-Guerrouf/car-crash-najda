from django.db import models


class AiCall(models.Model):
    """One AI call, kept for /api/metrics/ and for rehearsal debugging (plan §9.1: measure every call)."""

    class Kind(models.TextChoices):
        VISION = "VISION"
        BRIEF = "BRIEF"

    kind = models.CharField(max_length=6, choices=Kind.choices)
    provider = models.CharField(max_length=32, blank=True)
    model = models.CharField(max_length=64, blank=True)
    prompt_version = models.CharField(max_length=32, blank=True)
    ok = models.BooleanField(default=False)
    error = models.CharField(max_length=120, blank=True, help_text="failure reason, or 'fallback:<reason>' for a template brief")
    ms = models.IntegerField(null=True, blank=True)
    first_token_ms = models.IntegerField(null=True, blank=True)
    incident = models.ForeignKey("incidents.Incident", null=True, blank=True, on_delete=models.SET_NULL, related_name="ai_calls")
    report = models.ForeignKey("incidents.Report", null=True, blank=True, on_delete=models.SET_NULL, related_name="ai_calls")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.kind} {'ok' if self.ok else self.error} {self.ms}ms"
