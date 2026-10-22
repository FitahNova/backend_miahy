// Événements temps réel (SSE). Le message ne contient jamais de donnée patient :
// seulement un identifiant. Chaque écran recharge ses données par l'API, avec ses propres droits.
export const EVENEMENTS = {
  FILE_MODIFIEE: "file-modifiee", // passage créé, pris en charge, signé, urgence, praticien, statut
  PHARMACIE_MODIFIEE: "pharmacie-modifiee", // passage arrivé en pharmacie, délivrance, ajout hors ordonnance
  CAISSE_MODIFIEE: "caisse-modifiee", // facture à encaisser, paiement, remise, clôture
  STOCK_MODIFIE: "stock-modifie", // délivrance, approvisionnement, ajustement
  RENDEZ_VOUS_MODIFIE: "rendez-vous-modifie", // rendez-vous créé, venu, absent, annulé
  DEMANDES_MODIFIEES: "demandes-modifiees", // mot de passe oublié : demande créée, traitée
} as const;

export type Evenement = (typeof EVENEMENTS)[keyof typeof EVENEMENTS];
