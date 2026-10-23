import { Router } from "express";
import { limiteConnexion } from "../middleware/limitation.js";
import { exigerConnexion } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { connexion, enregistrerMotDePasse, lireLien, motDePasseOublie } from "../controllers/auth.controller.js";
import { moi } from "../controllers/authentification.controller.js";

const routeur = Router();

// Route publique : connexion par identifiant et mot de passe, limitée par IP.
routeur.post("/connexion", limiteConnexion, gererAsync(connexion));

// Routes publiques du lien reçu par e-mail ou SMS : choix du mot de passe (activation, réinitialisation).
routeur.post("/lien", limiteConnexion, gererAsync(lireLien));
routeur.post("/mot-de-passe", limiteConnexion, gererAsync(enregistrerMotDePasse));
routeur.post("/mot-de-passe-oublie", limiteConnexion, gererAsync(motDePasseOublie));

// Route protégée. Rafraîchissement et déconnexion : voir session.routes.ts.
routeur.get("/moi", exigerConnexion, gererAsync(moi));

export default routeur;
