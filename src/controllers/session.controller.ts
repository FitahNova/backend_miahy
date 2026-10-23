import type { Request, Response } from "express";
import { rafraichirSession, revoquerSession } from "../services/sessions.service.js";
import { journaliserConnexion } from "../services/journal.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { effacerCookiesSession, lireCookie, NOM_COOKIE_REFRESH, poserCookiesSession } from "../utils/cookies.js";

// Renouvelle les deux cookies à partir du refresh token. Le jeton n'est jamais renvoyé dans le corps :
// il reste dans un cookie httpOnly, hors de portée du JavaScript.
export async function rafraichir(requete: Request, reponse: Response) {
  const valeur = lireCookie(requete, NOM_COOKIE_REFRESH);
  if (!valeur) {
    throw new ErreurHttp(401, "SESSION_EXPIREE");
  }
  const resultat = await rafraichirSession(valeur);
  poserCookiesSession(reponse, resultat.jeton, resultat.refreshToken, resultat.expireLe);
  reponse.json({ utilisateur: resultat.utilisateur });
}

// Révoque la session courante et efface les deux cookies. Fonctionne même si le jeton d'accès a expiré.
export async function deconnecter(requete: Request, reponse: Response) {
  const valeur = lireCookie(requete, NOM_COOKIE_REFRESH);
  if (valeur) {
    const utilisateurId = await revoquerSession(valeur);
    if (utilisateurId !== null) {
      await journaliserConnexion(utilisateurId, "DECONNEXION");
    }
  }
  effacerCookiesSession(reponse);
  reponse.status(204).end();
}
