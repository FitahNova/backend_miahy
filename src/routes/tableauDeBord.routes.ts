import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { evolution, synthese } from "../controllers/tableauDeBord.controller.js";

// Direction (activité et finances) et Médecin chef (activité seulement : filtré par le service).
const routeur = Router();
routeur.use(exigerConnexion, exigerRole(Role.DIRECTION, Role.MEDECIN_CHEF));

routeur.get("/", gererAsync(synthese));
routeur.get("/evolution", gererAsync(evolution));

export default routeur;
