import { newShortId } from '../../utils/ids';

/**
 * One crash = one incident code. The automatic alert, the victim's own answers and the bystander's report
 * all belong to the same accident, so they must all carry the same code. The session starts when a crash is
 * triggered and ends when the user is back on Home.
 */
interface CrashSession {
  code: string;
  /** The automatic alert (countdown ran out) was already created for this crash. */
  autoStarted: boolean;
}

let session: CrashSession | null = null;

export function startCrashSession(): void {
  session = { code: newShortId(), autoStarted: false };
}

/** The incident code of the crash being handled, or undefined outside a crash flow (manual SOS). */
export function crashCode(): string | undefined {
  return session?.code;
}

/** Claims the one automatic alert of this crash. False if it was already claimed (never send it twice). */
export function claimAutoAlert(): boolean {
  if (!session || session.autoStarted) return false;
  session.autoStarted = true;
  return true;
}

/** Ends the session; returns whether there was one. */
export function endCrashSession(): boolean {
  const had = session !== null;
  session = null;
  return had;
}
