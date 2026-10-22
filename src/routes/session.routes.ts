import { Router } from "express";
import { gererAsync } from "../utils/asyncHandler.js";
import { deconnecter, rafraichir } from "../controllers/session.controller.js";

// Montées sur /api/auth. Pas de exigerConnexion : ces routes reçoivent un jeton expiré,
// c'est leur rôle de le remplacer.
const routeur = Router();

routeur.post("/rafraichir", gererAsync(rafraichir));
routeur.post("/deconnexion", gererAsync(deconnecter));

export default routeur;
