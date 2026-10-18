import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  obtenirConsultation,
  enregistrerConsultation,
  signerConsultation,
} from "../controllers/consultations.controller.js";

// R043 : seuls le Médecin chef, le Médecin et la Sage-femme accèdent à la consultation.
// La secrétaire et la Direction n'ont aucun accès à ces routes.
const ROLES_CONSULTATION = [Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME];

const routeur = Router();
routeur.use(exigerConnexion);

// Le passage est pris en charge par la route des passages (prise en charge), pas ici.
routeur.get("/passage/:passageId", exigerRole(...ROLES_CONSULTATION), gererAsync(obtenirConsultation));
routeur.put("/passage/:passageId", exigerRole(...ROLES_CONSULTATION), gererAsync(enregistrerConsultation));
routeur.post("/passage/:passageId/signer", exigerRole(...ROLES_CONSULTATION), gererAsync(signerConsultation));

export default routeur;
