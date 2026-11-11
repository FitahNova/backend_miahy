import type { Request, Response } from "express";
import { z } from "zod";
import { creerService, listerNomsServicesActifs, listerServices, modifierService } from "../services/services.service.js";
import { lireParametresTarification, modifierParametresTarification } from "../services/tarification.service.js";
import { FORMAT_HEURE, POURCENTAGE_MAX } from "../utils/tarification.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

// Instruction vide = aucune (null).
const instruction = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((texte) => (texte ? texte : texte === undefined ? undefined : null));

const schemaCreation = z.object({
  nom: z.string().trim().min(2).max(100),
  prix: z.number().int().nonnegative().nullish(),
  categorieId: z.number().int().positive().nullish(),
  instruction,
});

const schemaModification = z.object({
  nom: z.string().trim().min(2).max(100).optional(),
  prix: z.number().int().nonnegative().nullable().optional(),
  actif: z.boolean().optional(),
  categorieId: z.number().int().positive().nullable().optional(),
  instruction,
});

// Paramètres de tarification : pourcentages entiers de 0 à 500, heures « HH:mm », ouverture avant le soir.
const pourcentage = z.number().int().min(0).max(POURCENTAGE_MAX);
const heure = z.string().regex(FORMAT_HEURE);
const schemaTarification = z
  .object({
    majorationSoirPourcent: pourcentage,
    heureDebutSoir: heure,
    heureOuverture: heure,
    // Confirmation par le mot de passe de la Direction, vérifié par le serveur.
    motDePasse: z.string().min(1).max(200),
  })
  .strict()
  .refine((p) => p.heureOuverture < p.heureDebutSoir, { path: ["heureDebutSoir"], message: "HEURES_TARIF_INCOHERENTES" });

function lireAuteur(requete: Request): number {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  return Number(requete.utilisateur.id);
}

export async function obtenirServices(_requete: Request, reponse: Response) {
  reponse.json({ services: await listerServices() });
}

export async function obtenirNomsServices(_requete: Request, reponse: Response) {
  reponse.json({ noms: await listerNomsServicesActifs() });
}

/** GET /api/services/tarification : paramètres en vigueur. */
export async function obtenirTarification(_requete: Request, reponse: Response) {
  reponse.json({ parametres: await lireParametresTarification() });
}

/** PUT /api/services/tarification (Direction, mot de passe). @throws 400 HEURES_TARIF_INCOHERENTES ; 403 MOT_DE_PASSE_INCORRECT */
export async function enregistrerTarification(requete: Request, reponse: Response) {
  const resultat = schemaTarification.safeParse(requete.body);
  if (!resultat.success && resultat.error.issues.some((probleme) => probleme.message === "HEURES_TARIF_INCOHERENTES")) {
    throw new ErreurHttp(400, "HEURES_TARIF_INCOHERENTES");
  }
  const { motDePasse, ...donnees } = schemaTarification.parse(requete.body);
  reponse.json(await modifierParametresTarification(donnees, motDePasse, lireAuteur(requete)));
}

export async function ajouterService(requete: Request, reponse: Response) {
  const donnees = schemaCreation.parse(requete.body);
  const service = await creerService(
    { nom: donnees.nom, prix: donnees.prix ?? null, categorieId: donnees.categorieId ?? null, instruction: donnees.instruction ?? null },
    lireAuteur(requete),
  );
  reponse.status(201).json({ service });
}

export async function mettreAJourService(requete: Request, reponse: Response) {
  const donnees = schemaModification.parse(requete.body);
  const service = await modifierService(lireIdentifiant(requete.params.id), donnees, lireAuteur(requete));
  reponse.json({ service });
}
