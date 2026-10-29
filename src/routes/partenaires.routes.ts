import express, { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  ajouterCategoriePartenaire,
  ajouterPartenaire,
  ajouterVersement,
  basculerActifPartenaire,
  obtenirRecouvrement,
  joindreDocument,
  mettreAJourPartenaire,
  obtenirCategoriesPartenaires,
  obtenirPartenaires,
  renommerCategorie,
  telechargerDocument,
} from "../controllers/partenaires.controller.js";

// Partenaires : Direction et Médecin chef, avec les mêmes droits (décision du 29/10/2026).
const routeur = Router();
routeur.use(exigerConnexion, exigerRole(Role.DIRECTION, Role.MEDECIN_CHEF));

// Un document de 5 Mo pèse environ 6,7 Mo en base64 : limite propre à cette route.
const LIMITE_CORPS_DOCUMENT = "8mb";

routeur.get("/", gererAsync(obtenirPartenaires));
routeur.post("/", gererAsync(ajouterPartenaire));
routeur.get("/categories", gererAsync(obtenirCategoriesPartenaires));
routeur.post("/categories", gererAsync(ajouterCategoriePartenaire));
routeur.patch("/categories/:id", gererAsync(renommerCategorie));
routeur.get("/documents/:documentId", gererAsync(telechargerDocument));
routeur.put("/:id", gererAsync(mettreAJourPartenaire));
routeur.patch("/:id/actif", gererAsync(basculerActifPartenaire));
// R095 : ce que doit le partenaire, et les sommes qu'il a versées.
routeur.get("/:id/recouvrement", gererAsync(obtenirRecouvrement));
routeur.post("/:id/versements", gererAsync(ajouterVersement));
routeur.post("/:id/documents", express.json({ limit: LIMITE_CORPS_DOCUMENT }), gererAsync(joindreDocument));

export default routeur;
