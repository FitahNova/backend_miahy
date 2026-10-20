import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { StatutFacture, StatutPassage, TypeLigneFacture, TypeMouvement } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import {
  calculerNetAPayer,
  calculerResteDu,
  creerFactureComplementaire,
  recalculerStatutsDuPassage,
} from "./facturation.service.js";
import { calculerStocks, verrouillerMedicaments } from "./medicaments.service.js";

/** Passages servis au comptoir : à préparer, à encaisser, ou partiellement payés. */
const STATUTS_PASSAGE_AU_COMPTOIR: StatutPassage[] = [StatutPassage.PHARMACIE, StatutPassage.CAISSE, StatutPassage.PARTIEL];
const STATUTS_FACTURE_OUVERTE: StatutFacture[] = [StatutFacture.PHARMACIE, StatutFacture.A_PAYER, StatutFacture.PARTIEL];

// Types (et non interfaces) : ils sont enregistrés tels quels dans le journal (JSON).
export type LigneADelivrer = {
  ligneOrdonnanceId: number;
  quantite: number;
};

export type AjoutHorsOrdonnance = {
  medicamentId: number;
  quantite: number;
};

/** Une ligne de facture est retirable si elle est hors ordonnance et que sa facture n'a reçu aucun paiement. */
function estRetirable(
  ligne: { type: TypeLigneFacture; ligneOrdonnanceId: number | null },
  facture: { statut: StatutFacture; montantPaye: number },
): boolean {
  return (
    ligne.type === TypeLigneFacture.MEDICAMENT &&
    ligne.ligneOrdonnanceId === null &&
    (facture.statut === StatutFacture.PHARMACIE || facture.statut === StatutFacture.A_PAYER) &&
    facture.montantPaye === 0
  );
}

// ---------- Liste « À servir » ----------

/**
 * Patients à servir au comptoir, dans l'ordre d'arrivée : reste à délivrer de l'ordonnance (sans posologie),
 * stock disponible, et factures ouvertes avec leurs lignes et montants.
 */
export async function listerPassagesAuComptoir() {
  const passages = await prisma.passage.findMany({
    where: { statut: { in: STATUTS_PASSAGE_AU_COMPTOIR } },
    orderBy: { heureArrivee: "asc" },
    select: {
      id: true,
      statut: true,
      heureArrivee: true,
      patient: { select: { id: true, numeroDossier: true, nom: true, prenom: true } },
      ordonnance: {
        select: {
          lignes: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              quantitePrescrite: true,
              quantiteDelivree: true,
              medicament: { select: { id: true, nom: true, forme: true, prixVente: true } },
            },
          },
        },
      },
      factures: {
        where: { statut: { in: STATUTS_FACTURE_OUVERTE } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          numero: true,
          statut: true,
          total: true,
          partPatient: true,
          remise: true,
          montantPaye: true,
          lignes: {
            orderBy: { id: "asc" },
            select: { id: true, type: true, libelle: true, quantite: true, prixUnitaire: true, ligneOrdonnanceId: true },
          },
        },
      },
    },
  });

  const medicamentIds = [
    ...new Set(passages.flatMap((passage) => passage.ordonnance?.lignes.map((ligne) => ligne.medicament.id) ?? [])),
  ];
  const stocks = await calculerStocks(prisma, medicamentIds);

  return passages.map(({ ordonnance, factures, ...passage }) => ({
    ...passage,
    // Seulement ce qui reste à délivrer : la secrétaire ne lit pas l'ordonnance complète.
    aDelivrer: (ordonnance?.lignes ?? [])
      .filter((ligne) => ligne.quantitePrescrite > ligne.quantiteDelivree)
      .map((ligne) => ({
        ligneOrdonnanceId: ligne.id,
        medicament: ligne.medicament,
        resteADelivrer: ligne.quantitePrescrite - ligne.quantiteDelivree,
        dejaDelivre: ligne.quantiteDelivree,
        stockDisponible: stocks.get(ligne.medicament.id) ?? 0,
      })),
    factures: factures.map((facture) => ({
      ...facture,
      netAPayer: calculerNetAPayer(facture),
      resteDu: calculerResteDu(facture),
      lignes: facture.lignes.map((ligne) => ({ ...ligne, retirable: estRetirable(ligne, facture) })),
    })),
  }));
}

