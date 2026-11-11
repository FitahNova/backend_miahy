import { prisma } from "../config/prisma.js";
import { DomainePrestation } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { verifierCategoriePrestation } from "./categoriesPrestation.service.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";

// Services = actes facturables (R078). Le prix peut rester « à fixer » (null).
const selectionService = {
  id: true,
  nom: true,
  prix: true,
  actif: true,
  instruction: true,
  categorie: { select: { id: true, nom: true } },
} as const;

type DonneesCreationService = { nom: string; prix?: number | null; categorieId?: number | null; instruction?: string | null };

type DonneesModificationService = {
  nom?: string;
  prix?: number | null;
  actif?: boolean;
  categorieId?: number | null;
  instruction?: string | null;
};

function estViolationUnique(erreur: unknown): boolean {
  return typeof erreur === "object" && erreur !== null && "code" in erreur && erreur.code === "P2002";
}

export function listerServices() {
  return prisma.service.findMany({ select: selectionService, orderBy: { nom: "asc" } });
}

// Motifs d'arrivée : noms des services actifs seulement, jamais les tarifs.
export async function listerNomsServicesActifs(): Promise<string[]> {
  const services = await prisma.service.findMany({ where: { actif: true }, select: { nom: true }, orderBy: { nom: "asc" } });
  return services.map((service) => service.nom);
}

export async function creerService(donnees: DonneesCreationService, auteurId: number) {
  try {
    return await prisma.$transaction(async (transaction) => {
      await verifierCategoriePrestation(transaction, donnees.categorieId, DomainePrestation.SERVICE);
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
        select: { id: true, prix: true, actif: true, categorieId: true, instruction: true },
      });
      if (!existant) {
        throw new ErreurHttp(404, "SERVICE_INTROUVABLE");
      }
      await verifierCategoriePrestation(transaction, donnees.categorieId, DomainePrestation.SERVICE);

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
      const autres = (["categorieId", "instruction"] as const).filter(
        (champ) => donnees[champ] !== undefined && donnees[champ] !== existant[champ],
      );
      if (autres.length > 0) {
        await enregistrerAudit(transaction, {
          utilisateurId: auteurId,
          action: "SERVICE_MODIFIE",
          entite: "service",
          entiteId: id,
          detail: Object.fromEntries(autres.map((champ) => [champ, { avant: existant[champ], apres: donnees[champ] }])),
        });
      }
      return service;
    },
    OPTIONS_TRANSACTION,
  );
}