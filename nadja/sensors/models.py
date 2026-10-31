"""Vehicle sensor readings (ESP32 / MPU6050). Kept apart from Incident/Report on purpose: a reading, even a
possible collision, is never an incident until an operator says so."""

from django.db import models


class SensorSource(models.TextChoices):
    WOKWI_SIMULATOR = "WOKWI_SIMULATOR"


class ReviewStatus(models.TextChoices):
    PENDING = "PENDING"  # possible collision, not yet seen by an operator
    VALIDATED = "VALIDATED"
    REJECTED = "REJECTED"


class SensorReading(models.Model):
    device_id = models.CharField(max_length=64, db_index=True)
    source = models.CharField(max_length=32, choices=SensorSource.choices)
    is_simulated = models.BooleanField(default=True)  # every source accepted today is a simulator
    sequence = models.PositiveIntegerField()
    ax = models.FloatField()
    ay = models.FloatField()
    az = models.FloatField()
    unit = models.CharField(max_length=8, default="m/s2")
    magnitude = models.FloatField()  # m/s2, gravity included (what the accelerometer reads)
    magnitude_g = models.FloatField()
    possible_collision = models.BooleanField(default=False)
    # Empty for ordinary readings; PENDING -> VALIDATED | REJECTED for possible collisions.
    review_status = models.CharField(max_length=10, choices=ReviewStatus.choices, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-received_at", "-id"]

    def __str__(self):
        return f"{self.device_id}#{self.sequence} ({self.magnitude_g:.2f} g)"
