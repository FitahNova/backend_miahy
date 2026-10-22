import { PREFIXE_NUMERO_FACTURE } from "../config/constants.js";
import { prisma } from "../config/prisma.js";
import { StatutFacture, StatutPassage, TypeLigneFacture, TypeMouvement } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";

const NOM_SERVICE_CONSULTATION = "Consultation";
const NOMBRE_CHIFFRES_NUMERO_FACTURE = 4; // R-0001
const CLE_VERROU_NUMEROTATION_FACTURE = 4101;

export interface ActeFacture {
  serviceId: number;
  quantite: number;
}

async function calculerProchainNumeroFacture(client: Prisma.TransactionClient): Promise<string> {
  // Verrou valable jusqu'à la fin de la transaction : deux factures ne peuvent pas prendre le même numéro
  await client.$executeRaw`SELECT pg_advisory_xact_lock(${CLE_VERROU_NUMEROTATION_FACTURE}::bigint)`;

  const derniereFacture = await client.facture.findFirst({
    orderBy: { id: "desc" },
    select: { numero: true },
  });
  const dernierNumero = derniereFacture
    ? Number.parseInt(derniereFacture.numero.slice(PREFIXE_NUMERO_FACTURE.length), 10)
    : 0;

  return `${PREFIXE_NUMERO_FACTURE}${String(dernierNumero + 1).padStart(NOMBRE_CHIFFRES_NUMERO_FACTURE, "0")}`;
}

