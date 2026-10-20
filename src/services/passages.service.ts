import { prisma } from "../config/prisma.js";
import { SEUIL_ATTENTE_LONGUE_MINUTES, SOIGNANTS } from "../config/constants.js";
import { StatutPassage } from "../generated/prisma/client.js";
import type { Orientation, Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { verifierMotifGrossesse } from "../utils/motifs.js";
import { enregistrerAudit } from "./audit.service.js";
import { creerFacturePourPassage } from "./facturation.service.js";
import { cloturerSuivisAuRetour } from "./suivis.service.js";
import type { ActeFacture } from "./facturation.service.js";

const MILLISECONDES_PAR_MINUTE = 60 * 1000;

const selectionPassage = {
  id: true,
  motif: true,
  orientation: true,
  statut: true,
  urgence: true,
  heureArrivee: true,
  heureDebut: true,
  heureFin: true,
  patient: {
    select: { id: true, numeroDossier: true, nom: true, prenom: true, sexe: true, dateNaissance: true, allergies: true },
  },
  praticien: { select: { id: true, nom: true, role: true } },
} satisfies Prisma.PassageSelect;

// Statuts d'où l'on peut passer à chaque cible par un changement manuel (soignants seulement).
// PHARMACIE / CAISSE : signature de la consultation. CAISSE (après délivrance) : pharmacie.
// PARTIEL / TERMINE : paiement en caisse. Aucun de ces statuts ne se pose à la main.
const SOURCES_PAR_CIBLE: Partial<Record<StatutPassage, StatutPassage[]>> = {
  [StatutPassage.A_REVOIR]: [StatutPassage.EN_CONSULTATION],
  [StatutPassage.EN_CONSULTATION]: [StatutPassage.A_REVOIR],
};

// Cibles qui exigent que l'utilisateur soit le praticien de la consultation.
const CIBLES_RESERVEES_AU_PRATICIEN: StatutPassage[] = [StatutPassage.A_REVOIR, StatutPassage.EN_CONSULTATION];

export interface DonneesNouveauPassage {
  patientId: number;
  motif: string;
  orientation?: Orientation | null;
  urgence?: boolean;
  praticienId?: number | null;
}

function ajouterIndicateursAttente<T extends { statut: StatutPassage; heureArrivee: Date }>(passage: T) {
  const attenteMinutes = Math.floor((Date.now() - passage.heureArrivee.getTime()) / MILLISECONDES_PAR_MINUTE);
  return {
    ...passage,
    attenteMinutes,
    attenteLongue: passage.statut === StatutPassage.EN_ATTENTE && attenteMinutes >= SEUIL_ATTENTE_LONGUE_MINUTES,
  };
}

async function verifierPraticien(identifiant: number) {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: identifiant },
    select: { actif: true, role: true },
  });
  const estSoignantActif =
    utilisateur !== null && utilisateur.actif && (SOIGNANTS as readonly string[]).includes(utilisateur.role);

  if (!estSoignantActif) {
    throw new ErreurHttp(400, "PRATICIEN_INVALIDE");
  }
}

async function obtenirPassageExistant(identifiant: number) {
  const passage = await prisma.passage.findUnique({
    where: { id: identifiant },
    select: { id: true, statut: true, praticienId: true, urgence: true },
  });
  if (!passage) {
    throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");
  }
  return passage;
}

function lirePassageComplet(identifiant: number) {
  return prisma.passage.findUniqueOrThrow({ where: { id: identifiant }, select: selectionPassage });
}

export async function listerPassagesDeLaFile(statuts: StatutPassage[]) {
  const passages = await prisma.passage.findMany({
    where: { statut: { in: statuts } },
    orderBy: { heureArrivee: "asc" },
    select: selectionPassage,
  });

  // Règle unique : les urgents en attente d'abord, puis ordre d'arrivée.
  const rangUrgence = (p: { urgence: boolean; statut: StatutPassage }) =>
    p.urgence && p.statut === StatutPassage.EN_ATTENTE ? 0 : 1;

  return passages
    .sort((a, b) => rangUrgence(a) - rangUrgence(b) || a.heureArrivee.getTime() - b.heureArrivee.getTime())
    .map(ajouterIndicateursAttente);
}

