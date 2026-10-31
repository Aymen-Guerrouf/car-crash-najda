"""GH1 SMS codec (plan §5.5) — Python mirror of packages/shared/src/smsCodec.ts.

    GH1;<short_id>;<lat>,<lng>;<role>;<triage>;<counts>;<answers>;<flags>;<profile>

Both codecs must pass contracts/sms_vectors.json. Error codes are part of that contract.
"""

import re
import unicodedata

from incidents import triage as triage_rules

VERSION = "GH1"
MAX_SMS_CHARS = 160
# With a profile photo reference (up to 43 chars) the text needs two concatenated SMS parts (2 x 153 GSM-7 chars)
MAX_SMS_CHARS_WITH_PHOTO = 306
# GSM-7 basic characters we allow: uppercase ASCII, digits and ; + , . / ? -
SAFE_CHARS = re.compile(r"^[A-Za-z0-9;+,./?\- ]*$")

ROLE_CODES = {"V": "VICTIM", "W": "WITNESS", "B": "BYSTANDER", "A": "AUTO"}
TRIAGE_CODES = {"R": "RED", "Y": "YELLOW", "G": "GREEN", "U": "UNKNOWN"}
FLAG_CODES = {
    "NB": "NOT_BREATHING", "AW": "AIRWAY", "FB": "FAST_BREATHING", "UN": "UNRESPONSIVE",
    "BL": "BLEEDING", "CM": "CANNOT_MOVE", "HD": "HEAD", "CB": "CHECK_BLEEDING", "FI": "FIRE",
    "SM": "SMOKE", "FL": "FUEL_LEAK", "TR": "TRAPPED", "RB": "ROAD_BLOCKED", "MC": "MCI",
}
CONDITION_CODES = {"DIA", "HTA", "CAR", "AST", "EPI", "ANT", "PRG", "OTH"}
ALLERGY_CODES = {"PEN", "ASP", "LAT", "IOD", "OTH"}
BLOOD_TYPES = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}

# Profile field: <blood>/<conditions>/<allergies>[/<age><sex>/<name>]. The last two parts are optional
# (older phones send 3 parts). Age 0-120, sex M or F, either may be missing ("-" if both are).
# The name is GSM-7 safe: ASCII letters, digits, space, dot and dash, upper-cased, max NAME_MAX chars.
NAME_MAX = 24
MAX_AGE = 120
AGE_SEX_RE = re.compile(r"^(\d{1,3})?([MF])?$")
NAME_RE = re.compile(r"^[A-Z0-9 .\-]{1,24}$")
# 7th and 8th profile parts: the free text typed under "other" (condition, allergy), same alphabet as the name, max OTHER_MAX chars.
# The 6th part is then "-" when there is no picture.
OTHER_MAX = 20
OTHER_RE = re.compile(r"^[A-Z0-9 .\-]{1,20}$")
# 6th profile part: the Cloudinary picture as <version>.<32 hex> (the host, account and folder are implied)
PHOTO_REF_RE = re.compile(r"^\d{1,12}\.[0-9A-F]{32}$")
PHOTO_URL_RE = re.compile(r"^https://res\.cloudinary\.com/[^/]+/image/upload/v(\d{1,12})/golden-hour/profiles/([0-9a-f]{32})\.\w+$")

_INV = lambda d: {v: k for k, v in d.items()}  # noqa: E731
ROLE_TO_CODE, TRIAGE_TO_CODE, FLAG_TO_CODE = _INV(ROLE_CODES), _INV(TRIAGE_CODES), _INV(FLAG_CODES)

SHORT_ID_RE = re.compile(r"^[0-9A-Z]{6}$")
COUNTS_RE = re.compile(r"^R(\d)Y(\d)G(\d)$")


