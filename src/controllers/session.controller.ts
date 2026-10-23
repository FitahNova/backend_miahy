import type { Request, Response } from "express";
import { rafraichirSession, revoquerSession } from "../services/sessions.service.js";
import { journaliserConnexion } from "../services/journal.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { effacerCookiesSession, lireCookie, NOM_COOKIE_REFRESH, poserCookiesSession } from "../utils/cookies.js";

function lireRaison(corps: unknown): "manuelle" | "inactivite" {
  if (!corps || typeof corps !== "object") return "manuelle";
  return (corps as { raison?: unknown }).raison === "inactivite" ? "inactivite" : "manuelle";
}

// Renouvelle les deux cookies à partir du refresh token. Le jeton n'est jamais renvoyé dans le corps :
// il reste dans un cookie httpOnly, hors de portée du JavaScript.
export async function rafraichir(requete: Request, reponse: Response) {
  const valeur = lireCookie(requete, NOM_COOKIE_REFRESH);
  if (!valeur) {
    throw new ErreurHttp(401, "SESSION_EXPIREE");
  }
  const resultat = await rafraichirSession(valeur);
  poserCookiesSession(reponse, resultat.jeton, resultat.refreshToken, resultat.expireLe, resultat.dureeInactiviteMinutes);
  reponse.json({ utilisateur: resultat.utilisateur });
}

// Révoque la session courante et efface les deux cookies. Fonctionne même si le jeton d'accès a expiré.
export async function deconnecter(requete: Request, reponse: Response) {
  const valeur = lireCookie(requete, NOM_COOKIE_REFRESH);
  const raison = lireRaison(requete.body);
  if (valeur) {
    const utilisateurId = await revoquerSession(valeur);
    if (utilisateurId !== null) {
      await journaliserConnexion(utilisateurId, raison === "inactivite" ? "DECONNEXION_INACTIVITE" : "DECONNEXION");
    }
  }
  effacerCookiesSession(reponse);
  reponse.status(204).end();
}
