import { StatutRendezVous } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { bornesDuJour, choisirRendezVousDuJour, jourDuCentre } from "../utils/jourCentre.js";
import { enregistrerAudit } from "./audit.service.js";

/**
 * Un passage ouvert aujourd'hui fait passer à Venu le rendez-vous prévu du jour
 * (le plus tôt s'il y en a plusieurs). Un créneau d'un autre jour reste Prévu.
 * @returns vrai si un rendez-vous a changé de statut.
 */
export async function honorerRendezVousDuJour(
  transaction: Prisma.TransactionClient,
  patientId: number,
  passageId: number,
  auteurId: number | null,
  maintenant = new Date(),
): Promise<boolean> {
  const { debut, fin } = bornesDuJour(jourDuCentre(maintenant));
  const candidats = await transaction.rendezVous.findMany({
    where: {
      patientId,
      statut: StatutRendezVous.PREVU,
      dateHeure: { gte: debut, lt: fin },
    },
    orderBy: { dateHeure: "asc" },
    select: { id: true, dateHeure: true, statut: true, motif: true },
  });
  const choisi = choisirRendezVousDuJour(candidats, maintenant);
  if (!choisi) return false;

  await transaction.rendezVous.update({
    where: { id: choisi.id },
    data: { statut: StatutRendezVous.VENU, passageId },
  });
  await enregistrerAudit(transaction, {
    utilisateurId: auteurId,
    action: "RENDEZ_VOUS_VENU",
    entite: "rendez_vous",
    entiteId: choisi.id,
    detail: { passageId, origine: "passage" },
  });
  return true;
}
