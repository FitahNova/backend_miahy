/**
 * Clé d'un produit : même nom (sans tenir compte des majuscules ni des espaces), même forme, même catégorie.
 * « Vitamine C » comprimé à 500 Ar et à 600 Ar est un seul produit, sur deux lignes de stock (prix différents).
 */
export function cleProduit(medicament: { nom: string; forme: string; categorieId: number }): string {
  const nom = medicament.nom.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
  return `${nom}|${medicament.forme}|${medicament.categorieId}`;
}

/** Un arrivage rejoint une ligne de stock seulement si elle a la même date de péremption et le même prix d'achat. */
export function memeLigneDeStock(
  ligne: { datePeremption: Date | null; prixAchat: number },
  jourPeremption: string | null,
  prixAchat: number,
): boolean {
  return (ligne.datePeremption?.toISOString().slice(0, 10) ?? null) === jourPeremption && ligne.prixAchat === prixAchat;
}

/** Produits disponibles : lignes avec du stock (non périmées, filtrées par l'appelant), comptées une fois par produit. */
export function compterProduitsDisponibles(
  medicaments: readonly { nom: string; forme: string; categorieId: number; stock: number }[],
): number {
  return new Set(medicaments.filter((medicament) => medicament.stock > 0).map(cleProduit)).size;
}
