// Triage trees (plan §8.2): mirror of nadja/incidents/triage.py. The server recomputes the result
// and keeps the worse triage, so any change here must be made there too.
import type { Flag, Role, Triage } from '../../types';

export type Answer = 'yes' | 'no' | 'unknown';
export type QuestionId =
  | 'walk' | 'breathing' | 'airway' | 'fast' | 'responds' | 'bleeding'
  | 'v_bleeding' | 'v_move' | 'v_head';

export interface AnswerItem {
  q: QuestionId;
  v: Answer;
  at: number;
}

export interface TriageResult {
  triage: Triage;
  flag?: Flag;
}

type Next = QuestionId | TriageResult;
type Tree = Partial<Record<QuestionId, Record<Answer, Next>>>;

const r = (triage: Triage, flag?: Flag): TriageResult => ({ triage, flag });

// `unknown` always takes the safer branch
const WITNESS_TREE: Tree = {
  walk: { yes: r('GREEN'), no: 'breathing', unknown: 'breathing' },
  breathing: { yes: 'fast', no: 'airway', unknown: 'airway' },
  airway: { yes: r('RED', 'AIRWAY'), no: r('RED', 'NOT_BREATHING'), unknown: r('RED', 'NOT_BREATHING') },
  fast: { yes: r('RED', 'FAST_BREATHING'), no: 'responds', unknown: 'responds' },
  responds: { yes: 'bleeding', no: r('RED', 'UNRESPONSIVE'), unknown: r('RED', 'UNRESPONSIVE') },
  bleeding: { yes: r('RED', 'BLEEDING'), no: r('YELLOW'), unknown: r('YELLOW', 'CHECK_BLEEDING') },
};

const VICTIM_TREE: Tree = {
  v_bleeding: { yes: r('RED', 'BLEEDING'), no: 'v_move', unknown: 'v_move' },
  v_move: { yes: 'v_head', no: r('RED', 'CANNOT_MOVE'), unknown: 'v_head' },
  v_head: { yes: r('YELLOW', 'HEAD'), no: r('GREEN'), unknown: r('YELLOW', 'HEAD') },
};

export const AUTO_RESULT = r('RED', 'UNRESPONSIVE');

function treeFor(role: Role): { tree: Tree; root: QuestionId } {
  return role === 'VICTIM'
    ? { tree: VICTIM_TREE, root: 'v_bleeding' }
    : { tree: WITNESS_TREE, root: 'walk' }; // WITNESS and BYSTANDER use the layperson START tree
}

/** Walk the tree with the latest answer per question: the next question to ask, or the final result. */
export function walk(role: Role, answers: AnswerItem[]): { next: QuestionId } | { result: TriageResult } {
  if (role === 'AUTO') return { result: AUTO_RESULT };
  const { tree, root } = treeFor(role);
  const latest = new Map(answers.map((a) => [a.q, a.v] as const));
  let node: QuestionId = root;
  for (;;) {
    const value = latest.get(node);
    if (value === undefined) return { next: node };
    const nxt: Next = tree[node]![value];
    if (typeof nxt !== 'string') return { result: nxt };
    node = nxt;
  }
}

/** Number of questions on the path answered so far / total depth estimate, for the progress bar. */
export function progress(role: Role, answers: AnswerItem[]): { done: number; total: number } {
  const total = role === 'VICTIM' ? 3 : 6;
  return { done: Math.min(answers.length, total), total };
}
