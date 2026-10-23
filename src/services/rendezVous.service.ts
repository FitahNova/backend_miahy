/*
 * Rendez-vous : la Secrétaire et la Direction posent le créneau et notent le statut.
 * Prévu → Venu (crée le passage) | Absent (prépare une relance) | Annulé (sans relance).
 * Une revue programmée à la signature d'une consultation crée aussi un rendez-vous.
 */
import { prisma } from "../config/prisma.js";
import { SOIGNANTS } from "../config/constants.js";
import {
  Orientation,
  Role,
  StatutDemandeAcces,
  StatutPassage,
  StatutRendezVous,
  TypeSuivi,
} from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { bornesDuJour, jourDuCentre } from "../utils/jourCentre.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { verifierMotifGrossesse } from "../utils/motifs.js";
import { enregistrerAudit } from "./audit.service.js";
import { creerPassageDansTransaction } from "./passages.service.js";
import { coordonneesVisibles, listerPatientsParRecherche } from "./patients.service.js";

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
const DECALAGE_FUSEAU = "+03:00";
/** Heure proposée pour une revue programmée à la signature (le patient peut venir dans la journée). */
const HEURE_REVUE_PAR_DEFAUT = "09:00";
const TAILLE_MOTIF_RELANCE = 255;

export interface UtilisateurConnecte {
  id: number;
  role: Role;
}

const estClinicien = (role: Role) => (SOIGNANTS as readonly Role[]).includes(role);

/** Date et heure d'une revue : aujourd'hui + délai, à l'heure par défaut, dans le fuseau du centre. */
export function dateHeureRevue(delaiJours: number): Date {
  const jour = jourDuCentre(new Date(Date.now() + delaiJours * MS_PAR_JOUR));
  return new Date(`${jour}T${HEURE_REVUE_PAR_DEFAUT}:00${DECALAGE_FUSEAU}`);
}

async function verifierPraticien(client: Prisma.TransactionClient, praticienId: number) {
  const praticien = await client.utilisateur.findUnique({ where: { id: praticienId }, select: { actif: true, role: true } });
  if (!praticien || !praticien.actif || !estClinicien(praticien.role)) throw new ErreurHttp(400, "PRATICIEN_INVALIDE");
  return praticien;
}

const selectionListe = {
  id: true,
  dateHeure: true,
  motif: true,
  statut: true,
  passageId: true,
  praticien: { select: { id: true, civilite: true, nom: true, prenom: true, role: true } },
  patient: {
    select: {
      id: true,
      numeroDossier: true,
      nom: true,
      prenom: true,
      telephone: true,
      programme: { select: { nom: true } },
    },
  },
} satisfies Prisma.RendezVousSelect;

/**
 * Rendez-vous entre deux jours inclus (AAAA-MM-JJ), triés par heure.
 * Une seule lecture : l'écran n'a pas besoin de l'historique des visites.
 */
export async function listerRendezVous(filtre: { du: string; au: string }, utilisateur: UtilisateurConnecte) {
  const rendezVous = await prisma.rendezVous.findMany({
    where: {
      dateHeure: { gte: bornesDuJour(filtre.du).debut, lt: bornesDuJour(filtre.au).fin },
    },
    orderBy: { dateHeure: "asc" },
    select: selectionListe,
  });
  const telephoneVisible = coordonneesVisibles(utilisateur.role);
  return rendezVous.map(({ patient, ...rdv }) => ({
    ...rdv,
    patient: { ...patient, telephone: telephoneVisible ? patient.telephone : null },
  }));
}

/** Patients proposés dans le formulaire (au moins deux caractères). */
export async function chercherPatientsRendezVous(role: Role, recherche: string | undefined) {
  const texte = recherche?.trim() ?? "";
  if (texte.length < 2) return [];
  const patients = await listerPatientsParRecherche(role, texte);
  return patients.map((patient) => ({
    id: patient.id,
    nom: patient.nom,
    prenom: patient.prenom,
    numeroDossier: patient.numeroDossier,
    telephone: patient.telephone,
    programme: patient.programme?.nom ?? null,
  }));
}

/**
 * Crée un rendez-vous. La date doit être à venir et le praticien un soignant actif.
 * @throws 400 DATE_PASSEE, PRATICIEN_INVALIDE ; 404 PATIENT_INTROUVABLE ; 422 MOTIF_GROSSESSE_INCOMPATIBLE
 */