// ---------- Délivrance (ordonnance et/ou ajouts) ----------

async function verrouillerPassageAuComptoir(tx: Prisma.TransactionClient, passageId: number) {
  // Verrou du passage : deux postes ne délivrent pas la même ordonnance en même temps.
  await tx.$queryRaw`SELECT id FROM passage WHERE id = ${passageId} FOR UPDATE`;
  const passage = await tx.passage.findUnique({
    where: { id: passageId },
    select: { id: true, statut: true, patientId: true },
  });
  if (!passage) throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");
  if (!STATUTS_PASSAGE_AU_COMPTOIR.includes(passage.statut)) throw new ErreurHttp(409, "PASSAGE_NON_SERVI");
  return passage;
}

/**
 * Facture qui reçoit les médicaments délivrés : celle en préparation, sinon une facture à payer
 * sans paiement, sinon une nouvelle facture complémentaire (décision du 13/10/2026).
 */
async function choisirFactureCible(tx: Prisma.TransactionClient, passage: { id: number; patientId: number }) {
  const candidates = await tx.facture.findMany({
    where: { passageId: passage.id, statut: { in: [StatutFacture.PHARMACIE, StatutFacture.A_PAYER] }, montantPaye: 0 },
    orderBy: { id: "asc" },
    select: { id: true, numero: true, statut: true },
  });
  const cible = candidates.find((facture) => facture.statut === StatutFacture.PHARMACIE) ?? candidates[0];
  if (cible) return { ...cible, complementaire: false };
  const nouvelle = await creerFactureComplementaire(tx, { passageId: passage.id, patientId: passage.patientId });
  return { id: nouvelle.id, numero: nouvelle.numero, statut: nouvelle.statut, complementaire: true };
}

/**
 * Délivre, en une seule transaction, les quantités choisies de l'ordonnance (partielle possible)
 * et les ajouts hors ordonnance. Les lignes de facture sont créées au prix de vente du jour (copié),
 * chaque sortie de stock est reliée à sa ligne de facture (écriture inverse exacte en cas de retrait).
 * Une délivrance « vide » est permise : le patient refuse les médicaments, la facture passe à payer.
 * @throws 404 PASSAGE_INTROUVABLE, 409 PASSAGE_NON_SERVI, 400 LIGNE_ORDONNANCE_INVALIDE,
 *         400 QUANTITE_SUPERIEURE_AU_RESTE, 404 MEDICAMENT_INTROUVABLE, 409 STOCK_INSUFFISANT
 */
