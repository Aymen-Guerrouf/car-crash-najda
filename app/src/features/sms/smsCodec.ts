// GH1 SMS codec (plan §5.5): mirror of nadja/sms/codec.py. Must pass contracts/sms_vectors.json
// (run scripts/check-sms-codec.mjs). Self-contained on purpose so it can run outside Metro.
//
//   GH1;<short_id>;<lat>,<lng>;<role>;<triage>;<counts>;<answers>;<flags>;<profile>

export const VERSION = 'GH1';
export const MAX_SMS_CHARS = 160;
// With a picture reference (43 chars) the text needs two concatenated SMS parts (2 x 153 GSM-7 characters)
export const MAX_SMS_CHARS_WITH_PHOTO = 306;
// GSM-7 basic characters we allow: letters, digits and ; + , . / ? - and space
const SAFE_CHARS = /^[A-Za-z0-9;+,./?\- ]*$/;

export type DecodeErrorCode =
  | 'bad_version' | 'bad_field_count' | 'bad_short_id' | 'bad_position' | 'bad_role'
  | 'bad_triage' | 'bad_counts' | 'bad_answers' | 'bad_profile';

export class SmsDecodeError extends Error {
  code: DecodeErrorCode;

  constructor(code: DecodeErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const ROLE_CODES: Record<string, string> = { V: 'VICTIM', W: 'WITNESS', B: 'BYSTANDER', A: 'AUTO' };
const TRIAGE_CODES: Record<string, string> = { R: 'RED', Y: 'YELLOW', G: 'GREEN', U: 'UNKNOWN' };
const FLAG_CODES: Record<string, string> = {
  NB: 'NOT_BREATHING', AW: 'AIRWAY', FB: 'FAST_BREATHING', UN: 'UNRESPONSIVE', BL: 'BLEEDING',
  CM: 'CANNOT_MOVE', HD: 'HEAD', CB: 'CHECK_BLEEDING', FI: 'FIRE', SM: 'SMOKE', FL: 'FUEL_LEAK',
  TR: 'TRAPPED', RB: 'ROAD_BLOCKED', MC: 'MCI',
};
const QUESTION_CODES: Record<string, string> = {
  walk: 'W', breathing: 'B', airway: 'A', fast: 'F', responds: 'R', bleeding: 'H',
  v_bleeding: 'b', v_move: 'm', v_head: 'h',
};
const VALUE_CODES: Record<string, string> = { yes: '1', no: '0', unknown: '?' };

const invert = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [v, k]));
const ROLE_TO_CODE = invert(ROLE_CODES);
const TRIAGE_TO_CODE = invert(TRIAGE_CODES);
const FLAG_TO_CODE = invert(FLAG_CODES);
const CODE_TO_QUESTION = invert(QUESTION_CODES);
const CODE_TO_VALUE = invert(VALUE_CODES);

const CONDITION_CODES = new Set(['DIA', 'HTA', 'CAR', 'AST', 'EPI', 'ANT', 'PRG', 'OTH']);
const ALLERGY_CODES = new Set(['PEN', 'ASP', 'LAT', 'IOD', 'OTH']);
const BLOOD_TYPES = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

// Profile field: <blood>/<conditions>/<allergies>[/<age><sex>/<name>]. The last two parts are optional
// (older phones send 3 parts). Age 0-120, sex M or F, either may be missing ("-" if both are).
// The name is GSM-7 safe: ASCII letters, digits, space, dot and dash, upper-cased, max NAME_MAX characters.
export const NAME_MAX = 24;
const MAX_AGE = 120;
const AGE_SEX_RE = /^(\d{1,3})?([MF])?$/;
const NAME_RE = /^[A-Z0-9 .\-]{1,24}$/;
// 7th and 8th profile parts: the free text typed under "other" (condition, allergy), same alphabet as the name,
// max OTHER_MAX characters. The 6th part is then "-" when there is no picture.
export const OTHER_MAX = 20;
const OTHER_RE = /^[A-Z0-9 .\-]{1,20}$/;
// 6th profile part: the Cloudinary picture as <version>.<32 hex> (host, account and folder are implied)
const PHOTO_REF_RE = /^\d{1,12}\.[0-9A-F]{32}$/;
const PHOTO_URL_RE = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/v(\d{1,12})\/golden-hour\/profiles\/([0-9a-f]{32})\.\w+$/;

