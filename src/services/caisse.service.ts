import { prisma } from "../config/prisma.js";
import { ModePaiement, StatutFacture, StatutPassage } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { calculerNetAPayer, calculerResteDu, recalculerStatutsDuPassage } from "./facturation.service.js";
import { conventionsPossibles, figerConventionAvantPaiement } from "./conventions.service.js";
import { CABINET } from "./impression.service.js";

// Madagascar : UTC+3 toute l'année.
const FUSEAU_HORAIRE = "Indian/Antananarivo";
const DECALAGE_FUSEAU = "+03:00";
const MILLISECONDES_PAR_JOUR = 24 * 60 * 60 * 1000;

const STATUTS_A_ENCAISSER: StatutFacture[] = [StatutFacture.A_PAYER, StatutFacture.PARTIEL];
const STATUTS_REMISE_MODIFIABLE: StatutFacture[] = [StatutFacture.A_PAYER, StatutFacture.PARTIEL];


export function lireJourCourant(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU_HORAIRE }).format(new Date());
}

function lireBornesDuJour(jour: string) {
  const debut = new Date(`${jour}T00:00:00${DECALAGE_FUSEAU}`);
  return { debut, fin: new Date(debut.getTime() + MILLISECONDES_PAR_JOUR) };
}

// ---------- Factures à encaisser ----------

export async function listerFacturesEnAttenteDePaiement() {
  const factures = await prisma.facture.findMany({
    where: { statut: { in: STATUTS_A_ENCAISSER } },
    orderBy: { id: "asc" },
    include: {
      patient: { select: { id: true, numeroDossier: true, nom: true, prenom: true } },
      lignes: { orderBy: { id: "asc" } },
    },
  });
  // R089 : tant que la convention n'est pas figée, la caisse voit celles qui s'appliquent pour choisir.
  return Promise.all(
    factures.map(async (facture) => ({
      ...facture,
      netAPayer: calculerNetAPayer(facture),
      resteDu: calculerResteDu(facture),
      conventionsPossibles: await conventionsPossibles(facture.id),
    })),
  );
}

export async function calculerResteDuDuPatient(patientId: number) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, numeroDossier: true, nom: true, prenom: true },
  });
  if (!patient) throw new ErreurHttp(404, "PATIENT_INTROUVABLE");

  const factures = await prisma.facture.findMany({
    where: { patientId, statut: { in: STATUTS_A_ENCAISSER } },
    select: { id: true, numero: true, partPatient: true, remise: true, montantPaye: true, statut: true },
    orderBy: { id: "asc" },
  });

  const details = factures.map((facture) => ({ ...facture, resteDu: calculerResteDu(facture) }));
  const resteDuTotal = details.reduce((somme, facture) => somme + facture.resteDu, 0);
  return { patient, resteDuTotal, factures: details };
}

// ---------- Remise (montant fixe, avant ou pendant le paiement) ----------

