"""Validation of the vision model's JSON (plan §9.2). Never trust model output."""

import re

from django.conf import settings

from incidents.enums import Injury

COLLISIONS = ("FRONTAL", "SIDE", "REAR", "ROLLOVER", "PEDESTRIAN", "MOTORCYCLE", "UNKNOWN")
LEVELS = ("LOW", "MEDIUM", "HIGH", "UNKNOWN")
INJURIES = tuple(i.value for i in Injury)
NOT_ACCIDENT_CONFIDENCE = 0.2

# JSON schema handed to providers that support constrained output (Ollama `format`).
VISION_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "is_accident": {"type": "boolean"},  # first on purpose: the model decides this before anything else
        "collision_type": {"type": "string", "enum": list(COLLISIONS)},
        "vehicles_count": {"type": "integer"},
        "airbag_deployed": {"type": ["boolean", "null"]},
        "deformation": {"type": "string", "enum": list(LEVELS)},
        "cabin_intrusion": {"type": "boolean"},
        "rollover": {"type": "boolean"},
        "fire_or_smoke": {"type": "boolean"},
        "likely_injuries": {"type": "array", "items": {"type": "string", "enum": list(INJURIES)}},
        "impact_severity": {"type": "string", "enum": list(LEVELS)},
        "confidence": {"type": "number"},
        "summary_fr": {"type": "string"},
    },
}
# Every field is required, otherwise small models return only the minimum ("UNKNOWN", 0.2, summary).
VISION_JSON_SCHEMA["required"] = list(VISION_JSON_SCHEMA["properties"])


def _enum(value, allowed) -> str:
    return value.upper() if isinstance(value, str) and value.upper() in allowed else "UNKNOWN"


def _bool(value, default=False):
    return value if isinstance(value, bool) else default


def _clean_text(value, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    value = re.sub(r"[\x00-\x1f\x7f]", " ", value)
    return re.sub(r"\s+", " ", value).strip()[:limit]


def validate_vision(raw) -> dict:
    """Coerce any model output into the §9.2 schema. Raises ValueError only if it is not an object."""
    if not isinstance(raw, dict):
        raise ValueError("vision output is not a JSON object")

    try:
        confidence = float(raw.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = min(1.0, max(0.0, confidence)) if confidence == confidence else 0.0  # NaN -> 0

    collision = _enum(raw.get("collision_type"), COLLISIONS)
    summary = _clean_text(raw.get("summary_fr"), 120)
    injuries = []
    for item in raw.get("likely_injuries") if isinstance(raw.get("likely_injuries"), list) else []:
        item = item.upper() if isinstance(item, str) else item
        if item in INJURIES and item not in injuries:
            injuries.append(item)

    vehicles = raw.get("vehicles_count")
    vehicles = vehicles if isinstance(vehicles, int) and not isinstance(vehicles, bool) and 0 <= vehicles <= 50 else None

    airbag = raw.get("airbag_deployed")
    is_accident = raw.get("is_accident")
    result = {
        "is_accident": is_accident if isinstance(is_accident, bool) else None,
        "collision_type": collision,
        "vehicles_count": vehicles,
        "airbag_deployed": airbag if isinstance(airbag, bool) else None,
        "deformation": _enum(raw.get("deformation"), LEVELS),
        "cabin_intrusion": _bool(raw.get("cabin_intrusion")),
        "rollover": _bool(raw.get("rollover")),
        "fire_or_smoke": _bool(raw.get("fire_or_smoke")),
        "likely_injuries": injuries,
        "impact_severity": _enum(raw.get("impact_severity"), LEVELS),
        "confidence": round(confidence, 3),
        "summary_fr": summary,
    }
    if result["is_accident"] is False or "not an accident" in summary.lower():
        result["collision_type"] = "UNKNOWN"
        result["confidence"] = min(result["confidence"], NOT_ACCIDENT_CONFIDENCE)
    result["low_confidence"] = result["confidence"] < settings.AI_VISION_MIN_CONFIDENCE
    return result


def is_usable(vision: dict | None) -> bool:
    """Only confident results feed the incident (injuries) and the brief."""
    return bool(vision) and not vision.get("low_confidence", True)
