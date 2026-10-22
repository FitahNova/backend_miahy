import type { Request, Response } from "express";
import { obtenirBonDeDelivrance, obtenirDonneesOrdonnance, obtenirInventaire } from "../services/impression.service.js";
import { lireIdentifiant } from "../utils/parametres.js";

export async function imprimerOrdonnance(requete: Request, reponse: Response) {
  const donnees = await obtenirDonneesOrdonnance(lireIdentifiant(requete.params.passageId));
  reponse.json(donnees);
}

export async function imprimerBonDeDelivrance(requete: Request, reponse: Response) {
  const donnees = await obtenirBonDeDelivrance(lireIdentifiant(requete.params.passageId));
  reponse.json(donnees);
}

export async function imprimerInventaire(_requete: Request, reponse: Response) {
  const donnees = await obtenirInventaire();
  reponse.json(donnees);
}
