import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { SOIGNANTS } from "../config/constants.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  delivrer,
  listerPassagesPharmacie,
  retirerLigne,
} from "../controllers/pharmacie.controller.js";
import {
  imprimerBonDeDelivrance,
  imprimerInventaire,
  imprimerOrdonnance,
} from "../controllers/impression.controller.js";

const routeur = Router();
routeur.use(exigerConnexion);

// Écran pharmacie : la secrétaire délivre ; la Direction consulte (contrôle).
routeur.get("/", exigerRole(Role.SECRETAIRE, Role.DIRECTION), gererAsync(listerPassagesPharmacie));

// R054 (règle confirmée) : la délivrance est faite par la secrétaire seule, jamais par les soignants.
// Une seule opération : quantités de l'ordonnance (partielle possible) + ajouts hors ordonnance.
routeur.post("/passage/:passageId/delivrance", exigerRole(Role.SECRETAIRE), gererAsync(delivrer));

// Retrait d'un ajout hors ordonnance, tant que sa facture n'a reçu aucun paiement.
routeur.delete("/lignes-facture/:ligneId", exigerRole(Role.SECRETAIRE), gererAsync(retirerLigne));

// Documents imprimables (données JSON, mises en page côté front).
// L'ordonnance s'imprime par les prescripteurs et par la secrétaire (copie remise au patient à l'accueil ;
// décision du 28/10/2026). Sa saisie et sa modification restent réservées aux prescripteurs (ordonnances.routes.ts).
routeur.get("/impression/ordonnance/:passageId", exigerRole(...SOIGNANTS, Role.SECRETAIRE), gererAsync(imprimerOrdonnance));
routeur.get(
  "/impression/bon/:passageId",
  exigerRole(Role.SECRETAIRE, Role.DIRECTION),
  gererAsync(imprimerBonDeDelivrance),
);
// Inventaire avec prix d'achat et marges : Direction seule (R068).
routeur.get("/impression/inventaire", exigerRole(Role.DIRECTION), gererAsync(imprimerInventaire));

export default routeur;
