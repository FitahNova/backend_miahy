import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ipCourante } from "../middleware/contexteRequete.js";
import type { ActionConnexion } from "../utils/audit.js";
import { enregistrerAudit } from "./audit.service.js";

// Connexions (succès, échec, déconnexion, TOTP…) : l'adresse IP de la requête est notée.
export async function journaliserConnexion(
  utilisateurId: number | null,
  action: ActionConnexion,
  detail?: Prisma.InputJsonObject,
) {
  await enregistrerAudit(prisma, {
    utilisateurId,
    action,
    entite: "utilisateur",
    entiteId: utilisateurId,
    detail,
    ip: ipCourante(),
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
  await enregistrerAudit(prisma, { utilisateurId, action, entite, entiteId });
}
