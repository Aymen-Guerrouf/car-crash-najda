"""Metrics with the on-device output gate applied (numpy only). A prediction below the gate is "no suggestion":
for yes/no clips that counts as a MISS, for 'other' clips as a correct rejection."""

import numpy as np

P_MIN, MARGIN = 0.85, 0.30
YES, NO, OTHER = 1, 2, 0


def gated_predictions(probs: np.ndarray, p_min=P_MIN, margin=MARGIN) -> np.ndarray:
    """[N,3] probabilities -> [N] class index, or -1 when the gate says 'no suggestion'."""
    order = np.argsort(-probs, axis=1)
    top = probs[np.arange(len(probs)), order[:, 0]]
    second = probs[np.arange(len(probs)), order[:, 1]]
    ok = (top >= p_min) & (top - second >= margin)
    return np.where(ok, order[:, 0], -1)


def summarize(probs: np.ndarray, labels: np.ndarray, kinds=None) -> dict:
    labels = np.asarray(labels)
    pred = gated_predictions(probs)
    raw = probs.argmax(axis=1)
    n = {name: int((labels == cid).sum()) for name, cid in (("yes", YES), ("no", NO), ("other", OTHER))}

    def rate(num, den):
        return None if den == 0 else round(float(num) / float(den), 4)     # python floats only (json-serialisable)

    yes, no, oth = labels == YES, labels == NO, labels == OTHER
    shown = pred >= 0                                    # the gate let a suggestion through
    wrong = shown & (pred != labels)
    out = {
        "n": n,
        # what matters for a HELPER that only highlights a button (the user confirms by tapping):
        "coverage": rate(shown.sum(), len(labels)),                           # how often it suggests anything
        "precision": rate((shown & (pred == labels)).sum(), shown.sum()),      # when it suggests, how often it is right
        "wrong_suggestions": rate(wrong.sum(), len(labels)),                   # harmful: a wrong highlighted button
        "yes_no_precision": rate(((pred == labels) & np.isin(pred, (YES, NO))).sum(), np.isin(pred, (YES, NO)).sum()),
        "accuracy_ungated": rate((raw == labels).sum(), len(labels)),
        "yes_recall": rate((pred[yes] == YES).sum(), n["yes"]),                 # gated: below the gate = miss
        "no_recall": rate((pred[no] == NO).sum(), n["no"]),
        "yes_read_as_no": rate((pred[yes] == NO).sum(), n["yes"]),
        "no_read_as_yes": rate((pred[no] == YES).sum(), n["no"]),
        "false_accept": rate(np.isin(pred[oth], (YES, NO)).sum(), n["other"]),   # noise/silence/other words -> yes/no
    }
    if kinds is not None:
        kinds = np.asarray(kinds)
        for kind in ("silence", "noise"):
            sel = oth & (kinds == kind)
            out[f"false_accept_{kind}"] = rate(np.isin(pred[sel], (YES, NO)).sum(), int(sel.sum()))
    return out


def meets_gates(m: dict) -> dict:
    """The go/no-go gates of the plan (AI_Layer_Guide §11.5) on one metrics dict."""
    checks = {
        "yes_recall >= 0.95": (m["yes_recall"] or 0) >= 0.95,
        "no_recall >= 0.95": (m["no_recall"] or 0) >= 0.95,
        "false_accept <= 0.01": (m["false_accept"] if m["false_accept"] is not None else 1) <= 0.01,
        "yes<->no confusion <= 0.01": max(m["yes_read_as_no"] or 0, m["no_read_as_yes"] or 0) <= 0.01,
    }
    return {"checks": checks, "passed": all(checks.values())}


def meets_helper_gates(m: dict, min_precision=0.98, min_coverage=0.30) -> dict:
    """Gates for a confirm-by-tap helper: right when it speaks (precision), and speaks often enough to be worth having."""
    checks = {
        f"yes/no precision >= {min_precision}": (m.get("yes_no_precision") or 0) >= min_precision,
        f"false_accept <= 0.01": (m["false_accept"] if m["false_accept"] is not None else 1) <= 0.01,
        f"coverage of yes/no >= {min_coverage}": min(m["yes_recall"] or 0, m["no_recall"] or 0) >= min_coverage,
    }
    return {"checks": checks, "passed": all(checks.values())}