class SmsDecodeError(ValueError):
    """`code` is one of the contract error codes (bad_version, bad_field_count, bad_short_id,
    bad_position, bad_role, bad_triage, bad_counts, bad_answers, bad_profile)."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code, self.detail = code, detail


def decode_sms(text: str) -> dict:
    """Tolerant decoder: trims spaces, uppercases every field except answers (field 7),
    ignores unknown flag codes, rejects a wrong version or field count."""
    fields = [f.strip() for f in text.strip().split(";")]
    if not fields or fields[0].upper() != VERSION:
        raise SmsDecodeError("bad_version", fields[0][:10] if fields else "")
    if len(fields) != 9:
        raise SmsDecodeError("bad_field_count", f"expected 9, got {len(fields)}")
    _, short_id, pos, role, triage, counts, answers, flags, profile = (
        f if i == 6 else f.upper() for i, f in enumerate(fields)
    )

    if not SHORT_ID_RE.match(short_id):
        raise SmsDecodeError("bad_short_id", short_id)

    try:
        lat_s, lng_s = pos.split(",")
        lat, lng = float(lat_s), float(lng_s)
    except ValueError:
        raise SmsDecodeError("bad_position", pos)
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise SmsDecodeError("bad_position", pos)

    if role not in ROLE_CODES:
        raise SmsDecodeError("bad_role", role)
    if triage not in TRIAGE_CODES:
        raise SmsDecodeError("bad_triage", triage)

    m = COUNTS_RE.match(counts)
    if not m:
        raise SmsDecodeError("bad_counts", counts)
    victim_counts = dict(zip(("RED", "YELLOW", "GREEN"), map(int, m.groups())))

    try:
        answer_list = [] if answers == "-" else triage_rules.decode_answers(answers)
    except ValueError:
        raise SmsDecodeError("bad_answers", answers)

    flag_list = []
    if flags != "-":
        for code in flags.split("+"):
            name = FLAG_CODES.get(code)  # unknown codes are ignored
            if name and name not in flag_list:
                flag_list.append(name)

    return {
        "short_id": short_id,
        "lat": lat,
        "lng": lng,
        "role": ROLE_CODES[role],
        "triage": TRIAGE_CODES[triage],
        "victim_counts": victim_counts,
        "answers": answer_list,
        "flags": flag_list,
        "profile": _decode_profile(profile),
    }


def _decode_profile(profile: str) -> dict | None:
    if profile == "-":
        return None
    parts = profile.split("/")
    if len(parts) not in (3, 5, 6, 8):
        raise SmsDecodeError("bad_profile", profile)
    blood, conditions, allergies = parts[:3]
    if blood != "??" and blood not in BLOOD_TYPES:
        raise SmsDecodeError("bad_profile", profile)

    def codes(raw: str, allowed: set[str]) -> list[str]:
        return [] if raw == "-" else [c for c in raw.split(".") if c in allowed]

    decoded = {
        "blood": None if blood == "??" else blood,
        "conditions": codes(conditions, CONDITION_CODES),
        "allergies": codes(allergies, ALLERGY_CODES),
    }
    if len(parts) >= 5:
        age_sex, name = parts[3], parts[4]
        if age_sex != "-":
            m = AGE_SEX_RE.match(age_sex)
            if not m or not age_sex or (m.group(1) and int(m.group(1)) > MAX_AGE):
                raise SmsDecodeError("bad_profile", profile)
            if m.group(1):
                decoded["age"] = int(m.group(1))
            if m.group(2):
                decoded["sex"] = m.group(2)
        if name != "-":
            if not NAME_RE.match(name):
                raise SmsDecodeError("bad_profile", profile)
            decoded["name"] = name
    if len(parts) >= 6 and parts[5] != "-":
        if not PHOTO_REF_RE.match(parts[5]):
            raise SmsDecodeError("bad_profile", profile)
        decoded["photo_ref"] = parts[5].lower()
    if len(parts) == 8:
        for key, raw in (("condition_other", parts[6]), ("allergy_other", parts[7])):
            if raw != "-":
                if not OTHER_RE.match(raw):
                    raise SmsDecodeError("bad_profile", profile)
                decoded[key] = raw
    return decoded


def sms_safe_text(text: str, max_len: int) -> str:
    """Free text as it travels in the SMS: accents stripped, anything outside A-Z 0-9 space . - dropped
    (so Arabic letters are lost), upper-cased, cut to max_len characters."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    cleaned = re.sub(r"[^A-Za-z0-9 .\-]", "", ascii_text)
    return re.sub(r"\s+", " ", cleaned).strip().upper()[:max_len].strip()


def sms_safe_name(name: str) -> str:
    return sms_safe_text(name, NAME_MAX)


