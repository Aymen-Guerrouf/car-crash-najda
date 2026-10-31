import { AUTO_RESULT, walk, type Answer, type AnswerItem, type QuestionId } from '../features/triage/trees';
import { useIncidentStore } from '../store/useIncidentStore';
import { useProfileStore } from '../store/useProfileStore';
import { useReportStore, type Counts, type Draft } from '../store/useReportStore';
import type { Flag, MedicalProfile, NearbyIncident, ReportPatch, ReportPayload, Role, Triage } from '../types';
import { newClientId, newShortId } from '../utils/ids';
import { ApiError, checkNearby, isMockApi, patchReport, postReport } from './api';
import { checkOnline } from './connectivity';
import { getPosition } from './location';
import { uploadPhoto } from './photo';
import { enqueue } from './queue';

export class NoLocationError extends Error {}

/** Resolves with allback if promise has not settled after ms (or if it fails). */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

const get = () => useReportStore.getState();

const SEVERITY: Record<Triage, number> = { UNKNOWN: 0, GREEN: 1, YELLOW: 2, RED: 3 };
const worseOf = (a: Triage, b: Triage): Triage => (SEVERITY[a] >= SEVERITY[b] ? a : b);

function profileForReport(p: MedicalProfile): ReportPayload['profile'] {
  const out: NonNullable<ReportPayload['profile']> = {};
  if (p.name.trim()) out.name = p.name.trim();
  if (p.age != null) out.age = p.age;
  if (p.sex) out.sex = p.sex;
  if (p.blood) out.blood = p.blood;
  if (p.conditions.length) out.conditions = p.conditions;
  if (p.allergies.length) out.allergies = p.allergies;
  if (p.conditions.includes('OTH') && p.conditionOther.trim()) out.condition_other = p.conditionOther.trim().slice(0, 60);
  if (p.allergies.includes('OTH') && p.allergyOther.trim()) out.allergy_other = p.allergyOther.trim().slice(0, 60);
  if (p.contact.trim()) out.contact = p.contact.trim();
  if (p.contactName.trim()) out.contact_name = p.contactName.trim();
  if (p.photoUrl) out.photo_url = p.photoUrl;
  return Object.keys(out).length ? out : null;
}

/** Triage and flags always come from the answers (same trees as the server, which keeps the worse). */
function derive(role: Role, answers: AnswerItem[], hazards: Flag[]): { triage: Triage; flags: Flag[] } {
  const step = walk(role, answers);
  const treeFlag = 'result' in step ? step.result.flag : undefined;
  const flags = [...(treeFlag ? [treeFlag] : []), ...hazards.filter((h) => h !== treeFlag)];
  return { triage: 'result' in step ? step.result.triage : 'UNKNOWN', flags };
}

function countsOf(triage: Triage): Counts {
  // One person: a lone report counts itself in its triage bucket
  return { RED: triage === 'RED' ? 1 : 0, YELLOW: triage === 'YELLOW' ? 1 : 0, GREEN: triage === 'GREEN' ? 1 : 0 };
}

/** Everyone the witness reported: the MCI counts, or each victim's triage bucket. */
export function overallCounts(victims: Draft[], mciCounts: Counts | null): Counts {
  if (mciCounts) return mciCounts;
  const total: Counts = { RED: 0, YELLOW: 0, GREEN: 0 };
  for (const v of victims) {
    if (v.triage !== 'UNKNOWN') total[v.triage] += 1;
  }
  return total;
}

export function patchFor(d: Draft): ReportPatch {
  return {
    triage: d.triage,
    answers: d.answers,
    flags: d.flags,
    victim_counts: d.victimCounts ?? countsOf(d.triage),
    body_pain: d.bodyPain,
  };
}

export function toPayload(d: Draft, profile: MedicalProfile): ReportPayload {
  return {
    client_id: d.clientId,
    short_id: d.shortId,
    ...(d.forceNew ? { force_new: true } : {}),
    role: d.role,
    channel: 'HTTP',
    lat: d.lat,
    lng: d.lng,
    accuracy_m: d.accuracyM,
    ...(d.locationNote.trim() ? { location_note: d.locationNote.trim() } : {}),
    ...patchFor(d),
    profile: d.sendProfile ? profileForReport(profile) : null,
    device_created_at: new Date(d.createdAt).toISOString(),
  };
}