export async function creerRendezVous(
  donnees: { patientId: number; praticienId: number; dateHeure: Date; motif: string },
  auteur: UtilisateurConnecte,
) {
  if (donnees.dateHeure.getTime() <= Date.now()) throw new ErreurHttp(400, "DATE_PASSEE");
  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({
      where: { id: donnees.patientId },
      select: { actif: true, sexe: true, dateNaissance: true },
    });
    if (!patient?.actif) throw new ErreurHttp(404, "PATIENT_INTROUVABLE");
    verifierMotifGrossesse(donnees.motif, patient, donnees.dateHeure);
    await verifierPraticien(tx, donnees.praticienId);
    const rdv = await tx.rendezVous.create({
      data: {
        patientId: donnees.patientId,
        praticienId: donnees.praticienId ?? null,
        dateHeure: donnees.dateHeure,
        motif: donnees.motif,
        creeParId: auteur.id,
      },
      select: { id: true },
    });
    await enregistrerAudit(tx, {
      utilisateurId: auteur.id,
      action: "RENDEZ_VOUS_CREE",
      entite: "rendez_vous",
      entiteId: rdv.id,
      detail: { patientId: donnees.patientId, dateHeure: donnees.dateHeure.toISOString() },
    });
    return rdv;
  }, OPTIONS_TRANSACTION);
}

/** Rendez-vous de revue créé dans la transaction de signature d'une consultation. */
export async function creerRendezVousDeRevue(
  tx: Prisma.TransactionClient,
  donnees: { patientId: number; praticienId: number; consultationId: number; delaiJours: number; motif: string },
) {
  return tx.rendezVous.create({
    data: {
      patientId: donnees.patientId,
      praticienId: donnees.praticienId,
      dateHeure: dateHeureRevue(donnees.delaiJours),
      motif: donnees.motif,
      consultationOrigineId: donnees.consultationId,
      creeParId: donnees.praticienId,
    },
    select: { id: true, dateHeure: true },
  });
}

/** Verrouille un rendez-vous prévu (deux postes ne le traitent pas en même temps). */
async function lireRendezVousPrevu(tx: Prisma.TransactionClient, id: number) {
  await tx.$queryRaw`SELECT id FROM rendez_vous WHERE id = ${id} FOR UPDATE`;
  const rdv = await tx.rendezVous.findUnique({
    where: { id },
    select: {
      id: true,
      statut: true,
      dateHeure: true,
      motif: true,
      patientId: true,
      praticienId: true,
      praticien: { select: { role: true } },
    },
  });
  if (!rdv) throw new ErreurHttp(404, "RENDEZ_VOUS_INTROUVABLE");
  if (rdv.statut !== StatutRendezVous.PREVU) throw new ErreurHttp(409, "RENDEZ_VOUS_DEJA_TRAITE");
  return rdv;
}

/**
 * « Venu » : le patient est arrivé. Le passage est créé dans la file (orienté vers le praticien du
 * rendez-vous) et le rendez-vous passe VENU, dans une seule transaction.
 * @throws 409 RENDEZ_VOUS_PAS_AUJOURDHUI, PASSAGE_DEJA_EN_COURS
 */
