/*
 * Conventions partenaires en caisse (R084 à R089).
 * Avant le premier paiement, la convention de la facture est figée : celle choisie par la secrétaire,
 * ou la seule possible, ou aucune. La part partenaire est alors enregistrée (exacte, centimes compris)
 * et la part patient diminue d'autant ; la facture ne change plus de convention ensuite.
 */
import { prisma } from "../config/prisma.js";
import { StatutFacture, type Prisma } from "../generated/prisma/client.js";
import { conventionApplicable, montantCouvert, partPartenaire } from "../utils/conventions.js";
import { ErreurHttp } from "../utils/errors.js";
import { jourDuCentre } from "../utils/suivis.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { recalculerStatutsDuPassage } from "./facturation.service.js";

type Client = Prisma.TransactionClient;

const STATUTS_CONVENTION_MODIFIABLE: StatutFacture[] = [StatutFacture.A_PAYER, StatutFacture.PARTIEL];

/** Facture avec ce qu'il faut pour décider : lignes, programme du patient, date. */
async function lireFacture(client: Client, factureId: number) {
  const facture = await client.facture.findUnique({
    where: { id: factureId },
    select: {
      id: true,
      passageId: true,
      statut: true,
      total: true,
      remise: true,
      montantPaye: true,
      creeLe: true,
      conventionFigeeLe: true,
      patient: { select: { programmeId: true } },
      lignes: { select: { type: true, serviceId: true, quantite: true, prixUnitaire: true } },
    },
  });
  if (!facture) throw new ErreurHttp(404, "FACTURE_INTROUVABLE");
  return facture;
}

type FactureLue = Awaited<ReturnType<typeof lireFacture>>;

/** Conventions applicables à une facture, avec la part que chacune prendrait en charge (R089 : choix). */
async function calculerConventionsPossibles(client: Client, facture: FactureLue) {
  const partenaires = await client.partenaire.findMany({
    where: { actif: true, tauxPriseEnCharge: { gt: 0 } },
    orderBy: { nom: "asc" },
    select: {
      id: true,
      nom: true,
      tauxPriseEnCharge: true,
      serviceCouvertId: true,
      couvreMedicaments: true,
      actif: true,
      debut: true,
      fin: true,
      programmes: { select: { id: true } },
    },
  });
  const contexte = { jour: jourDuCentre(facture.creeLe), programmeId: facture.patient.programmeId };
  return partenaires
    .map((partenaire) => ({ partenaire, convention: { ...partenaire, programmeIds: partenaire.programmes.map((p) => p.id) } }))
    .filter(({ convention }) => conventionApplicable(convention, contexte, facture.lignes))
    .map(({ partenaire, convention }) => {
      const couvert = montantCouvert(convention, facture.lignes);
      const part = partPartenaire(couvert, partenaire.tauxPriseEnCharge);
      return {
        partenaireId: partenaire.id,
        nom: partenaire.nom,
        taux: partenaire.tauxPriseEnCharge,
        montantCouvert: couvert,
        partPartenaireExacte: part.exacte,
        partPartenaire: part.entiere,
        partPatient: facture.total - part.entiere,
      };
    });
}

/** Pour la caisse : conventions possibles d'une facture dont la convention n'est pas encore figée. */
export async function conventionsPossibles(factureId: number) {
  const facture = await lireFacture(prisma, factureId);
  if (facture.conventionFigeeLe || facture.montantPaye > 0) return [];
  return calculerConventionsPossibles(prisma, facture);
}

/**
 * Fige la convention (ou l'absence de convention) sur la facture et recalcule les statuts.
 * @throws 409 REMISE_A_REVOIR si la remise dépasse la nouvelle part patient
 */
async function figer(client: Client, facture: FactureLue, choix: Awaited<ReturnType<typeof calculerConventionsPossibles>>[number] | null, auteurId: number) {
  const partEntiere = choix?.partPartenaire ?? 0;
  const partPatient = facture.total - partEntiere;
  if (facture.remise > partPatient) throw new ErreurHttp(409, "REMISE_A_REVOIR", { maximum: partPatient });

  await client.facture.update({
    where: { id: facture.id },
    data: {
      partenaireId: choix?.partenaireId ?? null,
      tauxPartenaire: choix?.taux ?? null,
      partPartenaireExacte: choix?.partPartenaireExacte ?? null,
      partPartenaire: partEntiere,
      partPatient,
      conventionFigeeLe: new Date(),
    },
  });
  // Une prise en charge totale solde la facture sans paiement du patient.
  await recalculerStatutsDuPassage(client, facture.passageId);
  if (choix) {
    await enregistrerAudit(client, {
      utilisateurId: auteurId,
      action: "CONVENTION_APPLIQUEE",
      entite: "facture",
      entiteId: facture.id,
      detail: { partenaireId: choix.partenaireId, taux: choix.taux, part: choix.partPartenaireExacte },
    });
  }
}

/**
 * Choix en caisse (R089) : un partenaire parmi les conventions possibles, ou null pour « sans convention ».
 * Possible tant que la facture n'a reçu aucun paiement.
 * @throws 404 FACTURE_INTROUVABLE ; 409 FACTURE_NON_MODIFIABLE, CONVENTION_DEJA_FIGEE, REMISE_A_REVOIR ;
 *         400 CONVENTION_NON_APPLICABLE
 */
export async function choisirConvention(factureId: number, partenaireId: number | null, auteurId: number) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM facture WHERE id = ${factureId} FOR UPDATE`;
    const facture = await lireFacture(tx, factureId);
    if (!STATUTS_CONVENTION_MODIFIABLE.includes(facture.statut)) throw new ErreurHttp(409, "FACTURE_NON_MODIFIABLE");
    if (facture.conventionFigeeLe || facture.montantPaye > 0) throw new ErreurHttp(409, "CONVENTION_DEJA_FIGEE");

    let choix = null;
    if (partenaireId !== null) {
      choix = (await calculerConventionsPossibles(tx, facture)).find((possible) => possible.partenaireId === partenaireId);
      if (!choix) throw new ErreurHttp(400, "CONVENTION_NON_APPLICABLE");
    }
    await figer(tx, facture, choix, auteurId);
    return tx.facture.findUniqueOrThrow({ where: { id: factureId } });
  }, OPTIONS_TRANSACTION);
}

/**
 * Juste avant le premier paiement (R087) : fige la convention si ce n'est pas déjà fait.
 * Aucune possible → sans convention ; une seule → appliquée ; plusieurs → la secrétaire doit choisir.
 * À appeler dans la transaction du paiement, facture verrouillée.
 * @throws 409 CONVENTION_A_CHOISIR (nombre de conventions possibles)
 */
export async function figerConventionAvantPaiement(tx: Client, factureId: number, auteurId: number) {
  const facture = await lireFacture(tx, factureId);
  if (facture.conventionFigeeLe || facture.montantPaye > 0) return;
  const possibles = await calculerConventionsPossibles(tx, facture);
  if (possibles.length > 1) throw new ErreurHttp(409, "CONVENTION_A_CHOISIR", { nombre: possibles.length });
  await figer(tx, facture, possibles[0] ?? null, auteurId);
}
