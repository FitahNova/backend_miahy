import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { SOIGNANTS } from "../config/constants.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { ajouterCorrection, obtenirDossier } from "../controllers/dossier.controller.js";

// La secrétaire ouvre le dossier sans son contenu médical (diagnostics, ordonnances, maladies, traitements).
// La Direction n'a pas accès au dossier patient (décision du 12/11/2026) : elle voit la liste des patients seulement.
const ROLES_DOSSIER = [...SOIGNANTS, Role.SECRETAIRE];

const routeur = Router();
routeur.use(exigerConnexion);

routeur.post("/consultations/:consultationId/corrections", exigerRole(...SOIGNANTS), gererAsync(ajouterCorrection));
routeur.get("/:patientId", exigerRole(...ROLES_DOSSIER), gererAsync(obtenirDossier));

export default routeur;
