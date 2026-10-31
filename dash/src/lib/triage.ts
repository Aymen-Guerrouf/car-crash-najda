import type { Triage } from '../types/contracts';

export interface TriageConfig {
  rank: number;
  letter: string;
  label: string;
  fullLabel: string;
  shape: 'circle' | 'diamond' | 'square' | 'hollow-circle';
  bgVar: string;
  textVar: string;
}

export const TRIAGE_CONFIG: Record<Triage, TriageConfig> = {
  RED: {
    rank: 0,
    letter: 'R',
    label: 'ROUGE',
    fullLabel: 'ROUGE — urgent',
    shape: 'circle',
    bgVar: 'var(--triage-red)',
    textVar: 'var(--on-red)',
  },
  YELLOW: {
    rank: 1,
    letter: 'J',
    label: 'JAUNE',
    fullLabel: 'JAUNE — différé',
    shape: 'diamond',
    bgVar: 'var(--triage-yellow)',
    textVar: 'var(--on-yellow)', // NEVER white on yellow
  },
  GREEN: {
    rank: 2,
    letter: 'V',
    label: 'VERT',
    fullLabel: 'VERT — léger',
    shape: 'square',
    bgVar: 'var(--triage-green)',
    textVar: 'var(--on-green)',
  },
  UNKNOWN: {
    rank: 3,
    letter: '?',
    label: 'INCONNU',
    fullLabel: 'INCONNU — non trié',
    shape: 'hollow-circle',
    bgVar: 'var(--triage-unknown)',
    textVar: 'var(--on-unknown)',
  },
};

export function getTriageConfig(triage: string | undefined): TriageConfig {
  if (triage && triage in TRIAGE_CONFIG) {
    return TRIAGE_CONFIG[triage as Triage];
  }
  return TRIAGE_CONFIG.UNKNOWN;
}
