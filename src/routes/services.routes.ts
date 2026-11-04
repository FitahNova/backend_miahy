import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { ajouterService, mettreAJourService, obtenirNomsServices, obtenirServices } from "../controllers/services.controller.js";

// Services et tarifs (R078) : Direction uniquement.
const DIRECTION_SEULE = [Role.DIRECTION];

const routeur = Router();
routeur.use(exigerConnexion);

// Lecture : aussi le Médecin chef, pour choisir le service couvert d'un partenaire.
routeur.get("/", exigerRole(...DIRECTION_SEULE, Role.MEDECIN_CHEF), gererAsync(obtenirServices));
// Motifs proposés à l'arrivée d'un patient : la Secrétaire voit les noms des services actifs, sans les tarifs.
routeur.get("/noms", exigerRole(Role.SECRETAIRE, ...DIRECTION_SEULE), gererAsync(obtenirNomsServices));
routeur.post("/", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterService));
routeur.patch("/:id", exigerRole(...DIRECTION_SEULE), gererAsync(mettreAJourService));

export default routeur;
