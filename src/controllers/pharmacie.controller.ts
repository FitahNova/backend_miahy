import type { Request, Response } from "express";
import { z } from "zod";
import {
  delivrerAuComptoir,
  listerPassagesAuComptoir,
  retirerLigneHorsOrdonnance,
} from "../services/delivrance.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";

// Bornes de bon sens : une délivrance au comptoir ne compte pas des centaines de lignes.
const NOMBRE_MAX_LIGNES = 50;
const QUANTITE_MAX = 10_000;

const schemaDelivrance = z.object({
  lignes: z
    .array(
      z.object({
        ligneOrdonnanceId: z.number().int().positive(),
        // 0 = rien délivré sur cette ligne pour l'instant (reliquat complet).
        quantite: z.number().int().min(0).max(QUANTITE_MAX),
      }),
    )
    .max(NOMBRE_MAX_LIGNES)
    .default([]),
  ajouts: z
    .array(z.object({ medicamentId: z.number().int().positive(), quantite: z.number().int().positive().max(QUANTITE_MAX) }))
    .max(NOMBRE_MAX_LIGNES)
    .default([]),
});

function lireUtilisateurId(requete: Request): number {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return Number(requete.utilisateur.id);
}

/** GET /api/pharmacie — patients à servir au comptoir (délivrance et encaissement). */
export async function listerPassagesPharmacie(_requete: Request, reponse: Response) {
  reponse.json({ passages: await listerPassagesAuComptoir() });
}

/** POST /api/pharmacie/passage/:passageId/delivrance — délivrance partielle possible, avec ajouts. */
export async function delivrer(requete: Request, reponse: Response) {
  const donnees = schemaDelivrance.parse(requete.body);
  const resultat = await delivrerAuComptoir(lireIdentifiant(requete.params.passageId), donnees, lireUtilisateurId(requete));
  diffuser(
    [EVENEMENTS.FILE_MODIFIEE, EVENEMENTS.PHARMACIE_MODIFIEE, EVENEMENTS.CAISSE_MODIFIEE, EVENEMENTS.STOCK_MODIFIE],
    { passageId: resultat.passageId },
  );
  reponse.json(resultat);
}

/** DELETE /api/pharmacie/lignes-facture/:ligneId — retrait d'un ajout hors ordonnance non payé. */
export async function retirerLigne(requete: Request, reponse: Response) {
  const resultat = await retirerLigneHorsOrdonnance(lireIdentifiant(requete.params.ligneId), lireUtilisateurId(requete));
  diffuser(
    [EVENEMENTS.FILE_MODIFIEE, EVENEMENTS.PHARMACIE_MODIFIEE, EVENEMENTS.CAISSE_MODIFIEE, EVENEMENTS.STOCK_MODIFIE],
    { passageId: resultat.passageId },
  );
  reponse.json(resultat);
}
