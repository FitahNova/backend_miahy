// Statut d'un patient vu par la Direction (décision du 11/11/2026) : un seul statut, dans cet ordre de priorité.
//  - NOUVEAU : dossier créé depuis la fin de la session précédente de ce compte Direction ;
//  - FIDELE  : plus de 10 venues ;
//  - A_RELANCER : une seule venue (ou aucune), et rien depuis plus de 6 mois.
// Les autres n'ont pas de statut (patients réguliers, ou venus une fois récemment).

export type StatutPatient = "NOUVEAU" | "FIDELE" | "A_RELANCER";
export const STATUTS_PATIENT = ["NOUVEAU", "FIDELE", "A_RELANCER"] as const;

/** Fidèle : strictement plus de 10 venues. */
export const VENUES_FIDELE = 10;
/** À relancer : une seule venue, la dernière date de plus de 6 mois. */
export const MOIS_INACTIF = 6;

/** Sans activité pendant 1 h, la session de la Direction est considérée comme terminée (navigateur fermé sans déconnexion). */
export const PAUSE_FIN_SESSION_MS = 60 * 60 * 1000;
/** L'activité n'est réécrite en base qu'au plus toutes les 2 minutes. */
export const ECART_ECRITURE_ACTIVITE_MS = 2 * 60 * 1000;

/** Date avant laquelle une dernière venue met le patient « à relancer ». */
export function limiteInactivite(maintenant: Date): Date {
  const limite = new Date(maintenant);
  limite.setUTCMonth(limite.getUTCMonth() - MOIS_INACTIF);
  return limite;
}

/**
 * @param repere début des « nouveaux » pour ce compte Direction (fin de sa session précédente)
 */
export function statutPatient(
  patient: { creeLe: Date; venues: number; derniereVenue: Date | null },
  repere: Date,
  maintenant: Date = new Date(),
): StatutPatient | null {
  if (patient.creeLe > repere) return "NOUVEAU";
  if (patient.venues > VENUES_FIDELE) return "FIDELE";
  const derniere = patient.derniereVenue ?? patient.creeLe;
  if (patient.venues <= 1 && derniere < limiteInactivite(maintenant)) return "A_RELANCER";
  return null;
}

/**
 * Activité d'un compte Direction : ce qu'il faut écrire, ou null s'il n'y a rien à écrire (écriture récente).
 * Après une pause d'au moins 1 h, une nouvelle session commence : les « nouveaux » repartent de la dernière activité.
 */
export function activiteSuivante(
  derniereActivite: Date | null,
  maintenant: Date,
): { derniereActiviteLe: Date; nouveauxDepuis?: Date } | null {
  if (derniereActivite) {
    const ecart = maintenant.getTime() - derniereActivite.getTime();
    if (ecart < ECART_ECRITURE_ACTIVITE_MS) return null;
    if (ecart < PAUSE_FIN_SESSION_MS) return { derniereActiviteLe: maintenant };
    return { derniereActiviteLe: maintenant, nouveauxDepuis: derniereActivite };
  }
  // Toute première activité connue : aucun patient n'est « nouveau » avant elle.
  return { derniereActiviteLe: maintenant, nouveauxDepuis: maintenant };
}
