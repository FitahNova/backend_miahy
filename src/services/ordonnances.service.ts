import { prisma } from "../config/prisma.js";
import { Role, StatutPassage } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { estPerime } from "../utils/peremption.js";
import { estQuantiteEcrite } from "../utils/produits.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { journaliserAcces } from "./journal.service.js";

export interface LigneOrdonnanceSaisie {
  /** Médicament du stock du centre. Absent : médicament hors stock, nommé par « libelle » (prescription seule). */
  medicamentId?: number | null;
  libelle?: string | null;
  /** Vides pour pommade, injectable et collyre : la quantité est écrite par le médecin. */
  doseParPrise?: number | null;
  prisesParJour?: number | null;
  dureeJours?: number | null;
  /** Pommade, injectable, collyre : nombre de tubes, d'ampoules ou de flacons. */
  quantite?: number | null;
  instruction?: string | null;
}

export interface PrescripteurConnecte {
  id: number;
  role: Role;
}

// Quantité prescrite = dose par prise × prises par jour × durée, arrondie à l'unité supérieure.
export function calculerQuantitePrescrite(ligne: { doseParPrise: number; prisesParJour: number; dureeJours: number }): number {
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
      libelle: true,
      medicament: { select: { id: true, nom: true, forme: true, contenuConditionnement: true } },
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

    // Seuls les médicaments du stock sont vérifiés ; un médicament hors stock n'est ni délivré ni facturé.
    const identifiants = [...new Set(lignes.flatMap((ligne) => (ligne.medicamentId ? [ligne.medicamentId] : [])))];
    const medicaments = await transaction.medicament.findMany({
      where: { id: { in: identifiants }, actif: true },
      select: { id: true, nom: true, forme: true, datePeremption: true },
    });
    if (medicaments.length !== identifiants.length) {
      throw new ErreurHttp(400, "MEDICAMENT_INACTIF");
    }
    const perime = medicaments.find((medicament) => estPerime(medicament.datePeremption));
    if (perime) {
      throw new ErreurHttp(400, "MEDICAMENT_PERIME", { medicament: perime.nom });
    }

    const ordonnance = await transaction.ordonnance.upsert({
      where: { passageId },
      create: { passageId, prescripteurId: utilisateur.id },
      update: { prescripteurId: utilisateur.id },
    });

    // Pommade, injectable, collyre : instruction et quantité écrites ; les autres : dose × prises × jours.
    const formes = new Map(medicaments.map((medicament) => [medicament.id, medicament]));
    const donnees = lignes.map((ligne) => {
      const medicament = ligne.medicamentId ? formes.get(ligne.medicamentId) : undefined;
      const base = {
        ordonnanceId: ordonnance.id,
        medicamentId: ligne.medicamentId ?? null,
        libelle: ligne.medicamentId ? null : (ligne.libelle?.trim() ?? null),
        instruction: ligne.instruction?.trim() || null,
      };
      if (medicament && estQuantiteEcrite(medicament.forme)) {
        if (!ligne.quantite) throw new ErreurHttp(400, "QUANTITE_REQUISE", { medicament: medicament.nom });
        if (!base.instruction) throw new ErreurHttp(400, "INSTRUCTION_REQUISE", { medicament: medicament.nom });
        return { ...base, doseParPrise: null, prisesParJour: null, dureeJours: null, quantitePrescrite: ligne.quantite };
      }
      if (!ligne.doseParPrise || !ligne.prisesParJour || !ligne.dureeJours) {
        throw new ErreurHttp(400, "POSOLOGIE_REQUISE", { medicament: medicament?.nom ?? ligne.libelle ?? null });
      }
      const posologie = { doseParPrise: ligne.doseParPrise, prisesParJour: ligne.prisesParJour, dureeJours: ligne.dureeJours };
      return { ...base, ...posologie, quantitePrescrite: calculerQuantitePrescrite(posologie) };
    });

    await transaction.ligneOrdonnance.deleteMany({ where: { ordonnanceId: ordonnance.id } });
    await transaction.ligneOrdonnance.createMany({ data: donnees });

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
