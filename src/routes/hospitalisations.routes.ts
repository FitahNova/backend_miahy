import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { obtenirFormules, obtenirHospitalisations, prolonger, sortir } from "../controllers/hospitalisations.controller.js";

// Les soignants hospitalisent (à la consultation), prolongent et font sortir ; la secrétaire suit la liste.
const SOIGNANTS = [Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME];
const LECTURE = [...SOIGNANTS, Role.SECRETAIRE];

const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/", exigerRole(...LECTURE), gererAsync(obtenirHospitalisations));
routeur.get("/formules", exigerRole(...SOIGNANTS), gererAsync(obtenirFormules));
routeur.post("/:id/prolonger", exigerRole(...SOIGNANTS), gererAsync(prolonger));
routeur.post("/:id/sortie", exigerRole(...SOIGNANTS), gererAsync(sortir));

export default routeur;
