import type { MedicalProfile } from '../types';

/** Share of the 5 key identity fields filled in (0–100). Conditions/allergies can legitimately be empty. */
export function profileCompletion(p: MedicalProfile): number {
  const filled = [p.name.trim(), p.age, p.sex, p.blood, p.contact.trim()].filter(Boolean).length;
  return Math.round((filled / 5) * 100);
}