async function lireActeConsultationParDefaut(client: Prisma.TransactionClient): Promise<ActeFacture> {
  // Comparaison souple : le libellé a pu être retouché dans les paramètres (« Consultations »).
  const service = await client.service.findFirst({
    where: { nom: { startsWith: NOM_SERVICE_CONSULTATION, mode: "insensitive" }, actif: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!service) {
    throw new ErreurHttp(500, "SERVICE_CONSULTATION_ABSENT");
  }
  return { serviceId: service.id, quantite: 1 };
}

/**
 * Crée la facture d'un passage à la signature de la consultation (R079).
 * Statut PHARMACIE si une ordonnance doit être préparée, sinon directement À PAYER.
 * À appeler dans une transaction.
 */
export async function creerFacturePourPassage(
  client: Prisma.TransactionClient,
  donnees: { passageId: number; patientId: number; actes?: ActeFacture[]; avecOrdonnance: boolean },
) {
  const actes = donnees.actes && donnees.actes.length > 0
    ? donnees.actes
    : [await lireActeConsultationParDefaut(client)];

  const identifiantsServices = [...new Set(actes.map((acte) => acte.serviceId))];
  const services = await client.service.findMany({ where: { id: { in: identifiantsServices } } });
  const servicesParIdentifiant = new Map(services.map((service) => [service.id, service]));

  const lignes = actes.map((acte) => {
    const service = servicesParIdentifiant.get(acte.serviceId);
    if (!service || !service.actif) {
      throw new ErreurHttp(400, "SERVICE_INACTIF", { serviceId: acte.serviceId });
    }
    if (service.prix === null) {
      throw new ErreurHttp(409, "PRIX_SERVICE_A_FIXER", { service: service.nom });
    }
    return {
      type: TypeLigneFacture.ACTE,
      serviceId: service.id,
      libelle: service.nom,
      quantite: acte.quantite,
      prixUnitaire: service.prix,
    };
  });

  const total = lignes.reduce((somme, ligne) => somme + ligne.quantite * ligne.prixUnitaire, 0);
  const numero = await calculerProchainNumeroFacture(client);

  return client.facture.create({
    data: {
      numero,
      passageId: donnees.passageId,
      patientId: donnees.patientId,
      total,
      partPartenaire: 0,
      partPatient: total,
      statut: donnees.avecOrdonnance ? StatutFacture.PHARMACIE : StatutFacture.A_PAYER,
      lignes: { create: lignes },
    },
  });
}

/**
 * Ouvre une facture complémentaire sur un passage (ajout après un paiement partiel, décision du 13/10/2026).
 * La facture naît vide, à payer ; les lignes s'ajoutent ensuite. À appeler dans une transaction.
 */
export async function creerFactureComplementaire(
  client: Prisma.TransactionClient,
  donnees: { passageId: number; patientId: number },
) {
  const numero = await calculerProchainNumeroFacture(client);
  return client.facture.create({
    data: {
      numero,
      passageId: donnees.passageId,
      patientId: donnees.patientId,
      total: 0,
      partPartenaire: 0,
      partPatient: 0,
      statut: StatutFacture.A_PAYER,
    },
  });
}

// ---------- Calculs de montants (seule source du projet) ----------

/** Net à payer par le patient : part patient moins la remise (R086). */
export function calculerNetAPayer(facture: { partPatient: number; remise: number }): number {
  return facture.partPatient - facture.remise;
}

/** Reste dû : net à payer moins ce qui a déjà été payé (R100). */
export function calculerResteDu(facture: { partPatient: number; remise: number; montantPaye: number }): number {
  return calculerNetAPayer(facture) - facture.montantPaye;
}

function avecMontants<T extends { partPatient: number; remise: number; montantPaye: number }>(facture: T) {
  return { ...facture, netAPayer: calculerNetAPayer(facture), resteDu: calculerResteDu(facture) };
}

// ---------- Statuts (seule règle du projet) ----------

/**
 * Statut d'une facture déjà préparée, déduit de ses montants :
 * soldée → PAYE ; entamée → PARTIEL ; sinon À PAYER.
 * Une facture vide (toutes ses lignes retirées) n'a plus d'objet : elle est annulée.
 */
function statutSelonMontants(facture: {
  partPatient: number;
  remise: number;
  montantPaye: number;
  nombreLignes: number;
}): StatutFacture {
  if (facture.nombreLignes === 0 && facture.montantPaye === 0) return StatutFacture.ANNULEE;
  if (calculerResteDu(facture) <= 0) return StatutFacture.PAYE;
  return facture.montantPaye > 0 ? StatutFacture.PARTIEL : StatutFacture.A_PAYER;
}

// Statuts de passage gérés par la pharmacie et la caisse (après la signature de la consultation).
const STATUTS_PASSAGE_APRES_CONSULTATION: StatutPassage[] = [
  StatutPassage.PHARMACIE,
  StatutPassage.CAISSE,
  StatutPassage.PARTIEL,
];

/**
 * Recalcule le statut des factures ouvertes d'un passage, puis celui du passage :
 * - une facture en préparation (PHARMACIE) → passage PHARMACIE ;
 * - sinon une facture à encaisser → passage PARTIEL si l'une est entamée, CAISSE sinon ;
 * - sinon → TERMINE (heure de fin posée).
 * Hypothèse provisoire : PARTIEL reste distinct de TERMINE (le patient doit encore de l'argent).
 * À appeler dans la transaction de chaque opération qui change une facture (délivrance, retrait,
 * paiement, annulation) : la règle n'existe qu'ici.
 */
export async function recalculerStatutsDuPassage(client: Prisma.TransactionClient, passageId: number) {
  const factures = await client.facture.findMany({
    where: { passageId, statut: { in: [StatutFacture.A_PAYER, StatutFacture.PARTIEL, StatutFacture.PHARMACIE] } },
    select: {
      id: true,
      statut: true,
      partPatient: true,
      remise: true,
      montantPaye: true,
      _count: { select: { lignes: true } },
    },
  });

  const ouvertes: StatutFacture[] = [];
  for (const facture of factures) {
    if (facture.statut === StatutFacture.PHARMACIE) {
      ouvertes.push(facture.statut);
      continue;
    }
    const statut = statutSelonMontants({ ...facture, nombreLignes: facture._count.lignes });
    if (statut !== facture.statut) {
      await client.facture.update({
        where: { id: facture.id },
        data: {
          statut,
          ...(statut === StatutFacture.ANNULEE ? { annuleeLe: new Date(), motifAnnulation: "Facture vide" } : {}),
        },
      });
    }
    if (statut === StatutFacture.A_PAYER || statut === StatutFacture.PARTIEL) ouvertes.push(statut);
  }

  const statutPassage = ouvertes.includes(StatutFacture.PHARMACIE)
    ? StatutPassage.PHARMACIE
    : ouvertes.includes(StatutFacture.PARTIEL)
      ? StatutPassage.PARTIEL
      : ouvertes.length > 0
        ? StatutPassage.CAISSE
        : StatutPassage.TERMINE;

  await client.passage.updateMany({
    where: { id: passageId, statut: { in: STATUTS_PASSAGE_APRES_CONSULTATION, not: statutPassage } },
    data: { statut: statutPassage, ...(statutPassage === StatutPassage.TERMINE ? { heureFin: new Date() } : {}) },
  });
}

// ---------- Consultation des factures (historique, détail) ----------

const DECALAGE_FUSEAU = "+03:00"; // Madagascar : UTC+3 toute l'année
const MILLISECONDES_PAR_JOUR = 24 * 60 * 60 * 1000;

/** Nombre maximal de factures renvoyées par page (protège le serveur et l'affichage). */
export const TAILLE_PAGE_MAXIMALE = 100;

export interface FiltresFactures {
  statut?: StatutFacture;
  /** Jours AAAA-MM-JJ inclus, dans le fuseau du centre. */
  du?: string;
  au?: string;
  /** Nom, prénom, N° de dossier du patient ou numéro de facture. */
  recherche?: string;
  page: number;
  taille: number;
}

function debutDuJour(jour: string): Date {
  return new Date(`${jour}T00:00:00${DECALAGE_FUSEAU}`);
}

function construireFiltre(filtres: FiltresFactures): Prisma.FactureWhereInput {
  const terme = filtres.recherche?.trim();
  const contient = (valeur: string) => ({ contains: valeur, mode: "insensitive" as const });
  const periode: Prisma.DateTimeFilter = {};
  if (filtres.du) periode.gte = debutDuJour(filtres.du);
  if (filtres.au) periode.lt = new Date(debutDuJour(filtres.au).getTime() + MILLISECONDES_PAR_JOUR);

  return {
    ...(filtres.statut ? { statut: filtres.statut } : {}),
    ...(filtres.du || filtres.au ? { creeLe: periode } : {}),
    ...(terme
      ? {
          OR: [
            { numero: contient(terme) },
            { patient: { nom: contient(terme) } },
            { patient: { prenom: contient(terme) } },
            { patient: { numeroDossier: contient(terme) } },
          ],
        }
      : {}),
  };
}

const SELECTION_RESUME = {
  id: true,
  numero: true,
  statut: true,
  creeLe: true,
  total: true,
  partPatient: true,
  remise: true,
  montantPaye: true,
  passageId: true,
  patient: { select: { id: true, numeroDossier: true, nom: true, prenom: true } },
} satisfies Prisma.FactureSelect;

/** Historique paginé des factures, les plus récentes d'abord. */
export async function listerFactures(filtres: FiltresFactures) {
  const where = construireFiltre(filtres);
  const [factures, total] = await prisma.$transaction([
    prisma.facture.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (filtres.page - 1) * filtres.taille,
      take: filtres.taille,
      select: SELECTION_RESUME,
    }),
    prisma.facture.count({ where }),
  ]);
  return { factures: factures.map(avecMontants), total, page: filtres.page, taille: filtres.taille };
}

