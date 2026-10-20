import type { Request, Response } from "express";
import { z } from "zod";
import { listerJournal, lireOptionsJournal } from "../services/audit.service.js";
import { TAILLE_PAGE_DEFAUT, TAILLE_PAGE_MAX } from "../utils/audit.js";
import { lireUtilisateur } from "../utils/parametres.js";

const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schemaConsultation = z
  .object({
    du: jour.optional(),
    au: jour.optional(),
    utilisateurId: z.coerce.number().int().positive().optional(),
    action: z.string().trim().min(1).max(50).optional(),
    entite: z.string().trim().min(1).max(50).optional(),
    page: z.coerce.number().int().positive().default(1),
    taille: z.coerce.number().int().positive().max(TAILLE_PAGE_MAX).default(TAILLE_PAGE_DEFAUT),
  })
  .refine((filtres) => !filtres.du || !filtres.au || filtres.du <= filtres.au, { message: "PERIODE_INVALIDE" });

/** GET /api/audit?du=&au=&utilisateurId=&action=&entite=&page=&taille= */
export async function consulter(requete: Request, reponse: Response) {
  const { page, taille, ...filtres } = schemaConsultation.parse(requete.query);
  const { role } = lireUtilisateur(requete);
  const [journal, options] = await Promise.all([listerJournal(filtres, page, taille, role), lireOptionsJournal(role)]);
  reponse.json({ ...journal, options });
}
