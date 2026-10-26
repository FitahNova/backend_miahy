import { ErreurHttp } from "./errors.js";

/** Billets et pièces du comptage, du plus fort au plus faible. Le serveur recalcule le total. */
export const COUPURES = [10_000, 5_000, 2_000, 1_000, 500, 200, 100] as const;

export type Coupure = { valeur: number; quantite: number };

export function totalDuComptage(coupures: readonly Coupure[]): number {
  return coupures.reduce((somme, coupure) => somme + coupure.valeur * coupure.quantite, 0);
}

/** Attendu dans le tiroir : fond de caisse + espèces encaissées. Mobile Money et Autre n'y entrent pas. */
export function attenduDuTiroir(fondDeCaisse: number, especesEncaissees: number): number {
  return fondDeCaisse + especesEncaissees;
}

export function ecartDeCaisse(totalCompte: number, totalAttendu: number): number {
  return totalCompte - totalAttendu;
}

/** Refuse un comptage qui n'est pas exactement les coupures prévues, chacune une fois. */
export function verifierCoupures(coupures: readonly Coupure[]): void {
  const valeurs = coupures.map((coupure) => coupure.valeur);
  const uniques = new Set(valeurs);
  const completes = uniques.size === COUPURES.length && COUPURES.every((valeur) => uniques.has(valeur));
  if (!completes || valeurs.length !== COUPURES.length) {
    throw new ErreurHttp(400, "COMPTAGE_INVALIDE");
  }
}
