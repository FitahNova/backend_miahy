import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  annulerUneFacture,
  listerHistoriqueFactures,
  obtenirDetailFacture,
} from "../controllers/factures.controller.js";

const routeur = Router();
// Les soignants ne voient pas la facturation
routeur.use(exigerConnexion, exigerRole(Role.SECRETAIRE, Role.DIRECTION));

routeur.get("/", gererAsync(listerHistoriqueFactures));
routeur.get("/:factureId", gererAsync(obtenirDetailFacture));
// Annulation réservée à la Direction : elle efface une créance et remet du stock en rayon.
routeur.post("/:factureId/annulation", exigerRole(Role.DIRECTION), gererAsync(annulerUneFacture));

export default routeur;
