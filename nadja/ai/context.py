"""Facts about an incident, in words, for the ER brief (plan §9.3 input).

One builder feeds both the AI prompt and the template fallback so they can never disagree.
Phone numbers and contacts are deliberately left out.
"""

import re
from datetime import timezone as dt_timezone

from django.utils import timezone

from .schemas import is_usable

TRIAGE_FR = {"RED": "ROUGE", "YELLOW": "JAUNE", "GREEN": "VERT", "UNKNOWN": "NON TRIÉ"}
QUESTION_FR = {
    "walk": "peut marcher", "breathing": "respire", "airway": "respire après bascule de la tête",
    "fast": "respiration très rapide", "responds": "répond quand on lui parle", "bleeding": "saignement important",
    "v_bleeding": "saigne beaucoup", "v_move": "peut bouger bras et jambes", "v_head": "choc à la tête / vertiges",
}
VALUE_FR = {"yes": "oui", "no": "non", "unknown": "inconnu"}
FLAG_FR = {
    "NOT_BREATHING": "ne respire pas", "AIRWAY": "voies aériennes à libérer", "FAST_BREATHING": "respiration rapide",
    "UNRESPONSIVE": "ne répond pas", "BLEEDING": "hémorragie", "CANNOT_MOVE": "ne peut pas bouger",
    "HEAD": "traumatisme crânien possible", "CHECK_BLEEDING": "saignement à vérifier", "FIRE": "incendie",
    "SMOKE": "fumée", "FUEL_LEAK": "fuite de carburant", "TRAPPED": "personne coincée",
    "ROAD_BLOCKED": "route bloquée", "MCI": "afflux massif de victimes",
}
HAZARD_FLAGS = ("FIRE", "SMOKE", "FUEL_LEAK", "TRAPPED", "ROAD_BLOCKED")
INJURY_FR = {
    "HEAD": "tête", "NECK_SPINE": "cou / rachis", "CHEST": "thorax", "ABDOMEN": "abdomen",
    "PELVIS": "bassin", "LIMBS": "membres", "BURNS": "brûlures",
}
COLLISION_FR = {
    "FRONTAL": "choc frontal", "SIDE": "choc latéral", "REAR": "choc arrière", "ROLLOVER": "tonneaux",
    "PEDESTRIAN": "piéton percuté", "MOTORCYCLE": "moto", "UNKNOWN": "inconnu",
}
CONDITION_FR = {
    "DIA": "diabète", "HTA": "hypertension", "CAR": "cardiopathie", "AST": "asthme",
    "EPI": "épilepsie", "ANT": "anticoagulants", "PRG": "grossesse",
}
ALLERGY_FR = {"PEN": "pénicilline", "ASP": "aspirine/AINS", "LAT": "latex", "IOD": "iode", "OTH": "autre"}
SEX_FR = {"M": "homme", "F": "femme"}


def _other(profile: dict, key: str) -> str:
    """The text typed under "other" (condition / allergy), or "autre" when there is none."""
    text = profile.get(key)
    return text.strip()[:60] if isinstance(text, str) and text.strip() else "autre"


def _patient(reports) -> dict | None:
    profile = None
    for r in reports:  # newest non-empty profile wins
        if r.profile:
            profile = r.profile
    if not profile:
        return None
    age = profile.get("age")
    return {
        "blood": profile.get("blood") or None,
        "age": age if isinstance(age, int) and not isinstance(age, bool) else None,
        "sex": SEX_FR.get(profile.get("sex")),
        "conditions": [_other(profile, "condition_other") if c == "OTH" else CONDITION_FR.get(c, c) for c in profile.get("conditions") or [] if isinstance(c, str)],
        "allergies": [_other(profile, "allergy_other") if a == "OTH" else ALLERGY_FR.get(a, a) for a in profile.get("allergies") or [] if isinstance(a, str)],
    }


def _vision(reports) -> dict | None:
    best = None
    for r in reports:
        v = r.ai_vision
        if is_usable(v) and (best is None or v["confidence"] > best["confidence"]):
            best = v
    if best is None:
        return None
    return {
        "collision": COLLISION_FR.get(best["collision_type"], "inconnu"),
        "airbag_deployed": best["airbag_deployed"],
        "deformation": best["deformation"],
        "rollover": best["rollover"],
        "fire_or_smoke": best["fire_or_smoke"],
        "summary": best["summary_fr"],
        "confidence": best["confidence"],
    }


