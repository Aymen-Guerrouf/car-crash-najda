from django.db import models


class Hospital(models.Model):
    name = models.CharField(max_length=120)
    short_name = models.CharField(max_length=12, help_text="Used in the SMS ACK (<= 12 chars)")
    lat = models.FloatField()
    lng = models.FloatField()
    phone = models.CharField(max_length=32, blank=True)
    capabilities = models.JSONField(default=list, help_text="list[Capability]")
    beds_available = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.name
