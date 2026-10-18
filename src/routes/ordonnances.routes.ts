import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { enregistrerOrdonnance, obtenirOrdonnance } from "../controllers/ordonnances.controller.js";

// Ordonnance : prescripteurs uniquement (R043). La Secrétaire et la Direction n'y accèdent pas.
const PRESCRIPTEURS = [Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME];

const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/passage/:passageId", exigerRole(...PRESCRIPTEURS), gererAsync(obtenirOrdonnance));
routeur.put("/passage/:passageId", exigerRole(...PRESCRIPTEURS), gererAsync(enregistrerOrdonnance));

export default routeur;