def encode_sms(report: dict) -> str:
    """Inverse of decode_sms for a decoded-shape dict. Raises ValueError if it cannot fit
    one GSM-7 SMS (> 160 chars or unsafe characters)."""
    counts = report.get("victim_counts") or {}
    c = "".join(f"{k[0]}{min(int(counts.get(k, 0)), 9)}" for k in ("RED", "YELLOW", "GREEN"))
    answers = "".join(
        triage_rules.QUESTION_CODES[a["q"]] + triage_rules.VALUE_CODES[a["v"]] for a in report.get("answers") or []
    )
    flags = "+".join(FLAG_TO_CODE[f] for f in report.get("flags") or [] if f in FLAG_TO_CODE)
    sms = ";".join(
        [
            VERSION,
            report["short_id"].upper(),
            f"{report['lat']:.4f},{report['lng']:.4f}",
            ROLE_TO_CODE[report["role"]],
            TRIAGE_TO_CODE[report.get("triage", "UNKNOWN")],
            c,
            answers or "-",
            flags or "-",
            _encode_profile(report.get("profile")),
        ]
    )
    limit = MAX_SMS_CHARS_WITH_PHOTO if (report.get("profile") or {}).get("photo_ref") else MAX_SMS_CHARS
    if len(sms) > limit or not SAFE_CHARS.match(sms):
        raise ValueError(f"not a valid GSM-7 SMS ({len(sms)} chars, max {limit})")
    return sms


def encode_sms_fitted(report: dict) -> str:
    """Like encode_sms, but never refuses because of OPTIONAL profile details: if the SMS would exceed one message it
    drops, in this order, the name, then age and sex (the worst case without the name is 154 characters), then the typed "other" texts. Blood type,
    conditions, allergies, flags and counts are never dropped. The phone must do the same (see FRONTEND_HANDOFF.md §6)."""
    profile = report.get("profile")
    attempts = [report]
    if profile and profile.get("name"):
        attempts.append({**report, "profile": {k: v for k, v in profile.items() if k != "name"}})
    if profile and (profile.get("age") is not None or profile.get("sex")):
        attempts.append({**report, "profile": {k: v for k, v in profile.items() if k not in ("name", "age", "sex")}})
    if profile and (profile.get("condition_other") or profile.get("allergy_other")):  # last resort: the typed texts
        attempts.append({**report, "profile": {k: v for k, v in profile.items() if k not in ("name", "age", "sex", "condition_other", "allergy_other")}})
    last = None
    for candidate in attempts:
        try:
            return encode_sms(candidate)
        except ValueError as exc:
            last = exc
    raise last  # type: ignore[misc]


def _encode_profile(profile: dict | None) -> str:
    if not profile:
        return "-"
    parts = [
        profile.get("blood") or "??",
        ".".join(profile.get("conditions") or []) or "-",
        ".".join(profile.get("allergies") or []) or "-",
    ]
    age, sex = profile.get("age"), profile.get("sex")
    age_sex = (str(age) if isinstance(age, int) and 0 <= age <= MAX_AGE else "") + (sex if sex in ("M", "F") else "")
    name = sms_safe_name(profile.get("name") or "")
    photo = (profile.get("photo_ref") or "").upper()
    photo = photo if PHOTO_REF_RE.match(photo) else ""
    cond_other = sms_safe_text(profile.get("condition_other") or "", OTHER_MAX)
    allergy_other = sms_safe_text(profile.get("allergy_other") or "", OTHER_MAX)
    if cond_other or allergy_other:  # 8-part form: the picture slot is "-" when there is none
        parts += [age_sex or "-", name or "-", photo or "-", cond_other or "-", allergy_other or "-"]
    elif age_sex or name or photo:  # keep the 3-part form when there is nothing more to say
        parts += [age_sex or "-", name or "-"]
        if photo:
            parts.append(photo)
    return "/".join(parts)


def photo_ref_from_url(url: str | None) -> str | None:
    """"https://res.cloudinary.com/<cloud>/image/upload/v123/golden-hour/profiles/<hex>.jpg" -> "123.<hex>"."""
    m = PHOTO_URL_RE.match(url or "")
    return f"{m.group(1)}.{m.group(2)}" if m else None


def photo_url_from_ref(ref: str, cloud_name: str) -> str:
    version, hex_id = ref.split(".")
    return f"https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/golden-hour/profiles/{hex_id}.jpg"
