"""Prompts (plan §9.2 / §9.3). Keep byte-stable: providers can cache a stable prefix.
Version strings are logged with every call so rehearsal results stay comparable."""

VISION_PROMPT_VERSION = "vision-v3"
BRIEF_PROMPT_VERSION = "brief-v2"

# Findings on qwen2.5vl:3b (verify any change with `manage.py ai_eval`):
# - v1 (system prompt, optional fields) answered "Not an accident scene" for a wrecked SUV on a plain background.
# - v2 (all fields required) accepted the crash but ALSO invented a crash for a screenshot and a gradient: forcing a
#   small model to fill every field makes it hallucinate.
# - v3: a plain yes/no GATE decides "is this a crash?" first (accurate on all 3 test images); the structured analysis
#   only runs when the gate does not say "no".
GATE_QUESTIONS = (
    "Is there a vehicle in this image that is visibly damaged by a collision (crushed, broken, deformed)? "
    "Answer with one word: yes or no.",
    "Does this image show a road accident or a car crash? Answer with one word: yes or no.",
)
VISION_PROMPT = """You assist emergency dispatchers. Look at the photo and fill the JSON.
is_accident: true if a vehicle shows collision damage or a crash is visible (even on a plain background), else false.
If it is not an accident or a damaged vehicle: is_accident false, collision_type "UNKNOWN", confidence <= 0.2,
summary_fr "Not an accident scene".
collision_type: FRONTAL, SIDE, REAR, ROLLOVER, PEDESTRIAN, MOTORCYCLE or UNKNOWN.
airbag_deployed: true, false, or null if not visible.
deformation and impact_severity: LOW, MEDIUM, HIGH or UNKNOWN.
likely_injuries: infer from the mechanism only (decision support, not diagnosis):
frontal -> CHEST, ABDOMEN, LIMBS; side -> CHEST, PELVIS, HEAD; rollover -> HEAD, NECK_SPINE;
pedestrian or motorcycle -> HEAD, LIMBS, PELVIS; fire or smoke -> BURNS.
Describe only what is visible. If unsure use "UNKNOWN", null or a low confidence (0 to 1).
summary_fr: ONE factual sentence IN FRENCH, max 120 characters."""

VISION_USER_MESSAGE = ""


# brief-v2: v1 listed example preparations ("radio thorax") and the 3B model copied them with no chest evidence.
# Now the backend computes `allowed_preparations` from the facts and the model may only choose from that list.
BRIEF_PROMPT = """You write a pre-arrival brief for an emergency room in Algeria, in French.
Use ONLY facts from the JSON. Never invent vital signs, ages, injuries or preparations.
Write "inconnu" when information is missing. Max 90 words. Plain text, exactly these lines:
PATIENT: ...
MÉCANISME: ...
ÉTAT (triage): ...
LÉSIONS SUSPECTÉES: ... (prefix with "IA:" only when it comes from photo_analysis or suspected_injuries_from_photo)
ANTÉCÉDENTS / ALLERGIES: ...
PRÉPARER: copy the items of allowed_preparations, nothing else
ETA: ... min — <hospital>"""


def brief_prompt(context_json: str) -> str:
    """System prompt first (stable prefix), per-incident JSON last."""
    return f"{BRIEF_PROMPT}\n\nJSON:\n{context_json}"
