import type { Request, Response } from "express";
import { z } from "zod";
import { StatutFacture } from "../generated/prisma/client.js";
import {
  annulerFacture,
  listerFactures,
  obtenirFacture,
  TAILLE_PAGE_MAXIMALE,
} from "../services/facturation.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { EVENEMENTS, type Evenement } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";

const TAILLE_PAGE_PAR_DEFAUT = 20; // TAILLE_PAGE
const LONGUEUR_MAX_RECHERCHE = 100;
const LONGUEUR_MIN_MOTIF = 5;
const LONGUEUR_MAX_MOTIF = 255; // colonne motif_annulation VARCHAR(255)

const schemaFiltres = z
  .object({
    statut: z.enum(StatutFacture).optional(),
    du: z.iso.date().optional(),
    au: z.iso.date().optional(),
    q: z.string().trim().max(LONGUEUR_MAX_RECHERCHE).optional(),
    page: z.coerce.number().int().min(1).default(1),
    taille: z.coerce.number().int().min(1).max(TAILLE_PAGE_MAXIMALE).default(TAILLE_PAGE_PAR_DEFAUT),
  })
  .refine((filtres) => !filtres.du || !filtres.au || filtres.du <= filtres.au, {
    path: ["au"],
    message: "PERIODE_INVALIDE",
  });

// Le motif est obligatoire : une annulation sans explication n'est pas contrôlable.
const schemaAnnulation = z.object({
  motif: z.string().trim().min(LONGUEUR_MIN_MOTIF).max(LONGUEUR_MAX_MOTIF),
});

function lireUtilisateurId(requete: Request): number {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return Number(requete.utilisateur.id);
}

/** GET /api/factures : historique filtré et paginé. */
export async function listerHistoriqueFactures(requete: Request, reponse: Response) {
  const { q, ...filtres } = schemaFiltres.parse(requete.query);
  reponse.json(await listerFactures({ ...filtres, recherche: q }));
}

/** GET /api/factures/:factureId : détail complet. */
export async function obtenirDetailFacture(requete: Request, reponse: Response) {
  reponse.json({ facture: await obtenirFacture(lireIdentifiant(requete.params.factureId)) });
}

/** POST /api/factures/:factureId/annulation : Direction seule (contrôlé par la route). */
export async function annulerUneFacture(requete: Request, reponse: Response) {
  const { motif } = schemaAnnulation.parse(requete.body);
  const resultat = await annulerFacture(lireIdentifiant(requete.params.factureId), motif, lireUtilisateurId(requete));
  const evenements: Evenement[] = [EVENEMENTS.FILE_MODIFIEE, EVENEMENTS.CAISSE_MODIFIEE, EVENEMENTS.PHARMACIE_MODIFIEE];
  if (resultat.stockRestitue) evenements.push(EVENEMENTS.STOCK_MODIFIE);
  diffuser(evenements, { factureId: resultat.facture.id });
  reponse.json({ facture: resultat.facture });
}
