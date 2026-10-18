import { prisma } from "../config/prisma.js";
import { Role, StatutPassage } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { journaliserAcces } from "./journal.service.js";

export interface LigneOrdonnanceSaisie {
  medicamentId: number;
  doseParPrise: number;
  prisesParJour: number;
  dureeJours: number;
  instruction?: string | null;
}

export interface PrescripteurConnecte {
  id: number;
  role: Role;
}

// Quantité prescrite = dose par prise × prises par jour × durée, arrondie à l'unité supérieure.
export function calculerQuantitePrescrite(ligne: LigneOrdonnanceSaisie): number {
  const quantiteExacte = Math.round(ligne.doseParPrise * ligne.prisesParJour * ligne.dureeJours * 100) / 100;
  return Math.ceil(quantiteExacte);
}

// Le médecin voit le médicament prescrit, jamais son prix de vente ni son stock.
const selectionOrdonnance = {
  id: true,
  passageId: true,
  creeLe: true,
  prescripteur: { select: { id: true, nom: true } },
  lignes: {
    select: {
      id: true,
      doseParPrise: true,
      prisesParJour: true,
      dureeJours: true,
      quantitePrescrite: true,
      quantiteDelivree: true,
      instruction: true,
      medicament: { select: { id: true, nom: true, forme: true } },
    },
    orderBy: { id: "asc" },
  },
} as const;

type ClientLecture = typeof prisma | Prisma.TransactionClient;

// Seul le praticien du passage (ou le Médecin chef) accède à l'ordonnance.
async function verifierAccesPassage(
  passageId: number,
  utilisateur: PrescripteurConnecte,
  client: ClientLecture = prisma,
) {
  const passage = await client.passage.findUnique({
    where: { id: passageId },
    select: { id: true, statut: true, praticienId: true },
  });
  if (!passage) {
    throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");
  }
  if (utilisateur.role !== Role.MEDECIN_CHEF && passage.praticienId !== utilisateur.id) {
    throw new ErreurHttp(403, "PATIENT_NON_ASSIGNE");
  }
  return passage;
}

export async function obtenirOrdonnanceDuPassage(passageId: number, utilisateur: PrescripteurConnecte) {
  await verifierAccesPassage(passageId, utilisateur);

  // Trace de la lecture avant de renvoyer l'ordonnance.
  await journaliserAcces(utilisateur.id, "LECTURE_ORDONNANCE", "passage", passageId);

  return prisma.ordonnance.findUnique({ where: { passageId }, select: selectionOrdonnance });
}

// Remplace le contenu de l'ordonnance, pendant la consultation seulement.
export async function enregistrerOrdonnanceDuPassage(
  passageId: number,
  utilisateur: PrescripteurConnecte,
  lignes: LigneOrdonnanceSaisie[],
) {
  return prisma.$transaction(async (transaction) => {
    // Lectures dans la transaction : le passage ne peut pas être signé entre la vérification et l'écriture.
    const passage = await verifierAccesPassage(passageId, utilisateur, transaction);
    if (passage.statut !== StatutPassage.EN_CONSULTATION) {
      throw new ErreurHttp(409, "ORDONNANCE_NON_MODIFIABLE");
    }

    // Plus aucun médicament : l'ordonnance est supprimée, le patient ira directement en caisse.
    if (lignes.length === 0) {
      const existante = await transaction.ordonnance.findUnique({ where: { passageId }, select: { id: true } });
      if (existante) {
        await transaction.ligneOrdonnance.deleteMany({ where: { ordonnanceId: existante.id } });
        await transaction.ordonnance.delete({ where: { id: existante.id } });
        await enregistrerAudit(transaction, {
          utilisateurId: utilisateur.id,
          action: "ORDONNANCE_SUPPRIMEE",
          entite: "passage",
          entiteId: passageId,
        });
      }
      return null;
    }

    const identifiants = [...new Set(lignes.map((ligne) => ligne.medicamentId))];
    const medicaments = await transaction.medicament.findMany({
      where: { id: { in: identifiants }, actif: true },
      select: { id: true },
    });
    if (medicaments.length !== identifiants.length) {
      throw new ErreurHttp(400, "MEDICAMENT_INACTIF");
    }

    const ordonnance = await transaction.ordonnance.upsert({
      where: { passageId },
      create: { passageId, prescripteurId: utilisateur.id },
      update: { prescripteurId: utilisateur.id },
    });

    await transaction.ligneOrdonnance.deleteMany({ where: { ordonnanceId: ordonnance.id } });
    await transaction.ligneOrdonnance.createMany({
      data: lignes.map((ligne) => ({
        ordonnanceId: ordonnance.id,
        medicamentId: ligne.medicamentId,
        doseParPrise: ligne.doseParPrise,
        prisesParJour: ligne.prisesParJour,
        dureeJours: ligne.dureeJours,
        quantitePrescrite: calculerQuantitePrescrite(ligne),
        instruction: ligne.instruction ?? null,
      })),
    });

    await enregistrerAudit(transaction, {
      utilisateurId: utilisateur.id,
      action: "ORDONNANCE",
      entite: "passage",
      entiteId: passageId,
      detail: { lignes: lignes.length },
    });

    return transaction.ordonnance.findUniqueOrThrow({ where: { id: ordonnance.id }, select: selectionOrdonnance });
  }, OPTIONS_TRANSACTION);
}
