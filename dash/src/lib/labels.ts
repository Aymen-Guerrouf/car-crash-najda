import type { Role } from '../types/contracts';

/** Libellés lisibles des questions de triage (arbre START témoin + auto-triage victime). */
export const QUESTION_LABELS: Record<string, string> = {
  walk: 'Peut marcher',
  breathing: 'Respire',
  airway: 'Respire après libération des voies aériennes',
  fast: 'Respire très vite',
  responds: 'Répond quand on lui parle',
  bleeding: 'Saignement important',
  v_bleeding: 'Saigne abondamment',
  v_move: 'Peut bouger bras et jambes',
  v_head: 'Coup à la tête / vertiges',
};

const ANSWER_LABELS: Record<string, string> = { yes: 'Oui', no: 'Non', unknown: 'Inconnu' };

/** Réponses qui signalent un problème grave (affichées en rouge). */
const CONCERNING: Record<string, string> = {
  walk: 'no', breathing: 'no', airway: 'no', fast: 'yes', responds: 'no', bleeding: 'yes',
  v_bleeding: 'yes', v_move: 'no', v_head: 'yes',
};

export function questionLabel(q: string): string {
  return QUESTION_LABELS[q] ?? q;
}

export function answerLabel(v: string): string {
  return ANSWER_LABELS[v] ?? v;
}

export function isConcerning(q: string, v: string): boolean {
  return CONCERNING[q] === v;
}

export const FLAG_LABELS: Record<string, string> = {
  NOT_BREATHING: 'Ne respire pas', AIRWAY: 'Voies aériennes', FAST_BREATHING: 'Respiration rapide', UNRESPONSIVE: 'Inconscient',
  BLEEDING: 'Saignement', CANNOT_MOVE: 'Ne peut pas bouger', HEAD: 'Traumatisme crânien', CHECK_BLEEDING: 'Vérifier saignement',
  FIRE: 'Incendie', SMOKE: 'Fumée', FUEL_LEAK: 'Fuite de carburant', TRAPPED: 'Coincé', ROAD_BLOCKED: 'Route bloquée', MCI: 'Afflux de victimes',
};

export const INJURY_LABELS: Record<string, string> = {
  HEAD: 'Tête', NECK_SPINE: 'Cou / colonne', CHEST: 'Thorax', ABDOMEN: 'Abdomen', PELVIS: 'Bassin', LIMBS: 'Membres', BURNS: 'Brûlures',
};

export const CONDITION_LABELS: Record<string, string> = {
  DIA: 'Diabète', HTA: 'Hypertension', CAR: 'Maladie cardiaque', AST: 'Asthme', EPI: 'Épilepsie', ANT: 'Anticoagulants', PRG: 'Enceinte',
  OTH: 'Autre',
};

export const ALLERGY_LABELS: Record<string, string> = {
  PEN: 'Pénicilline', ASP: 'Aspirine / AINS', LAT: 'Latex', IOD: 'Iode', OTH: 'Autre',
};

/** Label of a condition / allergy; for "other" (OTH) the text the person typed, when there is one. */
export const conditionLabel = (code: string, p?: { condition_other?: string }): string =>
  code === 'OTH' && p?.condition_other ? p.condition_other : CONDITION_LABELS[code] ?? code;
export const allergyLabel = (code: string, p?: { allergy_other?: string }): string =>
  code === 'OTH' && p?.allergy_other ? p.allergy_other : ALLERGY_LABELS[code] ?? code;

export const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nouveau', VALIDATED: 'Validé', DISPATCHED: 'Envoyé', RESOLVED: 'Résolu', CANCELLED: 'Annulé',
};

export const flagLabel = (f: string) => FLAG_LABELS[f] ?? f.replace(/_/g, ' ');
export const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;

export const ROLE_LABELS: Record<Role, { label: string; hint: string }> = {
  VICTIM: { label: 'Victime', hint: 'Signalé par la personne blessée' },
  WITNESS: { label: 'Témoin', hint: 'Signalé par une personne présente sur place' },
  BYSTANDER: { label: 'Passant', hint: 'Un passant a utilisé le téléphone de la victime' },
  AUTO: { label: 'Alerte automatique', hint: 'Choc détecté, la victime n’a pas répondu' },
};

export const COLLISION_LABELS: Record<string, string> = {
  FRONTAL: 'Choc frontal', SIDE: 'Choc latéral', REAR: 'Choc arrière', ROLLOVER: 'Tonneau',
  PEDESTRIAN: 'Piéton percuté', MOTORCYCLE: 'Deux-roues', UNKNOWN: 'Non déterminé',
};

export const LEVEL_LABELS: Record<string, string> = { LOW: 'Faible', MEDIUM: 'Modérée', HIGH: 'Élevée', UNKNOWN: 'Inconnue' };

/** Flags that need the operator's immediate attention. */
export const DANGER_FLAGS = new Set(['FIRE', 'NOT_BREATHING', 'TRAPPED', 'FUEL_LEAK']);
