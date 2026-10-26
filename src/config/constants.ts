import { Role } from "../generated/prisma/client.js";
// Authentification
export const MAX_ECHECS_CONNEXION = 5;              // tentatives avant verrouillage
export const DUREE_VERROUILLAGE_MINUTES = 15;
export const DUREE_JETON_ACCES_MINUTES = 15;        // JWT et cookie d'accès : renouvelés par /api/auth/rafraichir
export const DUREE_SESSION_HEURES = 72;             // une session dure 72 h depuis la connexion, sans déconnexion pour inactivité
export const FENETRE_LIMITE_CONNEXION_MINUTES = 15;
export const MAX_REQUETES_CONNEXION = 20;           // par fenêtre
export const DUREE_LIEN_MOT_DE_PASSE_HEURES = 8;    // lien d'activation ou de réinitialisation (décision du 14/10/2026)
export const LONGUEUR_MIN_MOT_DE_PASSE = 8;
export const DUREE_CODE_CONNEXION_MINUTES = 10;     // code à 6 chiffres envoyé après le mot de passe
export const MAX_ESSAIS_CODE_CONNEXION = 5;
export const DELAI_RENVOI_CODE_SECONDES = 60;

// File d'attente
export const SEUIL_ATTENTE_LONGUE_MINUTES = 30;     // alerte orange [À valider avec la Direction]

// Suivi et rappels (R122, R124) [paramétrables plus tard par la Direction, R142]
export const JOURS_AVANT_A_CONTACTER = 3;           // « À contacter » : échéance dans les 3 prochains jours
export const JOURS_RETARD_PERDU_DE_VUE = 5;         // « Perdus de vue » : plus de 5 jours de retard

// Stock
export const JOURS_ALERTE_PEREMPTION = 90;           // « Proche de péremption » : 3 mois avant la date [à valider avec la Direction]

// Rendez-vous : un patient n'a pas deux rendez-vous à moins de 30 minutes d'écart (même date, même heure).
export const DUREE_CRENEAU_RENDEZ_VOUS_MINUTES = 30;

// Pagination : même taille de page pour toutes les listes de l'application.
export const TAILLE_PAGE = 20;
export const TAILLE_PAGE_MAXIMALE = 100;

// Numérotation
export const PREFIXE_NUMERO_DOSSIER = "MIA-";       // MIA-0001
export const PREFIXE_NUMERO_FACTURE = "R-";         // R-0101

// Temps réel
export const INTERVALLE_PING_SSE_SECONDES = 25;     // garde la connexion ouverte

export const SOIGNANTS = [Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME] as const;