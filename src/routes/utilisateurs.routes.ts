import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  ajouterUtilisateur,
  modifierContact,
  obtenirDemandes,
  refuserDemande,
  validerDemande,
  modifierRoleUtilisateur,
  modifierStatutUtilisateur,
  obtenirJournalConnexion,
  obtenirListeUtilisateurs,
  reinitialiserMdp,
} from "../controllers/utilisateurs.controller.js";

// Gestion des comptes et journal de connexion : Direction uniquement.
const DIRECTION_SEULE = [Role.DIRECTION];

const routeur = Router();
routeur.use(exigerConnexion);

routeur.get("/", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirListeUtilisateurs));
routeur.post("/", exigerRole(...DIRECTION_SEULE), gererAsync(ajouterUtilisateur));
routeur.get("/journal-connexion", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirJournalConnexion));
// Demandes d'accès (mot de passe oublié).
routeur.get("/demandes", exigerRole(...DIRECTION_SEULE), gererAsync(obtenirDemandes));
routeur.post("/demandes/:id/valider", exigerRole(...DIRECTION_SEULE), gererAsync(validerDemande));
routeur.post("/demandes/:id/refuser", exigerRole(...DIRECTION_SEULE), gererAsync(refuserDemande));
routeur.patch("/:id/role", exigerRole(...DIRECTION_SEULE), gererAsync(modifierRoleUtilisateur));
routeur.patch("/:id/statut", exigerRole(...DIRECTION_SEULE), gererAsync(modifierStatutUtilisateur));
routeur.post("/:id/reinitialiser-mot-de-passe", exigerRole(...DIRECTION_SEULE), gererAsync(reinitialiserMdp));
routeur.patch("/:id/contact", exigerRole(...DIRECTION_SEULE), gererAsync(modifierContact));

export default routeur;
