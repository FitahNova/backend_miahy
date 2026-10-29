import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  ajouterApprovisionnement,
  ajouterCategorie,
  ajouterFournisseur,
  ajouterMedicament,
  ajouterEnStock,
  ajouterMedicamentRapide,
  ajouterMedicamentsEnLot,
  ajusterStockMedicament,
  changerActif,
  mettreAJourMedicament,
  modifierActifFournisseur,
  modifierCategorie,
  obtenirApprovisionnement,
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

// Stock, prix, approvisionnements, fournisseurs : modifiés par la Direction uniquement.
const DIRECTION_SEULE = [Role.DIRECTION];
// Lecture du stock (page Médicaments) : Direction, et Médecin chef en lecture seule (décision du 29/10/2026).
const LECTURE_STOCK = [Role.DIRECTION, Role.MEDECIN_CHEF];
// Recherche pour l'ordonnance : soignants prescripteurs, sans stock ni prix.
const PRESCRIPTEURS = [Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME];
// Recherche pour le comptoir : secrétaire (et Direction), avec prix de vente et disponibilité.
const COMPTOIR = [Role.SECRETAIRE, Role.DIRECTION];

const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/recherche/prescripteur", exigerRole(...PRESCRIPTEURS), gererAsync(rechercherPrescripteur));
routeur.get("/recherche/comptoir", exigerRole(...COMPTOIR), gererAsync(rechercherComptoir));

routeur.get("/", exigerRole(...LECTURE_STOCK), gererAsync(obtenirMedicaments));
routeur.get("/categories", exigerRole(...LECTURE_STOCK), gererAsync(obtenirCategories));
routeur.get("/fournisseurs", exigerRole(...LECTURE_STOCK), gererAsync(obtenirFournisseurs));
routeur.get("/approvisionnements", exigerRole(...LECTURE_STOCK), gererAsync(obtenirApprovisionnements));
routeur.get("/approvisionnements/:id", exigerRole(...LECTURE_STOCK), gererAsync(obtenirApprovisionnement));
routeur.get("/a-commander", exigerRole(...LECTURE_STOCK), gererAsync(obtenirProduitsACommander));
routeur.get("/inventaire", exigerRole(...LECTURE_STOCK), gererAsync(obtenirInventaire));

routeur.post("/", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterMedicament));
routeur.post("/lot", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterMedicamentsEnLot));
routeur.post("/rapide", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterMedicamentRapide));
routeur.post("/ajout-stock", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterEnStock));
routeur.post("/categories", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterCategorie));
routeur.patch("/categories/:id", exigerRole(...DIRECTION_SEULE), gererAsync(modifierCategorie));
routeur.delete("/categories/:id", exigerRole(...DIRECTION_SEULE), gererAsync(retirerCategorie));
routeur.post("/fournisseurs", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterFournisseur));
routeur.patch("/fournisseurs/:id/actif", exigerRole(...DIRECTION_SEULE), gererAsync(modifierActifFournisseur));
routeur.post("/approvisionnements", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterApprovisionnement));

routeur.get("/:id/mouvements", exigerRole(...LECTURE_STOCK), gererAsync(obtenirMouvements));
routeur.patch("/:id", exigerRole(...DIRECTION_SEULE), gererAsync(mettreAJourMedicament));
routeur.patch("/:id/actif", exigerRole(...DIRECTION_SEULE), gererAsync(changerActif));
routeur.post("/:id/ajustement", exigerRole(...DIRECTION_SEULE), gererAsync(ajusterStockMedicament));

export default routeur;
