import { DUREE_CRENEAU_RENDEZ_VOUS_MINUTES } from "../config/constants.js";

const MS_PAR_MINUTE = 60_000;

/**
 * Deux rendez-vous sont sur le même créneau s'ils commencent à moins de DUREE_CRENEAU_RENDEZ_VOUS_MINUTES
 * l'un de l'autre : un patient ne peut pas être attendu par deux praticiens à la même date et à la même heure.
 */
export function memeCreneau(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < DUREE_CRENEAU_RENDEZ_VOUS_MINUTES * MS_PAR_MINUTE;
}

/** Premier horaire libre à partir de « souhaite », par pas d'un créneau (revue programmée en consultation). */
export function premierCreneauLibre(souhaite: Date, occupes: readonly Date[], essais = 16): Date {
  let candidat = souhaite;
  for (let essai = 0; essai < essais && occupes.some((occupe) => memeCreneau(candidat, occupe)); essai++) {
    candidat = new Date(candidat.getTime() + DUREE_CRENEAU_RENDEZ_VOUS_MINUTES * MS_PAR_MINUTE);
  }
  return candidat;
}
