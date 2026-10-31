"""Sensor reading pipeline: validate -> store -> detect -> broadcast.

Deliberately does NOT touch incidents, hospitals, SMS or AI. A possible collision is stored as PENDING and shown
on the dashboard; only an operator decides what happens next.
"""

import math
import re
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from realtime.broadcast import broadcast

from . import detection
from .models import ReviewStatus, SensorReading, SensorSource

DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,64}$")
MAX_SEQUENCE = 2_147_483_647  # PositiveIntegerField upper bound
MAX_ABS_ACCEL = 1000.0  # m/s2 sanity bound (~100 g; the MPU6050 saturates at 16 g)
UNIT = "m/s2"


class ReadingInvalid(ValueError):
    def __init__(self, errors: dict):
        super().__init__("invalid sensor reading")
        self.errors = errors


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def validate(data) -> dict:
    """Strict validation of the ESP32 JSON body. Returns the clean values or raises ReadingInvalid."""
    if not isinstance(data, dict):
        raise ReadingInvalid({"non_field_errors": "Expected a JSON object."})
    errors = {}

    device_id = data.get("device_id")
    if not isinstance(device_id, str) or not device_id.strip():
        errors["device_id"] = "Required, non-empty string."
    elif not DEVICE_ID_RE.match(device_id.strip()):
        errors["device_id"] = "1-64 characters: letters, digits, '_', '.', '-'."

    source = data.get("source")
    if source is None:
        errors["source"] = "Required."
    elif source not in SensorSource.values:
        errors["source"] = f"Must be one of {SensorSource.values}."

    sequence = data.get("sequence")
    if not isinstance(sequence, int) or isinstance(sequence, bool) or not 1 <= sequence <= MAX_SEQUENCE:
        errors["sequence"] = "Required positive integer."

    acc = data.get("acceleration")
    if not isinstance(acc, dict):
        errors["acceleration"] = "Required object with numeric x, y, z."
    else:
        bad = [k for k in ("x", "y", "z") if not _is_number(acc.get(k)) or abs(acc[k]) > MAX_ABS_ACCEL]
        if bad:
            errors["acceleration"] = f"Finite numbers within ±{MAX_ABS_ACCEL:g} required for: {', '.join(bad)}."

    if data.get("unit") != UNIT:
        errors["unit"] = f"Must be '{UNIT}'."

    if errors:
        raise ReadingInvalid(errors)
    return {
        "device_id": device_id.strip(),
        "source": source,
        "sequence": sequence,
        "ax": float(acc["x"]),
        "ay": float(acc["y"]),
        "az": float(acc["z"]),
        "unit": UNIT,
    }


def reading_payload(r: SensorReading) -> dict:
    return {
        "id": r.id,
        "device_id": r.device_id,
        "source": r.source,
        "simulated": r.is_simulated,
        "sequence": r.sequence,
        "acceleration": {"x": r.ax, "y": r.ay, "z": r.az},
        "unit": r.unit,
        "magnitude": round(r.magnitude, 3),
        "magnitude_g": round(r.magnitude_g, 3),
        "possible_collision": r.possible_collision,
        "review_status": r.review_status or None,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        "received_at": r.received_at.isoformat(),
    }


def _simulator_status(previous: SensorReading | None, reading: SensorReading) -> str | None:
    """ONLINE when a device starts talking (first reading or after a silence), RESTARTED when its sequence
    goes backwards (ESP32 reboot). None while it keeps streaming normally."""
    if previous is None:
        return "ONLINE"
    if reading.received_at - previous.received_at > timedelta(seconds=settings.SENSOR_OFFLINE_AFTER_S):
        return "ONLINE"
    if reading.sequence <= previous.sequence:
        return "RESTARTED"
    return None


def ingest(clean: dict) -> SensorReading:
    result = detection.evaluate(clean["ax"], clean["ay"], clean["az"])
    with transaction.atomic():
        previous = SensorReading.objects.filter(device_id=clean["device_id"]).order_by("-received_at", "-id").first()
        reading = SensorReading.objects.create(
            **clean,
            is_simulated=True,
            magnitude=result.magnitude,
            magnitude_g=result.magnitude_g,
            possible_collision=result.possible_collision,
            review_status=ReviewStatus.PENDING if result.possible_collision else "",
        )

    status = _simulator_status(previous, reading)
    if status:
        broadcast(
            "simulator_status",
            {
                "device_id": reading.device_id,
                "source": reading.source,
                "simulated": True,
                "status": status,
                "sequence": reading.sequence,
                "received_at": reading.received_at.isoformat(),
            },
        )
    payload = reading_payload(reading)
    broadcast("sensor_reading", payload)
    if reading.possible_collision:
        broadcast(
            "possible_collision",
            {
                **payload,
                "verified": False,  # always: only an operator can validate it
                "detection": {
                    "method": "magnitude_threshold",
                    "magnitude_g": round(result.magnitude_g, 3),
                    "threshold_g": result.threshold_g,
                },
            },
        )
    return reading


class ReviewError(Exception):
    def __init__(self, code: str, detail: str, status: int):
        super().__init__(detail)
        self.code, self.detail, self.status = code, detail, status


def review(reading: SensorReading, decision: str) -> SensorReading:
    """Operator decision on a possible collision. Only flips the review status: it never creates an incident,
    dispatches or sends an SMS (that stays a separate, explicit operator action)."""
    if not reading.possible_collision:
        raise ReviewError("not_a_collision", "This reading is not a possible collision.", 409)
    target = {"VALIDATE": ReviewStatus.VALIDATED, "REJECT": ReviewStatus.REJECTED}.get(decision)
    if target is None:
        raise ReviewError("validation_error", "decision must be VALIDATE or REJECT.", 400)
    if reading.review_status == target:
        return reading  # idempotent
    if reading.review_status != ReviewStatus.PENDING:
        raise ReviewError("invalid_state", f"Already {reading.review_status}.", 409)
    reading.review_status = target
    reading.reviewed_at = timezone.now()
    reading.save(update_fields=["review_status", "reviewed_at"])
    broadcast("possible_collision.reviewed", reading_payload(reading))
    return reading
