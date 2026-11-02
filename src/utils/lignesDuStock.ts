// Lignes d'ordonnance qui passent au comptoir : médicament du stock du centre, avec un prix de vente fixé.
// Un médicament hors stock (prescription seule) ou dont le prix est à fixer reste une simple prescription.
export const LIGNES_DU_STOCK = { medicament: { is: { prixVente: { gt: 0 } } } } as const;
