import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { DUREE_JETON_ACCES_MINUTES } from "../config/constants.js";
import { lireCookie, NOM_COOKIE_SESSION } from "../utils/cookies.js";

export interface UtilisateurConnecte {
  id: number;
  role: Role;
}

interface DonneesJeton {
  id: number;
  role: Role;
  versionSession: number;
}

declare global {
  namespace Express {
    interface Request {
      utilisateur?: UtilisateurConnecte;
    }
  }
}

function lireSecretJwt(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET manquant dans le fichier .env");
  }
  return secret;
}

// Utilisé par la connexion pour créer le jeton du cookie.
// La version de session est incluse : si elle change en base, le jeton n'est plus valable.
export function signerJeton(donnees: DonneesJeton): string {
  return jwt.sign(
    { id: donnees.id, role: donnees.role, version: donnees.versionSession },
    lireSecretJwt(),
    { expiresIn: `${DUREE_JETON_ACCES_MINUTES}m` },
  );
}

export async function exigerConnexion(requete: Request, reponse: Response, suivant: NextFunction): Promise<void> {
  const jeton = lireCookie(requete, NOM_COOKIE_SESSION);

  if (!jeton) {
    reponse.status(401).json({ code: "CONNEXION_REQUISE" });
    return;
  }

  let contenu: jwt.JwtPayload;
  try {
    contenu = jwt.verify(jeton, lireSecretJwt()) as jwt.JwtPayload;
  } catch {
    reponse.status(401).json({ code: "SESSION_EXPIREE" });
    return;
  }

  const id = Number(contenu.id);

  try {
    // Relecture en base à chaque requête : désactivation, changement de rôle et révocation prennent effet immédiatement.
    const utilisateur = await prisma.utilisateur.findUnique({
      where: { id },
      select: { actif: true, role: true, versionSession: true },
    });

    if (!utilisateur || !utilisateur.actif || contenu.version !== utilisateur.versionSession) {
      reponse.status(401).json({ code: "SESSION_EXPIREE" });
      return;
    }

    requete.utilisateur = { id, role: utilisateur.role };
    suivant();
  } catch (erreur) {
    suivant(erreur);
  }
}

export function exigerRole(...rolesAutorises: readonly Role[]) {
  return (requete: Request, reponse: Response, suivant: NextFunction): void => {
    if (!requete.utilisateur) {
      reponse.status(401).json({ code: "CONNEXION_REQUISE" });
      return;
    }

    if (!rolesAutorises.includes(requete.utilisateur.role)) {
      reponse.status(403).json({ code: "ACCES_REFUSE" });
      return;
    }

    suivant();
  };
}