// R029 : un seul passage en cours par patient. Un passage PARTIEL (reste dû) ne bloque pas une
// nouvelle venue : son reste s'encaisse plus tard sans nouveau passage (R102).
const STATUTS_PASSAGE_EN_COURS: StatutPassage[] = [
  StatutPassage.EN_ATTENTE,
  StatutPassage.EN_CONSULTATION,
  StatutPassage.A_REVOIR,
  StatutPassage.PHARMACIE,
  StatutPassage.CAISSE,
];

/** Crée un passage dans la file (arrivée enregistrée par la secrétaire). */
export async function creerNouveauPassage(donnees: DonneesNouveauPassage) {
  if (donnees.praticienId != null) {
    await verifierPraticien(donnees.praticienId);
  }
  return prisma.$transaction((transaction) => creerPassageDansTransaction(transaction, donnees), OPTIONS_TRANSACTION);
}

/**
 * Création d'un passage dans une transaction existante (arrivée, ou rendez-vous marqué « Venu »).
 * Verrou sur le patient : deux postes ne peuvent pas créer chacun un passage au même instant (R029).
 * @throws 404 PATIENT_INTROUVABLE, 409 PASSAGE_DEJA_EN_COURS, 422 MOTIF_GROSSESSE_INCOMPATIBLE
 */
export async function creerPassageDansTransaction(transaction: Prisma.TransactionClient, donnees: DonneesNouveauPassage) {
  const verrou = await transaction.$queryRaw<{ actif: boolean }[]>`
    SELECT actif FROM patient WHERE id = ${donnees.patientId} FOR UPDATE`;
  if (verrou.length === 0 || !verrou[0].actif) {
    throw new ErreurHttp(404, "PATIENT_INTROUVABLE");
  }
  const patient = await transaction.patient.findUniqueOrThrow({
    where: { id: donnees.patientId },
    select: { sexe: true, dateNaissance: true },
  });
  verifierMotifGrossesse(donnees.motif, patient);

  const enCours = await transaction.passage.findFirst({
    where: { patientId: donnees.patientId, statut: { in: STATUTS_PASSAGE_EN_COURS } },
    select: { id: true },
  });
  if (enCours) {
    throw new ErreurHttp(409, "PASSAGE_DEJA_EN_COURS");
  }

  const passage = await transaction.passage.create({
    data: {
      patientId: donnees.patientId,
      motif: donnees.motif,
      orientation: donnees.orientation ?? null,
      urgence: donnees.urgence ?? false,
      praticienId: donnees.praticienId ?? null,
    },
    select: selectionPassage,
  });
  // Le patient est revenu : ses suivis échus ou proches sont clôturés (R128).
  await cloturerSuivisAuRetour(transaction, donnees.patientId);
  return passage;
}

export async function prendrePassageEnCharge(passageId: number, praticienId: number) {
  const pris = await prisma.$transaction(async (transaction) => {
    const resultat = await transaction.passage.updateMany({
      where: { id: passageId, statut: StatutPassage.EN_ATTENTE },
      data: { statut: StatutPassage.EN_CONSULTATION, praticienId, heureDebut: new Date() },
    });
    if (resultat.count === 0) return false;
    await enregistrerAudit(transaction, {
      utilisateurId: praticienId,
      action: "PRISE_EN_CHARGE_PASSAGE",
      entite: "passage",
      entiteId: passageId,
    });
    return true;
  }, OPTIONS_TRANSACTION);

  if (!pris) {
    await obtenirPassageExistant(passageId);
    throw new ErreurHttp(409, "PASSAGE_PLUS_EN_ATTENTE");
  }

  return lirePassageComplet(passageId);
}