export async function delivrerAuComptoir(
  passageId: number,
  donnees: { lignes: LigneADelivrer[]; ajouts: AjoutHorsOrdonnance[] },
  utilisateurId: number,
) {
  return prisma.$transaction(async (tx) => {
    const passage = await verrouillerPassageAuComptoir(tx, passageId);

    const lignesOrdonnance = await tx.ligneOrdonnance.findMany({
      where: { ordonnance: { passageId } },
      select: {
        id: true,
        medicamentId: true,
        quantitePrescrite: true,
        quantiteDelivree: true,
        medicament: { select: { nom: true, prixAchat: true, prixVente: true } },
      },
    });
    const lignesParId = new Map(lignesOrdonnance.map((ligne) => [ligne.id, ligne]));

    const lignesRetenues = donnees.lignes.filter((ligne) => ligne.quantite > 0);
    for (const demande of lignesRetenues) {
      const ligne = lignesParId.get(demande.ligneOrdonnanceId);
      if (!ligne) throw new ErreurHttp(400, "LIGNE_ORDONNANCE_INVALIDE");
      const reste = ligne.quantitePrescrite - ligne.quantiteDelivree;
      if (demande.quantite > reste) {
        throw new ErreurHttp(400, "QUANTITE_SUPERIEURE_AU_RESTE", { medicament: ligne.medicament.nom, reste });
      }
    }

    const medicamentsAjoutes = await tx.medicament.findMany({
      where: { id: { in: donnees.ajouts.map((ajout) => ajout.medicamentId) }, actif: true },
      select: { id: true, nom: true, prixAchat: true, prixVente: true },
    });
    const ajoutsParId = new Map(medicamentsAjoutes.map((medicament) => [medicament.id, medicament]));
    for (const ajout of donnees.ajouts) {
      if (!ajoutsParId.has(ajout.medicamentId)) throw new ErreurHttp(404, "MEDICAMENT_INTROUVABLE");
    }

    // Besoin total par médicament (une même molécule peut être prescrite et ajoutée).
    const besoin = new Map<number, number>();
    const cumuler = (medicamentId: number, quantite: number) =>
      besoin.set(medicamentId, (besoin.get(medicamentId) ?? 0) + quantite);
    for (const demande of lignesRetenues) cumuler(lignesParId.get(demande.ligneOrdonnanceId)!.medicamentId, demande.quantite);
    for (const ajout of donnees.ajouts) cumuler(ajout.medicamentId, ajout.quantite);

    // Un seul verrou pour tous les médicaments, toujours dans le même ordre (pas d'interblocage).
    const medicamentIds = [...besoin.keys()].sort((a, b) => a - b);
    await verrouillerMedicaments(tx, medicamentIds);
    const stocks = await calculerStocks(tx, medicamentIds);
    for (const [medicamentId, quantite] of besoin) {
      const disponible = stocks.get(medicamentId) ?? 0;
      if (disponible < quantite) {
        const nom = medicamentsAjoutes.find((m) => m.id === medicamentId)?.nom
          ?? lignesOrdonnance.find((l) => l.medicamentId === medicamentId)?.medicament.nom;
        throw new ErreurHttp(409, "STOCK_INSUFFISANT", { medicament: nom ?? null, disponible });
      }
    }

    const facture = await choisirFactureCible(tx, passage);
    let montantAjoute = 0;

    const sortir = async (ligne: {
      medicamentId: number;
      libelle: string;
      quantite: number;
      prixVente: number;
      prixAchat: number | null;
      ligneOrdonnanceId: number | null;
    }) => {
      const ligneFacture = await tx.ligneFacture.create({
        data: {
          factureId: facture.id,
          type: TypeLigneFacture.MEDICAMENT,
          medicamentId: ligne.medicamentId,
          libelle: ligne.libelle,
          quantite: ligne.quantite,
          prixUnitaire: ligne.prixVente,
          ligneOrdonnanceId: ligne.ligneOrdonnanceId,
        },
      });
      await tx.mouvementStock.create({
        data: {
          medicamentId: ligne.medicamentId,
          type: TypeMouvement.SORTIE,
          quantite: -ligne.quantite,
          utilisateurId,
          ligneOrdonnanceId: ligne.ligneOrdonnanceId,
          ligneFactureId: ligneFacture.id,
          prixAchatUnitaire: ligne.prixAchat,
          motif: `Délivrance facture ${facture.numero}`,
        },
      });
      montantAjoute += ligne.quantite * ligne.prixVente;
    };

    for (const demande of lignesRetenues) {
      const ligne = lignesParId.get(demande.ligneOrdonnanceId)!;
      await sortir({
        medicamentId: ligne.medicamentId,
        libelle: ligne.medicament.nom,
        quantite: demande.quantite,
        prixVente: ligne.medicament.prixVente,
        prixAchat: ligne.medicament.prixAchat,
        ligneOrdonnanceId: ligne.id,
      });
      await tx.ligneOrdonnance.update({
        where: { id: ligne.id },
        data: { quantiteDelivree: { increment: demande.quantite } },
      });
    }
    for (const ajout of donnees.ajouts) {
      const medicament = ajoutsParId.get(ajout.medicamentId)!;
      await sortir({
        medicamentId: medicament.id,
        libelle: medicament.nom,
        quantite: ajout.quantite,
        prixVente: medicament.prixVente,
        prixAchat: medicament.prixAchat,
        ligneOrdonnanceId: null,
      });
    }

    // La préparation est terminée : la facture devient encaissable (son statut suit ses montants).
    await tx.facture.update({
      where: { id: facture.id },
      data: {
        total: { increment: montantAjoute },
        partPatient: { increment: montantAjoute },
        ...(facture.statut === StatutFacture.PHARMACIE ? { statut: StatutFacture.A_PAYER } : {}),
      },
    });
    await recalculerStatutsDuPassage(tx, passageId);

    const reliquat = await tx.ligneOrdonnance.findMany({
      where: { ordonnance: { passageId } },
      select: { quantitePrescrite: true, quantiteDelivree: true, medicament: { select: { nom: true } } },
    });

    await enregistrerAudit(tx, {
      utilisateurId,
      action: "DELIVRANCE",
      entite: "passage",
      entiteId: passageId,
      detail: {
        factureId: facture.id,
        factureComplementaire: facture.complementaire,
        lignesOrdonnance: lignesRetenues,
        ajouts: donnees.ajouts,
        montantAjoute,
      },
    });

    return {
      passageId,
      factureId: facture.id,
      factureNumero: facture.numero,
      factureComplementaire: facture.complementaire,
      montantAjoute,
      reliquat: reliquat
        .filter((ligne) => ligne.quantitePrescrite > ligne.quantiteDelivree)
        .map((ligne) => ({ medicament: ligne.medicament.nom, reste: ligne.quantitePrescrite - ligne.quantiteDelivree })),
    };
  }, OPTIONS_TRANSACTION);
}

