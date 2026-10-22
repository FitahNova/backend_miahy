import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { SOIGNANTS } from "../config/constants.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  ajouterGardeJour,
  copierSemaineGardes,
  imprimerGardes,
  lireReglementGardes,
  lireSemaineGardes,
  listerPersonnesGardes,
  modifierReglementGardes,
  retirerGardeJour,
} from "../controllers/gardes.controller.js";

const routeur = Router();
routeur.use(exigerConnexion);

// Lecture : médecin chef, médecin et sage-femme.
routeur.get("/semaine", exigerRole(...SOIGNANTS), gererAsync(lireSemaineGardes));
routeur.get("/personnes", exigerRole(...SOIGNANTS), gererAsync(listerPersonnesGardes));
routeur.get("/reglement", exigerRole(...SOIGNANTS), gererAsync(lireReglementGardes));
routeur.get("/impression", exigerRole(...SOIGNANTS), gererAsync(imprimerGardes));

// Modification : médecin chef seulement.
routeur.post("/jour/:date/personnes", exigerRole(Role.MEDECIN_CHEF), gererAsync(ajouterGardeJour));
routeur.delete(
  "/jour/:date/personnes/:utilisateurId",
  exigerRole(Role.MEDECIN_CHEF),
  gererAsync(retirerGardeJour),
);
routeur.post("/copier", exigerRole(Role.MEDECIN_CHEF), gererAsync(copierSemaineGardes));
routeur.put("/reglement", exigerRole(Role.MEDECIN_CHEF), gererAsync(modifierReglementGardes));

export default routeur;