# Preparations the ER can be asked for, each with the wordings a model might use for it (for the grounding check).
PREPARATION_PATTERNS = {
    "salle de déchocage": r"d[ée]chocage",
    "matériel de ventilation": r"ventilation|intubation",
    "radio thorax": r"radio(graphie)?\s+(du\s+)?thora|thorax",
    "scanner cérébral": r"scanner\s+c[ée]r[ée]bral|scanner\s+(de\s+la\s+)?t[êe]te|tdm\s+c[ée]r[ée]bral",
    "immobilisation du rachis": r"rachis|immobilisation",
    "échographie FAST": r"[ée]chographie|\bfast\b",
    "culots globulaires": r"culots?|transfusion",
    "prise en charge des brûlés": r"br[ûu]l[ée]s?|br[ûu]lures",
    "renforts pour afflux de victimes": r"renforts|afflux",
}


def preparations(ctx: dict) -> list[str]:
    """What to prepare, derived ONLY from the facts (max 4). The model may pick from this list, never beyond it."""
    flags, injuries = set(ctx["_flags_raw"]), set(ctx["_injuries_raw"])
    blood = (ctx["patient"] or {}).get("blood")
    wanted = []
    if ctx["triage_code"] == "RED" or ctx["mass_casualty"]:
        wanted.append("salle de déchocage")
    if flags & {"NOT_BREATHING", "AIRWAY", "FAST_BREATHING", "UNRESPONSIVE"}:
        wanted.append("matériel de ventilation")
    if "CHEST" in injuries:
        wanted.append("radio thorax")
    if "HEAD" in flags | injuries:
        wanted.append("scanner cérébral")
    if "NECK_SPINE" in injuries or "CANNOT_MOVE" in flags:
        wanted.append("immobilisation du rachis")
    if injuries & {"ABDOMEN", "PELVIS"}:
        wanted.append("échographie FAST")
    if "BLEEDING" in flags:
        wanted.append(f"culots globulaires groupe {blood}" if blood else "culots globulaires")
    if "BURNS" in injuries or "FIRE" in flags:
        wanted.append("prise en charge des brûlés")
    if ctx["mass_casualty"]:
        wanted.append("renforts pour afflux de victimes")
    return wanted[:4] or ["équipe de traumatologie"]


def ungrounded_preparations(text: str, allowed: list[str]) -> list[str]:
    """Preparations mentioned in a brief that the facts do not justify."""
    allowed_text = " ".join(allowed).lower()
    found = []
    for name, pattern in PREPARATION_PATTERNS.items():
        if re.search(pattern, text, re.IGNORECASE) and not re.search(pattern, allowed_text, re.IGNORECASE):
            found.append(name)
    return found


def build_context(incident) -> dict:
    reports = list(incident.reports.all())
    first = min((r.received_at for r in reports), default=incident.created_at)
    minutes = max(0, int((timezone.now() - first.astimezone(dt_timezone.utc)).total_seconds() // 60))
    hospital = incident.hospital
    ctx = {
        "triage": TRIAGE_FR[incident.worst_triage],
        "triage_code": incident.worst_triage,
        "victim_counts": incident.victim_counts,
        "mass_casualty": incident.is_mci,
        "flags": [FLAG_FR.get(f, f) for f in incident.flags if f not in HAZARD_FLAGS],
        "hazards": [FLAG_FR[f] for f in incident.flags if f in HAZARD_FLAGS],
        "reports": [
            {
                "role": r.role,
                "channel": r.channel,
                "answers": [
                    f"{QUESTION_FR[a['q']]}: {VALUE_FR[a['v']]}"
                    for a in r.answers or []
                    if a.get("q") in QUESTION_FR and a.get("v") in VALUE_FR
                ],
            }
            for r in reports
        ],
        "patient": _patient(reports),
        "photo_analysis": _vision(reports),
        "suspected_injuries_from_photo": [INJURY_FR[i] for i in incident.injuries if i in INJURY_FR],
        "hospital": hospital.name if hospital else None,
        "eta_min": incident.eta_min,
        "channels": sorted({r.channel for r in reports}),
        "minutes_since_first_alert": minutes,
        "_flags_raw": list(incident.flags),
        "_injuries_raw": list(incident.injuries),
    }
    ctx["allowed_preparations"] = preparations(ctx)
    return ctx


def prompt_json(context: dict) -> dict:
    """The context without the internal `_` keys, safe to send to a model."""
    return {k: v for k, v in context.items() if not k.startswith("_")}


def numbers_in(obj) -> set[str]:
    import json

    return set(re.findall(r"\d+", json.dumps(obj, ensure_ascii=False)))
