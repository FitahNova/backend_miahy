import { prisma } from "../config/prisma.js";
import { StatutFacture, TypeLigneFacture } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { calculerStocks } from "./medicaments.service.js";

// Coordonnées du centre, reprises sur tous les documents imprimés.
export const CABINET = {
  nom: "Centre Médical MIAHY",
  adresse: "Andohanimandroseza",
  ville: "Antananarivo",
};

// Ordonnance signée : patient, allergies, prescripteur, lignes de prescription.
export async function obtenirDonneesOrdonnance(passageId: number) {
  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: {
      id: true,
      patient: {
        select: { numeroDossier: true, nom: true, prenom: true, sexe: true, dateNaissance: true, allergies: true },
      },
      ordonnance: {
        select: {
          creeLe: true,
          prescripteur: { select: { civilite: true, nom: true, prenom: true, role: true } },
          lignes: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              doseParPrise: true,
              prisesParJour: true,
              dureeJours: true,
              quantitePrescrite: true,
              instruction: true,
              medicament: { select: { nom: true, forme: true } },
            },
          },
        },
      },
    },
  });
  if (!passage) throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");
  if (!passage.ordonnance) throw new ErreurHttp(404, "ORDONNANCE_INTROUVABLE");

  return {
    cabinet: CABINET,
    date: passage.ordonnance.creeLe,
    numero: `ORD-${passage.id}`,
    patient: passage.patient,
    prescripteur: passage.ordonnance.prescripteur,
    lignes: passage.ordonnance.lignes.map((ligne) => ({ ...ligne, doseParPrise: Number(ligne.doseParPrise) })),
  };
}

// Bon de délivrance pour la pharmacie : ce qui est prescrit, ce qui reste, le stock, et les ajouts au comptoir.
export async function obtenirBonDeDelivrance(passageId: number) {
  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: {
      id: true,
      statut: true,
      motif: true,
      heureArrivee: true,
      patient: { select: { numeroDossier: true, nom: true, prenom: true } },
      ordonnance: {
        select: {
          lignes: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              quantitePrescrite: true,
              quantiteDelivree: true,
              instruction: true,
              medicament: { select: { id: true, nom: true, forme: true } },
            },
          },
        },
      },
      factures: {
        where: { statut: { not: StatutFacture.ANNULEE } },
        orderBy: { id: "asc" },
        select: {
          lignes: {
            // Ajouts hors ordonnance seulement : les lignes prescrites figurent déjà via l'ordonnance.
            where: { type: TypeLigneFacture.MEDICAMENT, ligneOrdonnanceId: null },
            orderBy: { id: "asc" },
            select: { id: true, libelle: true, quantite: true },
          },
        },
      },
    },
  });
  if (!passage) throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");

  const medicamentIds = passage.ordonnance?.lignes.map((ligne) => ligne.medicament.id) ?? [];
  const stocks = await calculerStocks(prisma, medicamentIds);

  const horsOrdonnance = passage.factures.flatMap((facture) => facture.lignes);

  return {
    cabinet: CABINET,
    numero: `BDL-${passage.id}`,
    date: passage.heureArrivee,
    motif: passage.motif,
    patient: passage.patient,
    lignes: (passage.ordonnance?.lignes ?? []).map((ligne) => ({
      id: ligne.id,
      medicament: ligne.medicament,
      quantitePrescrite: ligne.quantitePrescrite,
      quantiteDelivree: ligne.quantiteDelivree,
      resteADelivrer: ligne.quantitePrescrite - ligne.quantiteDelivree,
      stockDisponible: stocks.get(ligne.medicament.id) ?? 0,
      instruction: ligne.instruction,
    })),
    horsOrdonnance,
  };
}

// Inventaire des médicaments actifs : stock, valeur à l'achat et à la vente, marge.
export async function obtenirInventaire() {
  const medicaments = await prisma.medicament.findMany({
    where: { actif: true },
    orderBy: { nom: "asc" },
    select: {
      id: true,
      nom: true,
      forme: true,
      prixAchat: true,
      prixVente: true,
      seuilAlerte: true,
      categorie: { select: { nom: true } },
    },
  });

  const stocks = await calculerStocks(
    prisma,
    medicaments.map((medicament) => medicament.id),
  );

  const lignes = medicaments.map((medicament) => {
    const stock = stocks.get(medicament.id) ?? 0;
    const marge = medicament.prixAchat > 0 ? Math.round(((medicament.prixVente - medicament.prixAchat) / medicament.prixAchat) * 100) : 0;
    return {
      id: medicament.id,
      nom: medicament.nom,
      forme: medicament.forme,
      categorie: medicament.categorie.nom,
      stock,
      seuilAlerte: medicament.seuilAlerte,
      prixAchat: medicament.prixAchat,
      prixVente: medicament.prixVente,
      marge,
      valeurAchat: stock * medicament.prixAchat,
      valeurVente: stock * medicament.prixVente,
    };
  });

  const totaux = {
    produits: lignes.length,
    ruptures: lignes.filter((ligne) => ligne.stock <= 0).length,
    valeurAchat: lignes.reduce((somme, ligne) => somme + ligne.valeurAchat, 0),
    valeurVente: lignes.reduce((somme, ligne) => somme + ligne.valeurVente, 0),
  };

  return { cabinet: CABINET, date: new Date(), lignes, totaux };
}
