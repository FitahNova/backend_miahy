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
 * Compteurs de la cloche. Un périmé ne compte pas : il sort du stock et passe dans l'onglet « Périmés ».
 * Rupture et sous le seuil : même règle que l'onglet « Rupture et alerte » (R067).
 */
export function compterAlertesStock(
  produits: readonly { stock: number; seuilAlerte: number; datePeremption: Date | null; prixVente: number }[],
  aujourdhui: string = jourDuCentre(),
) {
  const compte = { proches: 0, ruptures: 0, sousSeuil: 0, sansPrix: 0 };
  for (const { stock, seuilAlerte, datePeremption, prixVente } of produits) {
    if (estPerime(datePeremption, aujourdhui)) continue;
    if (stock <= 0) {
      compte.ruptures += 1;
    } else {
      if (estProcheDePeremption(datePeremption, aujourdhui)) compte.proches += 1;
      if (stock <= seuilAlerte) compte.sousSeuil += 1;
      if (prixVente <= 0) compte.sansPrix += 1;
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
