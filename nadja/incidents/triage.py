"""Server-side triage (plan §8.2, Phase 2 backend step 2-3).

The phone runs the same trees. The server recomputes the result from the
stored answers and trusts its own computation, but never *lowers* a triage the
phone reported: when both disagree the worse one wins and the mismatch is logged.
"""

import logging
from dataclasses import dataclass

from .enums import TRIAGE_SEVERITY, Flag, Role, Triage

logger = logging.getLogger(__name__)

YES, NO, UNKNOWN = "yes", "no", "unknown"
ANSWER_VALUES = (YES, NO, UNKNOWN)

# Question id -> SMS code (plan §5.5). Letters are case-sensitive.
QUESTION_CODES = {
    "walk": "W",
    "breathing": "B",
    "airway": "A",
    "fast": "F",
    "responds": "R",
    "bleeding": "H",
    "v_bleeding": "b",
    "v_move": "m",
    "v_head": "h",
}
VALUE_CODES = {YES: "1", NO: "0", UNKNOWN: "?"}
CODE_TO_QUESTION = {c: q for q, c in QUESTION_CODES.items()}
CODE_TO_VALUE = {c: v for v, c in VALUE_CODES.items()}


@dataclass(frozen=True)
class Result:
    triage: str
    flag: str | None = None


# node -> {answer: next node id (str) | Result}. `unknown` always takes the safer branch.
WITNESS_TREE = {
    "walk": {YES: Result(Triage.GREEN), NO: "breathing", UNKNOWN: "breathing"},
    "breathing": {YES: "fast", NO: "airway", UNKNOWN: "airway"},
    "airway": {
        YES: Result(Triage.RED, Flag.AIRWAY),
        NO: Result(Triage.RED, Flag.NOT_BREATHING),
        UNKNOWN: Result(Triage.RED, Flag.NOT_BREATHING),
    },
    "fast": {YES: Result(Triage.RED, Flag.FAST_BREATHING), NO: "responds", UNKNOWN: "responds"},
    "responds": {
        YES: "bleeding",
        NO: Result(Triage.RED, Flag.UNRESPONSIVE),
        UNKNOWN: Result(Triage.RED, Flag.UNRESPONSIVE),
    },
    "bleeding": {
        YES: Result(Triage.RED, Flag.BLEEDING),
        NO: Result(Triage.YELLOW),
        UNKNOWN: Result(Triage.YELLOW, Flag.CHECK_BLEEDING),
    },
}
WITNESS_ROOT = "walk"

VICTIM_TREE = {
    "v_bleeding": {YES: Result(Triage.RED, Flag.BLEEDING), NO: "v_move", UNKNOWN: "v_move"},
    "v_move": {YES: "v_head", NO: Result(Triage.RED, Flag.CANNOT_MOVE), UNKNOWN: "v_head"},
    "v_head": {
        YES: Result(Triage.YELLOW, Flag.HEAD),
        NO: Result(Triage.GREEN),
        UNKNOWN: Result(Triage.YELLOW, Flag.HEAD),
    },
}
VICTIM_ROOT = "v_bleeding"

AUTO_RESULT = Result(Triage.RED, Flag.UNRESPONSIVE)


def worse(a: str, b: str) -> str:
    return a if TRIAGE_SEVERITY[a] >= TRIAGE_SEVERITY[b] else b


def evaluate(role: str, answers: list[dict]) -> Result | None:
    """Walk the tree for `role` using the latest answer per question.
    Returns the Result, or None while the tree is not finished (or unknown role)."""
    if role == Role.AUTO:
        return AUTO_RESULT
    if role == Role.VICTIM:
        tree, node = VICTIM_TREE, VICTIM_ROOT
    else:  # WITNESS and BYSTANDER use the layperson START tree
        tree, node = WITNESS_TREE, WITNESS_ROOT
    latest = {a["q"]: a["v"] for a in answers or []}
    while True:
        value = latest.get(node)
        if value not in ANSWER_VALUES:
            return None
        nxt = tree[node][value]
        if isinstance(nxt, Result):
            return nxt
        node = nxt


def encode_answers(answers: list[dict]) -> str:
    """[{"q":"walk","v":"no"},...] -> "W0B1" (latest answer per question, first-asked order)."""
    latest: dict[str, str] = {}
    for a in answers or []:
        if a.get("q") in QUESTION_CODES and a.get("v") in VALUE_CODES:
            latest[a["q"]] = a["v"]
    return "".join(QUESTION_CODES[q] + VALUE_CODES[v] for q, v in latest.items())


def decode_answers(code: str) -> list[dict]:
    """Inverse of encode_answers. Raises ValueError on a malformed code."""
    if len(code) % 2:
        raise ValueError(f"bad answers code {code!r}")
    out = []
    for i in range(0, len(code), 2):
        q, v = CODE_TO_QUESTION.get(code[i]), CODE_TO_VALUE.get(code[i + 1])
        if q is None or v is None:
            raise ValueError(f"bad answers code {code!r}")
        out.append({"q": q, "v": v})
    return out


def reconcile(role: str, triage: str, answers: list[dict], flags: list[str]) -> tuple[str, list[str], str]:
    """Combine the phone's triage/flags with the server's own computation.

    Returns (triage, flags, answers_code):
    - triage: worse of phone vs server (server only counts once the tree is finished)
    - flags: phone flags + the tree's flag, no duplicates
    - answers_code: always computed server-side
    """
    result = evaluate(role, answers)
    final_triage = triage
    final_flags = list(flags or [])
    if result is not None:
        final_triage = worse(triage, result.triage)
        if result.triage != triage and triage != Triage.UNKNOWN:
            logger.warning(
                "triage mismatch role=%s phone=%s server=%s answers=%s -> keeping %s",
                role, triage, result.triage, encode_answers(answers), final_triage,
            )
        if result.flag and result.flag not in final_flags:
            final_flags.append(result.flag)
    return final_triage, final_flags, encode_answers(answers)
