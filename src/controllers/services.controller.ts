import type { Request, Response } from "express";
import { z } from "zod";
import { creerService, listerServices, modifierService } from "../services/services.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

const schemaCreation = z.object({
  nom: z.string().trim().min(2).max(100),
  prix: z.number().int().nonnegative().nullish(),
});

const schemaModification = z.object({
  nom: z.string().trim().min(2).max(100).optional(),
  prix: z.number().int().nonnegative().nullable().optional(),
  actif: z.boolean().optional(),
});

function lireAuteur(requete: Request): number {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  return Number(requete.utilisateur.id);
}

export async function obtenirServices(_requete: Request, reponse: Response) {
  reponse.json({ services: await listerServices() });
}

export async function ajouterService(requete: Request, reponse: Response) {
  const donnees = schemaCreation.parse(requete.body);
  const service = await creerService({ nom: donnees.nom, prix: donnees.prix ?? null }, lireAuteur(requete));
  reponse.status(201).json({ service });
}

export async function mettreAJourService(requete: Request, reponse: Response) {
  const donnees = schemaModification.parse(requete.body);
  const service = await modifierService(lireIdentifiant(requete.params.id), donnees, lireAuteur(requete));
  reponse.json({ service });
}
