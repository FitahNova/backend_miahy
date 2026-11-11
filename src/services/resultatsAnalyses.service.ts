import { prisma } from "../config/prisma.js";
import { Orientation, StatutFacture, TypeLigneFacture } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { CABINET } from "./impression.service.js";

/*
 * Résultats d'analyses (secrétaire) : passages avec des analyses facturées, venue « analyse seule » ou analyses
 * prescrites en consultation. La secrétaire fixe la date de retour du résultat, imprime le ticket une fois payé,
 * puis note la remise du résultat au patient.
 */

// Factures qui comptent : toutes sauf les annulées.
const FACTURES_VALIDES: Prisma.FactureWhereInput = { statut: { not: StatutFacture.ANNULEE } };
const AVEC_ANALYSES: Prisma.PassageWhereInput = {
  factures: { some: { ...FACTURES_VALIDES, lignes: { some: { type: TypeLigneFacture.ANALYSE } } } },
};

const LIMITE_LISTE = 200;

const selectionResultat = {
  id: true,
  orientation: true,
  heureArrivee: true,
  dateRetourResultat: true,
  resultatRemisLe: true,
  patient: { select: { id: true, numeroDossier: true, nom: true, prenom: true, telephone: true } },
  factures: {
    where: { ...FACTURES_VALIDES, lignes: { some: { type: TypeLigneFacture.ANALYSE } } },
    select: {
      statut: true,
      lignes: {
        where: { type: TypeLigneFacture.ANALYSE },
        orderBy: { id: "asc" },
        select: { libelle: true, analyse: { select: { code: true } } },
      },
    },
  },
} satisfies Prisma.PassageSelect;

type PassageResultat = Prisma.PassageGetPayload<{ select: typeof selectionResultat }>;

const jour = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

function versResultat(passage: PassageResultat) {
  return {
    passageId: passage.id,
    patient: passage.patient,
    origine: passage.orientation === Orientation.ANALYSE ? ("ANALYSE_SEULE" as const) : ("CONSULTATION" as const),
    arrivee: passage.heureArrivee,
    dateRetour: jour(passage.dateRetourResultat),
    remisLe: passage.resultatRemisLe,
    // Paiement avant l'analyse : le ticket ne sort que si toutes les factures d'analyses sont soldées.
    paye: passage.factures.every((facture) => facture.statut === StatutFacture.PAYE),
    analyses: passage.factures.flatMap((facture) =>
      facture.lignes.map((ligne) => ({ code: ligne.analyse?.code ?? null, nom: ligne.libelle })),
    ),
  };
}

export type EtatResultat = "attente" | "remis";

/** À remettre (date de retour la plus proche d'abord) ou déjà remis (les plus récents d'abord). */
export async function listerResultatsAnalyses(filtres: { etat: EtatResultat; recherche?: string }) {
  const terme = filtres.recherche?.trim();
  const contient = (valeur: string) => ({ contains: valeur, mode: "insensitive" as const });
  const passages = await prisma.passage.findMany({
    where: {
      ...AVEC_ANALYSES,
      resultatRemisLe: filtres.etat === "attente" ? null : { not: null },
      ...(terme
        ? {
            OR: [
              { patient: { nom: contient(terme) } },
              { patient: { prenom: contient(terme) } },
              { patient: { numeroDossier: contient(terme) } },
              { patient: { telephone: contient(terme) } },
            ],
          }
        : {}),
    },
    orderBy:
      filtres.etat === "attente"
        ? [{ dateRetourResultat: { sort: "asc", nulls: "first" } }, { heureArrivee: "asc" }]
        : [{ resultatRemisLe: "desc" }],
    take: LIMITE_LISTE,
    select: selectionResultat,
  });
  return passages.map(versResultat);
}

async function lirePassageAvecAnalyses(client: Prisma.TransactionClient, passageId: number) {
  const passage = await client.passage.findFirst({ where: { id: passageId, ...AVEC_ANALYSES }, select: selectionResultat });
  if (!passage) throw new ErreurHttp(404, "ANALYSES_INTROUVABLES");
  return passage;
}

