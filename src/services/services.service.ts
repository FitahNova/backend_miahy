import { prisma } from "../config/prisma.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";

// Services = actes facturables (R078). Le prix peut rester « à fixer » (null).
const selectionService = { id: true, nom: true, prix: true, actif: true } as const;

type DonneesCreationService = { nom: string; prix?: number | null };

type DonneesModificationService = {
  nom?: string;
  prix?: number | null;
  actif?: boolean;
};

function estViolationUnique(erreur: unknown): boolean {
  return typeof erreur === "object" && erreur !== null && "code" in erreur && erreur.code === "P2002";
}

export function listerServices() {
  return prisma.service.findMany({ select: selectionService, orderBy: { nom: "asc" } });
}

export async function creerService(donnees: DonneesCreationService, auteurId: number) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const service = await transaction.service.create({ data: donnees, select: selectionService });
      await enregistrerAudit(transaction, {
        utilisateurId: auteurId,
        action: "SERVICE_CREE",
        entite: "service",
        entiteId: service.id,
        detail: { nom: service.nom, prix: service.prix },
      });
      return service;
    }, OPTIONS_TRANSACTION);
  } catch (erreur) {
    if (estViolationUnique(erreur)) {
      throw new ErreurHttp(409, "SERVICE_EXISTANT");
    }
    throw erreur;
  }
}

export async function modifierService(
  id: number,
  donnees: DonneesModificationService,
  auteurId: number,
) {
  return prisma.$transaction(
    async (transaction) => {
      const existant = await transaction.service.findUnique({
        where: { id },
        select: { id: true, prix: true, actif: true },
      });
      if (!existant) {
        throw new ErreurHttp(404, "SERVICE_INTROUVABLE");
      }

      const service = await transaction.service.update({
        where: { id },
        data: donnees,
        select: selectionService,
      });

      if (donnees.prix !== undefined && donnees.prix !== existant.prix) {
        await enregistrerAudit(transaction, {
          utilisateurId: auteurId,
          action: "MODIFICATION_TARIF_SERVICE",
          entite: "service",
          entiteId: id,
          detail: { ancienPrix: existant.prix, nouveauPrix: service.prix },
        });
      }
      if (donnees.actif !== undefined && donnees.actif !== existant.actif) {
        await enregistrerAudit(transaction, {
          utilisateurId: auteurId,
          action: donnees.actif ? "SERVICE_ACTIVE" : "SERVICE_DESACTIVE",
          entite: "service",
          entiteId: id,
        });
      }
      return service;
    },
    OPTIONS_TRANSACTION,
  );
}