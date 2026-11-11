import { prisma } from "../config/prisma.js";
import { DomainePrestation } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { verifierCategoriePrestation } from "./categoriesPrestation.service.js";

// Analyses de laboratoire (Direction) : code et nom uniques, tarif vide = « à fixer », catégorie et instruction facultatives.
const selectionAnalyse = {
  id: true,
  code: true,
  nom: true,
  prix: true,
  instruction: true,
  actif: true,
  categorie: { select: { id: true, nom: true } },
} as const;

export type DonneesAnalyse = {
  code: string;
  nom: string;
  prix?: number | null;
  categorieId?: number | null;
  instruction?: string | null;
};

export type DonneesModificationAnalyse = Partial<DonneesAnalyse> & { actif?: boolean };

/** Doublon de code ou de nom : un code d'erreur précis pour chacun. */
function erreurDoublon(erreur: unknown): ErreurHttp | null {
  if (typeof erreur !== "object" || erreur === null || !("code" in erreur) || erreur.code !== "P2002") return null;
  const cible = JSON.stringify((erreur as { meta?: unknown }).meta ?? "");
  return new ErreurHttp(409, cible.includes("code") ? "CODE_ANALYSE_EXISTANT" : "ANALYSE_EXISTANTE");
}

export function listerAnalyses() {
  return prisma.analyse.findMany({ select: selectionAnalyse, orderBy: [{ nom: "asc" }] });
}

export async function creerAnalyse(donnees: DonneesAnalyse, auteurId: number) {
  try {
    return await prisma.$transaction(async (transaction) => {
      await verifierCategoriePrestation(transaction, donnees.categorieId, DomainePrestation.ANALYSE);
      const analyse = await transaction.analyse.create({ data: donnees, select: selectionAnalyse });
      await enregistrerAudit(transaction, {
        utilisateurId: auteurId,
        action: "ANALYSE_CREEE",
        entite: "analyse",
        entiteId: analyse.id,
        detail: { code: analyse.code, nom: analyse.nom, prix: analyse.prix },
      });
      return analyse;
    }, OPTIONS_TRANSACTION);
  } catch (erreur) {
    throw erreurDoublon(erreur) ?? erreur;
  }
}

export async function modifierAnalyse(id: number, donnees: DonneesModificationAnalyse, auteurId: number) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const avant = await transaction.analyse.findUnique({
        where: { id },
        select: { code: true, nom: true, prix: true, categorieId: true, instruction: true, actif: true },
      });
      if (!avant) throw new ErreurHttp(404, "ANALYSE_INTROUVABLE");
      await verifierCategoriePrestation(transaction, donnees.categorieId, DomainePrestation.ANALYSE);

      const analyse = await transaction.analyse.update({ where: { id }, data: donnees, select: selectionAnalyse });

      if (donnees.prix !== undefined && donnees.prix !== avant.prix) {
        await enregistrerAudit(transaction, {
          utilisateurId: auteurId,
          action: "MODIFICATION_TARIF_ANALYSE",
          entite: "analyse",
          entiteId: id,
          detail: { ancienPrix: avant.prix, nouveauPrix: analyse.prix },
        });
      }
      if (donnees.actif !== undefined && donnees.actif !== avant.actif) {
        await enregistrerAudit(transaction, {
          utilisateurId: auteurId,
          action: donnees.actif ? "ANALYSE_ACTIVEE" : "ANALYSE_DESACTIVEE",
          entite: "analyse",
          entiteId: id,
        });
      }
      const autres = (["code", "nom", "categorieId", "instruction"] as const).filter(
        (champ) => donnees[champ] !== undefined && donnees[champ] !== avant[champ],
      );
      if (autres.length > 0) {
        await enregistrerAudit(transaction, {
          utilisateurId: auteurId,
          action: "ANALYSE_MODIFIEE",
          entite: "analyse",
          entiteId: id,
          detail: Object.fromEntries(autres.map((champ) => [champ, { avant: avant[champ], apres: donnees[champ] }])),
        });
      }
      return analyse;
    }, OPTIONS_TRANSACTION);
  } catch (erreur) {
    throw erreurDoublon(erreur) ?? erreur;
  }
}
