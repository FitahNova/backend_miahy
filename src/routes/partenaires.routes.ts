import express, { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  ajouterCategoriePartenaire,
  ajouterPartenaire,
  basculerActifPartenaire,
  joindreDocument,
  mettreAJourPartenaire,
  obtenirCategoriesPartenaires,
  obtenirPartenaires,
  renommerCategorie,
  telechargerDocument,
} from "../controllers/partenaires.controller.js";

// Matrice de droits du dossier de projet : « Partenaires, services et tarifs » = Direction seule.
const routeur = Router();
routeur.use(exigerConnexion, exigerRole(Role.DIRECTION));

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
routeur.post("/:id/documents", express.json({ limit: LIMITE_CORPS_DOCUMENT }), gererAsync(joindreDocument));

export default routeur;
