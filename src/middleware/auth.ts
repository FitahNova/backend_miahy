import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "../generated/prisma/client.js";
import { lireCookie, NOM_COOKIE_SESSION } from "../utils/cookies.js";
import { controlerSession, cloturerSiInactive } from "../services/inactivite.service.js";

export interface UtilisateurConnecte {
  id: number;
  role: Role;
}

interface DonneesJeton {
  id: number;
  role: Role;
  versionSession: number;
  sessionId: number;
}

declare global {
  namespace Express {
    interface Request {
      utilisateur?: UtilisateurConnecte;
      sessionId?: number;
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
export function signerJeton(donnees: DonneesJeton, dureeMinutes: number): string {
  return jwt.sign(
    { id: donnees.id, role: donnees.role, version: donnees.versionSession, session: donnees.sessionId },
    lireSecretJwt(),
    { expiresIn: `${dureeMinutes}m` },
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
  } catch (erreur) {
    if (erreur instanceof jwt.TokenExpiredError) {
      await noterExpiration(jeton);
    }
    reponse.status(401).json({ code: "SESSION_EXPIREE" });
    return;
  }

  const id = Number(contenu.id);
  const sessionId = Number(contenu.session);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    reponse.status(401).json({ code: "SESSION_EXPIREE" });
    return;
  }

  try {
    // Relecture en base : désactivation, révocation et inactivité prennent effet immédiatement.
    // L'échéance n'est pas repoussée ici.
    const utilisateur = await controlerSession(sessionId, id, Number(contenu.version));
    if (!utilisateur) {
      reponse.status(401).json({ code: "SESSION_EXPIREE" });
      return;
    }

    requete.utilisateur = utilisateur;
    requete.sessionId = sessionId;
    suivant();
  } catch (erreur) {
    suivant(erreur);
  }
}

async function noterExpiration(jeton: string): Promise<void> {
  try {
    const perime = jwt.verify(jeton, lireSecretJwt(), { ignoreExpiration: true }) as jwt.JwtPayload;
    const sessionId = Number(perime.session);
    const utilisateurId = Number(perime.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0 || !Number.isInteger(utilisateurId) || utilisateurId <= 0) return;
    await cloturerSiInactive(sessionId, utilisateurId);
  } catch {
    // Signature invalide : rien à noter.
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