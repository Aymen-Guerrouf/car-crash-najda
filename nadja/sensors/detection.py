"""Deterministic collision detector. No AI here, ever: a fixed threshold on the acceleration magnitude.

The magnitude includes gravity (a car at rest reads ~1 g), which is what the MPU6050 reports. Thresholds come from
settings (SENSOR_COLLISION_THRESHOLD_G) so the demo can tune them without touching code.
"""

import math
from dataclasses import dataclass

from django.conf import settings

GRAVITY = 9.80665  # m/s2 per g


@dataclass(frozen=True)
class Detection:
    magnitude: float  # m/s2
    magnitude_g: float
    threshold_g: float
    possible_collision: bool


def evaluate(x: float, y: float, z: float, threshold_g: float | None = None) -> Detection:
    threshold = settings.SENSOR_COLLISION_THRESHOLD_G if threshold_g is None else threshold_g
    magnitude = math.sqrt(x * x + y * y + z * z)
    magnitude_g = magnitude / GRAVITY
    return Detection(
        magnitude=magnitude,
        magnitude_g=magnitude_g,
        threshold_g=threshold,
        possible_collision=magnitude_g >= threshold,
    )
