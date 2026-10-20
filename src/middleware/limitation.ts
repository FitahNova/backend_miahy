import rateLimit from "express-rate-limit";
import { FENETRE_LIMITE_CONNEXION_MINUTES, MAX_REQUETES_CONNEXION } from "../config/constants.js";

// R159 : 20 tentatives par adresse IP et par 15 minutes sur les routes de connexion publiques.
export const limiteConnexion = rateLimit({
  windowMs: FENETRE_LIMITE_CONNEXION_MINUTES * 60 * 1000,
  limit: MAX_REQUETES_CONNEXION,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Le délai d'attente est envoyé dans l'en-tête RateLimit / Retry-After (draft-7).
  message: { code: "TROP_DE_TENTATIVES" },
});
