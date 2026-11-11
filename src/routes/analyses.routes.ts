import { Router, type Request } from "express";
import { z } from "zod";
import { DomainePrestation, Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { creerAnalyse, listerAnalyses, modifierAnalyse } from "../services/analyses.service.js";
import { listerAnalysesProposees } from "../services/resultatsAnalyses.service.js";
import { SOIGNANTS } from "../config/constants.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { routeurCategoriesPrestation } from "./categoriesPrestation.routes.js";

// Code : lettres, chiffres, tiret ou point (ex. « NFS », « GLY-01 »), enregistré en majuscules.
const code = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 .\-_/()]*$/)
  .transform((texte) => texte.replace(/\s+/g, " ").toUpperCase());
const instruction = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((texte) => (texte ? texte : texte === undefined ? undefined : null));

const schemaCreation = z
  .object({
    code,
    nom: z.string().trim().min(2).max(150),
    prix: z.number().int().nonnegative().nullish(),
    categorieId: z.number().int().positive().nullish(),
    instruction,
  })
  .strict();

const schemaModification = z
  .object({
    code: code.optional(),
    nom: z.string().trim().min(2).max(150).optional(),
    prix: z.number().int().nonnegative().nullable().optional(),
    categorieId: z.number().int().positive().nullable().optional(),
    instruction,
    actif: z.boolean().optional(),
  })
  .strict();

function lireAuteur(requete: Request): number {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return Number(requete.utilisateur.id);
}

const routeur = Router();
routeur.use(exigerConnexion);

// Analyses proposées à l'accueil (analyse seule) et en consultation : actives et tarifées.
routeur.get(
  "/proposees",
  exigerRole(Role.SECRETAIRE, Role.DIRECTION, ...SOIGNANTS),
  gererAsync(async (_requete, reponse) => {
    reponse.json({ analyses: await listerAnalysesProposees() });
  }),
);

// Catalogue des analyses : Direction seule.
routeur.use(exigerRole(Role.DIRECTION));

routeur.use("/categories", routeurCategoriesPrestation(DomainePrestation.ANALYSE));

routeur.get(
  "/",
  gererAsync(async (_requete, reponse) => {
    reponse.json({ analyses: await listerAnalyses() });
  }),
);

routeur.post(
  "/",
  gererAsync(async (requete, reponse) => {
    const donnees = schemaCreation.parse(requete.body);
    const analyse = await creerAnalyse(
      { ...donnees, prix: donnees.prix ?? null, categorieId: donnees.categorieId ?? null, instruction: donnees.instruction ?? null },
      lireAuteur(requete),
    );
    reponse.status(201).json({ analyse });
  }),
);

routeur.patch(
  "/:id",
  gererAsync(async (requete, reponse) => {
    const analyse = await modifierAnalyse(lireIdentifiant(requete.params.id), schemaModification.parse(requete.body), lireAuteur(requete));
    reponse.json({ analyse });
  }),
);

export default routeur;
