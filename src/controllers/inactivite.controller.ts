import type { Request, Response } from "express";
import { z } from "zod";
import { signalerActivite as noterActivite } from "../services/sessions.service.js";
import { enregistrerDureeInactivite, lireDureeInactiviteMinutes } from "../services/inactivite.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireCookie, NOM_COOKIE_REFRESH, poserCookieAcces } from "../utils/cookies.js";
import { DUREE_INACTIVITE_MAX, DUREE_INACTIVITE_MIN } from "../services/inactivite.js";

const schemaDuree = z.object({
  dureeInactiviteMinutes: z.number().int().min(DUREE_INACTIVITE_MIN).max(DUREE_INACTIVITE_MAX),
});

export async function lireInactivite(_requete: Request, reponse: Response) {
  reponse.json({ dureeInactiviteMinutes: await lireDureeInactiviteMinutes() });
}

export async function modifierInactivite(requete: Request, reponse: Response) {
  const { dureeInactiviteMinutes } = schemaDuree.parse(requete.body);
  const minutes = await enregistrerDureeInactivite(dureeInactiviteMinutes);
  reponse.json({ dureeInactiviteMinutes: minutes });
}

// Le jeton d'accès peut être périmé : le refresh token, limité à /api/auth, identifie la session.
export async function recevoirActivite(requete: Request, reponse: Response) {
  const valeur = lireCookie(requete, NOM_COOKIE_REFRESH);
  if (!valeur) throw new ErreurHttp(401, "SESSION_EXPIREE");
  const resultat = await noterActivite(valeur);
  poserCookieAcces(reponse, resultat.jeton, resultat.dureeInactiviteMinutes);
  reponse.json({ dureeInactiviteMinutes: resultat.dureeInactiviteMinutes });
}
