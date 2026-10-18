import rateLimit from "express-rate-limit";

// Tentatives par adresse IP : 10 par 15 minutes sur les routes de connexion publiques.
export const limiteConnexion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Le délai d'attente est envoyé dans l'en-tête RateLimit / Retry-After (draft-7).
  message: { code: "TROP_DE_TENTATIVES" },
});
