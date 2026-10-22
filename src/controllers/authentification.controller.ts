import type { Request, Response } from "express";
import { obtenirUtilisateurConnecte } from "../services/auth.service.js";
import { ErreurHttp } from "../utils/errors.js";

// Renvoie l'utilisateur connecté (lu en base, donc à jour).
// La déconnexion est dans session.controller.ts : elle doit marcher même avec un jeton d'accès expiré.
export async function moi(requete: Request, reponse: Response) {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  const utilisateur = await obtenirUtilisateurConnecte(Number(requete.utilisateur.id));
  reponse.json({ utilisateur });
}