/** Hosted picture URL (from /api/profile-photo/) -> the short reference carried in the SMS, or null if it is not ours. */
export function photoRefFromUrl(url: string | null | undefined): string | null {
  const m = PHOTO_URL_RE.exec(url ?? '');
  return m ? `${m[1]}.${m[2]}` : null;
}

export interface SmsReport {
  short_id: string;
  lat: number;
  lng: number;
  role: string;
  triage: string;
  victim_counts: { RED: number; YELLOW: number; GREEN: number };
  answers: { q: string; v: string }[];
  flags: string[];
  profile: { blood: string | null; conditions: string[]; allergies: string[]; age?: number; sex?: string; name?: string; photo_ref?: string; condition_other?: string; allergy_other?: string } | null;
}

function decodeAnswers(code: string): { q: string; v: string }[] {
  if (code.length % 2) throw new SmsDecodeError('bad_answers', code);
  const out: { q: string; v: string }[] = [];
  for (let i = 0; i < code.length; i += 2) {
    const q = CODE_TO_QUESTION[code[i]!];
    const v = CODE_TO_VALUE[code[i + 1]!];
    if (!q || !v) throw new SmsDecodeError('bad_answers', code);
    out.push({ q, v });
  }
  return out;
}

function decodeProfile(profile: string): SmsReport['profile'] {
  if (profile === '-') return null;
  const parts = profile.split('/');
  if (parts.length !== 3 && parts.length !== 5 && parts.length !== 6 && parts.length !== 8) throw new SmsDecodeError('bad_profile', profile);
  const [blood, conditions, allergies] = parts as [string, string, string];
  if (blood !== '??' && !BLOOD_TYPES.has(blood)) throw new SmsDecodeError('bad_profile', profile);
  const codes = (raw: string, allowed: Set<string>) =>
    raw === '-' ? [] : raw.split('.').filter((c) => allowed.has(c));
  const decoded: NonNullable<SmsReport['profile']> = {
    blood: blood === '??' ? null : blood,
    conditions: codes(conditions, CONDITION_CODES),
    allergies: codes(allergies, ALLERGY_CODES),
  };
  if (parts.length >= 5) {
    const [ageSex, name] = [parts[3]!, parts[4]!];
    if (ageSex !== '-') {
      const m = AGE_SEX_RE.exec(ageSex);
      if (!m || ageSex === '' || (m[1] && Number(m[1]) > MAX_AGE)) throw new SmsDecodeError('bad_profile', profile);
      if (m[1]) decoded.age = Number(m[1]);
      if (m[2]) decoded.sex = m[2];
    }
    if (name !== '-') {
      if (!NAME_RE.test(name)) throw new SmsDecodeError('bad_profile', profile);
      decoded.name = name;
    }
    if (parts.length >= 6 && parts[5] !== '-') {
      if (!PHOTO_REF_RE.test(parts[5]!)) throw new SmsDecodeError('bad_profile', profile);
      decoded.photo_ref = parts[5]!.toLowerCase();
    }
    if (parts.length === 8) {
      for (const [key, raw] of [['condition_other', parts[6]!], ['allergy_other', parts[7]!]] as const) {
        if (raw === '-') continue;
        if (!OTHER_RE.test(raw)) throw new SmsDecodeError('bad_profile', profile);
        decoded[key] = raw;
      }
    }
  }
  return decoded;
}

/** Name as it travels in the SMS: accents stripped, anything outside A-Z 0-9 space . - dropped
 *  (so Arabic letters are lost), upper-cased, at most NAME_MAX characters. */
export function smsSafeText(text: string, max: number): string {
  const ascii = text.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  return ascii.replace(/[^A-Za-z0-9 .\-]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max).trim();
}
export const smsSafeName = (name: string): string => smsSafeText(name, NAME_MAX);

