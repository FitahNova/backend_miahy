import type { Request, Response } from "express";
import { z } from "zod";
import {
  creerNouveauPatient,
  TAILLE_PAGE_PATIENTS_MAXIMALE,
  listerPatientsParRecherche,
  modifierPatientExistant,
  obtenirPatientParIdentifiant,
} from "../services/patients.service.js";
import { estClinique } from "../services/dossier.service.js";
import { ErreurHttp } from "../utils/errors.js";
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
  financement: z.string().trim().min(1).max(30).optional(),
  maladies: z.string().trim().max(2000).nullish(),
  traitements: z.string().trim().max(2000).nullish(),
  sensible: z.boolean().optional(),
};

// Partie clinique de la fiche : modifiable par tous les rôles sauf la Direction (maquette).
const CHAMPS_CLINIQUES = ["allergies", "maladies", "traitements", "sensible"] as const;

const schemaModificationPatient = z
  .object(champsPatient)
  .partial()
  .extend({ actif: z.boolean().optional() })
  .superRefine(regleNaissance(false));

// Filtres de la liste ; « complet=1 » lève la limite d'affichage (impression de la liste filtrée).
const schemaRecherche = z.object({
  q: z.string().optional(),
  programmeId: z.coerce.number().int().positive().optional(),
  sexe: z.enum(["H", "F"]).optional(),
  tranche: z.enum(["enfant", "adulte", "senior"]).optional(),
  complet: z.literal("1").optional(),
  page: z.coerce.number().int().min(1).optional(),
  taille: z.coerce.number().int().min(1).max(TAILLE_PAGE_PATIENTS_MAXIMALE).optional(),
});

const lireRole = (requete: Request) => lireUtilisateur(requete).role;

// Les coordonnées sont masquées selon le rôle (R024) : le service reçoit le rôle de l'appelant.
export async function listerPatients(requete: Request, reponse: Response) {
  const { q, complet, ...filtres } = schemaRecherche.parse(requete.query);
  // { patients, total, page, taille } : la liste affiche « page X sur Y ».
  reponse.json(await listerPatientsParRecherche(lireRole(requete), q, { ...filtres, complet: complet === "1" }));
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
  const utilisateur = lireUtilisateur(requete);
  if (!estClinique(utilisateur.role) && CHAMPS_CLINIQUES.some((champ) => donnees[champ] !== undefined)) {
    throw new ErreurHttp(403, "CHAMPS_CLINIQUES_INTERDITS");
  }
  const patient = await modifierPatientExistant(
    lireIdentifiant(requete.params.id),
    { ...donnees, dateNaissance },
    utilisateur.id,
  );
  reponse.json({ patient });
}
