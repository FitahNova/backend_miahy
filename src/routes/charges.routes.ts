import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { changerActif, creer, lister, modifier } from "../controllers/charges.controller.js";

// Matrice de droits : « Partenaires, services et tarifs, charges » = Direction seule.
const routeur = Router();
routeur.use(exigerConnexion, exigerRole(Role.DIRECTION));

routeur.get("/", gererAsync(lister));
routeur.post("/", gererAsync(creer));
routeur.patch("/:id", gererAsync(modifier));
routeur.patch("/:id/actif", gererAsync(changerActif));

export default routeur;
