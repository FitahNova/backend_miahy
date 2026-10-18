import type { Request, Response } from "express";
import { z } from "zod";
import {
  creerNouveauPatient,
  listerPatientsParRecherche,
  modifierPatientExistant,
  obtenirPatientParIdentifiant,
} from "../services/patients.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

const schemaDateNaissance = z.iso
  .date()
  .transform((texte) => new Date(`${texte}T00:00:00.000Z`))
  .refine((date) => date <= new Date(), "La date de naissance ne peut pas être dans le futur");

const schemaPatient = z.object({
  nom: z.string().trim().min(1).max(100),
  prenom: z.string().trim().min(1).max(100),
  sexe: z.enum(["H", "F"]),
  dateNaissance: schemaDateNaissance,
  telephone: z.string().trim().max(20).nullish(),
  adresse: z.string().trim().max(255).nullish(),
  allergies: z.string().trim().nullish(),
  programmeId: z.number().int().positive().nullish(),
  contactConfiance: z.string().trim().max(255).nullish(),
  financement: z.string().trim().min(1).max(30).optional(),
});

const schemaModificationPatient = schemaPatient.partial().extend({
  actif: z.boolean().optional(),
});

const schemaRecherche = z.object({ q: z.string().optional() });

function lireRole(requete: Request) {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  return requete.utilisateur.role;
}

// Les coordonnées sont masquées selon le rôle (R024) : le service reçoit le rôle de l'appelant.
export async function listerPatients(requete: Request, reponse: Response) {
  const { q } = schemaRecherche.parse(requete.query);
  const patients = await listerPatientsParRecherche(lireRole(requete), q);
  reponse.json({ patients });
}

export async function obtenirPatient(requete: Request, reponse: Response) {
  const patient = await obtenirPatientParIdentifiant(lireIdentifiant(requete.params.id), lireRole(requete));
  reponse.json({ patient });
}

// R017 : « confirmerDoublon » est envoyé quand l'accueil confirme la création malgré un doublon probable.
const schemaCreationPatient = schemaPatient.extend({ confirmerDoublon: z.boolean().optional() });

export async function creerPatient(requete: Request, reponse: Response) {
  const { confirmerDoublon, ...donnees } = schemaCreationPatient.parse(requete.body);
  const patient = await creerNouveauPatient(donnees, confirmerDoublon ?? false);
  reponse.status(201).json({ patient });
}

export async function modifierPatient(requete: Request, reponse: Response) {
  const donnees = schemaModificationPatient.parse(requete.body);
  const patient = await modifierPatientExistant(lireIdentifiant(requete.params.id), donnees);
  reponse.json({ patient });
}