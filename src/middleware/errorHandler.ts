import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ErreurHttp } from "../utils/errors.js";

/*
 * Format d'erreur unique de l'API : { code, details?, champs? }.
 * - code : stable, traduit en français par le front (utilitaires/messagesErreur.ts) ;
 * - details : valeurs utiles (essais restants, montant maximal…) ;
 * - champs : erreurs de validation par champ ({ champ, regle, min?, max? }).
 * Aucun texte technique (Prisma, Zod, pile d'appel, SQL) n'est renvoyé : il reste dans les logs du serveur.
 */

const ERREURS_PRISMA: Record<string, { statut: number; code: string; reessayer?: boolean }> = {
  P1001: { statut: 503, code: "SERVICE_INDISPONIBLE", reessayer: true }, // base injoignable
  P2028: { statut: 503, code: "SERVEUR_OCCUPE", reessayer: true }, // transaction expirée
  P2034: { statut: 409, code: "CONFLIT_CONCURRENT" }, // écriture concurrente
  P2002: { statut: 409, code: "DOUBLON" }, // contrainte d'unicité
  P2025: { statut: 404, code: "INTROUVABLE" },
  P2039: { statut: 400, code: "DONNEES_INVALIDES" }, // contrainte de contrôle (CHECK) refusée par la base
};

function lireCodePrisma(erreur: unknown): string | null {
  if (typeof erreur === "object" && erreur !== null && "code" in erreur && typeof erreur.code === "string") {
    return erreur.code;
  }
  return null;
}

// Corps JSON illisible ou trop gros (levés par express.json avant nos contrôleurs).
function lireErreurCorps(erreur: unknown): { statut: number; code: string } | null {
  if (typeof erreur !== "object" || erreur === null || !("type" in erreur)) return null;
  if (erreur.type === "entity.parse.failed") return { statut: 400, code: "REQUETE_INVALIDE" };
  if (erreur.type === "entity.too.large") return { statut: 413, code: "REQUETE_TROP_VOLUMINEUSE" };
  return null;
}

/** Transforme une erreur Zod en liste d'erreurs par champ, sans le texte anglais de Zod. */
function versChamps(erreur: ZodError) {
  return erreur.issues.map((probleme) => ({
    champ: probleme.path.join("."),
    regle: probleme.code,
    // « origin » (string, number, array…) permet au front d'écrire « 100 caractères maximum » ou « au moins 1 ».
    ...("origin" in probleme && typeof probleme.origin === "string" ? { type: probleme.origin } : {}),
    ...("minimum" in probleme ? { min: Number(probleme.minimum) } : {}),
    ...("maximum" in probleme ? { max: Number(probleme.maximum) } : {}),
  }));
}

/** Réponse 404 pour toute route /api inconnue (même format que les autres erreurs). */
export const routeInconnue: RequestHandler = (_requete, reponse) => {
  reponse.status(404).json({ code: "ROUTE_INCONNUE" });
};

/** Dernier middleware : convertit toute erreur en réponse { code, details?, champs? }. */
export const gestionnaireErreurs: ErrorRequestHandler = (erreur, _requete, reponse, _suivant) => {
  if (erreur instanceof ErreurHttp) {
    reponse.status(erreur.statut).json({ code: erreur.code, ...(erreur.details ? { details: erreur.details } : {}) });
    return;
  }

  if (erreur instanceof ZodError) {
    reponse.status(400).json({ code: "DONNEES_INVALIDES", champs: versChamps(erreur) });
    return;
  }

  const corps = lireErreurCorps(erreur);
  if (corps) {
    reponse.status(corps.statut).json({ code: corps.code });
    return;
  }

  const codePrisma = lireCodePrisma(erreur);
  const connue = codePrisma ? ERREURS_PRISMA[codePrisma] : undefined;
  if (connue) {
    if (connue.statut >= 500) console.error("Erreur Prisma", codePrisma, erreur);
    if (connue.reessayer) reponse.set("Retry-After", "5");
    reponse.status(connue.statut).json({ code: connue.code });
    return;
  }

  console.error(erreur);
  reponse.status(500).json({ code: "ERREUR_INTERNE" });
};
