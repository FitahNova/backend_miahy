import type { Request, Response, CookieOptions } from "express";
import { DUREE_JETON_ACCES_MINUTES } from "../config/constants.js";
import { estEnProduction } from "../config/env.js";

// Deux cookies httpOnly : le JavaScript du navigateur ne peut lire ni l'un ni l'autre.
// - jeton d'accès (JWT court) : envoyé à toute l'API ;
// - refresh token (aléatoire, 12 h) : envoyé seulement aux routes /api/auth.
export const NOM_COOKIE_SESSION = "miahy_session";
export const NOM_COOKIE_REFRESH = "miahy_refresh";
const CHEMIN_REFRESH = "/api/auth";

const OPTIONS_COMMUNES: CookieOptions = {
  httpOnly: true,
  secure: estEnProduction,
  sameSite: "strict",
};

export function lireCookie(requete: Request, nom: string): string | null {
  const valeur: unknown = requete.cookies?.[nom];
  return typeof valeur === "string" && valeur !== "" ? valeur : null;
}

export function poserCookiesSession(reponse: Response, jeton: string, refreshToken: string, expireLe: Date) {
  reponse.cookie(NOM_COOKIE_SESSION, jeton, {
    ...OPTIONS_COMMUNES,
    path: "/",
    maxAge: DUREE_JETON_ACCES_MINUTES * 60 * 1000,
  });
  reponse.cookie(NOM_COOKIE_REFRESH, refreshToken, { ...OPTIONS_COMMUNES, path: CHEMIN_REFRESH, expires: expireLe });
}

// Les options doivent correspondre à celles de la pose, sinon le navigateur garde le cookie.
export function effacerCookiesSession(reponse: Response) {
  reponse.clearCookie(NOM_COOKIE_SESSION, { ...OPTIONS_COMMUNES, path: "/" });
  reponse.clearCookie(NOM_COOKIE_REFRESH, { ...OPTIONS_COMMUNES, path: CHEMIN_REFRESH });
}
