import { Router } from "express";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { ROLES_JOURNAL } from "../utils/audit.js";
import { consulter } from "../controllers/audit.controller.js";

// Matrice de droits « Utilisateurs et journal » : Direction (tout), Médecin chef (partiel). Lecture seule :
// aucune route de modification ni de suppression n'existe.
const routeur = Router();
routeur.use(exigerConnexion, exigerRole(...ROLES_JOURNAL));

routeur.get("/", gererAsync(consulter));

export default routeur;
