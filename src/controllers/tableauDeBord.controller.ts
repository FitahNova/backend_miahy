import type { Request, Response } from "express";
import { z } from "zod";
import { obtenirEvolution, obtenirSynthese } from "../services/tableauDeBord.service.js";
import { ErreurHttp } from "../utils/errors.js";

const schemaPeriode = z.object({ periode: z.enum(["7j", "30j", "90j", "12m"]).default("30j") });

function lireRole(requete: Request) {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return requete.utilisateur.role;
}

/** GET /api/tableau-de-bord : blocs du jour et du mois, programmes, alertes. */
export async function synthese(requete: Request, reponse: Response) {
  reponse.json(await obtenirSynthese(lireRole(requete)));
}

/** GET /api/tableau-de-bord/evolution?periode=30j */
export async function evolution(requete: Request, reponse: Response) {
  const { periode } = schemaPeriode.parse(requete.query);
  reponse.json(await obtenirEvolution(periode, lireRole(requete)));
}
