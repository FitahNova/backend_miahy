import { Role } from "../generated/prisma/client.js";
// Authentification
export const MAX_ECHECS_CONNEXION = 5;              // tentatives avant verrouillage
export const DUREE_VERROUILLAGE_MINUTES = 15;
export const DUREE_JETON_ACCES_MINUTES = 15;        // JWT et cookie d'accès : renouvelés par /api/auth/rafraichir
export const DUREE_SESSION_HEURES = 12;             // refresh token : une journée de travail
export const FENETRE_LIMITE_CONNEXION_MINUTES = 15;
export const MAX_REQUETES_CONNEXION = 20;           // par fenêtre
export const DUREE_LIEN_MOT_DE_PASSE_HEURES = 8;    // lien d'activation ou de réinitialisation (décision du 14/10/2026)
export const LONGUEUR_MIN_MOT_DE_PASSE = 8;

// File d'attente
export const SEUIL_ATTENTE_LONGUE_MINUTES = 30;     // alerte orange [À valider avec la Direction]

// Numérotation
export const PREFIXE_NUMERO_DOSSIER = "MIA-";       // MIA-0001
export const PREFIXE_NUMERO_FACTURE = "R-";         // R-0101

// Temps réel
export const INTERVALLE_PING_SSE_SECONDES = 25;     // garde la connexion ouverte

export const SOIGNANTS = [Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME] as const;