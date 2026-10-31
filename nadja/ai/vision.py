"""Scene analysis pipeline shared by the background task and `manage.py ai_eval`:

    shrink photo -> yes/no GATE ("is this a crash?") -> structured analysis (only if the gate does not say "no")

The gate exists because a small model asked to fill a full JSON invents a crash for any picture (see prompts.py).
"""

from django.conf import settings

from . import client, images, prompts, schemas


def analyze_scene(raw_image: bytes):
    """Returns (validated vision dict, client.Used). The dict has a `gate` key: passed | rejected | off.
    Raises client.AiError subclasses / ValueError (not an image) on failure."""
    image = images.prepare_for_model(raw_image, settings.AI_VISION_MAX_PX)
    if settings.AI_VISION_GATE:
        verdict, used = client.call_gate(image, prompts.GATE_QUESTIONS)
        if verdict == "no":
            vision = schemas.validate_vision({
                "is_accident": False, "collision_type": "UNKNOWN", "confidence": 0.1, "summary_fr": "Not an accident scene",
            })
            vision["gate"] = "rejected"
            return vision, used
    raw, used = client.call_vision(image, prompts.VISION_PROMPT)
    vision = schemas.validate_vision(raw)
    vision["gate"] = "passed" if settings.AI_VISION_GATE else "off"
    return vision, used
