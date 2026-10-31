"""Template ER brief (plan §9.3 fallback): the same 7 lines, filled from data, no AI."""

from .context import build_context

LINE_PREFIXES = ("PATIENT", "MÉCANISME", "ÉTAT (triage)", "LÉSIONS SUSPECTÉES", "ANTÉCÉDENTS / ALLERGIES", "PRÉPARER", "ETA")


def _patient_line(ctx) -> str:
    p = ctx["patient"]
    parts = []
    if p:
        parts += [x for x in (p["sex"], f"{p['age']} ans" if p["age"] is not None else None) if x]
        if p["blood"]:
            parts.append(f"groupe {p['blood']}")
    c = ctx["victim_counts"]
    counts = ", ".join(f"{c.get(k, 0)} {label}" for k, label in (("RED", "rouge"), ("YELLOW", "jaune"), ("GREEN", "vert")) if c.get(k))
    head = ", ".join(parts) if parts else "inconnu"
    return f"{head} — victimes: {counts}" if counts else head


def _mechanism_line(ctx) -> str:
    bits = []
    v = ctx["photo_analysis"]
    if v and v["collision"] != "inconnu":
        extra = ["airbag déclenché"] if v["airbag_deployed"] else []
        if v["rollover"]:
            extra.append("tonneaux")
        bits.append(f"IA: {v['collision']}" + (f" ({', '.join(extra)})" if extra else ""))
    bits += ctx["hazards"]
    return ", ".join(bits) if bits else "inconnu"


def _state_line(ctx) -> str:
    flags = ", ".join(ctx["flags"])
    return f"{ctx['triage']}" + (f" — {flags}" if flags else "")


def _lesions_line(ctx) -> str:
    items = []
    if ctx["suspected_injuries_from_photo"]:
        items.append("IA: " + ", ".join(ctx["suspected_injuries_from_photo"]))
    flags = set(ctx["_flags_raw"])
    if "HEAD" in flags:
        items.append("tête (déclaré)")
    if "BLEEDING" in flags:
        items.append("hémorragie (déclarée)")
    if "CANNOT_MOVE" in flags:
        items.append("atteinte neurologique/rachis possible")
    return "; ".join(items) if items else "inconnues"


def _history_line(ctx) -> str:
    p = ctx["patient"]
    if not p:
        return "inconnus"
    cond = ", ".join(p["conditions"]) or "aucun connu"
    allergy = ", ".join(p["allergies"]) or "aucune connue"
    return f"{cond} / {allergy}"


def _prepare_line(ctx) -> str:
    return ", ".join(ctx["allowed_preparations"])


def _eta_line(ctx) -> str:
    if ctx["hospital"] and ctx["eta_min"] is not None:
        return f"{ctx['eta_min']} min — {ctx['hospital']}"
    return f"inconnu — {ctx['hospital']}" if ctx["hospital"] else "inconnu"


def template_brief(incident) -> str:
    ctx = build_context(incident)
    values = (
        _patient_line(ctx), _mechanism_line(ctx), _state_line(ctx), _lesions_line(ctx),
        _history_line(ctx), _prepare_line(ctx), _eta_line(ctx),
    )
    return "\n".join(f"{prefix}: {value}" for prefix, value in zip(LINE_PREFIXES, values))
