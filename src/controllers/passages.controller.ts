import type { Request, Response } from "express";
import { z } from "zod";
import { Orientation, StatutPassage } from "../generated/prisma/client.js";
import { SOIGNANTS } from "../config/constants.js";
import {
  affecterPraticienAuPassage,
  changerStatutPassage,
  creerNouveauPassage,
  listerPassagesDeLaFile,
  modifierUrgenceDuPassage,
  prendrePassageEnCharge,
} from "../services/passages.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant, lireUtilisateur } from "../utils/parametres.js";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";

// Tous les statuts sauf TERMINE : un passage soldé ne reste pas dans la file.
const STATUTS_FILE_PAR_DEFAUT = [
  StatutPassage.EN_ATTENTE,
  StatutPassage.EN_CONSULTATION,
  StatutPassage.A_REVOIR,
  StatutPassage.PHARMACIE,
  StatutPassage.CAISSE,
  StatutPassage.PARTIEL,
];

// Qui peut demander chaque statut manuel (le praticien reste contrôlé dans le service).
// PARTIEL et TERMINE ne s'obtiennent que par un paiement en caisse, jamais à la main (R040, R097).
const ROLES_PAR_STATUT_CIBLE: Partial<Record<StatutPassage, readonly string[]>> = {
  [StatutPassage.A_REVOIR]: SOIGNANTS,
  [StatutPassage.EN_CONSULTATION]: SOIGNANTS,
};

const schemaRechercheFile = z.object({ statut: z.enum(StatutPassage).optional() });

const schemaNouveauPassage = z.object({
  patientId: z.number().int().positive(),
  motif: z.string().trim().min(1).max(255),
  orientation: z.enum(Orientation).nullish(),
  urgence: z.boolean().optional(),
  // Arrivée : le patient est affecté à un praticien (médecin, médecin chef ou sage-femme).
  praticienId: z.number().int().positive(),
  constantes: z.object({
    tension: z.string().trim().regex(/^\d{2,3}\/\d{2,3}$/).optional(),
    poidsKg: z.number().positive().max(400).optional(),
    pouls: z.number().int().min(20).max(250).optional(),
    temperature: z.number().min(30).max(45).optional(),
    glycemie: z.number().positive().max(10).optional(),
    spo2: z.number().int().min(50).max(100).optional(),
  }).optional(),
  allergies: z.string().trim().max(2000).nullable().optional(),
  sensible: z.boolean().optional(),
});

const schemaUrgence = z.object({ urgence: z.boolean() });
const schemaPraticien = z.object({ praticienId: z.number().int().positive() });
const schemaStatut = z.object({ statut: z.enum(StatutPassage) });

export async function listerFileAttente(requete: Request, reponse: Response) {
  const { statut } = schemaRechercheFile.parse(requete.query);
  // Médecin et sage-femme : seulement leurs patients ; secrétaire et médecin chef : toute la file.
  const passages = await listerPassagesDeLaFile(statut ? [statut] : STATUTS_FILE_PAR_DEFAUT, lireUtilisateur(requete));
  reponse.json({ passages });
}

export async function creerPassage(requete: Request, reponse: Response) {
  const donnees = schemaNouveauPassage.parse(requete.body);
  const passage = await creerNouveauPassage(donnees, lireUtilisateur(requete).id);
  diffuser([EVENEMENTS.FILE_MODIFIEE, EVENEMENTS.SUIVIS_MODIFIES], { passageId: passage.id });
  reponse.status(201).json({ passage });
}

export async function prendreEnCharge(requete: Request, reponse: Response) {
  const passage = await prendrePassageEnCharge(lireIdentifiant(requete.params.id), lireUtilisateur(requete));
  diffuser(EVENEMENTS.FILE_MODIFIEE, { passageId: passage.id });
  reponse.json({ passage });
}

export async function changerStatut(requete: Request, reponse: Response) {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  const { statut } = schemaStatut.parse(requete.body);
  const rolesAutorises = ROLES_PAR_STATUT_CIBLE[statut];
  if (!rolesAutorises || !rolesAutorises.includes(String(requete.utilisateur.role))) {
    throw new ErreurHttp(403, "ACCES_REFUSE");
  }
  const passage = await changerStatutPassage(
    lireIdentifiant(requete.params.id),
    statut,
    Number(requete.utilisateur.id),
  );
  diffuser(EVENEMENTS.FILE_MODIFIEE, { passageId: passage.id });
  reponse.json({ passage });
}

export async function changerUrgence(requete: Request, reponse: Response) {
  const { urgence } = schemaUrgence.parse(requete.body);
  const passage = await modifierUrgenceDuPassage(lireIdentifiant(requete.params.id), urgence, lireUtilisateur(requete).id);
  diffuser(EVENEMENTS.FILE_MODIFIEE, { passageId: passage.id });
  reponse.json({ passage });
}

export async function affecterPraticien(requete: Request, reponse: Response) {
  const { praticienId } = schemaPraticien.parse(requete.body);
  const passage = await affecterPraticienAuPassage(lireIdentifiant(requete.params.id), praticienId, lireUtilisateur(requete).id);
  diffuser(EVENEMENTS.FILE_MODIFIEE, { passageId: passage.id });
  reponse.json({ passage });
}
