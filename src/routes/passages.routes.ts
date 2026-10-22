import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { SOIGNANTS } from "../config/constants.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  listerFileAttente,
  creerPassage,
  prendreEnCharge,
  changerStatut,
  changerUrgence,
  affecterPraticien,
} from "../controllers/passages.controller.js";

const routeur = Router();
routeur.use(exigerConnexion);

// La file d'attente est visible par la secrétaire, le médecin chef, les médecins et les sages-femmes.
routeur.get("/", exigerRole(Role.SECRETAIRE, ...SOIGNANTS), gererAsync(listerFileAttente));

// Enregistrer une arrivée : secrétaire seulement.
routeur.post("/", exigerRole(Role.SECRETAIRE), gererAsync(creerPassage));

routeur.post("/:id/prendre-en-charge", exigerRole(...SOIGNANTS), gererAsync(prendreEnCharge));
// La fin de consultation passe par la signature : POST /api/consultations/passage/:id/signer.

// Changements de statut manuels (partiel, soldé, à revoir, reprendre) : le contrôleur vérifie le rôle exact.
routeur.patch("/:id/statut", exigerRole(Role.SECRETAIRE, ...SOIGNANTS), gererAsync(changerStatut));

// Marquer ou retirer l'urgence : secrétaire seulement (comme dans la maquette).
routeur.patch("/:id/urgence", exigerRole(Role.SECRETAIRE), gererAsync(changerUrgence));

routeur.patch("/:id/praticien", exigerRole(Role.SECRETAIRE, Role.DIRECTION), gererAsync(affecterPraticien));

export default routeur;
