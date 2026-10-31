import { router } from 'expo-router';
import { Alert } from 'react-native';
import { claimAutoAlert, crashCode, endCrashSession } from '../features/crash/crashSession';
import type { STRINGS } from '../i18n/strings';
import { useIncidentStore } from '../store/useIncidentStore';
import { useReportStore } from '../store/useReportStore';
import { NoLocationError, beginReport, pushReport } from './report';

type T = (typeof STRINGS)['fr'];

// Inside a crash flow every report carries the code of that crash (see crashSession); a manual SOS has no
// crash session, so it gets a fresh code, shared by everything that follows from that SOS.

/** Finishes when the SOS alert has been created (and sent when online); "Moi"/"Quelqu'un d'autre" wait for it. */
let sosReady: Promise<void> = Promise.resolve();
let sosPending = false;

/**
 * SOS: opens "Qui a besoin d'aide ?" at once (the screen never waits on GPS or network) while the alert
 * leaves in the background with the position, before any question. It carries no medical profile: it is only
 * "someone needs help here". `onError` is called if there is no position.
 */
export function sosFlow(onError: (e: unknown) => void): void {
  if (sosPending) return; // a double tap must not create two alerts
  sosPending = true;
  router.push('/role');
  sosReady = (async () => {
    // A new SOS always starts from a clean slate: fresh alert code, nothing left from a previous incident
    useIncidentStore.getState().setLast(null);
    endCrashSession(); // a leftover crash code must never leak into a new SOS
    // Nothing leaves the phone yet: the alert is sent once the questions are done (or when they time out)
    await beginReport('WITNESS', { sendProfile: false });
  })();
  void sosReady.finally(() => {
    sosPending = false;
  });
  sosReady.catch((e) => {
    onError(e);
    router.replace('/');
  });
}
/** "Me": the phone owner is the victim; their questions and medical profile join the SOS (same code). */
export async function startVictimFlow(replace = false): Promise<void> {
  await sosReady.catch(() => {});
  const code = crashCode() ?? useReportStore.getState().draft?.shortId;
  await beginReport('VICTIM', { shortId: code }); // sent at the end of the questions, not before
  if (replace) router.replace('/triage');
  else router.push('/triage');
}

/** "Send now" (V5): no questions, minimum data. Reuses the open report when there is one. */
export async function sendNowFlow(): Promise<void> {
  if (!useReportStore.getState().draft) await beginReport('VICTIM', { shortId: crashCode() });
  router.replace('/send');
}

/**
 * Countdown expired with no answer: the victim is assumed unresponsive (RED + UNRESPONSIVE). The alert
 * goes out by itself when there is internet; either way the phone turns into a beacon asking a passer-by
 * for help (bystander mode), because without internet iOS needs a human tap to send the SMS.
 *
 * The automatic alert exists once per crash: a second call (double trigger, retry) only shows the beacon.
 */
export async function autoAlertFlow(): Promise<void> {
  if (!claimAutoAlert()) {
    router.replace('/bystander');
    return;
  }
  const draft = await beginReport('AUTO', { shortId: crashCode() });
  if (draft.mode === 'online') void pushReport().catch(() => {});
  router.replace('/bystander');
}

/**
 * A passer-by taps the beacon: the witness questions run on the victim's phone, the report joins the
 * automatic alert (same incident code) and carries the victim's medical profile.
 */
export function startBystanderFlow(): void {
  const code = crashCode() ?? useReportStore.getState().draft?.shortId ?? '';
  router.replace({ pathname: '/witness/safety', params: { role: 'BYSTANDER', short: code } });
}

/** "Someone else": a witness. The SOS already sent becomes the first victim's report (no second alert). */
export async function startWitnessFlow(): Promise<void> {
  await sosReady.catch(() => {});
  router.push({ pathname: '/witness/safety', params: { role: 'WITNESS', reuse: '1' } });
}

export function showFlowError(e: unknown, t: T): void {
  if (e instanceof NoLocationError) Alert.alert(t.noLocationTitle, t.noLocationBody);
  else Alert.alert(t.sendFailedTitle, t.sendFailedBody);
}
