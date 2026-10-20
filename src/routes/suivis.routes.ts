import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { SOIGNANTS } from "../config/constants.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  ajouterType,
  changerActifType,
  cloturer,
  compteurs,
  contacter,
  creer,
  lister,
  listerDuPatient,
  types,
} from "../controllers/suivis.controller.js";

// Matrice de droits : suivi et rappels pour la Secrétaire, les soignants et la Direction (lecture).
// Relancer et clôturer : Secrétaire et soignants. Types de suivi : Direction.
const LECTURE = [Role.SECRETAIRE, ...SOIGNANTS, Role.DIRECTION];
const RELANCE = [Role.SECRETAIRE, ...SOIGNANTS];

const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/", exigerRole(...LECTURE), gererAsync(lister));
routeur.get("/compteurs", exigerRole(...LECTURE), gererAsync(compteurs));
routeur.get("/types", exigerRole(...LECTURE), gererAsync(types));
routeur.post("/types", exigerRole(Role.DIRECTION), gererAsync(ajouterType));
routeur.patch("/types/:id/actif", exigerRole(Role.DIRECTION), gererAsync(changerActifType));
routeur.get("/patient/:patientId", exigerRole(...LECTURE), gererAsync(listerDuPatient));
routeur.post("/", exigerRole(...RELANCE), gererAsync(creer));
routeur.post("/:id/contacts", exigerRole(...RELANCE), gererAsync(contacter));
routeur.post("/:id/cloture", exigerRole(...RELANCE), gererAsync(cloturer));

export default routeur;
