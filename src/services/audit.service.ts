/*
 * Journal d'audit (dossier §6.14, §11) : écriture centralisée et consultation.
 * Écriture : dans la transaction de l'opération métier, pour que l'action et sa trace soient indissociables.
 * Le journal est en ajout seul : la base refuse toute modification ou suppression.
 */
import { prisma } from "../config/prisma.js";
import type { Prisma, Role } from "../generated/prisma/client.js";
import { construireFiltre, decomposerDetail, perimetreDuRole, type FiltresJournal } from "../utils/audit.js";

interface EntreeAudit {
  utilisateurId: number | null;
  action: string;
  entite: string;
  entiteId?: number | null;
  detail?: Prisma.InputJsonValue;
  ip?: string | null;
}

export async function enregistrerAudit(client: Prisma.TransactionClient, entree: EntreeAudit) {
  await client.journalAudit.create({
    data: {
      utilisateurId: entree.utilisateurId,
      action: entree.action,
      entite: entree.entite,
      entiteId: entree.entiteId ?? null,
      detail: entree.detail,
      ip: entree.ip ?? null,
    },
  });
}

/** Page du journal, la plus récente d'abord, restreinte au périmètre du rôle. */
export async function listerJournal(filtres: FiltresJournal, page: number, taille: number, role: Role) {
  const where = construireFiltre(filtres, role);
  const [total, entrees] = await prisma.$transaction([
    prisma.journalAudit.count({ where }),
    prisma.journalAudit.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: (page - 1) * taille,
      take: taille,
      select: {
        id: true,
        date: true,
        role: true,
        action: true,
        entite: true,
        entiteId: true,
        detail: true,
        ip: true,
        utilisateur: { select: { id: true, nom: true, prenom: true } },
      },
    }),
  ]);

  return {
    // id est un BigInt : converti en nombre pour le JSON.
    entrees: entrees.map(({ id, detail, ...entree }) => ({ id: Number(id), ...entree, ...decomposerDetail(detail) })),
    total,
    page,
    taille,
  };
}

/** Valeurs proposées dans les filtres : seulement celles présentes dans le périmètre du rôle. */
export async function lireOptionsJournal(role: Role) {
  const where = perimetreDuRole(role);
  const [actions, entites, auteurs] = await Promise.all([
    prisma.journalAudit.findMany({ where, distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.journalAudit.findMany({ where, distinct: ["entite"], select: { entite: true }, orderBy: { entite: "asc" } }),
    prisma.journalAudit.findMany({ where: { ...where, utilisateurId: { not: null } }, distinct: ["utilisateurId"], select: { utilisateurId: true } }),
  ]);
  const utilisateurs = await prisma.utilisateur.findMany({
    where: { id: { in: auteurs.map((auteur) => auteur.utilisateurId!) } },
    select: { id: true, nom: true, prenom: true },
    orderBy: { nom: "asc" },
  });
  return {
    actions: actions.map((ligne) => ligne.action),
    entites: entites.map((ligne) => ligne.entite),
    utilisateurs,
  };
}
