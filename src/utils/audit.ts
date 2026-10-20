import { Role } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { SOIGNANTS } from "../config/constants.js";

const DECALAGE_FUSEAU = "+03:00"; // heure de Madagascar
export const TAILLE_PAGE_DEFAUT = 50;
export const TAILLE_PAGE_MAX = 100;

// Connexion : succès, échec, déconnexion, et événements de première activation.
export const ACTIONS_CONNEXION = [
  "CONNEXION",
  "CONNEXION_ECHEC",
  "DECONNEXION",
  "CODE_CONNEXION_ENVOYE",
  "CODE_CONNEXION_INCORRECT",
  "MOT_DE_PASSE_RENOUVELE",
  "MOT_DE_PASSE_DEFINI",
  "DEMANDE_ACCES",
  "TOTP_ACTIVE",
  "TOTP_REINITIALISE",
] as const;
export type ActionConnexion = (typeof ACTIONS_CONNEXION)[number];

// Actions visibles par le Médecin chef (supervision médicale).
export const ACTIONS_MEDICALES = [
  "PATIENT_CREE",
  "PATIENT_MODIFIE",
  "LECTURE_DOSSIER",
  "LECTURE_CONSULTATION",
  "LECTURE_ORDONNANCE",
  "MODIFICATION_CONSULTATION",
  "SIGNATURE_CONSULTATION",
  "FIN_CONSULTATION",
  "ORDONNANCE",
  "ORDONNANCE_SUPPRIMEE",
  "PRISE_EN_CHARGE_PASSAGE",
  "CHANGEMENT_STATUT_PASSAGE",
  "URGENCE_PASSAGE",
  "AFFECTATION_PRATICIEN",
  "RENDEZ_VOUS_CREE",
  "RENDEZ_VOUS_VENU",
  "SUIVI_CREE",
  "SUIVI_CLOTURE",
] as const;

export const ROLES_JOURNAL = [Role.DIRECTION, Role.MEDECIN_CHEF] as const;

export interface FiltresJournal {
  du?: string; // AAAA-MM-JJ, inclus
  au?: string; // AAAA-MM-JJ, inclus
  utilisateurId?: number;
  action?: string;
  entite?: string;
}

/** Début du jour (heure du centre) en instant UTC. */
function debutDuJour(jour: string): Date {
  return new Date(`${jour}T00:00:00${DECALAGE_FUSEAU}`);
}

/** Lendemain du jour donné, pour une borne « au » incluse. */
function lendemain(jour: string): Date {
  return new Date(debutDuJour(jour).getTime() + 24 * 60 * 60 * 1000);
}

/** Restriction imposée par le rôle, ajoutée à tous les filtres. */
export function perimetreDuRole(role: Role): Prisma.JournalAuditWhereInput {
  if (role === Role.DIRECTION) return {};
  if (role === Role.MEDECIN_CHEF) {
    return {
      OR: [
        { action: { in: [...ACTIONS_MEDICALES] } },
        { action: { in: [...ACTIONS_CONNEXION] }, role: { in: [...SOIGNANTS] } },
      ],
    };
  }
  // Sécurité en profondeur : la route refuse déjà les autres profils.
  return { id: -1n };
}

/** Filtres de l'écran + périmètre du rôle, en une seule condition Prisma. */
export function construireFiltre(filtres: FiltresJournal, role: Role): Prisma.JournalAuditWhereInput {
  const date: Prisma.DateTimeFilter = {};
  if (filtres.du) date.gte = debutDuJour(filtres.du);
  if (filtres.au) date.lt = lendemain(filtres.au);

  return {
    AND: [
      perimetreDuRole(role),
      {
        ...(filtres.du || filtres.au ? { date } : {}),
        ...(filtres.utilisateurId ? { utilisateurId: filtres.utilisateurId } : {}),
        ...(filtres.action ? { action: filtres.action } : {}),
        ...(filtres.entite ? { entite: filtres.entite } : {}),
      },
    ],
  };
}

/** Sépare avant / après du reste du détail (convention { avant, apres }). */
export function decomposerDetail(detail: unknown) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return { avant: null, apres: null, detail: detail ?? null };
  }
  const { avant = null, apres = null, ...reste } = detail as Record<string, unknown>;
  return { avant, apres, detail: Object.keys(reste).length ? reste : null };
}

/** Champs modifiés d'un patient : noms seulement, jamais les valeurs (données de santé). */
export function champsModifies(donnees: Record<string, unknown>): string[] {
  return Object.keys(donnees).filter((cle) => donnees[cle] !== undefined).sort();
}
