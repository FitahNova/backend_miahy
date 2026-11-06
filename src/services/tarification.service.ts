import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { PARAMETRES_TARIF_DEFAUT, type ParametresTarif } from "../utils/tarification.js";
import { enregistrerAudit } from "./audit.service.js";

const selectionParametres = {
  majorationSoirPourcent: true,
  heureDebutSoir: true,
  heureOuverture: true,
  majorationEtrangerPourcent: true,
} as const;

/** Paramètres en vigueur (ligne unique) ; valeurs par défaut si la ligne manque encore. */
export async function lireParametresTarification(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<ParametresTarif> {
  const ligne = await client.parametresTarification.findUnique({ where: { id: 1 }, select: selectionParametres });
  return ligne ?? PARAMETRES_TARIF_DEFAUT;
}

/**
 * Direction : enregistre les paramètres ; s'appliquent aux actes facturés à partir de maintenant.
 * La Direction confirme avec son mot de passe : un mot de passe faux est refusé et noté au journal.
 * @throws 403 MOT_DE_PASSE_INCORRECT
 */
export async function modifierParametresTarification(donnees: ParametresTarif, motDePasse: string, auteurId: number) {
  const auteur = await prisma.utilisateur.findUnique({ where: { id: auteurId }, select: { motDePasseHash: true } });
  if (!auteur || !(await bcrypt.compare(motDePasse, auteur.motDePasseHash))) {
    await enregistrerAudit(prisma, {
      utilisateurId: auteurId,
      action: "TARIFICATION_REFUSEE",
      entite: "parametres_tarification",
      entiteId: 1,
      detail: { raison: "Mot de passe incorrect" },
    });
    throw new ErreurHttp(403, "MOT_DE_PASSE_INCORRECT");
  }
  await prisma.$transaction(async (tx) => {
    const avant = await lireParametresTarification(tx);
    await tx.parametresTarification.upsert({
      where: { id: 1 },
      create: { id: 1, ...donnees, modifieParId: auteurId },
      update: { ...donnees, modifieLe: new Date(), modifieParId: auteurId },
    });
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "TARIFICATION_MODIFIEE",
      entite: "parametres_tarification",
      entiteId: 1,
      detail: { avant: { ...avant }, apres: { ...donnees } },
    });
  }, OPTIONS_TRANSACTION);
  return { parametres: await lireParametresTarification() };
}
