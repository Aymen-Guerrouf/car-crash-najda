import type { Hospital, IncidentSummary } from '../types/contracts';

/** `incident.hospital` may be a full object, a partial one, or an id (OPEN_QUESTIONS A1). */
export function hospitalIdOf(incident: IncidentSummary): number | null {
  const h = incident.hospital;
  if (h == null) return null;
  return typeof h === 'number' ? h : h.id;
}

export interface HospitalOption {
  hospital: Hospital;
  etaMin: number | null;
  reason: string;
  /** The hospital the system recommends (or the one already dispatched to). */
  primary: boolean;
}

/** The recommended hospital first, then the backend's alternatives, each resolved to a known hospital. */
export function hospitalOptions(incident: IncidentSummary, hospitals: Hospital[]): HospitalOption[] {
  const byId = new Map(hospitals.map((h) => [h.id, h]));
  const options: HospitalOption[] = [];

  const mainId = hospitalIdOf(incident);
  const main = mainId != null ? byId.get(mainId) : undefined;
  if (main) options.push({ hospital: main, etaMin: incident.eta_min, reason: incident.hospital_reason, primary: true });

  for (const alt of incident.alternatives ?? []) {
    const hospital = byId.get(alt.hospital_id);
    if (hospital && !options.some((o) => o.hospital.id === hospital.id)) {
      options.push({ hospital, etaMin: alt.eta_min ?? null, reason: alt.reason ?? '', primary: false });
    }
  }
  return options;
}
