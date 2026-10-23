import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  clore,
  compteurs,
  creer,
  lister,
  patients,
  praticiens,
  venu,
} from "../controllers/rendezVous.controller.js";

// La Secrétaire et la Direction planifient. Les praticiens n'ont pas cet écran : le serveur refuse.
const ACCUEIL = [Role.SECRETAIRE, Role.DIRECTION] as const;

const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/compteurs", gererAsync(compteurs));
routeur.use(exigerRole(...ACCUEIL));
routeur.get("/praticiens", gererAsync(praticiens));
routeur.get("/patients", gererAsync(patients));
routeur.get("/", gererAsync(lister));
routeur.post("/", gererAsync(creer));
routeur.post("/:id/venu", gererAsync(venu));
routeur.post("/:id/cloture", gererAsync(clore));

export default routeur;
