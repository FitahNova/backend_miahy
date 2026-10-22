import type { Prisma } from "../generated/prisma/client.js";

interface EntreeAudit {
  utilisateurId: number | null;
  action: string;
  entite: string;
  entiteId?: number | null;
  detail?: Prisma.InputJsonValue;
}

export async function enregistrerAudit(client: Prisma.TransactionClient, entree: EntreeAudit) {
  await client.journalAudit.create({
    data: {
      utilisateurId: entree.utilisateurId,
      action: entree.action,
      entite: entree.entite,
      entiteId: entree.entiteId ?? null,
      detail: entree.detail,
    },
  });
}
