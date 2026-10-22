import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { obtenirDossier } from "../controllers/dossier.controller.js";

// Tous les rôles peuvent ouvrir un dossier ; le contenu clinique est filtré dans le service.
const TOUS_LES_ROLES = [Role.DIRECTION, Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME, Role.SECRETAIRE];

const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/:patientId", exigerRole(...TOUS_LES_ROLES), gererAsync(obtenirDossier));

export default routeur;
