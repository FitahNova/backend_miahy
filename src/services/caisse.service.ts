import { prisma } from "../config/prisma.js";
import { ModePaiement, StatutFacture, type Prisma } from "../generated/prisma/client.js";
import {
  attenduDuTiroir,
  ecartDeCaisse,
  totalDuComptage,
  verifierCoupures,
  type Coupure,
} from "../utils/comptageCaisse.js";
import { TAILLE_PAGE } from "../config/constants.js";
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

function jourEnDate(jour: string) {
  return new Date(`${jour}T00:00:00.000Z`);
}

type ClientLecture = Prisma.TransactionClient | typeof prisma;

/** Refuse délivrance, remise et encaissement une fois la journée de caisse clôturée. */
export async function exigerJourneeOuverte(db: ClientLecture) {
  const cloture = await db.clotureCaisse.findUnique({
    where: { jour: jourEnDate(lireJourCourant()) },
    select: { id: true },
  });
  if (cloture) throw new ErreurHttp(409, "JOURNEE_CLOTUREE");
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
    await exigerJourneeOuverte(tx);
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
    await exigerJourneeOuverte(tx);

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

const MODES_AFFICHES = ["ESPECES", "MOBILE_MONEY", "AUTRE"] as const;
export type ModeAffiche = (typeof MODES_AFFICHES)[number];
export type LigneEncaissement = { mode: ModeAffiche; nombre: number; total: number };

async function syntheseDuJour(db: ClientLecture, jour: string) {
  const { debut, fin } = lireBornesDuJour(jour);
  const [groupes, reste] = await Promise.all([
    db.paiement.groupBy({
      by: ["mode"],
      where: { date: { gte: debut, lt: fin } },
      _sum: { montant: true },
      _count: { _all: true },
    }),
    db.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(GREATEST("part_patient" - "remise" - "montant_paye", 0)), 0)::int AS total
      FROM "facture"
      WHERE "cree_le" >= ${debut} AND "cree_le" < ${fin}
        AND "statut" <> 'annulee'::"statut_facture"
    `,
  ]);

  const lignes = new Map<ModeAffiche, LigneEncaissement>(
    MODES_AFFICHES.map((mode) => [mode, { mode, nombre: 0, total: 0 }]),
  );
  for (const groupe of groupes) {
    const mode = groupe.mode === ModePaiement.ESPECES || groupe.mode === ModePaiement.MOBILE_MONEY ? groupe.mode : "AUTRE";
    const ligne = lignes.get(mode)!;
    ligne.nombre += groupe._count._all;
    ligne.total += groupe._sum.montant ?? 0;
  }
  const parMode = MODES_AFFICHES.map((mode) => lignes.get(mode)!);
  return {
    debut,
    fin,
    parMode,
    totalEncaisse: parMode.reduce((somme, ligne) => somme + ligne.total, 0),
    especes: lignes.get("ESPECES")!.total,
    nonEncaisse: Number(reste[0]?.total ?? 0),
  };
}

export async function calculerApercuCloture(jour: string) {
  const [synthese, cloture] = await Promise.all([
    syntheseDuJour(prisma, jour),
    prisma.clotureCaisse.findUnique({ where: { jour: jourEnDate(jour) } }),
  ]);
  return {
    jour,
    cabinet: CABINET,
    totalAttendu: synthese.totalEncaisse,
    parMode: synthese.parMode,
    especes: synthese.especes,
    nonEncaisse: synthese.nonEncaisse,
    cloture,
  };
}

export async function cloturerLaJournee(
  donnees: { jour: string; fondDeCaisse: number; coupures: Coupure[]; commentaire?: string | null },
  utilisateurId: number,
) {
  if (donnees.jour > lireJourCourant()) throw new ErreurHttp(400, "JOUR_FUTUR");
  verifierCoupures(donnees.coupures);

  const jourCloture = jourEnDate(donnees.jour);
  const totalCompte = totalDuComptage(donnees.coupures);

  return prisma.$transaction(async (tx) => {
    const existante = await tx.clotureCaisse.findUnique({ where: { jour: jourCloture } });
    if (existante) throw new ErreurHttp(409, "JOURNEE_DEJA_CLOTUREE");

    const synthese = await syntheseDuJour(tx, donnees.jour);
    const totalAttendu = attenduDuTiroir(donnees.fondDeCaisse, synthese.especes);

    const cloture = await tx.clotureCaisse.create({
      data: {
        utilisateurId,
        jour: jourCloture,
        fondDeCaisse: donnees.fondDeCaisse,
        totalAttendu,
        totalCompte,
        ecart: ecartDeCaisse(totalCompte, totalAttendu),
        detailComptage: donnees.coupures,
        commentaire: donnees.commentaire ?? null,
      },
    });

    // R110 : les paiements du jour sont figés avec la clôture.
    await tx.paiement.updateMany({
      where: { date: { gte: synthese.debut, lt: synthese.fin }, clotureId: null },
      data: { clotureId: cloture.id },
    });

    await enregistrerAudit(tx, {
      utilisateurId,
      action: "CLOTURE_CAISSE",
      entite: "cloture_caisse",
      entiteId: cloture.id,
      detail: { jour: donnees.jour, ecart: cloture.ecart, fondDeCaisse: donnees.fondDeCaisse },
    });

    return cloture;
  }, OPTIONS_TRANSACTION);
}

/**
 * Historique des clôtures (Direction), la plus récente d'abord : date, heure, auteur et comptage.
 * Seule la clôture du jour peut être rouverte (à toute heure) ; les jours passés restent figés.
 */
export async function listerClotures(page = 1, taille = TAILLE_PAGE) {
  const aujourdhui = lireJourCourant();
  const [clotures, total] = await prisma.$transaction([
    prisma.clotureCaisse.findMany({
      orderBy: [{ jour: "desc" }, { id: "desc" }],
      skip: (page - 1) * taille,
      take: taille,
      select: {
        id: true,
        jour: true,
        creeLe: true,
        fondDeCaisse: true,
        totalAttendu: true,
        totalCompte: true,
        ecart: true,
        utilisateur: { select: { prenom: true, nom: true } },
      },
    }),
    prisma.clotureCaisse.count(),
  ]);
  return {
    clotures: clotures.map((cloture) => {
      const jour = cloture.jour.toISOString().slice(0, 10);
      return { ...cloture, jour, reouvrable: jour === aujourdhui };
    }),
    total,
    page,
    taille,
  };
}

/**
 * Réouverture de la caisse du jour par la Direction (oubli d'un paiement, erreur de comptage…), avec un motif.
 * La clôture est retirée et les paiements redeviennent libres : ils seront figés par la prochaine clôture.
 * Le journal garde le comptage retiré, qui l'avait fait, et le motif.
 * @throws 400 REOUVERTURE_JOUR_COURANT ; 404 CLOTURE_INTROUVABLE
 */
export async function rouvrirLaJournee(jour: string, motif: string, utilisateurId: number) {
  if (jour !== lireJourCourant()) throw new ErreurHttp(400, "REOUVERTURE_JOUR_COURANT");
  return prisma.$transaction(async (tx) => {
    const cloture = await tx.clotureCaisse.findUnique({ where: { jour: jourEnDate(jour) } });
    if (!cloture) throw new ErreurHttp(404, "CLOTURE_INTROUVABLE");

    const { count } = await tx.paiement.updateMany({ where: { clotureId: cloture.id }, data: { clotureId: null } });
    await tx.clotureCaisse.delete({ where: { id: cloture.id } });

    await enregistrerAudit(tx, {
      utilisateurId,
      action: "REOUVERTURE_CAISSE",
      entite: "cloture_caisse",
      entiteId: cloture.id,
      detail: {
        jour,
        motif,
        clotureePar: cloture.utilisateurId,
        fondDeCaisse: cloture.fondDeCaisse,
        totalAttendu: cloture.totalAttendu,
        totalCompte: cloture.totalCompte,
        ecart: cloture.ecart,
        paiements: count,
      },
    });
  }, OPTIONS_TRANSACTION);
}
