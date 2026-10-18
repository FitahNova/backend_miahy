import type { Request, Response } from "express";
import { z } from "zod";
import {
  ajouterPersonneGarde,
  copierSemaine,
  lireReglement,
  lireSemaine,
  listerPersonnesDeGarde,
  obtenirPlanningImpression,
  remplacerReglement,
  retirerPersonneGarde,
} from "../services/gardes.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

const schemaAjout = z.object({
  utilisateurId: z.number().int().positive(),
});

const schemaCopie = z.object({
  debutSource: z.string(),
  debutCible: z.string(),
});

const schemaReglement = z.object({
  lignes: z.array(z.string().trim().min(1).max(255)).max(30),
});

function lireUtilisateurId(requete: Request): number {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return Number(requete.utilisateur.id);
}

function lireDebut(requete: Request): string {
  const debut = requete.query.debut;
  if (typeof debut !== "string") throw new ErreurHttp(400, "DATE_INVALIDE");
  return debut;
}

export async function lireSemaineGardes(requete: Request, reponse: Response) {
  reponse.json(await lireSemaine(lireDebut(requete)));
}

export async function listerPersonnesGardes(_requete: Request, reponse: Response) {
  reponse.json({ personnes: await listerPersonnesDeGarde() });
}

export async function ajouterGardeJour(requete: Request, reponse: Response) {
  const { utilisateurId } = schemaAjout.parse(requete.body);
  const resultat = await ajouterPersonneGarde(String(requete.params.date), utilisateurId, lireUtilisateurId(requete));
  reponse.status(201).json(resultat);
}

export async function retirerGardeJour(requete: Request, reponse: Response) {
  const resultat = await retirerPersonneGarde(
    String(requete.params.date),
    lireIdentifiant(requete.params.utilisateurId),
    lireUtilisateurId(requete),
  );
  reponse.json(resultat);
}

export async function copierSemaineGardes(requete: Request, reponse: Response) {
  const { debutSource, debutCible } = schemaCopie.parse(requete.body);
  reponse.status(201).json(await copierSemaine(debutSource, debutCible, lireUtilisateurId(requete)));
}

export async function lireReglementGardes(_requete: Request, reponse: Response) {
  reponse.json({ reglement: await lireReglement() });
}

export async function modifierReglementGardes(requete: Request, reponse: Response) {
  const { lignes } = schemaReglement.parse(requete.body);
  reponse.json({ reglement: await remplacerReglement(lignes, lireUtilisateurId(requete)) });
}

export async function imprimerGardes(requete: Request, reponse: Response) {
  reponse.json(await obtenirPlanningImpression(lireDebut(requete)));
}
