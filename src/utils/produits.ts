/**
 * Clé d'un produit : même nom (sans tenir compte des majuscules ni des espaces), même forme, même catégorie.
 * « Vitamine C » comprimé à 500 Ar et à 600 Ar est un seul produit, sur deux lignes de stock (prix différents).
 */
export function cleProduit(medicament: { nom: string; forme: string; categorieId: number }): string {
  const nom = medicament.nom.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
  return `${nom}|${medicament.forme}|${medicament.categorieId}`;
}

/** Produits disponibles : lignes avec du stock (non périmées, filtrées par l'appelant), comptées une fois par produit. */
export function compterProduitsDisponibles(
  medicaments: readonly { nom: string; forme: string; categorieId: number; stock: number }[],
): number {
  return new Set(medicaments.filter((medicament) => medicament.stock > 0).map(cleProduit)).size;
}
