import type { Request, Response } from "express";
import { z } from "zod";
import { Nationalite, Role } from "../generated/prisma/client.js";
import {
  creerNouveauPatient,
  TAILLE_PAGE_PATIENTS_MAXIMALE,
  listerPatientsParRecherche,
  modifierPatientExistant,
  obtenirPatientParIdentifiant,
} from "../services/patients.service.js";
import { estClinique } from "../services/dossier.service.js";
import { repereNouveaux } from "../services/activiteDirection.service.js";
import { STATUTS_PATIENT } from "../utils/statutPatient.js";
import { coordonneesVisibles, masquerCoordonnees } from "../services/patients.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { champNom, champPrenom, champsNaissance, naissanceDepuisSaisie, regleNaissance } from "../utils/identite.js";
import { lireIdentifiant, lireUtilisateur } from "../utils/parametres.js";

// La date de naissance peut être remplacée par l'âge (R016) : voir regleNaissance.
const champsPatient = {
  nom: champNom().min(1),
  // Prénom facultatif (décision du 29/10/2026) : vide = rien d'affiché.
  prenom: champPrenom().default(""),
  sexe: z.enum(["H", "F"]),
  ...champsNaissance,
  telephone: z.string().trim().max(20).nullish(),
  adresse: z.string().trim().max(255).nullish(),
  nationalite: z.enum(Nationalite).nullish(),
  allergies: z.string().trim().nullish(),
  // Pas de programme saisi : le serveur le déduit toujours de l'âge et du sexe (un programmeId envoyé est ignoré).
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
  // Direction seulement : statuts séparés par des virgules (« NOUVEAU,FIDELE ») ; ignoré pour les autres rôles.
  statuts: z
    .string()
    .optional()
    .transform((texte) => (texte ? texte.split(",").filter(Boolean) : undefined))
    .pipe(z.array(z.enum(STATUTS_PATIENT)).optional()),
  programmeId: z.coerce.number().int().positive().optional(),
  sexe: z.enum(["H", "F"]).optional(),
  // Âge exact saisi dans le filtre de la liste.
  age: z.coerce.number().int().min(0).max(130).optional(),
  complet: z.literal("1").optional(),
  page: z.coerce.number().int().min(1).optional(),
  taille: z.coerce.number().int().min(1).max(TAILLE_PAGE_PATIENTS_MAXIMALE).optional(),
});

const lireRole = (requete: Request) => lireUtilisateur(requete).role;

// Les coordonnées sont masquées selon le rôle (R024) : le service reçoit le rôle de l'appelant.
export async function listerPatients(requete: Request, reponse: Response) {
  const { q, complet, ...filtres } = schemaRecherche.parse(requete.query);
  // Liste complète = export PDF de la liste des patients : réservé à la Direction.
  if (complet === "1" && lireRole(requete) !== Role.DIRECTION) throw new ErreurHttp(403, "EXPORT_RESERVE_DIRECTION");
  // { patients, total, page, taille } : la liste affiche « page X sur Y ».
  const utilisateur = lireUtilisateur(requete);
  // Direction : statut des patients, « nouveaux » depuis la fin de sa session précédente.
  const repere = utilisateur.role === Role.DIRECTION ? await repereNouveaux(utilisateur.id) : undefined;
  reponse.json(await listerPatientsParRecherche(utilisateur.role, q, { ...filtres, complet: complet === "1" }, repere));
}

export async function obtenirPatient(requete: Request, reponse: Response) {
  const role = lireRole(requete);
  const patient = await obtenirPatientParIdentifiant(lireIdentifiant(requete.params.id), role);
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
  // Secrétaire : allergies et sensibilité seulement (pas maladies ni traitements). Direction : aucun champ clinique.
  const interdits = estClinique(utilisateur.role)
    ? []
    : utilisateur.role === Role.SECRETAIRE
      ? (["maladies", "traitements"] as const)
      : CHAMPS_CLINIQUES;
  if (interdits.some((champ) => donnees[champ] !== undefined)) {
    throw new ErreurHttp(403, "CHAMPS_CLINIQUES_INTERDITS");
  }
  // Un rôle qui ne voit pas le téléphone ne peut pas le changer (ni l'effacer sans le savoir).
  if (!coordonneesVisibles(utilisateur.role)) delete donnees.telephone;
  const patient = await modifierPatientExistant(
    lireIdentifiant(requete.params.id),
    { ...donnees, dateNaissance },
    utilisateur.id,
  );
  reponse.json({ patient: masquerCoordonnees(patient, utilisateur.role) });
}