export async function modifierRemiseFacture(factureId: number, montant: number, utilisateurId: number) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM facture WHERE id = ${factureId} FOR UPDATE`;
    const facture = await tx.facture.findUnique({ where: { id: factureId } });
    if (!facture) throw new ErreurHttp(404, "FACTURE_INTROUVABLE");
    if (!STATUTS_REMISE_MODIFIABLE.includes(facture.statut)) throw new ErreurHttp(409, "FACTURE_NON_MODIFIABLE");

    // La remise ne peut pas faire passer le reste dû sous zéro.
    const maximum = facture.partPatient - facture.montantPaye;
    if (montant > maximum) throw new ErreurHttp(400, "REMISE_TROP_ELEVEE", { maximum });

    await tx.facture.update({ where: { id: factureId }, data: { remise: montant } });
    // Une remise qui couvre tout le reste solde la facture : statuts recalculés par la règle commune.
    await recalculerStatutsDuPassage(tx, facture.passageId);
    const miseAJour = await tx.facture.findUniqueOrThrow({ where: { id: factureId } });

    await enregistrerAudit(tx, {
      utilisateurId,
      action: "REMISE_FACTURE",
      entite: "facture",
      entiteId: factureId,
      detail: { ancienne: facture.remise, nouvelle: montant },
    });

    return { facture: miseAJour, netAPayer: calculerNetAPayer(miseAJour), resteDu: calculerResteDu(miseAJour) };
  }, OPTIONS_TRANSACTION);
}

// ---------- Paiement (total ou partiel, avec montant reçu et rendu) ----------

export async function enregistrerNouveauPaiement(
  factureId: number,
  donnees: { montant: number; mode: ModePaiement; reference?: string | null; montantRecu?: number | null },
  utilisateurId: number,
) {
  return prisma.$transaction(async (tx) => {
    const jourCourant = lireJourCourant();
    const clotureDuJour = await tx.clotureCaisse.findUnique({
      where: { jour: new Date(`${jourCourant}T00:00:00.000Z`) },
    });
    if (clotureDuJour) throw new ErreurHttp(409, "JOURNEE_CLOTUREE");

    await tx.$queryRaw`SELECT id FROM facture WHERE id = ${factureId} FOR UPDATE`;
    const avant = await tx.facture.findUnique({ where: { id: factureId }, select: { statut: true } });
    if (!avant) throw new ErreurHttp(404, "FACTURE_INTROUVABLE");
    // R087 : la convention est figée au premier paiement (la part patient peut diminuer).
    if (STATUTS_A_ENCAISSER.includes(avant.statut)) await figerConventionAvantPaiement(tx, factureId, utilisateurId);
    const facture = await tx.facture.findUniqueOrThrow({ where: { id: factureId } });
    if (facture.statut === StatutFacture.PHARMACIE) throw new ErreurHttp(409, "PHARMACIE_EN_COURS");
    // Prise en charge totale par la convention : rien à encaisser, la convention reste figée.
    if (facture.statut === StatutFacture.PAYE && avant.statut !== StatutFacture.PAYE) {
      return { paiement: null, facture, resteDu: 0, rendu: 0 };
    }
    if (facture.statut === StatutFacture.PAYE) throw new ErreurHttp(409, "FACTURE_PAYEE");
    if (facture.statut === StatutFacture.ANNULEE) throw new ErreurHttp(409, "FACTURE_ANNULEE");
    // Mobile Money : la référence de la transaction est la seule preuve du paiement.
    if (donnees.mode === ModePaiement.MOBILE_MONEY && !donnees.reference?.trim()) {
      throw new ErreurHttp(400, "REFERENCE_REQUISE");
    }

    const resteAvant = calculerResteDu(facture);
    if (donnees.montant > resteAvant) throw new ErreurHttp(400, "MONTANT_DEPASSE_RESTE", { reste: resteAvant });

    // Montant reçu : par défaut le montant imputé. Le rendu n'existe qu'en espèces.
    const montantRecu = donnees.montantRecu ?? donnees.montant;
    if (montantRecu < donnees.montant) throw new ErreurHttp(400, "MONTANT_RECU_INSUFFISANT");
    const rendu = montantRecu - donnees.montant;
    if (rendu > 0 && donnees.mode !== ModePaiement.ESPECES) throw new ErreurHttp(400, "RENDU_NON_AUTORISE");

    const paiement = await tx.paiement.create({
      data: {
        factureId,
        utilisateurId,
        montant: donnees.montant,
        mode: donnees.mode,
        reference: donnees.reference ?? null,
        montantRecu,
      },
    });

    const nouveauMontantPaye = facture.montantPaye + donnees.montant;
    const resteApres = calculerResteDu({
      partPatient: facture.partPatient,
      remise: facture.remise,
      montantPaye: nouveauMontantPaye,
    });

    await tx.facture.update({ where: { id: factureId }, data: { montantPaye: nouveauMontantPaye } });
    // Facture PAYE ou PARTIEL, passage PARTIEL, CAISSE ou TERMINE : une seule règle pour tout le projet
    // (le passage ne se termine que si toutes ses factures sont soldées).
    await recalculerStatutsDuPassage(tx, facture.passageId);
    const miseAJour = await tx.facture.findUniqueOrThrow({ where: { id: factureId } });

    await enregistrerAudit(tx, {
      utilisateurId,
      action: "PAIEMENT",
      entite: "facture",
      entiteId: factureId,
      detail: { montant: donnees.montant, mode: donnees.mode, montantRecu, rendu, resteApres },
    });

    return { paiement, facture: miseAJour, resteDu: resteApres, rendu };
  }, OPTIONS_TRANSACTION);
}

// ---------- Reçu (données pour l'impression) ----------

export async function obtenirRecuFacture(factureId: number) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: {
      patient: { select: { numeroDossier: true, nom: true, prenom: true } },
      passage: {
        select: {
          heureArrivee: true,
          consultation: {
            select: {
              rendezVousRevue: {
                orderBy: { dateHeure: "asc" },
                take: 1,
                select: { dateHeure: true },
              },
            },
          },
        },
      },
      lignes: { orderBy: { id: "asc" } },
      paiements: {
        orderBy: { date: "asc" },
        select: { id: true, montant: true, mode: true, reference: true, montantRecu: true, date: true },
      },
    },
  });
  if (!facture) throw new ErreurHttp(404, "FACTURE_INTROUVABLE");

  return {
    cabinet: CABINET,
    facture: {
      id: facture.id,
      numero: facture.numero,
      statut: facture.statut,
      date: facture.passage.heureArrivee,
      rendezVousRevue: facture.passage.consultation?.rendezVousRevue[0] ?? null,
      total: facture.total,
      remise: facture.remise,
      partPatient: facture.partPatient,
      montantPaye: facture.montantPaye,
      netAPayer: calculerNetAPayer(facture),
      resteDu: calculerResteDu(facture),
      patient: facture.patient,
      lignes: facture.lignes,
      paiements: facture.paiements.map((paiement) => ({
        ...paiement,
        montantRecu: paiement.montantRecu ?? paiement.montant,
        rendu: (paiement.montantRecu ?? paiement.montant) - paiement.montant,
      })),
    },
  };
}

// ---------- Clôture quotidienne ----------

async function calculerTotauxDuJour(jour: string) {
  const { debut, fin } = lireBornesDuJour(jour);
  const groupes = await prisma.paiement.groupBy({
    by: ["mode"],
    where: { date: { gte: debut, lt: fin } },
    _sum: { montant: true },
  });
  const parMode = groupes.map((groupe) => ({ mode: groupe.mode, total: groupe._sum.montant ?? 0 }));
  const totalAttendu = parMode.reduce((somme, ligne) => somme + ligne.total, 0);
  return { totalAttendu, parMode };
}

export async function calculerApercuCloture(jour: string) {
  const { totalAttendu, parMode } = await calculerTotauxDuJour(jour);
  const cloture = await prisma.clotureCaisse.findUnique({ where: { jour: new Date(`${jour}T00:00:00.000Z`) } });
  return { jour, totalAttendu, parMode, cloture };
}

export async function cloturerLaJournee(
  donnees: { jour: string; totalCompte: number; commentaire?: string | null },
  utilisateurId: number,
) {
  if (donnees.jour > lireJourCourant()) throw new ErreurHttp(400, "JOUR_FUTUR");

  const jourCloture = new Date(`${donnees.jour}T00:00:00.000Z`);

  return prisma.$transaction(async (tx) => {
    const existante = await tx.clotureCaisse.findUnique({ where: { jour: jourCloture } });
    if (existante) throw new ErreurHttp(409, "JOURNEE_DEJA_CLOTUREE");

    const { debut, fin } = lireBornesDuJour(donnees.jour);
    const somme = await tx.paiement.aggregate({
      where: { date: { gte: debut, lt: fin } },
      _sum: { montant: true },
    });
    const totalAttendu = somme._sum.montant ?? 0;

    const cloture = await tx.clotureCaisse.create({
      data: {
        utilisateurId,
        jour: jourCloture,
        totalAttendu,
        totalCompte: donnees.totalCompte,
        ecart: donnees.totalCompte - totalAttendu,
        commentaire: donnees.commentaire ?? null,
      },
    });

    await enregistrerAudit(tx, {
      utilisateurId,
      action: "CLOTURE_CAISSE",
      entite: "cloture_caisse",
      entiteId: cloture.id,
      detail: { jour: donnees.jour, ecart: cloture.ecart },
    });

    return cloture;
  }, OPTIONS_TRANSACTION);
}
