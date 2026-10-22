import type { Request, Response } from "express";
import { z } from "zod";
import { enregistrerOrdonnanceDuPassage, obtenirOrdonnanceDuPassage } from "../services/ordonnances.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

const schemaLigne = z.object({
  medicamentId: z.number().int().positive(),
  doseParPrise: z.number().positive().max(99.99),
  prisesParJour: z.number().int().min(1).max(24),
  dureeJours: z.number().int().min(1).max(365),
  instruction: z.string().trim().max(255).nullish(),
});

const schemaOrdonnance = z.object({
  // Liste vide : supprime l'ordonnance (le praticien a retiré tous les médicaments).
  lignes: z.array(schemaLigne).max(30),
});

function lireUtilisateur(requete: Request) {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  return { id: Number(requete.utilisateur.id), role: requete.utilisateur.role };
}

export async function obtenirOrdonnance(requete: Request, reponse: Response) {
  const ordonnance = await obtenirOrdonnanceDuPassage(lireIdentifiant(requete.params.passageId), lireUtilisateur(requete));
  reponse.json({ ordonnance });
}

export async function enregistrerOrdonnance(requete: Request, reponse: Response) {
  const { lignes } = schemaOrdonnance.parse(requete.body);
  const ordonnance = await enregistrerOrdonnanceDuPassage(
    lireIdentifiant(requete.params.passageId),
    lireUtilisateur(requete),
    lignes,
  );
  reponse.json({ ordonnance });
}
