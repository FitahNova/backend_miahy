import type { Request, Response } from "express";
import { z } from "zod";
import {
  creerNouveauPatient,
  listerPatientsParRecherche,
  modifierPatientExistant,
  obtenirPatientParIdentifiant,
} from "../services/patients.service.js";
import { champNom, champPrenom, champsNaissance, naissanceDepuisSaisie, regleNaissance } from "../utils/identite.js";
import { lireIdentifiant, lireUtilisateur } from "../utils/parametres.js";

// La date de naissance peut être remplacée par l'âge (R016) : voir regleNaissance.
const champsPatient = {
  nom: champNom().min(1),
  prenom: champPrenom().min(1),
  sexe: z.enum(["H", "F"]),
  ...champsNaissance,
  telephone: z.string().trim().max(20).nullish(),
  adresse: z.string().trim().max(255).nullish(),
  allergies: z.string().trim().nullish(),
  programmeId: z.number().int().positive().nullish(),
  contactConfiance: z.string().trim().max(255).nullish(),
  financement: z.string().trim().min(1).max(30).optional(),
};

const schemaModificationPatient = z
  .object(champsPatient)
  .partial()
  .extend({ actif: z.boolean().optional() })
  .superRefine(regleNaissance(false));

const schemaRecherche = z.object({ q: z.string().optional() });

const lireRole = (requete: Request) => lireUtilisateur(requete).role;

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
const schemaCreationPatient = z
  .object({ ...champsPatient, confirmerDoublon: z.boolean().optional() })
  .superRefine(regleNaissance(true));

export async function creerPatient(requete: Request, reponse: Response) {
  const { confirmerDoublon, age, uniteAge, ...donnees } = schemaCreationPatient.parse(requete.body);
  // Toujours définie ici : regleNaissance(true) exige la date ou l'âge.
  const dateNaissance = naissanceDepuisSaisie({ dateNaissance: donnees.dateNaissance, age, uniteAge })!;
  const patient = await creerNouveauPatient({ ...donnees, dateNaissance }, lireUtilisateur(requete).id, confirmerDoublon ?? false);
  reponse.status(201).json({ patient });
}

export async function modifierPatient(requete: Request, reponse: Response) {
  const { age, uniteAge, ...donnees } = schemaModificationPatient.parse(requete.body);
  const dateNaissance = naissanceDepuisSaisie({ dateNaissance: donnees.dateNaissance, age, uniteAge });
  const patient = await modifierPatientExistant(
    lireIdentifiant(requete.params.id),
    { ...donnees, dateNaissance },
    lireUtilisateur(requete).id,
  );
  reponse.json({ patient });
}