/**
 * Détail d'une facture : lignes, paiements, annulation éventuelle.
 * @throws ErreurHttp 404 FACTURE_INTROUVABLE
 */
export async function obtenirFacture(factureId: number) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    select: {
      ...SELECTION_RESUME,
      annuleeLe: true,
      motifAnnulation: true,
      lignes: {
        orderBy: { id: "asc" },
        select: { id: true, type: true, libelle: true, quantite: true, prixUnitaire: true },
      },
      paiements: {
        orderBy: { date: "asc" },
        select: { id: true, montant: true, mode: true, reference: true, montantRecu: true, date: true },
      },
    },
  });
  if (!facture) throw new ErreurHttp(404, "FACTURE_INTROUVABLE");
  return avecMontants(facture);
}

// ---------- Annulation ----------

// Annulable seulement si rien n'a été payé : une facture encaissée ne se modifie plus.
const STATUTS_ANNULABLES: StatutFacture[] = [StatutFacture.PHARMACIE, StatutFacture.A_PAYER];

/**
 * Annule une facture non payée (Direction seule, contrôlé par la route).
 * Dans une seule transaction : verrou de la facture, retour en stock des médicaments facturés
 * (mouvement RETOUR, jamais de suppression — R065), quantité délivrée de l'ordonnance remise à jour,
 * statut ANNULEE, puis statuts du passage recalculés (terminé s'il n'a plus aucune facture ouverte).
 * Hypothèse provisoire (à valider avec la Direction) : le patient repart sans payer, son passage est terminé.
 * @throws ErreurHttp 404 FACTURE_INTROUVABLE, 409 FACTURE_NON_ANNULABLE
 */
export async function annulerFacture(factureId: number, motif: string, auteurId: number) {
  return prisma.$transaction(async (tx) => {
    // Verrou : un encaissement simultané sur un autre poste attend la fin de l'annulation.
    await tx.$queryRaw`SELECT id FROM facture WHERE id = ${factureId} FOR UPDATE`;
    const facture = await tx.facture.findUnique({
      where: { id: factureId },
      select: {
        id: true,
        numero: true,
        statut: true,
        montantPaye: true,
        total: true,
        passageId: true,
        lignes: {
          where: { type: TypeLigneFacture.MEDICAMENT },
          select: { id: true, medicamentId: true, quantite: true, ligneOrdonnanceId: true },
        },
      },
    });
    if (!facture) throw new ErreurHttp(404, "FACTURE_INTROUVABLE");
    if (!STATUTS_ANNULABLES.includes(facture.statut) || facture.montantPaye > 0) {
      throw new ErreurHttp(409, "FACTURE_NON_ANNULABLE");
    }

    for (const ligne of facture.lignes) {
      if (ligne.medicamentId === null) continue;
      await tx.mouvementStock.create({
        data: {
          medicamentId: ligne.medicamentId,
          type: TypeMouvement.RETOUR,
          quantite: ligne.quantite, // retour en stock : quantité positive
          utilisateurId: auteurId,
          ligneFactureId: ligne.id,
          motif: `Annulation facture ${facture.numero}`,
        },
      });
      if (ligne.ligneOrdonnanceId !== null) {
        await tx.ligneOrdonnance.update({
          where: { id: ligne.ligneOrdonnanceId },
          data: { quantiteDelivree: { decrement: ligne.quantite } },
        });
      }
    }

    const annulee = await tx.facture.update({
      where: { id: factureId },
      data: { statut: StatutFacture.ANNULEE, annuleeLe: new Date(), motifAnnulation: motif },
    });

    await recalculerStatutsDuPassage(tx, facture.passageId);

    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "ANNULATION_FACTURE",
      entite: "facture",
      entiteId: factureId,
      detail: { numero: facture.numero, total: facture.total, motif, lignesRestituees: facture.lignes.length },
    });

    return { facture: annulee, stockRestitue: facture.lignes.length > 0 };
  }, OPTIONS_TRANSACTION);
}
