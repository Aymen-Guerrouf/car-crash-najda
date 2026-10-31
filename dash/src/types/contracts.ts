// Golden Hour Copilot (Nadjda) — Exact Contract Types (§4.1, §4.3)
// DO NOT rename or invent fields.

export type Triage = 'RED' | 'YELLOW' | 'GREEN' | 'UNKNOWN'; // no BLACK, ever
export type Role = 'VICTIM' | 'WITNESS' | 'BYSTANDER' | 'AUTO'; // AUTO = unresponsive victim, no human input
export type Channel = 'HTTP' | 'SMS';
export type IncidentStatus = 'NEW' | 'VALIDATED' | 'DISPATCHED' | 'RESOLVED' | 'CANCELLED';
export type Flag =
  | 'NOT_BREATHING'
  | 'AIRWAY'
  | 'FAST_BREATHING'
  | 'UNRESPONSIVE'
  | 'BLEEDING'
  | 'CANNOT_MOVE'
  | 'HEAD'
  | 'CHECK_BLEEDING'
  | 'FIRE'
  | 'SMOKE'
  | 'FUEL_LEAK'
  | 'TRAPPED'
  | 'ROAD_BLOCKED'
  | 'MCI';
export type Injury = 'HEAD' | 'NECK_SPINE' | 'CHEST' | 'ABDOMEN' | 'PELVIS' | 'LIMBS' | 'BURNS';
export type Capability =
  | 'TRAUMA'
  | 'NEURO'
  | 'THORACIC'
  | 'GENERAL_SURGERY'
  | 'ORTHO'
  | 'BURNS'
  | 'ICU'
  | 'PEDIATRIC';
export type Collision =
  | 'FRONTAL'
  | 'SIDE'
  | 'REAR'
  | 'ROLLOVER'
  | 'PEDESTRIAN'
  | 'MOTORCYCLE'
  | 'UNKNOWN';
export type Level = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export interface VictimCounts {
  RED: number;
  YELLOW: number;
  GREEN: number;
}

export interface Hospital {
  id: number;
  name: string;
  short_name: string;
  lat: number;
  lng: number;
  phone: string;
  capabilities: Capability[];
  beds_available: number;
  active: boolean;
}

export interface Alternative {
  hospital_id: number;
  score: number | null; // null until the Phase 5 scoring replaces the nearest-hospital rule
  eta_min: number;
  reason: string;
}

export interface MedicalProfile {
  blood?: string; // 'A+','A-','B+','B-','AB+','AB-','O+','O-','??'
  conditions?: string[]; // DIA HTA CAR AST EPI ANT PRG OTH
  allergies?: string[]; // PEN ASP LAT IOD OTH
  condition_other?: string; // free text typed for OTH in conditions
  allergy_other?: string; // free text typed for OTH in allergies
  age?: number;
  sex?: 'M' | 'F';
  contact?: string;
  contact_name?: string;
  name?: string;
  photo_url?: string; // Cloudinary URL uploaded by the phone
}

export interface AiVision {
  collision_type: Collision;
  vehicles_count: number | null;
  airbag_deployed: boolean | null;
  deformation: Level;
  cabin_intrusion: boolean | null;
  rollover: boolean | null;
  fire_or_smoke: boolean | null;
  likely_injuries: Injury[];
  impact_severity: Level;
  confidence: number; // 0..1
  summary_fr: string; // <= 120 chars
  is_accident?: boolean | null;
  low_confidence?: boolean; // confidence under the backend threshold: shown, but not used for decisions
  gate?: 'passed' | 'rejected' | 'off';
}

export interface Answer {
  q: string;
  v: 'yes' | 'no' | 'unknown' | string;
  at?: number;
}

export interface Report {
  id: string;
  client_id: string;
  incident_id: string; // backend field name (verified against ReportSerializer), not `incident`
  role: Role;
  channel: Channel;
  triage: Triage;
  answers: Answer[];
  answers_code: string;
  flags: Flag[];
  victim_counts: VictimCounts;
  profile: MedicalProfile | null;
  body_pain: Injury[] | string[];
  photo: string | null; // URL or path; prefix with API_URL if it starts with '/'
  ai_vision: AiVision | null;
  ai_vision_ms: number | null;
  device_created_at: string;
  received_at: string;
}

export interface IncidentSummary {
  id: string;
  short_id: string;
  status: IncidentStatus;
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  location_note: string;
  worst_triage: Triage;
  victim_counts: VictimCounts;
  flags: Flag[];
  is_mci: boolean;
  injuries: Injury[];
  hospital: Hospital | { id: number; name: string; phone?: string } | number | null; // see assumption A1
  hospital_reason: string;
  alternatives: Alternative[];
  eta_min: number | null;
  er_brief: string;
  er_brief_source: 'AI' | 'TEMPLATE' | '';
  dispatched_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // optional helpers, see assumption A2:
  report_count?: number;
  channels?: Channel[];
  roles?: Role[];
  has_photo?: boolean;
  has_ai?: boolean;
}

export interface IncidentDetail extends IncidentSummary {
  reports: Report[];
}

export interface SmsLog {
  id: number | string;
  direction: 'IN' | 'OUT';
  phone: string;
  raw: string;
  parsed: Record<string, unknown> | null;
  error: string;
  incident_id: string | null; // backend field name
  short_id?: string | null;
  at: string;
}

export interface Metrics {
  alert_ms_p50: number | null;
  vision_ms_p50: number | null;
  brief_first_token_ms_p50: number | null;
}

export interface WsEventEnvelope<T = unknown> {
  type: string;
  data: T;
  ts: string;
}

export interface PingData {
  from?: string;
  [key: string]: unknown;
}
