import * as SMS from 'expo-sms';
import { encodeSms, OTHER_MAX, photoRefFromUrl, smsSafeText, type SmsReport } from '../features/sms/smsCodec';
import { useIncidentStore } from '../store/useIncidentStore';
import { useProfileStore } from '../store/useProfileStore';
import { useReportStore, type Draft } from '../store/useReportStore';
import { ensurePhotoUploaded, overallCounts } from './report';
import type { MedicalProfile } from '../types';

const GATEWAY = process.env.EXPO_PUBLIC_SMS_GATEWAY_NUMBER ?? '';

export type SmsOutcome = 'sent' | 'cancelled' | 'unavailable' | 'no_gateway' | 'too_long';

type SmsProfile = NonNullable<SmsReport['profile']>;

/** Profile as the SMS can carry it: medical data plus identity (name, age, sex). Null when empty. */
function smsProfile(p: MedicalProfile): SmsProfile | null {
  const profile: SmsProfile = { blood: p.blood, conditions: p.conditions, allergies: p.allergies };
  if (p.age != null) profile.age = p.age;
  if (p.sex) profile.sex = p.sex;
  if (p.name.trim()) profile.name = p.name.trim();
  // text typed under "other" (only what the SMS alphabet allows survives)
  const condOther = p.conditions.includes('OTH') ? smsSafeText(p.conditionOther, OTHER_MAX) : '';
  const allergyOther = p.allergies.includes('OTH') ? smsSafeText(p.allergyOther, OTHER_MAX) : '';
  if (condOther) profile.condition_other = condOther;
  if (allergyOther) profile.allergy_other = allergyOther;
  const photoRef = photoRefFromUrl(p.photoUrl); // only a hosted picture can travel (as a short reference)
  if (photoRef) profile.photo_ref = photoRef;
  const hasMedical = p.blood || p.conditions.length > 0 || p.allergies.length > 0;
  const hasIdentity = profile.age !== undefined || profile.sex !== undefined || profile.name !== undefined || photoRef !== null;
  return hasMedical || hasIdentity ? profile : null;
}

/** Same profile with less in it, in the order we would rather lose things: name, then age/sex, then the picture, then the typed "other" texts, then all. */
function shrinkingProfiles(profile: SmsProfile | null): (SmsProfile | null)[] {
  if (!profile) return [null];
  const { name: _name, ...noName } = profile;
  const { age: _age, sex: _sex, ...noIdentity } = noName;
  const { photo_ref: _photo, ...noPhoto } = noIdentity;
  const { condition_other: _c, allergy_other: _a, ...medicalOnly } = noPhoto;
  return [profile, noName, noIdentity, noPhoto, medicalOnly, null];
}

const SEVERITY = { UNKNOWN: 0, GREEN: 1, YELLOW: 2, RED: 3 } as const;

/**
 * One SMS carries one report. With several victims it describes the worst one (its answers and flags),
 * plus the hazards and the counts of everybody.
 */
function smsSource(): Draft & { counts: { RED: number; YELLOW: number; GREEN: number } } {
  const { victims, draft, witness } = useReportStore.getState();
  if (!draft) throw new Error('no report in progress');
  const all = victims.length ? victims : [draft];
  const worst = all.reduce((a, b) => (SEVERITY[b.triage] > SEVERITY[a.triage] ? b : a));
  const flags = [...new Set([...all.flatMap((v) => v.flags), ...(all[0]?.hazards ?? [])])];
  const counts = overallCounts(all, witness.mciCounts);
  const single = { RED: worst.triage === 'RED' ? 1 : 0, YELLOW: worst.triage === 'YELLOW' ? 1 : 0, GREEN: worst.triage === 'GREEN' ? 1 : 0 };
  return { ...worst, flags, counts: counts.RED + counts.YELLOW + counts.GREEN > 0 ? counts : single };
}

/** The GH1 text for the current report; sheds the name, then age/sex, then the profile if it overflows one SMS. */
export function buildAlertSms(): string {
  const { counts, ...d } = smsSource();
  const base = {
    short_id: d.shortId,
    lat: d.lat,
    lng: d.lng,
    role: d.role,
    triage: d.triage,
    victim_counts: counts,
    answers: d.answers.map((a) => ({ q: a.q, v: a.v })),
    flags: d.flags,
  };
  const candidates = shrinkingProfiles(d.sendProfile ? smsProfile(useProfileStore.getState().profile) : null);
  for (const profile of candidates.slice(0, -1)) {
    try {
      return encodeSms({ ...base, profile });
    } catch {
      // too long with this much profile: try with less
    }
  }
  return encodeSms({ ...base, profile: candidates[candidates.length - 1] ?? null });
}

/**
 * Opens the Messages composer pre-filled with the coded alert. iOS never allows a silent SMS, so the
 * user taps Send; the result tells us whether they did.
 */
export async function sendAlertSms(): Promise<SmsOutcome> {
  if (!GATEWAY) return 'no_gateway';
  if (!(await SMS.isAvailableAsync())) return 'unavailable';

  // a picture chosen while offline has no hosted URL yet: try to host it so the SMS can carry its reference
  await ensurePhotoUploaded(smsSource(), 15000).catch(() => {});

  let text: string;
  try {
    text = buildAlertSms();
  } catch {
    return 'too_long';
  }

  const t0 = Date.now();
  const { result } = await SMS.sendSMSAsync([GATEWAY], text);
  if (result === 'cancelled') return 'cancelled';

  // 'sent' on iOS; Android answers 'unknown' even when the message went out
  const d = smsSource();
  useReportStore.getState().victims.forEach((_, i) => useReportStore.getState().patchVictim(i, { deliveredVia: 'SMS' }));
  useIncidentStore.getState().setLast({
    report_id: d.clientId,
    incident_id: d.shortId,
    short_id: d.shortId,
    merged: false,
    worst_triage: d.triage,
    hospital: null,
    channel: 'SMS',
    alertMs: Date.now() - t0,
    sentAt: Date.now(),
    mock: false,
  });
  return 'sent';
}