interface BeginOptions {
  /** Reuse an incident code: the bystander's report joins the automatic alert already sent. */
  shortId?: string;
  /** Override: attach the medical profile (default: everything but a witness's report). */
  sendProfile?: boolean;
}

/** Start a report: real GPS fix and connectivity check. Throws NoLocationError without a position. */
export async function beginReport(role: Role, options: BeginOptions = {}): Promise<Draft> {
  // Hard limits: an emergency must never wait forever on the GPS or the network
  const [pos, online] = await Promise.all([withTimeout(getPosition(), 6000, null), withTimeout(checkOnline(), 3500, false)]);
  if (!pos) throw new NoLocationError();
  const draft: Draft = {
    clientId: newClientId(),
    shortId: options.shortId ?? newShortId(),
    role,
    ...derive(role, [], []),
    answers: [],
    hazards: [],
    sendProfile: options.sendProfile ?? role !== 'WITNESS',
    bodyPain: [],
    lat: pos.lat,
    lng: pos.lng,
    accuracyM: pos.accuracyM,
    locationNote: '',
    victimCounts: null,
    // A new code = a new incident: never silently merged by place. Joining an existing accident is the user's
    // explicit choice (joinIncident), which switches to that incident's code.
    forceNew: true,
    updating: false,
    mode: online ? 'online' : 'offline',
    reportId: null,
    deliveredVia: null,
    createdAt: Date.now(),
  };
  get().setDraft(draft);
  return draft;
}

/** Record (or change) an answer for the active victim and recompute triage + flags. */
export function applyAnswer(q: QuestionId, v: Answer): Draft {
  const d = get().draft;
  if (!d) throw new Error('no report in progress');
  const answers = [...d.answers.filter((a) => a.q !== q), { q, v, at: Date.now() }];
  get().patchDraft({ answers, ...derive(d.role, answers, d.hazards) });
  return get().draft!;
}

/** "Retour" on a question: forget the last answer. False when there is nothing to undo (leave the screen instead). */
export function undoAnswer(): boolean {
  const d = get().draft;
  if (!d || d.answers.length === 0) return false;
  const answers = d.answers.slice(0, -1);
  get().patchDraft({ answers, ...derive(d.role, answers, d.hazards) });
  return true;
}
export function setBodyPain(bodyPain: Draft['bodyPain']) {
  get().patchDraft({ bodyPain });
}

/** Witness pins the exact spot (dragged marker) and/or writes a landmark. Applies to every victim. */
export function setLocation(lat: number, lng: number, note: string) {
  const { victims, patchVictim } = get();
  victims.forEach((_, i) => patchVictim(i, { lat, lng, locationNote: note }));
}

/** Ask the backend whether this accident is already reported. Failures just mean "no duplicate". */
export async function findDuplicate(): Promise<NearbyIncident | null> {
  const d = get().draft;
  if (!d || d.mode === 'offline') return null;
  try {
    return await checkNearby(d.lat, d.lng);
  } catch {
    return null;
  }
}

/** "Add my information": the witness's reports join the incident that already exists. */
export function joinIncident(shortId: string) {
  const { victims, patchVictim } = get();
  victims.forEach((_, i) => patchVictim(i, { shortId, forceNew: false }));
}

/** "It's a different accident". */
export function forceNewIncident() {
  const { victims, patchVictim } = get();
  victims.forEach((_, i) => patchVictim(i, { forceNew: true }));
}

/** How many victims the witness reports. 5+ is a mass casualty: counts only, no per-victim questions. */
export function setVictimTotal(total: number, mciCounts: Counts | null = null) {
  get().setWitness({ total, mciCounts });
  if (mciCounts) {
    const triage: Triage = mciCounts.RED > 0 ? 'RED' : mciCounts.YELLOW > 0 ? 'YELLOW' : mciCounts.GREEN > 0 ? 'GREEN' : 'UNKNOWN';
    get().patchVictim(0, { triage, answers: [] });
  }
}

