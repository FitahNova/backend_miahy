const FUSEAU = "Indian/Antananarivo";
const DECALAGE_FUSEAU = "+03:00";
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/** Jour calendaire du centre (Madagascar), au format AAAA-MM-JJ. */
export function jourDuCentre(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(date);
}

/** Début inclus et fin exclue du jour calendaire du centre. */
export function bornesDuJour(jour: string) {
  const debut = new Date(`${jour}T00:00:00${DECALAGE_FUSEAU}`);
  return { debut, fin: new Date(debut.getTime() + MS_PAR_JOUR) };
}

export function estCeJourAuCentre(dateHeure: Date, maintenant: Date): boolean {
  const { debut, fin } = bornesDuJour(jourDuCentre(maintenant));
  return dateHeure >= debut && dateHeure < fin;
}

/**
 * Rendez-vous encore « Prévu » dont le créneau tombe le jour même au centre.
 * S'il y en a plusieurs, le plus tôt. Un créneau d'un autre jour n'est pas retenu.
 */
export function choisirRendezVousDuJour<T extends { dateHeure: Date; statut: string }>(
  rendezVous: readonly T[],
  maintenant: Date,
): T | undefined {
  return rendezVous
    .filter((rdv) => rdv.statut === "PREVU" && estCeJourAuCentre(rdv.dateHeure, maintenant))
    .sort((a, b) => a.dateHeure.getTime() - b.dateHeure.getTime())[0];
}
