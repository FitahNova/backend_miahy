import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { SOIGNANTS } from "../config/constants.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { clore, compteurs, creer, lister, praticiens, venu } from "../controllers/rendezVous.controller.js";

// Matrice de droits : rendez-vous pour la Secrétaire et les soignants.
// L'arrivée (« Venu ») et l'absence se notent à l'accueil : Secrétaire seule.
const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/compteurs", gererAsync(compteurs));
routeur.get("/praticiens", exigerRole(Role.SECRETAIRE, Role.DIRECTION, ...SOIGNANTS), gererAsync(praticiens));
routeur.get("/", exigerRole(Role.SECRETAIRE, ...SOIGNANTS), gererAsync(lister));
// « + RDV » depuis le dossier patient : ouvert aussi à la Direction (maquette).
routeur.post("/", exigerRole(Role.SECRETAIRE, Role.DIRECTION, ...SOIGNANTS), gererAsync(creer));
routeur.post("/:id/venu", exigerRole(Role.SECRETAIRE), gererAsync(venu));
routeur.post("/:id/cloture", exigerRole(Role.SECRETAIRE, ...SOIGNANTS), gererAsync(clore));

export default routeur;