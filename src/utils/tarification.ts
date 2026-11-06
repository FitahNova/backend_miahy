import type { Nationalite } from "../generated/prisma/client.js";

/*
 * Tarif d'un acte : le tarif saisi pour le service est le tarif Malagasy en heures normales.
 * Étranger : + majoration étranger ; hors plage normale (dès l'heure du soir, ou avant l'ouverture) : + majoration du soir.
 * Les deux majorations se multiplient, puis le prix est arrondi à l'Ariary.
 * Seule source de calcul de l'application : facturation, prix des actes en consultation, aperçu des tarifs.
 */

export interface ParametresTarif {
  majorationSoirPourcent: number;
  /** « HH:mm », heure du centre : la plage normale s'arrête juste avant. */
  heureDebutSoir: string;
  /** « HH:mm », heure du centre : la plage normale commence à cette heure. */
  heureOuverture: string;
  majorationEtrangerPourcent: number;
}

export const PARAMETRES_TARIF_DEFAUT: ParametresTarif = {
  majorationSoirPourcent: 30,
  heureDebutSoir: "18:00",
  heureOuverture: "07:30",
  majorationEtrangerPourcent: 25,
};

export const FORMAT_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const POURCENTAGE_MAX = 500;

export interface DetailTarif {
  prixBase: number;
  nationalite: Nationalite | null;
  /** Taux appliqués (0 si la majoration ne s'applique pas). */
  tauxEtranger: number;
  tauxSoir: number;
  /** Prix final, en Ariary entiers. */
  prix: number;
}

/** Heure du centre « HH:mm » (fuseau Indian/Antananarivo). */
export function heureDuCentre(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Antananarivo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Hors plage normale : à partir de l'heure du soir, ou avant l'heure d'ouverture. */
export function estHorsPlage(heure: string, parametres: Pick<ParametresTarif, "heureDebutSoir" | "heureOuverture">): boolean {
  return heure >= parametres.heureDebutSoir || heure < parametres.heureOuverture;
}

/** Applique les taux (multipliés) au prix de base, en calcul entier, arrondi à l'Ariary. */
export function appliquerMajorations(prixBase: number, tauxEtranger: number, tauxSoir: number): number {
  return Math.round((prixBase * (100 + tauxEtranger) * (100 + tauxSoir)) / 10_000);
}

/** Tarif d'un acte pour un patient à un instant donné. Nationalité vide (patient enregistré avant) : tarif Malagasy. */
export function calculerTarif(
  prixBase: number,
  contexte: { nationalite: Nationalite | null; date: Date },
  parametres: ParametresTarif,
): DetailTarif {
  const tauxEtranger = contexte.nationalite === "ETRANGER" ? parametres.majorationEtrangerPourcent : 0;
  const tauxSoir = estHorsPlage(heureDuCentre(contexte.date), parametres) ? parametres.majorationSoirPourcent : 0;
  return {
    prixBase,
    nationalite: contexte.nationalite,
    tauxEtranger,
    tauxSoir,
    prix: appliquerMajorations(prixBase, tauxEtranger, tauxSoir),
  };
}
