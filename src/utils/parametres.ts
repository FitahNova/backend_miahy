import type { Request } from "express";
import { z } from "zod";
import type { UtilisateurConnecte } from "../middleware/auth.js";
import { ErreurHttp } from "./errors.js";

const schemaIdentifiant = z.coerce.number().int().positive();

export function lireIdentifiant(valeur: unknown): number {
  return schemaIdentifiant.parse(valeur);
}

/** Utilisateur connecté (posé par exigerConnexion). @throws 401 CONNEXION_REQUISE */
export function lireUtilisateur(requete: Request): UtilisateurConnecte {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return requete.utilisateur;
}
