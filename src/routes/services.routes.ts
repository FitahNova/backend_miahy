import { Router } from "express";
import { DomainePrestation, Role } from "../generated/prisma/client.js";
import { routeurCategoriesPrestation } from "./categoriesPrestation.routes.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  ajouterService,
  enregistrerTarification,
  mettreAJourService,
  obtenirNomsServices,
  obtenirServices,
  obtenirTarification,
} from "../controllers/services.controller.js";

// Services et tarifs (R078) : Direction uniquement.
const DIRECTION_SEULE = [Role.DIRECTION];

const routeur = Router();
routeur.use(exigerConnexion);

// Catégories des services (filtre de la liste) : Direction seule.
routeur.use("/categories", exigerRole(...DIRECTION_SEULE), routeurCategoriesPrestation(DomainePrestation.SERVICE));

// Lecture : aussi le Médecin chef, pour choisir le service couvert d'un partenaire.
routeur.get("/", exigerRole(...DIRECTION_SEULE, Role.MEDECIN_CHEF), gererAsync(obtenirServices));
// Motifs proposés à l'arrivée d'un patient : la Secrétaire voit les noms des services actifs, sans les tarifs.
routeur.get("/noms", exigerRole(Role.SECRETAIRE, ...DIRECTION_SEULE), gererAsync(obtenirNomsServices));
// Paramètres de tarification (majorations du soir et des étrangers) : Direction seule, en lecture comme en écriture.
routeur.get("/tarification", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirTarification));
routeur.put("/tarification", exigerRole(...DIRECTION_SEULE), gererAsync(enregistrerTarification));
routeur.post("/", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterService));
routeur.patch("/:id", exigerRole(...DIRECTION_SEULE), gererAsync(mettreAJourService));

export default routeur;
