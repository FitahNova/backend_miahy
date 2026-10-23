import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";

// Connexion : succès, échec, déconnexion, et événements de première activation.
export const ACTIONS_CONNEXION = [
  "CONNEXION",
  "CONNEXION_ECHEC",
  "DECONNEXION",
  "MOT_DE_PASSE_RENOUVELE",
  "MOT_DE_PASSE_DEFINI",
  "DEMANDE_ACCES",
  "TOTP_ACTIVE",
] as const;
export type ActionConnexion = (typeof ACTIONS_CONNEXION)[number];

// Événements que la Direction doit voir sans les chercher.
export const ACTIONS_ALERTE: readonly ActionConnexion[] = ["TOTP_ACTIVE"];

export async function journaliserConnexion(
  utilisateurId: number | null,
  action: ActionConnexion,
  detail?: Prisma.InputJsonObject,
) {
  await prisma.journalAudit.create({
    data: {
      utilisateurId,
      action,
      entite: "utilisateur",
      entiteId: utilisateurId,
      detail: detail ?? undefined,
    },
  });
}

// Accès à une donnée sensible (dossier, consultation, ordonnance).
// Pas de capture silencieuse : si l'écriture échoue, l'appelant reçoit l'erreur et n'affiche rien.
export async function journaliserAcces(
  utilisateurId: number,
  action: "LECTURE_DOSSIER" | "LECTURE_CONSULTATION" | "LECTURE_ORDONNANCE" | "MODIFICATION_CONSULTATION",
  entite: "patient" | "passage",
  entiteId: number,
) {
  await prisma.journalAudit.create({
    data: { utilisateurId, action, entite, entiteId },
  });
}

export async function listerJournalConnexion(limite = 200) {
  const entrees = await prisma.journalAudit.findMany({
    where: { action: { in: [...ACTIONS_CONNEXION] } },
    orderBy: { date: "desc" },
    take: limite,
    select: {
      id: true,
      action: true,
      date: true,
      detail: true,
      utilisateur: { select: { nom: true, role: true } },
    },
  });
  // id est un BigInt côté Prisma : conversion nécessaire pour le JSON.
  return entrees.map((entree) => ({ ...entree, id: Number(entree.id) }));
}

// Événements sensibles récents, pour l'alerte à la Direction (activation TOTP).
export async function listerAlertesRecentes(depuis: Date) {
  const entrees = await prisma.journalAudit.findMany({
    where: { action: { in: [...ACTIONS_ALERTE] }, date: { gte: depuis } },
    orderBy: { date: "desc" },
    select: {
      id: true,
      action: true,
      date: true,
      utilisateur: { select: { nom: true, role: true } },
    },
  });
  return entrees.map((entree) => ({ ...entree, id: Number(entree.id) }));
}
