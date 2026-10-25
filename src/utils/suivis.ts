import { JOURS_AVANT_A_CONTACTER, JOURS_RETARD_PERDU_DE_VUE } from "../config/constants.js";

// Les échéances sont des jours (AAAA-MM-JJ), comptés à l'heure de Madagascar.

export type ListeSuivi = "a-contacter" | "en-retard" | "perdus-de-vue";

/** Jour du centre (AAAA-MM-JJ) pour un instant donné. */
export function jourDuCentre(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Antananarivo" }).format(date);
}

export function decalerJour(jour: string, jours: number): string {
  const date = new Date(`${jour}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + jours);
  return date.toISOString().slice(0, 10);
}

/** Jours de retard (0 si l'échéance n'est pas dépassée). */
export function joursDeRetard(echeance: string, aujourdhui: string): number {
  const ecart = (Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${echeance}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, Math.round(ecart));
}

/**
 * Liste d'un suivi ouvert selon son échéance ; null s'il est encore trop loin pour être relancé.
 * « manque » : son rendez-vous est noté Absent. L'heure est passée sans le patient : il est en retard
 * dès le jour même, sans passer par « À contacter ».
 */
export function classerSuivi(echeance: string, aujourdhui: string, manque = false): ListeSuivi | null {
  if (echeance > decalerJour(aujourdhui, JOURS_AVANT_A_CONTACTER)) return null;
  if (echeance >= aujourdhui) return manque ? "en-retard" : "a-contacter";
  if (joursDeRetard(echeance, aujourdhui) <= JOURS_RETARD_PERDU_DE_VUE) return "en-retard";
  return "perdus-de-vue";
}

/** Bornes d'échéance (jours inclus) d'une liste, pour filtrer en base. */
export function bornesListe(liste: ListeSuivi, aujourdhui: string): { du?: string; au?: string } {
  if (liste === "a-contacter") return { du: aujourdhui, au: decalerJour(aujourdhui, JOURS_AVANT_A_CONTACTER) };
  if (liste === "en-retard") return { du: decalerJour(aujourdhui, -JOURS_RETARD_PERDU_DE_VUE), au: decalerJour(aujourdhui, -1) };
  return { au: decalerJour(aujourdhui, -JOURS_RETARD_PERDU_DE_VUE - 1) };
}

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Type de suivi deviné d'après un motif libre (« Contrôle tension » → Contrôle) ; « Autre » sinon. */
export function typeDepuisMotif(motif: string, types: readonly string[]): string {
  const texte = sansAccents(motif);
  return types.find((nom) => nom !== "Autre" && texte.includes(sansAccents(nom))) ?? "Autre";
}