/** After a victim's triage result: start the next victim's report, or report that there is none. */
export function advanceVictim(): 'next' | 'done' {
  const { active, draft, witness, addVictim } = get();
  if (!draft || active + 1 >= witness.total) return 'done';
  addVictim({
    ...draft,
    clientId: newClientId(),
    answers: [],
    hazards: [],
    bodyPain: [],
    victimCounts: null,
    updating: false,
    reportId: null,
    deliveredVia: null,
    createdAt: Date.now(),
    ...derive(draft.role, [], []),
  });
  return 'next';
}

/** Scene hazards go on the first victim's report, together with the counts of the whole accident. */
export function finalizeWitness(hazards: Flag[]) {
  const { victims, witness, patchVictim } = get();
  const first = victims[0];
  if (!first) return;
  patchVictim(0, {
    hazards,
    ...derive(first.role, first.answers, hazards),
    victimCounts: overallCounts(victims, witness.mciCounts),
  });
}

/** "Update situation": run the first victim's questions again; the result goes straight back to sending. */
export function restartTriage() {
  const { victims, patchVictim, setActive } = get();
  const first = victims[0];
  if (!first) return;
  patchVictim(0, { answers: [], updating: true, ...derive(first.role, [], first.hazards) });
  setActive(0);
}

/**
 * A victim who stops answering is treated as unresponsive: a new AUTO report (RED + UNRESPONSIVE) is
 * created on the same incident, so the dashboard shows it next to the victim's own partial report.
 */
export function escalateToAuto(): Draft {
  const d = get().draft;
  if (!d) throw new Error('no report in progress');
  const auto: Draft = {
    ...d,
    clientId: newClientId(),
    role: 'AUTO',
    answers: [],
    triage: AUTO_RESULT.triage,
    flags: AUTO_RESULT.flag ? [AUTO_RESULT.flag] : [],
    hazards: [],
    victimCounts: null,
    reportId: null,
    deliveredVia: null,
    createdAt: Date.now(),
  };
  get().setDraft(auto);
  return auto;
}

/** A photo picked while offline has no hosted URL yet: try once more when the first alert goes out (short wait). */
export async function ensurePhotoUploaded(d: Draft, waitMs = 4000): Promise<void> {
  const { profile, setProfile } = useProfileStore.getState();
  if (d.reportId || !d.sendProfile || !profile.photoUri || profile.photoUrl || isMockApi) return;
  const res = await withTimeout(uploadPhoto(profile.photoUri), waitMs, null);
  if (res && 'url' in res) setProfile({ photoUrl: res.url });
}

export type PushResult = 'sent' | 'queued';

/**
 * Deliver one victim's report over HTTP: POST the first time, PATCH afterwards ("send early, update
 * later"). Network failures put the latest payload in the offline queue; a 4xx is a real error.
 */
export async function pushReport(index: number = get().active): Promise<PushResult> {
  const d = get().victims[index];
  if (!d) throw new Error('no report in progress');
  await ensurePhotoUploaded(d);
  const profile = useProfileStore.getState().profile;
  const t0 = Date.now();
  try {
    const response = d.reportId
      ? await patchReport(d.reportId, patchFor(d), d.shortId)
      : await postReport(toPayload(d, profile));
    // The draft may have been replaced while the request was in flight (e.g. beacon -> bystander flow)
    const at = get().victims.findIndex((v) => v.clientId === d.clientId);
    if (at >= 0) get().patchVictim(at, { reportId: response.report_id, deliveredVia: 'HTTP' });
    // Merged into an existing incident: every report of this phone now belongs to that incident code
    if (at >= 0 && response.short_id !== d.shortId) {
      get().victims.forEach((_, i) => get().patchVictim(i, { shortId: response.short_id }));
    }
    useIncidentStore.getState().setLast({
      ...response,
      channel: 'HTTP',
      alertMs: Date.now() - t0,
      sentAt: Date.now(),
      mock: isMockApi,
    });
    return 'sent';
  } catch (e) {
    if (e instanceof ApiError && !e.retryable) throw e;
    await enqueue(toPayload(d, profile));
    return 'queued';
  }
}

/** Deliver everything: the first victim's report (counts, hazards) and any victim not delivered yet. */
export async function pushAll(): Promise<PushResult> {
  const { victims } = get();
  let result: PushResult = 'sent';
  for (let i = 0; i < victims.length; i++) {
    const v = victims[i]!;
    if (i === 0 || !v.reportId) {
      if ((await pushReport(i)) === 'queued') result = 'queued';
    }
  }
  return result;
}