/** Date de retour du résultat (AAAA-MM-JJ), modifiable tant que le résultat n'est pas remis. */
export async function fixerDateRetour(passageId: number, dateRetour: string, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const passage = await lirePassageAvecAnalyses(transaction, passageId);
    if (passage.resultatRemisLe) throw new ErreurHttp(409, "RESULTAT_DEJA_REMIS");
    await transaction.passage.update({
      where: { id: passageId },
      data: { dateRetourResultat: new Date(`${dateRetour}T00:00:00Z`) },
    });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "DATE_RETOUR_RESULTAT",
      entite: "passage",
      entiteId: passageId,
      detail: { avant: jour(passage.dateRetourResultat), apres: dateRetour },
    });
    return versResultat(await lirePassageAvecAnalyses(transaction, passageId));
  }, OPTIONS_TRANSACTION);
}

/** Résultat remis au patient (ou remise annulée, en cas d'erreur de clic). */
export async function marquerResultatRemis(passageId: number, remis: boolean, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const passage = await lirePassageAvecAnalyses(transaction, passageId);
    if (remis && !versResultat(passage).paye) throw new ErreurHttp(409, "ANALYSES_NON_PAYEES");
    await transaction.passage.update({ where: { id: passageId }, data: { resultatRemisLe: remis ? new Date() : null } });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: remis ? "RESULTAT_REMIS" : "REMISE_RESULTAT_ANNULEE",
      entite: "passage",
      entiteId: passageId,
    });
    return versResultat(await lirePassageAvecAnalyses(transaction, passageId));
  }, OPTIONS_TRANSACTION);
}

/** Ticket d'analyses remis au patient : analyses avec code et consigne, montant payé, date de retour. */
export async function obtenirTicketAnalyses(passageId: number) {
  const passage = await prisma.passage.findFirst({
    where: { id: passageId, ...AVEC_ANALYSES },
    select: {
      id: true,
      heureArrivee: true,
      dateRetourResultat: true,
      patient: { select: { numeroDossier: true, nom: true, prenom: true, telephone: true } },
      factures: {
        where: { ...FACTURES_VALIDES, lignes: { some: { type: TypeLigneFacture.ANALYSE } } },
        orderBy: { id: "asc" },
        select: {
          numero: true,
          statut: true,
          lignes: {
            where: { type: TypeLigneFacture.ANALYSE },
            orderBy: { id: "asc" },
            select: { id: true, libelle: true, prixUnitaire: true, quantite: true, analyse: { select: { code: true, instruction: true } } },
          },
        },
      },
    },
  });
  if (!passage) throw new ErreurHttp(404, "ANALYSES_INTROUVABLES");

  const lignes = passage.factures.flatMap((facture) =>
    facture.lignes.map((ligne) => ({
      id: ligne.id,
      code: ligne.analyse?.code ?? null,
      nom: ligne.libelle,
      instruction: ligne.analyse?.instruction ?? null,
      prix: ligne.prixUnitaire * ligne.quantite,
    })),
  );
  return {
    cabinet: CABINET,
    passageId: passage.id,
    date: passage.heureArrivee,
    patient: passage.patient,
    factures: passage.factures.map((facture) => facture.numero),
    paye: passage.factures.every((facture) => facture.statut === StatutFacture.PAYE),
    dateRetour: jour(passage.dateRetourResultat),
    analyses: lignes,
    total: lignes.reduce((somme, ligne) => somme + ligne.prix, 0),
  };
}

/** Analyses actives proposées à l'accueil et en consultation (prix du catalogue ; « à fixer » exclues). */
export function listerAnalysesProposees() {
  return prisma.analyse.findMany({
    where: { actif: true, prix: { not: null } },
    orderBy: { nom: "asc" },
    select: { id: true, code: true, nom: true, prix: true, instruction: true, categorie: { select: { nom: true } } },
  });
}
