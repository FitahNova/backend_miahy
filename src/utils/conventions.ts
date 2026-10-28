// Calcul des conventions partenaires (R084, R085), sans accès à la base.

export interface Convention {
  tauxPriseEnCharge: number;
  serviceCouvertId: number | null;
  couvreMedicaments: boolean;
  actif: boolean;
  debut: Date | null;
  fin: Date | null;
  programmeIds: number[];
}

export interface LigneCouvrable {
  type: "ACTE" | "MEDICAMENT";
  serviceId: number | null;
  quantite: number;
  prixUnitaire: number;
}

const jour = (date: Date) => date.toISOString().slice(0, 10);

/** Montant des lignes couvertes : le service de la convention, ou tous les médicaments (ou les deux). */
export function montantCouvert(convention: Convention, lignes: readonly LigneCouvrable[]): number {
  return lignes
    .filter((ligne) => {
      const couvreMedicament = convention.couvreMedicaments && ligne.type === "MEDICAMENT";
      const couvreService =
        convention.serviceCouvertId !== null &&
        ligne.type === "ACTE" &&
        ligne.serviceId !== null &&
        ligne.serviceId === convention.serviceCouvertId;
      return couvreMedicament || couvreService;
    })
    .reduce((somme, ligne) => somme + ligne.quantite * ligne.prixUnitaire, 0);
}

/**
 * R084 : partenaire actif, taux positif, date de la facture dans la période, patient d'un programme
 * couvert, et au moins une ligne couverte.
 */
export function conventionApplicable(
  convention: Convention,
  facture: { jour: string; programmeId: number | null },
  lignes: readonly LigneCouvrable[],
): boolean {
  if (!convention.actif || convention.tauxPriseEnCharge <= 0) return false;
  if (convention.debut && facture.jour < jour(convention.debut)) return false;
  if (convention.fin && facture.jour > jour(convention.fin)) return false;
  if (facture.programmeId === null || !convention.programmeIds.includes(facture.programmeId)) return false;
  return montantCouvert(convention, lignes) > 0;
}

/**
 * R085 : part partenaire = montant couvert × taux ÷ 100, sans arrondi (centimes gardés jusqu'à la
 * validation de la Direction). La caisse travaillant en Ariary entiers, le partenaire est compté pour
 * la partie entière ; les centimes restent à la charge du patient.
 */
export function partPartenaire(montant: number, taux: number): { exacte: string; entiere: number } {
  const centimes = montant * taux; // montant × taux / 100, exprimé en centimes d'Ariary
  const entiere = Math.floor(centimes / 100);
  return { exacte: `${entiere}.${String(centimes % 100).padStart(2, "0")}`, entiere };
}