// Fin de consultation : crée la facture (prix copiés) puis oriente le passage.
// Avec ordonnance → pharmacie ; sans ordonnance → caisse.
// Appelée uniquement par la signature de la consultation, dans sa transaction.
export async function terminerPassageDansTransaction(
  transaction: Prisma.TransactionClient,
  passageId: number,
  utilisateurId: number,
  actes?: ActeFacture[],
) {
  const passage = await transaction.passage.findUnique({
    where: { id: passageId },
    select: { patientId: true, ordonnance: { select: { id: true } } },
  });
  if (!passage) {
    throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");
  }

  const avecOrdonnance = passage.ordonnance !== null;

  const resultat = await transaction.passage.updateMany({
    where: { id: passageId, statut: StatutPassage.EN_CONSULTATION },
    data: {
      statut: avecOrdonnance ? StatutPassage.PHARMACIE : StatutPassage.CAISSE,
      heureFin: new Date(),
    },
  });
  if (resultat.count === 0) {
    throw new ErreurHttp(409, "PAS_EN_CONSULTATION");
  }

  const facture = await creerFacturePourPassage(transaction, {
    passageId,
    patientId: passage.patientId,
    actes,
    avecOrdonnance,
  });

  await enregistrerAudit(transaction, {
    utilisateurId,
    action: "FIN_CONSULTATION",
    entite: "passage",
    entiteId: passageId,
    detail: { facture: facture.numero, total: facture.total, avecOrdonnance },
  });
}

// Changement manuel de statut : vérifie la transition, le praticien si besoin, puis écrit l'audit.
export async function changerStatutPassage(passageId: number, cible: StatutPassage, utilisateurId: number) {
  const passage = await obtenirPassageExistant(passageId);

  const sourcesAutorisees = SOURCES_PAR_CIBLE[cible];
  if (!sourcesAutorisees) {
    throw new ErreurHttp(400, "TRANSITION_INTERDITE");
  }

  if (CIBLES_RESERVEES_AU_PRATICIEN.includes(cible) && passage.praticienId !== utilisateurId) {
    throw new ErreurHttp(403, "RESERVE_AU_PRATICIEN");
  }

  await prisma.$transaction(async (transaction) => {
    const resultat = await transaction.passage.updateMany({
      where: { id: passageId, statut: { in: sourcesAutorisees } },
      data: { statut: cible },
    });
    if (resultat.count === 0) {
      throw new ErreurHttp(409, "TRANSITION_INTERDITE");
    }

    await enregistrerAudit(transaction, {
      utilisateurId,
      action: "CHANGEMENT_STATUT_PASSAGE",
      entite: "passage",
      entiteId: passageId,
      detail: { ancienStatut: passage.statut, nouveauStatut: cible },
    });
  }, OPTIONS_TRANSACTION);

  return lirePassageComplet(passageId);
}

export async function modifierUrgenceDuPassage(passageId: number, urgence: boolean, auteurId: number) {
  const passage = await obtenirPassageExistant(passageId);
  if (passage.statut === StatutPassage.TERMINE) {
    throw new ErreurHttp(409, "PASSAGE_TERMINE");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.passage.update({ where: { id: passageId }, data: { urgence } });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "URGENCE_PASSAGE",
      entite: "passage",
      entiteId: passageId,
      detail: { avant: { urgence: passage.urgence }, apres: { urgence } },
    });
  }, OPTIONS_TRANSACTION);
  return lirePassageComplet(passageId);
}

export async function affecterPraticienAuPassage(passageId: number, praticienId: number, auteurId: number) {
  const passage = await obtenirPassageExistant(passageId);
  if (passage.statut === StatutPassage.TERMINE) {
    throw new ErreurHttp(409, "PASSAGE_TERMINE");
  }

  await verifierPraticien(praticienId);
  await prisma.$transaction(async (transaction) => {
    await transaction.passage.update({ where: { id: passageId }, data: { praticienId } });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "AFFECTATION_PRATICIEN",
      entite: "passage",
      entiteId: passageId,
      detail: { avant: { praticienId: passage.praticienId }, apres: { praticienId } },
    });
  }, OPTIONS_TRANSACTION);
  return lirePassageComplet(passageId);
}
