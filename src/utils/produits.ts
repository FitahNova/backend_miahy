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

/**
 * Formes dont la fiche précise le contenu d'une unité de vente (décision du 03/11/2026) :
 * comprimés ou gélules par plaquette, suppositoires ou sachets par boîte, ml par flacon de sirop.
 */
/**
 * Unité de vente (comme le front) : plaquette, boîte, flacon, tube, ampoule ou sachet.
 * Deux formes de même unité (comprimé et gélule) gardent un stock et des prix comparables.
 */
export function uniteDeVente(forme: string, contenu = 1): string {
  switch (forme) {
    case "comprimé":
    case "gélule":
      return "plaquette";
    case "suppositoire":
      return "boîte";
    case "sachet":
      return contenu > 1 ? "boîte" : "sachet";
    case "sirop":
    case "collyre":
      return "flacon";
    case "pommade":
      return "tube";
    case "injectable":
      return "ampoule";
    default:
      return forme;
  }
}

export const FORMES_A_CONTENU = ["comprimé", "gélule", "suppositoire", "sachet", "sirop"] as const;

/** Pommade (tube), injectable (ampoule), collyre (flacon) : instruction et quantité écrites par le médecin. */
export const FORMES_QUANTITE_ECRITE = ["pommade", "injectable", "collyre"] as const;

export const estQuantiteEcrite = (forme: string) => (FORMES_QUANTITE_ECRITE as readonly string[]).includes(forme);

/** Toutes les formes connues (fiches du stock, et médicaments hors stock de l'ordonnance). */
export const FORMES_MEDICAMENT = ["comprimé", "gélule", "sachet", "sirop", "pommade", "injectable", "suppositoire", "collyre"] as const;

/** Contenu retenu pour une forme : la valeur saisie pour les formes à contenu, sinon 1. */
export function contenuSelonForme(forme: string, contenu: number | null | undefined): number {
  return (FORMES_A_CONTENU as readonly string[]).includes(forme) ? Math.max(1, contenu ?? 1) : 1;
}

/** Unités à délivrer : quantité prescrite ÷ contenu, arrondi au supérieur (15 comprimés et 10 → 2 plaquettes). */
export function unitesADelivrer(quantitePrescrite: number, contenu: number): number {
  return Math.ceil(quantitePrescrite / Math.max(1, contenu));
}
