// Mirror of the contracts in the implementation plan (§5). Keep in sync with the backend.
export type Triage = 'RED' | 'YELLOW' | 'GREEN' | 'UNKNOWN';
export type Role = 'VICTIM' | 'WITNESS' | 'BYSTANDER' | 'AUTO';
export type Channel = 'HTTP' | 'SMS';
export type Flag =
  | 'NOT_BREATHING' | 'AIRWAY' | 'FAST_BREATHING' | 'UNRESPONSIVE' | 'BLEEDING'
  | 'CANNOT_MOVE' | 'HEAD' | 'CHECK_BLEEDING' | 'FIRE' | 'SMOKE' | 'FUEL_LEAK'
  | 'TRAPPED' | 'ROAD_BLOCKED' | 'MCI';
export type Injury = 'HEAD' | 'NECK_SPINE' | 'CHEST' | 'ABDOMEN' | 'PELVIS' | 'LIMBS' | 'BURNS';

export type Language = 'ar' | 'fr';

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const CONDITION_CODES = ['DIA', 'HTA', 'CAR', 'AST', 'EPI', 'ANT', 'PRG', 'OTH'] as const;
export const ALLERGY_CODES = ['PEN', 'ASP', 'LAT', 'IOD', 'OTH'] as const;
export const INJURIES: Injury[] = ['HEAD', 'NECK_SPINE', 'CHEST', 'ABDOMEN', 'PELVIS', 'LIMBS', 'BURNS'];

export type ConditionCode = (typeof CONDITION_CODES)[number];
export type AllergyCode = (typeof ALLERGY_CODES)[number];

export interface MedicalProfile {
  name: string;
  age: number | null;
  sex: 'M' | 'F' | null;
  blood: string | null;
  conditions: ConditionCode[];
  allergies: AllergyCode[];
  /** Free text typed when 'Autre' is ticked in the conditions / allergies lists. */
  conditionOther: string;
  allergyOther: string;
  contact: string;
  /** Name of the emergency contact (shown next to the phone). */
  contactName: string;
  /** Local file of the chosen picture (instant display, may disappear). */
  photoUri: string | null;
  /** Cloudinary URL returned by POST /api/profile-photo/; the only value sent in reports. */
  photoUrl: string | null;
}

export interface ReportPayload {
  client_id: string;
  short_id: string;
  // "It's a different accident": skip the backend's duplicate detection (plan §8.4)
  force_new?: boolean;
  role: Role;
  channel: Channel;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  location_note?: string;
  triage: Triage;
  answers: { q: string; v: 'yes' | 'no' | 'unknown'; at: number }[];
  flags: Flag[];
  victim_counts: { RED: number; YELLOW: number; GREEN: number };
  body_pain: Injury[];
  profile: {
    blood?: string;
    conditions?: ConditionCode[];
    allergies?: AllergyCode[];
    condition_other?: string;
    allergy_other?: string;
    age?: number;
    sex?: 'M' | 'F';
    name?: string;
    contact?: string;
    contact_name?: string;
    photo_url?: string;
  } | null;
  device_created_at: string;
}

/** Fields the backend accepts on PATCH /api/reports/{id}/ (full lists, replace not append). */
export type ReportPatch = Pick<ReportPayload, 'triage' | 'answers' | 'flags' | 'victim_counts' | 'body_pain'>;

export interface ReportResponse {
  report_id: string;
  incident_id: string;
  short_id: string;
  merged: boolean;
  worst_triage: Triage;
  hospital: { id: number; name: string; eta_min: number | null } | null;
}

/** status.updated pushed by the backend to the reporting phone (plan §5.4). */
export interface LiveStatus {
  status: 'NEW' | 'VALIDATED' | 'DISPATCHED' | 'RESOLVED' | 'CANCELLED';
  hospital: { name: string; phone: string } | null;
  eta_min: number | null;
  message_fr: string;
  message_ar: string;
}

/** Answer of POST /api/incidents/nearby-check/. */
export interface NearbyIncident {
  short_id: string;
  worst_triage: Triage;
  created_at: string;
}
