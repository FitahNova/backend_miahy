import type { Request, Response } from "express";
import { lireDossierPatient } from "../services/dossier.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

export async function obtenirDossier(requete: Request, reponse: Response) {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  const dossier = await lireDossierPatient(lireIdentifiant(requete.params.patientId), {
    id: Number(requete.utilisateur.id),
    role: requete.utilisateur.role,
  });
  reponse.json(dossier);
}
