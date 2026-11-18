import { cleProduit } from "./produits.js";

/** Un médicament manquant est signalé dès que ce nombre de patients différents l'ont reçu en ordonnance… */
export const PATIENTS_DEMANDE = 3;
/** … sur cette période (les ordonnances plus anciennes ne comptent plus). */
export const JOURS_DEMANDE = 30;

export interface MedicamentDemande {
  /** RUPTURE : produit du centre sans stock utilisable. HORS_CENTRE : prescrit hors stock, absent de la liste du centre. */
  type: "RUPTURE" | "HORS_CENTRE";
  /** Ligne à commander (RUPTURE) ; null si toutes les lignes du produit sont périmées, et pour HORS_CENTRE. */
  medicamentId: number | null;
  /** Identifiant stable du produit ou du nom saisi (clé de l'alerte). */
  cle: string;
  nom: string;
  forme: string | null;
  patients: number;
}

export interface LignePrescrite {
  medicamentId: number | null;
  libelle: string | null;
  forme: string | null;
  patientId: number;
}

export interface MedicamentDuCentre {
  id: number;
  nom: string;
  forme: string;
  categorieId: number;
  stock: number;
  perime: boolean;
}

/** Nom comparé sans majuscules, accents ni espaces en trop. */
export const nomCompare = (nom: string) =>
  nom.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Médicaments manquants dont au moins PATIENTS_DEMANDE patients différents ont eu besoin (lignes d'ordonnance déjà
 * limitées à la période) : produits actifs du centre sans stock utilisable, et médicaments prescrits hors stock
 * que le centre n'a pas dans sa liste. Un produit réunit ses lignes de prix (même nom, forme et catégorie).
 */
export function regrouperDemandes(lignes: LignePrescrite[], medicaments: MedicamentDuCentre[]): MedicamentDemande[] {
  const produitDe = new Map<number, string>();
  const produits = new Map<string, { nom: string; forme: string; stock: number; ligne: number | null; patients: Set<number> }>();
  for (const medicament of medicaments) {
    const cle = cleProduit(medicament);
    produitDe.set(medicament.id, cle);
    const produit = produits.get(cle) ?? { nom: medicament.nom, forme: medicament.forme, stock: 0, ligne: null, patients: new Set<number>() };
    // Une ligne périmée ne se délivre plus : ni son stock ni elle-même ne comptent pour la commande.
    if (!medicament.perime) {
      produit.stock += medicament.stock;
      if (produit.ligne === null || medicament.id > produit.ligne) produit.ligne = medicament.id;
    }
    produits.set(cle, produit);
  }

  // Nom d'un produit du centre : prescrit hors stock (rupture, périmé), il compte pour ce produit.
  const produitDuNom = new Map<string, string>();
  for (const medicament of medicaments) {
    const nom = nomCompare(medicament.nom);
    if (!produitDuNom.has(nom)) produitDuNom.set(nom, cleProduit(medicament));
  }
  const horsCentre = new Map<string, { nom: string; formes: Map<string, number>; patients: Set<number> }>();
  for (const ligne of lignes) {
    if (ligne.medicamentId !== null) {
      const cle = produitDe.get(ligne.medicamentId);
      if (cle) produits.get(cle)?.patients.add(ligne.patientId);
      continue;
    }
    const nom = ligne.libelle?.trim();
    if (!nom) continue;
    const cle = nomCompare(nom);
    // Médicament de la liste du centre (en rupture quand il a été prescrit) : suivi comme produit.
    const produitConnu = produitDuNom.get(cle);
    if (produitConnu) {
      produits.get(produitConnu)?.patients.add(ligne.patientId);
      continue;
    }
    const demande = horsCentre.get(cle) ?? { nom, formes: new Map<string, number>(), patients: new Set<number>() };
    demande.patients.add(ligne.patientId);
    if (ligne.forme) demande.formes.set(ligne.forme, (demande.formes.get(ligne.forme) ?? 0) + 1);
    horsCentre.set(cle, demande);
  }

  const resultat: MedicamentDemande[] = [];
  for (const [cle, produit] of produits) {
    if (produit.stock > 0 || produit.patients.size < PATIENTS_DEMANDE) continue;
    resultat.push({ type: "RUPTURE", medicamentId: produit.ligne, cle, nom: produit.nom, forme: produit.forme, patients: produit.patients.size });
  }
  for (const [cle, demande] of horsCentre) {
    if (demande.patients.size < PATIENTS_DEMANDE) continue;
    // Forme la plus prescrite (aucune pour les anciennes lignes sans forme).
    const forme = [...demande.formes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    resultat.push({ type: "HORS_CENTRE", medicamentId: null, cle, nom: demande.nom, forme, patients: demande.patients.size });
  }
  return resultat.sort((a, b) => b.patients - a.patients || a.nom.localeCompare(b.nom, "fr"));
}