// ---------- Retrait d'un ajout hors ordonnance ----------

/**
 * Retire une ligne hors ordonnance d'une facture non payée : mouvement RETOUR (le stock revient),
 * ligne supprimée de la facture, montants et statuts recalculés.
 * @throws 404 LIGNE_FACTURE_INTROUVABLE, 409 LIGNE_NON_RETIRABLE, 409 REMISE_SUPERIEURE_AU_MONTANT
 */
export async function retirerLigneHorsOrdonnance(ligneFactureId: number, utilisateurId: number) {
  return prisma.$transaction(async (tx) => {
    const reperage = await tx.ligneFacture.findUnique({ where: { id: ligneFactureId }, select: { factureId: true } });
    if (!reperage) throw new ErreurHttp(404, "LIGNE_FACTURE_INTROUVABLE");

    // Même ordre de verrous que le paiement (facture) : un encaissement simultané attend.
    await tx.$queryRaw`SELECT id FROM facture WHERE id = ${reperage.factureId} FOR UPDATE`;
    const ligne = await tx.ligneFacture.findUnique({
      where: { id: ligneFactureId },
      select: {
        id: true,
        type: true,
        libelle: true,
        quantite: true,
        prixUnitaire: true,
        medicamentId: true,
        ligneOrdonnanceId: true,
        facture: {
          select: { id: true, numero: true, statut: true, montantPaye: true, partPatient: true, remise: true, passageId: true },
        },
      },
    });
    if (!ligne || ligne.medicamentId === null) throw new ErreurHttp(404, "LIGNE_FACTURE_INTROUVABLE");
    if (!estRetirable(ligne, ligne.facture)) throw new ErreurHttp(409, "LIGNE_NON_RETIRABLE");

    const montant = ligne.quantite * ligne.prixUnitaire;
    if (ligne.facture.partPatient - montant < ligne.facture.remise) {
      throw new ErreurHttp(409, "REMISE_SUPERIEURE_AU_MONTANT", { remise: ligne.facture.remise });
    }

    await tx.mouvementStock.create({
      data: {
        medicamentId: ligne.medicamentId,
        type: TypeMouvement.RETOUR,
        quantite: ligne.quantite,
        utilisateurId,
        motif: `Retrait facture ${ligne.facture.numero} : ${ligne.libelle} × ${ligne.quantite}`,
      },
    });
    // Les mouvements gardent leur trace (motif + journal) ; seul le lien vers la ligne supprimée est levé.
    await tx.mouvementStock.updateMany({ where: { ligneFactureId: ligne.id }, data: { ligneFactureId: null } });
    await tx.ligneFacture.delete({ where: { id: ligne.id } });
    await tx.facture.update({
      where: { id: ligne.facture.id },
      data: { total: { decrement: montant }, partPatient: { decrement: montant } },
    });
    await recalculerStatutsDuPassage(tx, ligne.facture.passageId);

    await enregistrerAudit(tx, {
      utilisateurId,
      action: "RETRAIT_MEDICAMENT_PHARMACIE",
      entite: "facture",
      entiteId: ligne.facture.id,
      detail: { libelle: ligne.libelle, quantite: ligne.quantite, montant },
    });

    return { factureId: ligne.facture.id, passageId: ligne.facture.passageId, montantRetire: montant };
  }, OPTIONS_TRANSACTION);
}
