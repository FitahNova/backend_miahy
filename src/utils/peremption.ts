import { JOURS_ALERTE_PEREMPTION } from "../config/constants.js";
import { decalerJour, jourDuCentre } from "./suivis.js";

/**
 * Un médicament est périmé dès que sa date de péremption est atteinte (le jour même compris),
 * au jour de Madagascar. Sans date, il n'est jamais périmé.
 */
export function estPerime(datePeremption: Date | null, aujourdhui: string = jourDuCentre()): boolean {
  if (!datePeremption) return false;
  return datePeremption.toISOString().slice(0, 10) <= aujourdhui;
}

/** Péremption dans les JOURS_ALERTE_PEREMPTION prochains jours (et pas encore atteinte). */
export function estProcheDePeremption(datePeremption: Date | null, aujourdhui: string = jourDuCentre()): boolean {
  if (!datePeremption || estPerime(datePeremption, aujourdhui)) return false;
  return datePeremption.toISOString().slice(0, 10) <= decalerJour(aujourdhui, JOURS_ALERTE_PEREMPTION);
}

export type ObservationInventaire = "Périmé" | "Rupture" | "Proche de péremption" | "Stock insuffisant" | "Stock conforme";

/**
 * Observation de la fiche d'inventaire, la plus grave d'abord :
 * périmé, rupture (stock nul), proche de péremption, stock insuffisant (au seuil d'alerte ou dessous), stock conforme.
 */
export function observationInventaire(
  produit: { stock: number; seuilAlerte: number; datePeremption: Date | null },
  aujourdhui: string = jourDuCentre(),
): ObservationInventaire {
  if (estPerime(produit.datePeremption, aujourdhui)) return "Périmé";
  if (produit.stock <= 0) return "Rupture";
  if (estProcheDePeremption(produit.datePeremption, aujourdhui)) return "Proche de péremption";
  if (produit.stock <= produit.seuilAlerte) return "Stock insuffisant";
  return "Stock conforme";
}
