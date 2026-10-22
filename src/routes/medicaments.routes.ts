import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  ajouterApprovisionnement,
  ajouterCategorie,
  ajouterFournisseur,
  ajouterMedicament,
  ajusterStockMedicament,
  changerActif,
  mettreAJourMedicament,
  modifierActifFournisseur,
  modifierCategorie,
  obtenirApprovisionnements,
  obtenirCategories,
  obtenirFournisseurs,
  obtenirInventaire,
  obtenirMedicaments,
  obtenirMouvements,
  obtenirProduitsACommander,
  rechercherComptoir,
  rechercherPrescripteur,
  retirerCategorie,
} from "../controllers/medicaments.controller.js";

// Stock, prix, approvisionnements, fournisseurs : Direction uniquement.
const DIRECTION_SEULE = [Role.DIRECTION];
// Recherche pour l'ordonnance : soignants prescripteurs, sans stock ni prix.
const PRESCRIPTEURS = [Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME];
// Recherche pour le comptoir : secrétaire (et Direction), avec prix de vente et disponibilité.
const COMPTOIR = [Role.SECRETAIRE, Role.DIRECTION];

const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/recherche/prescripteur", exigerRole(...PRESCRIPTEURS), gererAsync(rechercherPrescripteur));
routeur.get("/recherche/comptoir", exigerRole(...COMPTOIR), gererAsync(rechercherComptoir));

routeur.get("/", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirMedicaments));
routeur.get("/categories", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirCategories));
routeur.get("/fournisseurs", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirFournisseurs));
routeur.get("/approvisionnements", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirApprovisionnements));
routeur.get("/a-commander", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirProduitsACommander));
routeur.get("/inventaire", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirInventaire));

routeur.post("/", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterMedicament));
routeur.post("/categories", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterCategorie));
routeur.patch("/categories/:id", exigerRole(...DIRECTION_SEULE), gererAsync(modifierCategorie));
routeur.delete("/categories/:id", exigerRole(...DIRECTION_SEULE), gererAsync(retirerCategorie));
routeur.post("/fournisseurs", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterFournisseur));
routeur.patch("/fournisseurs/:id/actif", exigerRole(...DIRECTION_SEULE), gererAsync(modifierActifFournisseur));
routeur.post("/approvisionnements", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterApprovisionnement));

routeur.get("/:id/mouvements", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirMouvements));
routeur.patch("/:id", exigerRole(...DIRECTION_SEULE), gererAsync(mettreAJourMedicament));
routeur.patch("/:id/actif", exigerRole(...DIRECTION_SEULE), gererAsync(changerActif));
routeur.post("/:id/ajustement", exigerRole(...DIRECTION_SEULE), gererAsync(ajusterStockMedicament));

export default routeur;
