import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  listerPatients,
  obtenirPatient,
  creerPatient,
  modifierPatient,
} from "../controllers/patients.controller.js";

const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/", gererAsync(listerPatients));          // recherche : ?q=nom ou téléphone
routeur.get("/:id", gererAsync(obtenirPatient));
routeur.post("/", exigerRole(Role.SECRETAIRE, Role.DIRECTION), gererAsync(creerPatient));
routeur.patch("/:id", exigerRole(Role.SECRETAIRE, Role.DIRECTION), gererAsync(modifierPatient));

export default routeur;
