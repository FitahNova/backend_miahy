/*
 * Rendez-vous (dossier §6.7, maquette « Rendez-vous »).
 * - Statuts : PRÉVU → VENU (crée le passage dans la file d'attente) | ABSENT | ANNULÉ.
 * - Médecin et Sage-femme voient leurs rendez-vous ; Médecin chef et Secrétaire voient tout.
 * - L'arrivée (« Venu ») et l'absence sont notées par la secrétaire, comme toute arrivée à l'accueil.
 * - Une revue programmée à la signature d'une consultation crée automatiquement un rendez-vous.
 */
import { prisma } from "../config/prisma.js";
import { SOIGNANTS } from "../config/constants.js";
import { Orientation, Role, StatutDemandeAcces, StatutPassage, StatutRendezVous } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { verifierMotifGrossesse } from "../utils/motifs.js";
import { enregistrerAudit } from "./audit.service.js";
import { creerPassageDansTransaction } from "./passages.service.js";
import { coordonneesVisibles } from "./patients.service.js";

const FUSEAU = "Indian/Antananarivo";
const DECALAGE_FUSEAU = "+03:00";
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
/** Heure proposée pour une revue programmée à la signature (le patient peut venir dans la journée). */
const HEURE_REVUE_PAR_DEFAUT = "09:00";

export interface UtilisateurConnecte {
  id: number;
  role: Role;
}

/** Les praticiens « simples » ne voient que leurs propres rendez-vous (maquette : « Mes rendez-vous »). */
const voitSeulementLesSiens = (role: Role) => role === Role.MEDECIN || role === Role.SAGE_FEMME;
const estClinicien = (role: Role) => (SOIGNANTS as readonly Role[]).includes(role);

function jourDuCentre(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(date);
}

function bornesDuJour(jour: string) {
  const debut = new Date(`${jour}T00:00:00${DECALAGE_FUSEAU}`);
  return { debut, fin: new Date(debut.getTime() + MS_PAR_JOUR) };
}

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

/**
 * Rendez-vous entre deux jours inclus (AAAA-MM-JJ), triés par date.
 * Le détail suit les droits : allergies pour les cliniciens seulement, téléphone selon les règles de coordonnées.
 */
export async function listerRendezVous(filtre: { du: string; au: string }, utilisateur: UtilisateurConnecte) {
  const debut = bornesDuJour(filtre.du).debut;
  const fin = bornesDuJour(filtre.au).fin;
  const rendezVous = await prisma.rendezVous.findMany({
    where: {
      dateHeure: { gte: debut, lt: fin },
      ...(voitSeulementLesSiens(utilisateur.role) ? { praticienId: utilisateur.id } : {}),
    },
    orderBy: { dateHeure: "asc" },
    select: {
      id: true,
      dateHeure: true,
      motif: true,
      statut: true,
      passageId: true,
      praticien: { select: { id: true, civilite: true, nom: true, prenom: true } },
      patient: {
        select: {
          id: true,
          numeroDossier: true,
          nom: true,
          prenom: true,
          sexe: true,
          dateNaissance: true,
          telephone: true,
          allergies: true,
          programme: { select: { nom: true } },
        },
      },
    },
  });

  // Dernière visite signée de chaque patient (maquette : « DERNIÈRE VISITE »).
  const patientIds = [...new Set(rendezVous.map((rdv) => rdv.patient.id))];
  const visites = await prisma.passage.findMany({
    where: { patientId: { in: patientIds }, consultation: { signeeLe: { not: null } } },
    orderBy: { heureArrivee: "desc" },
    select: { patientId: true, heureArrivee: true, motif: true, praticien: { select: { nom: true } } },
  });
  const derniere = new Map<number, (typeof visites)[number]>();
  for (const visite of visites) if (!derniere.has(visite.patientId)) derniere.set(visite.patientId, visite);

  const clinicien = estClinicien(utilisateur.role);
  const telephoneVisible = coordonneesVisibles(utilisateur.role) && !voitSeulementLesSiens(utilisateur.role);
  return rendezVous.map(({ patient, ...rdv }) => {
    const visite = derniere.get(patient.id);
    return {
      ...rdv,
      patient: {
        ...patient,
        telephone: telephoneVisible ? patient.telephone : null,
        allergies: clinicien ? patient.allergies : undefined,
      },
      derniereVisite: visite
        ? { date: visite.heureArrivee, motif: clinicien ? visite.motif : null, praticien: visite.praticien?.nom ?? null }
        : null,
    };
  });
}

/**
 * Crée un rendez-vous. La date doit être à venir ; le praticien, s'il est choisi, doit être un soignant actif.
 * @throws 400 DATE_PASSEE, PRATICIEN_INVALIDE ; 404 PATIENT_INTROUVABLE ; 422 MOTIF_GROSSESSE_INCOMPATIBLE
 */
export async function creerRendezVous(
  donnees: { patientId: number; praticienId?: number | null; dateHeure: Date; motif: string },
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
    if (donnees.praticienId) await verifierPraticien(tx, donnees.praticienId);
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
    const rdv = await lireRendezVousPrevu(tx, id);
    if (jourDuCentre(rdv.dateHeure) !== jourDuCentre(new Date())) throw new ErreurHttp(409, "RENDEZ_VOUS_PAS_AUJOURDHUI");
    const passage = await creerPassageDansTransaction(tx, {
      patientId: rdv.patientId,
      motif: rdv.motif,
      orientation: rdv.praticien?.role === Role.SAGE_FEMME ? Orientation.SAGE_FEMME : Orientation.MEDECIN,
      praticienId: rdv.praticienId,
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
    await enregistrerAudit(tx, {
      utilisateurId: auteur.id,
      action: statut === "ABSENT" ? "RENDEZ_VOUS_ABSENT" : "RENDEZ_VOUS_ANNULE",
      entite: "rendez_vous",
      entiteId: id,
    });
  }, OPTIONS_TRANSACTION);
}

// ---------- Compteurs du menu ----------

/**
 * Compteurs affichés entre parenthèses dans le menu, selon le rôle :
 * - File d'attente : patients en attente (orientés vers le soignant s'il s'agit d'un praticien) ;
 * - Rendez-vous : rendez-vous prévus aujourd'hui (les siens pour Médecin et Sage-femme) ;
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
    compteurs.rendezVous = await prisma.rendezVous.count({
      where: {
        statut: StatutRendezVous.PREVU,
        dateHeure: { gte: debut, lt: fin },
        ...(voitSeulementLesSiens(role) ? { praticienId: utilisateur.id } : {}),
      },
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
