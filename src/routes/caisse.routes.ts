import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  calculerCloture,
  calculerResteDuPatient,
  cloturerJournee,
  enregistrerPaiement,
  listerFacturesAEncaisser,
  modifierRemise,
  obtenirRecu,
} from "../controllers/caisse.controller.js";

const routeur = Router();
routeur.use(exigerConnexion, exigerRole(Role.SECRETAIRE, Role.DIRECTION));

routeur.get("/factures", gererAsync(listerFacturesAEncaisser));
routeur.post("/factures/:factureId/paiements", gererAsync(enregistrerPaiement));
// Règle confirmée : la remise est réservée à la Direction.
routeur.patch("/factures/:factureId/remise", exigerRole(Role.DIRECTION), gererAsync(modifierRemise));
routeur.get("/factures/:factureId/recu", gererAsync(obtenirRecu));
routeur.get("/patients/:patientId/reste-du", gererAsync(calculerResteDuPatient));
routeur.get("/cloture/:jour", gererAsync(calculerCloture));
routeur.post("/cloture", gererAsync(cloturerJournee));

export default routeur;
