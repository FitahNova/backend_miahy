import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  calculerCloture,
  calculerResteDuPatient,
  choisirConventionFacture,
  cloturerJournee,
  enregistrerPaiement,
  historiqueClotures,
  listerFacturesAEncaisser,
  modifierRemise,
  obtenirRecu,
  rouvrirJournee,
} from "../controllers/caisse.controller.js";

const routeur = Router();
routeur.use(exigerConnexion, exigerRole(Role.SECRETAIRE, Role.DIRECTION));

routeur.get("/factures", gererAsync(listerFacturesAEncaisser));
routeur.post("/factures/:factureId/paiements", gererAsync(enregistrerPaiement));
routeur.post("/factures/:factureId/convention", gererAsync(choisirConventionFacture));
// Règle confirmée : la remise est réservée à la Direction.
routeur.patch("/factures/:factureId/remise", exigerRole(Role.DIRECTION), gererAsync(modifierRemise));
routeur.get("/factures/:factureId/recu", gererAsync(obtenirRecu));
routeur.get("/patients/:patientId/reste-du", gererAsync(calculerResteDuPatient));
routeur.get("/cloture/:jour", gererAsync(calculerCloture));
routeur.post("/cloture", gererAsync(cloturerJournee));
routeur.get("/clotures", exigerRole(Role.DIRECTION), gererAsync(historiqueClotures));
// Réouverture après clôture : réservée à la Direction, motif obligatoire, tracée dans le journal.
routeur.post("/cloture/:jour/reouverture", exigerRole(Role.DIRECTION), gererAsync(rouvrirJournee));

export default routeur;
