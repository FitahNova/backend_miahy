/*
 * Charges fixes (dossier §6.12, maquette « Paramètres → Charges fixes »). Direction seule.
 * Une charge sans montant est « à fixer » ; elle n'est jamais supprimée, seulement désactivée.
 * Chaque modification est tracée dans le journal.
 */
import { prisma } from "../config/prisma.js";
import type { PeriodiciteCharge } from "../generated/prisma/client.js";
import { montantMensuel, totalMensuel } from "../utils/charges.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";

export interface DonneesCharge {
  libelle: string;
  montant: number | null;
  periodicite: PeriodiciteCharge;
}

const selectionCharge = { id: true, libelle: true, montant: true, periodicite: true, actif: true } as const;

async function verifierLibelleLibre(libelle: string, saufId?: number) {
  const existante = await prisma.chargeFixe.findFirst({
    where: { libelle: { equals: libelle, mode: "insensitive" }, ...(saufId ? { id: { not: saufId } } : {}) },
    select: { id: true },
  });
  if (existante) throw new ErreurHttp(409, "CHARGE_EXISTANTE");
}

/** Liste (actives d'abord), avec la part mensuelle de chacune et le total mensuel. */
export async function listerCharges() {
  const charges = await prisma.chargeFixe.findMany({ orderBy: [{ actif: "desc" }, { id: "asc" }], select: selectionCharge });
  return {
    charges: charges.map((charge) => ({ ...charge, montantMensuel: montantMensuel(charge) })),
    ...totalMensuel(charges),
  };
}

/** Total mensuel des charges actives (résultat du tableau de bord). */
export async function lireTotalMensuel() {
  const charges = await prisma.chargeFixe.findMany({ select: { montant: true, periodicite: true, actif: true } });
  return totalMensuel(charges);
}

/** @throws 409 CHARGE_EXISTANTE */
export async function creerCharge(donnees: DonneesCharge, auteurId: number) {
  await verifierLibelleLibre(donnees.libelle);
  return prisma.$transaction(async (tx) => {
    const charge = await tx.chargeFixe.create({ data: donnees, select: selectionCharge });
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "CHARGE_CREEE",
      entite: "charge_fixe",
      entiteId: charge.id,
      detail: { libelle: charge.libelle, montant: charge.montant, periodicite: charge.periodicite },
    });
    return charge;
  }, OPTIONS_TRANSACTION);
}

/** Modification : l'ancienne et la nouvelle valeur sont gardées dans le journal. @throws 404, 409 CHARGE_EXISTANTE */
export async function modifierCharge(id: number, donnees: Partial<DonneesCharge>, auteurId: number) {
  if (donnees.libelle) await verifierLibelleLibre(donnees.libelle, id);
  return prisma.$transaction(async (tx) => {
    const avant = await tx.chargeFixe.findUnique({ where: { id }, select: selectionCharge });
    if (!avant) throw new ErreurHttp(404, "CHARGE_INTROUVABLE");
    const charge = await tx.chargeFixe.update({ where: { id }, data: donnees, select: selectionCharge });
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "CHARGE_MODIFIEE",
      entite: "charge_fixe",
      entiteId: id,
      detail: {
        avant: { libelle: avant.libelle, montant: avant.montant, periodicite: avant.periodicite },
        apres: { libelle: charge.libelle, montant: charge.montant, periodicite: charge.periodicite },
      },
    });
    return charge;
  }, OPTIONS_TRANSACTION);
}

/** Désactiver ou réactiver (une charge désactivée ne compte plus dans le résultat). @throws 404 */
export async function changerActifCharge(id: number, actif: boolean, auteurId: number) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.chargeFixe.updateMany({ where: { id }, data: { actif } });
    if (count === 0) throw new ErreurHttp(404, "CHARGE_INTROUVABLE");
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: actif ? "CHARGE_REACTIVEE" : "CHARGE_DESACTIVEE",
      entite: "charge_fixe",
      entiteId: id,
    });
    return tx.chargeFixe.findUniqueOrThrow({ where: { id }, select: selectionCharge });
  }, OPTIONS_TRANSACTION);
}
