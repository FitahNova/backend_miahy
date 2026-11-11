import { Router, type Request } from "express";
import { z } from "zod";
import type { DomainePrestation } from "../generated/prisma/client.js";
import {
  creerCategoriePrestation,
  listerCategoriesPrestation,
  renommerCategoriePrestation,
  supprimerCategoriePrestation,
} from "../services/categoriesPrestation.service.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

const schemaCategorie = z.object({ nom: z.string().trim().min(2).max(80) }).strict();

function lireAuteur(requete: Request): number {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return Number(requete.utilisateur.id);
}

/** Catégories d'un domaine (services ou analyses) : lister, créer, renommer, supprimer si inutilisée. Droits : routeur parent. */
export function routeurCategoriesPrestation(domaine: DomainePrestation) {
  const routeur = Router();
  routeur.get(
    "/",
    gererAsync(async (_requete, reponse) => {
      reponse.json({ categories: await listerCategoriesPrestation(domaine) });
    }),
  );
  routeur.post(
    "/",
    gererAsync(async (requete, reponse) => {
      const { nom } = schemaCategorie.parse(requete.body);
      reponse.status(201).json({ categorie: await creerCategoriePrestation(domaine, nom, lireAuteur(requete)) });
    }),
  );
  routeur.patch(
    "/:id",
    gererAsync(async (requete, reponse) => {
      const { nom } = schemaCategorie.parse(requete.body);
      reponse.json({ categorie: await renommerCategoriePrestation(domaine, lireIdentifiant(requete.params.id), nom, lireAuteur(requete)) });
    }),
  );
  routeur.delete(
    "/:id",
    gererAsync(async (requete, reponse) => {
      reponse.json(await supprimerCategoriePrestation(domaine, lireIdentifiant(requete.params.id), lireAuteur(requete)));
    }),
  );
  return routeur;
}