export async function marquerVenu(id: number, auteur: UtilisateurConnecte) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT patient.id FROM patient
      INNER JOIN rendez_vous ON rendez_vous.patient_id = patient.id
      WHERE rendez_vous.id = ${id}
      FOR UPDATE OF patient`;
    const rdv = await lireRendezVousPrevu(tx, id);
    if (jourDuCentre(rdv.dateHeure) !== jourDuCentre(new Date())) throw new ErreurHttp(409, "RENDEZ_VOUS_PAS_AUJOURDHUI");
    const { passage } = await creerPassageDansTransaction(tx, {
      patientId: rdv.patientId,
      motif: rdv.motif,
      orientation: rdv.praticien?.role === Role.SAGE_FEMME ? Orientation.SAGE_FEMME : Orientation.MEDECIN,
      praticienId: rdv.praticienId,
      auteurId: auteur.id,
      lierRendezVousDuJour: false,
    });
    await tx.rendezVous.update({ where: { id }, data: { statut: StatutRendezVous.VENU, passageId: passage.id } });
    await enregistrerAudit(tx, {
      utilisateurId: auteur.id,
      action: "RENDEZ_VOUS_VENU",
      entite: "rendez_vous",
      entiteId: id,
      detail: { passageId: passage.id },
    });
    return { passageId: passage.id };
  }, OPTIONS_TRANSACTION);
}

/**
 * Absent ou annulé. Absent : seulement le jour même ou après. Annulé : tant qu'il est prévu.
 * @throws 409 RENDEZ_VOUS_A_VENIR (absence notée avant le jour du rendez-vous)
 */
export async function cloreRendezVous(id: number, statut: "ABSENT" | "ANNULE", auteur: UtilisateurConnecte) {
  return prisma.$transaction(async (tx) => {
    const rdv = await lireRendezVousPrevu(tx, id);
    if (statut === "ABSENT" && jourDuCentre(rdv.dateHeure) > jourDuCentre(new Date())) {
      throw new ErreurHttp(409, "RENDEZ_VOUS_A_VENIR");
    }
    await tx.rendezVous.update({ where: { id }, data: { statut: StatutRendezVous[statut] } });
    if (statut === "ABSENT") {
      const motif = `Patient absent au RDV prévu : ${rdv.motif}`.slice(0, TAILLE_MOTIF_RELANCE);
      await tx.suivi.create({
        data: {
          patientId: rdv.patientId,
          rendezVousId: id,
          type: TypeSuivi.RENDEZ_VOUS_MANQUE,
          echeance: new Date(`${jourDuCentre(new Date())}T00:00:00.000Z`),
          motif,
          creeParId: auteur.id,
        },
      });
    }
    await enregistrerAudit(tx, {
      utilisateurId: auteur.id,
      action: statut === "ABSENT" ? "RENDEZ_VOUS_ABSENT" : "RENDEZ_VOUS_ANNULE",
      entite: "rendez_vous",
      entiteId: id,
      detail: { relance: statut === "ABSENT" },
    });
  }, OPTIONS_TRANSACTION);
}

// ---------- Compteurs du menu ----------

/**
 * Compteurs affichés entre parenthèses dans le menu, selon le rôle :
 * - File d'attente : patients en attente (orientés vers le soignant s'il s'agit d'un praticien) ;
 * - Rendez-vous : rendez-vous prévus aujourd'hui (Secrétaire et Direction) ;
 * - Pharmacie & Caisse (Secrétaire) : patients à servir.
 * - Paramètres (Direction) : demandes d'accès en attente (mot de passe oublié).
 * Seuls les compteurs utiles au rôle sont renvoyés.
 */
export async function lireCompteurs(utilisateur: UtilisateurConnecte) {
  const { debut, fin } = bornesDuJour(jourDuCentre(new Date()));
  const compteurs: { fileAttente?: number; rendezVous?: number; pharmacieCaisse?: number; parametres?: number } = {};
  const role = utilisateur.role;

  if (role === Role.SECRETAIRE || estClinicien(role)) {
    const orientation =
      role === Role.SAGE_FEMME ? Orientation.SAGE_FEMME : estClinicien(role) ? Orientation.MEDECIN : undefined;
    compteurs.fileAttente = await prisma.passage.count({
      where: {
        statut: StatutPassage.EN_ATTENTE,
        ...(orientation ? { OR: [{ orientation }, ...(orientation === Orientation.MEDECIN ? [{ orientation: null }] : [])] } : {}),
      },
    });
  }
  if (role === Role.SECRETAIRE || role === Role.DIRECTION) {
    compteurs.rendezVous = await prisma.rendezVous.count({
      where: { statut: StatutRendezVous.PREVU, dateHeure: { gte: debut, lt: fin } },
    });
  }
  if (role === Role.SECRETAIRE) {
    compteurs.pharmacieCaisse = await prisma.passage.count({
      where: { statut: { in: [StatutPassage.PHARMACIE, StatutPassage.CAISSE, StatutPassage.PARTIEL] } },
    });
  }
  if (role === Role.DIRECTION) {
    // R013 : demandes (mot de passe oublié) en attente, sauf les siennes que la Direction ne traite pas.
    compteurs.parametres = await prisma.demandeAcces.count({
      where: { statut: StatutDemandeAcces.EN_ATTENTE, utilisateurId: { not: utilisateur.id } },
    });
  }
  return compteurs;
}

/** Soignants actifs proposés comme praticien d'un rendez-vous (nom et rôle seulement). */
export function listerPraticiens() {
  return prisma.utilisateur.findMany({
    where: { actif: true, role: { in: [...SOIGNANTS] } },
    orderBy: [{ role: "asc" }, { nom: "asc" }],
    select: { id: true, civilite: true, nom: true, prenom: true, role: true },
  });
}
