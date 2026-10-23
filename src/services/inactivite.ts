/** Durée réglable dans Paramètres, en minutes. */
export const DUREE_INACTIVITE_MIN = 1;
export const DUREE_INACTIVITE_MAX = 240;
export const DUREE_INACTIVITE_DEFAUT = 15;

/** Le bandeau s'affiche une minute avant la fin. */
export const AVERTISSEMENT_INACTIVITE_MS = 60_000;

/**
 * On n'écrit pas la dernière activité à chaque mouvement de souris :
 * un geste plus récent que cet intervalle est déjà couvert.
 */
export const INTERVALLE_ACTIVITE_MS = 15_000;

export function dureeInactiviteValide(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= DUREE_INACTIVITE_MIN && minutes <= DUREE_INACTIVITE_MAX;
}

export function sessionInactive(derniereActivite: Date, dureeMinutes: number, maintenant: Date): boolean {
  return maintenant.getTime() - derniereActivite.getTime() >= dureeMinutes * 60_000;
}

export function activiteAEnregistrer(derniereActivite: Date, maintenant: Date): boolean {
  return maintenant.getTime() - derniereActivite.getTime() >= INTERVALLE_ACTIVITE_MS;
}