/** Tolerant decoder: trims spaces, uppercases every field except answers, ignores unknown flag codes. */
export function decodeSms(text: string): SmsReport {
  const fields = text.trim().split(';').map((f) => f.trim());
  if (fields[0]?.toUpperCase() !== VERSION) throw new SmsDecodeError('bad_version', (fields[0] ?? '').slice(0, 10));
  if (fields.length !== 9) throw new SmsDecodeError('bad_field_count', `expected 9, got ${fields.length}`);
  const [, shortId, pos, role, triage, counts, answers, flags, profile] = fields.map((f, i) => (i === 6 ? f : f.toUpperCase())) as string[] & { length: 9 };

  if (!/^[0-9A-Z]{6}$/.test(shortId!)) throw new SmsDecodeError('bad_short_id', shortId);
  const ll = pos!.split(',');
  const lat = Number(ll[0]);
  const lng = Number(ll[1]);
  if (ll.length !== 2 || ll[0] === '' || ll[1] === '' || Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new SmsDecodeError('bad_position', pos);
  }
  if (!ROLE_CODES[role!]) throw new SmsDecodeError('bad_role', role);
  if (!TRIAGE_CODES[triage!]) throw new SmsDecodeError('bad_triage', triage);
  const m = /^R(\d)Y(\d)G(\d)$/.exec(counts!);
  if (!m) throw new SmsDecodeError('bad_counts', counts);

  const flagList: string[] = [];
  if (flags !== '-') {
    for (const code of flags!.split('+')) {
      const name = FLAG_CODES[code];
      if (name && !flagList.includes(name)) flagList.push(name);
    }
  }
  return {
    short_id: shortId!,
    lat,
    lng,
    role: ROLE_CODES[role!]!,
    triage: TRIAGE_CODES[triage!]!,
    victim_counts: { RED: +m[1]!, YELLOW: +m[2]!, GREEN: +m[3]! },
    answers: answers === '-' ? [] : decodeAnswers(answers!),
    flags: flagList,
    profile: decodeProfile(profile!),
  };
}

function encodeProfile(profile: SmsReport['profile'] | undefined): string {
  if (!profile) return '-';
  const parts = [profile.blood || '??', profile.conditions.join('.') || '-', profile.allergies.join('.') || '-'];
  const ageSex =
    (Number.isInteger(profile.age) && profile.age! >= 0 && profile.age! <= MAX_AGE ? String(profile.age) : '') +
    (profile.sex === 'M' || profile.sex === 'F' ? profile.sex : '');
  const name = smsSafeName(profile.name ?? '');
  const photo = (profile.photo_ref ?? '').toUpperCase();
  const hasPhoto = PHOTO_REF_RE.test(photo);
  const condOther = smsSafeText(profile.condition_other ?? '', OTHER_MAX);
  const allergyOther = smsSafeText(profile.allergy_other ?? '', OTHER_MAX);
  if (condOther || allergyOther) {
    parts.push(ageSex || '-', name || '-', hasPhoto ? photo : '-', condOther || '-', allergyOther || '-'); // 8-part form
  } else if (ageSex || name || hasPhoto) {
    parts.push(ageSex || '-', name || '-'); // keep the 3-part form when there is nothing more to say
    if (hasPhoto) parts.push(photo);
  }
  return parts.join('/');
}

/** Inverse of decodeSms. Throws if it cannot fit one GSM-7 SMS (> 160 chars or unsafe characters). */
export function encodeSms(report: Omit<SmsReport, 'profile'> & { profile?: SmsReport['profile'] }): string {
  const c = (['RED', 'YELLOW', 'GREEN'] as const).map((k) => `${k[0]}${Math.min(report.victim_counts[k] ?? 0, 9)}`).join('');
  const answers = report.answers.map((a) => QUESTION_CODES[a.q]! + VALUE_CODES[a.v]!).join('');
  const flags = report.flags.filter((f) => FLAG_TO_CODE[f]).map((f) => FLAG_TO_CODE[f]!).join('+');
  const sms = [
    VERSION,
    report.short_id.toUpperCase(),
    `${report.lat.toFixed(4)},${report.lng.toFixed(4)}`,
    ROLE_TO_CODE[report.role]!,
    TRIAGE_TO_CODE[report.triage] ?? 'U',
    c,
    answers || '-',
    flags || '-',
    encodeProfile(report.profile),
  ].join(';');
  const limit = report.profile?.photo_ref ? MAX_SMS_CHARS_WITH_PHOTO : MAX_SMS_CHARS;
  if (sms.length > limit || !SAFE_CHARS.test(sms)) {
    throw new Error(`not a valid GSM-7 SMS (${sms.length} chars, max ${limit})`);
  }
  return sms;
}
