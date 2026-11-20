/**
 * Hospitalisation courte : un acte (service) de la catégorie « Hospitalisation courte » hospitalise le patient.
 * Sa durée vient du champ « Durée (heures) » du service ; à défaut, de son nom (« 24 heures », « Journée »…).
 */

const HEURE_MS = 60 * 60 * 1000;
/** Durées par défaut quand le nom ne donne pas de nombre d'heures (décision de la Direction, 19/11/2026). */
export const HEURES_DEMI_JOURNEE = 6;
export const HEURES_JOURNEE = 12;

const sansAccents = (texte: string) => texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export interface ServiceHospitalisable {
  nom: string;
  dureeHeures?: number | null;
  categorie?: { nom: string } | null;
}

/** Durée d'hospitalisation de l'acte en heures ; null si ce n'est pas un acte d'hospitalisation. */
export function dureeHospitalisation(service: ServiceHospitalisable): number | null {
  if (service.dureeHeures && service.dureeHeures > 0) return service.dureeHeures;
  const nom = sansAccents(service.nom);
  const categorie = sansAccents(service.categorie?.nom ?? "");
  if (!nom.includes("hospitalisation") && !categorie.includes("hospitalisation")) return null;
  const heures = /(\d+)\s*(?:h\b|heures?)/.exec(nom);
  if (heures) return Number(heures[1]);
  if (nom.includes("demi-journee") || nom.includes("demi journee")) return HEURES_DEMI_JOURNEE;
  if (nom.includes("journee")) return HEURES_JOURNEE;
  return null;
}

/** Sortie prévue : celle choisie par le soignant si elle est après l'arrivée, sinon l'arrivée plus la durée de l'acte. */
export function sortiePrevue(arrivee: Date, dureeHeures: number, choisie?: Date | null): Date {
  if (choisie && choisie.getTime() > arrivee.getTime()) return choisie;
  return new Date(arrivee.getTime() + dureeHeures * HEURE_MS);
}

/** Prolongation : la durée s'ajoute à la sortie prévue, ou à maintenant si elle est déjà dépassée. */
export function sortieApresProlongation(sortieActuelle: Date, dureeHeures: number, maintenant = new Date()): Date {
  const depart = Math.max(sortieActuelle.getTime(), maintenant.getTime());
  return new Date(depart + dureeHeures * HEURE_MS);
}
