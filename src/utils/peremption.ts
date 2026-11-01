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

/**
 * Compteurs de la cloche. Un périmé ne compte que s'il reste du stock à retirer, et il n'est ni en rupture
 * ni sous le seuil. Rupture et sous le seuil : même règle que l'onglet « Rupture et alerte » (R067).
 */
export function compterAlertesStock(
  produits: readonly { stock: number; seuilAlerte: number; datePeremption: Date | null }[],
  aujourdhui: string = jourDuCentre(),
) {
  const compte = { perimes: 0, proches: 0, ruptures: 0, sousSeuil: 0 };
  for (const { stock, seuilAlerte, datePeremption } of produits) {
    if (estPerime(datePeremption, aujourdhui)) {
      if (stock > 0) compte.perimes += 1;
    } else if (stock <= 0) {
      compte.ruptures += 1;
    } else {
      if (estProcheDePeremption(datePeremption, aujourdhui)) compte.proches += 1;
      if (stock <= seuilAlerte) compte.sousSeuil += 1;
    }
  }
  return compte;
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
