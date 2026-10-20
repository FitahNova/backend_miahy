// Charges fixes ramenées au mois (R140) : trimestrielle ÷ 3, annuelle ÷ 12, en Ariary entiers.

export type Periodicite = "MENSUELLE" | "TRIMESTRIELLE" | "ANNUELLE";

const MOIS_PAR_PERIODE: Record<Periodicite, number> = { MENSUELLE: 1, TRIMESTRIELLE: 3, ANNUELLE: 12 };

/** Part mensuelle d'une charge ; 0 si son montant n'est pas encore fixé. */
export function montantMensuel(charge: { montant: number | null; periodicite: Periodicite }): number {
  if (charge.montant === null) return 0;
  return Math.round(charge.montant / MOIS_PAR_PERIODE[charge.periodicite]);
}

/** Total mensuel des charges actives, et nombre de charges encore « à fixer ». */
export function totalMensuel(charges: readonly { montant: number | null; periodicite: Periodicite; actif: boolean }[]) {
  const actives = charges.filter((charge) => charge.actif);
  return {
    total: actives.reduce((somme, charge) => somme + montantMensuel(charge), 0),
    aFixer: actives.filter((charge) => charge.montant === null).length,
  };
}
