import { Router } from "express";
import { limiteConnexion } from "../middleware/limitation.js";
import { exigerConnexion } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import {
  activerTotpConnexion,
  connexion,
  enregistrerMotDePasse,
  lireLien,
  motDePasseOublie,
  preparerTotp,
  renvoyerCodeConnexion,
  verifierCode,
  verifierTotpConnexion,
} from "../controllers/auth.controller.js";
import { moi } from "../controllers/authentification.controller.js";

const routeur = Router();

// Route publique : connexion par identifiant et mot de passe, limitée par IP.
routeur.post("/connexion", limiteConnexion, gererAsync(connexion));
// Double authentification : code reçu par e-mail, et nouvel envoi.
routeur.post("/code", limiteConnexion, gererAsync(verifierCode));
routeur.post("/code/renvoi", limiteConnexion, gererAsync(renvoyerCodeConnexion));
// Double authentification par application (TOTP) : clé à recopier, activation, puis code à chaque connexion.
routeur.post("/totp/preparer", limiteConnexion, gererAsync(preparerTotp));
routeur.post("/totp/activer", limiteConnexion, gererAsync(activerTotpConnexion));
routeur.post("/totp", limiteConnexion, gererAsync(verifierTotpConnexion));

// Routes publiques du lien reçu par e-mail ou SMS : choix du mot de passe (activation, réinitialisation).
routeur.post("/lien", limiteConnexion, gererAsync(lireLien));
routeur.post("/mot-de-passe", limiteConnexion, gererAsync(enregistrerMotDePasse));
routeur.post("/mot-de-passe-oublie", limiteConnexion, gererAsync(motDePasseOublie));

// Route protégée. Rafraîchissement et déconnexion : voir session.routes.ts.
routeur.get("/moi", exigerConnexion, gererAsync(moi));

export default routeur;
