import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { FENETRE_LIMITE_CONNEXION_MINUTES, MAX_REQUETES_CONNEXION } from "../config/constants.js";

// Compte visé par la requête : identifiant (connexion, oubli), défi (code, TOTP) ou jeton (lien reçu).
function compteVise(requete: Request): string {
  const corps = (requete.body ?? {}) as { identifiant?: unknown; defi?: unknown; jeton?: unknown };
  const valeur = corps.identifiant ?? corps.defi ?? corps.jeton;
  return typeof valeur === "string" ? valeur.trim().toLowerCase() : "";
}

// R159 : 20 échecs par adresse IP et par compte sur 15 minutes sur les routes de connexion publiques.
// Les erreurs d'un compte ne bloquent pas les autres comptes du même poste ; les réussites ne comptent pas.
export const limiteConnexion = rateLimit({
  windowMs: FENETRE_LIMITE_CONNEXION_MINUTES * 60 * 1000,
  limit: MAX_REQUETES_CONNEXION,
  keyGenerator: (requete) => `${ipKeyGenerator(requete.ip ?? "")}|${compteVise(requete)}`,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Le délai d'attente est envoyé dans l'en-tête RateLimit / Retry-After (draft-7).
  message: { code: "TROP_DE_TENTATIVES" },
});
