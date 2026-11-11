import { prisma } from "../config/prisma.js";
import type { DomainePrestation, Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";

/*
 * Catégories des services et des analyses (Direction). Chaque domaine a sa propre liste ; une catégorie utilisée
 * ne se supprime pas, comme pour les médicaments (R074).
 */

function estViolationUnique(erreur: unknown): boolean {
  return typeof erreur === "object" && erreur !== null && "code" in erreur && erreur.code === "P2002";
}

const nombreElements = (categorie: { _count: { services: number; analyses: number } }) =>
  categorie._count.services + categorie._count.analyses;

export async function listerCategoriesPrestation(domaine: DomainePrestation) {
  const categories = await prisma.categoriePrestation.findMany({
    where: { domaine },
    select: { id: true, nom: true, _count: { select: { services: true, analyses: true } } },
    orderBy: { nom: "asc" },
  });
  return categories.map((categorie) => ({ id: categorie.id, nom: categorie.nom, nombre: nombreElements(categorie) }));
}

/** Vérifie qu'une catégorie existe et appartient bien au domaine (une catégorie d'analyse ne classe pas un service). */
export async function verifierCategoriePrestation(
  client: Prisma.TransactionClient | typeof prisma,
  categorieId: number | null | undefined,
  domaine: DomainePrestation,
) {
  if (categorieId === null || categorieId === undefined) return;
  const categorie = await client.categoriePrestation.findUnique({ where: { id: categorieId }, select: { domaine: true } });
  if (!categorie || categorie.domaine !== domaine) throw new ErreurHttp(400, "CATEGORIE_INTROUVABLE");
}

export async function creerCategoriePrestation(domaine: DomainePrestation, nom: string, auteurId: number) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const categorie = await transaction.categoriePrestation.create({ data: { nom, domaine }, select: { id: true, nom: true } });
      await enregistrerAudit(transaction, {
        utilisateurId: auteurId,
        action: "CREATION_CATEGORIE_PRESTATION",
        entite: "categorie_prestation",
        entiteId: categorie.id,
        detail: { nom, domaine },
      });
      return { ...categorie, nombre: 0 };
    }, OPTIONS_TRANSACTION);
  } catch (erreur) {
    if (estViolationUnique(erreur)) throw new ErreurHttp(409, "CATEGORIE_EXISTANTE");
    throw erreur;
  }
}

export async function renommerCategoriePrestation(domaine: DomainePrestation, id: number, nom: string, auteurId: number) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const existante = await transaction.categoriePrestation.findUnique({ where: { id }, select: { domaine: true } });
      if (!existante || existante.domaine !== domaine) throw new ErreurHttp(404, "CATEGORIE_INTROUVABLE");
      const categorie = await transaction.categoriePrestation.update({ where: { id }, data: { nom }, select: { id: true, nom: true } });
      await enregistrerAudit(transaction, {
        utilisateurId: auteurId,
        action: "MODIFICATION_CATEGORIE_PRESTATION",
        entite: "categorie_prestation",
        entiteId: id,
        detail: { nom, domaine },
      });
      return categorie;
    }, OPTIONS_TRANSACTION);
  } catch (erreur) {
    if (estViolationUnique(erreur)) throw new ErreurHttp(409, "CATEGORIE_EXISTANTE");
    throw erreur;
  }
}

export async function supprimerCategoriePrestation(domaine: DomainePrestation, id: number, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const categorie = await transaction.categoriePrestation.findUnique({
      where: { id },
      select: { nom: true, domaine: true, _count: { select: { services: true, analyses: true } } },
    });
    if (!categorie || categorie.domaine !== domaine) throw new ErreurHttp(404, "CATEGORIE_INTROUVABLE");
    if (nombreElements(categorie) > 0) throw new ErreurHttp(409, "CATEGORIE_UTILISEE");
    await transaction.categoriePrestation.delete({ where: { id } });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "SUPPRESSION_CATEGORIE_PRESTATION",
      entite: "categorie_prestation",
      entiteId: id,
      detail: { nom: categorie.nom, domaine },
    });
    return { id };
  }, OPTIONS_TRANSACTION);
}
