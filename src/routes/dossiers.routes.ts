import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { SOIGNANTS } from "../config/constants.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { ajouterCorrection, obtenirDossier } from "../controllers/dossier.controller.js";

// La secrétaire ouvre le dossier sans son contenu médical (diagnostics, ordonnances, maladies, traitements).
const ROLES_DOSSIER = [Role.DIRECTION, ...SOIGNANTS, Role.SECRETAIRE];

const routeur = Router();
routeur.use(exigerConnexion);

routeur.post("/consultations/:consultationId/corrections", exigerRole(...SOIGNANTS), gererAsync(ajouterCorrection));
routeur.get("/:patientId", exigerRole(...ROLES_DOSSIER), gererAsync(obtenirDossier));

export default routeur;
