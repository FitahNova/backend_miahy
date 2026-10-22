import { ErreurHttp } from "./errors.js";

// Grossesse refusée à 7 ans et moins, et à 80 ans et plus.
const AGE_MAX_TROP_JEUNE = 7;
const AGE_MIN_TROP_AGEE = 80;

// Les journées sont comptées à l'heure de Madagascar (UTC+3).
const DECALAGE_MADAGASCAR_MS = 3 * 60 * 60 * 1000;

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function estMotifGrossesse(motif: string): boolean {
  return sansAccents(motif).includes("grossesse");
}

/** Âge en années révolues à une date donnée. */
export function ageEnAnnees(dateNaissance: Date, date: Date): number {
  const jour = new Date(date.getTime() + DECALAGE_MADAGASCAR_MS);
  let age = jour.getUTCFullYear() - dateNaissance.getUTCFullYear();
  const anniversairePasse =
    jour.getUTCMonth() > dateNaissance.getUTCMonth() ||
    (jour.getUTCMonth() === dateNaissance.getUTCMonth() && jour.getUTCDate() >= dateNaissance.getUTCDate());
  if (!anniversairePasse) age -= 1;
  return age;
}

/**
 * Refuse un motif de grossesse pour un homme, ou pour une patiente trop jeune ou trop âgée à la date de la visite.
 * @throws 422 MOTIF_GROSSESSE_INCOMPATIBLE avec details.raison = "SEXE" ou "AGE"
 */
export function verifierMotifGrossesse(
  motif: string | null | undefined,
  patient: { sexe: "H" | "F"; dateNaissance: Date },
  dateVisite: Date = new Date(),
): void {
  if (!motif || !estMotifGrossesse(motif)) return;
  if (patient.sexe === "H") {
    throw new ErreurHttp(422, "MOTIF_GROSSESSE_INCOMPATIBLE", { raison: "SEXE" });
  }
  const age = ageEnAnnees(patient.dateNaissance, dateVisite);
  if (age <= AGE_MAX_TROP_JEUNE || age >= AGE_MIN_TROP_AGEE) {
    throw new ErreurHttp(422, "MOTIF_GROSSESSE_INCOMPATIBLE", { raison: "AGE", age });
  }
}
