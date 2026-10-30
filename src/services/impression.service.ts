import { prisma } from "../config/prisma.js";
import { StatutFacture, TypeLigneFacture } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireActes } from "./consultations.service.js";
import { journaliserAcces } from "./journal.service.js";
import { calculerStocks } from "./medicaments.service.js";
import { prochainRendezVousDuPatient } from "./rendezVous.service.js";

// Coordonnées du centre, reprises sur tous les documents imprimés.
export const CABINET = {
  nom: "Centre Médical MIAHY",
  adresse: "Andohanimandroseza",
  ville: "Antananarivo",
};

// Papier remis au patient après la consultation : consultation signée, ordonnance s'il y en a une,
// prochain rendez-vous. Sans consultation signée ni ordonnance, il n'y a rien à imprimer.
export async function obtenirDonneesOrdonnance(passageId: number, utilisateurId: number) {
  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: {
      id: true,
      motif: true,
      praticien: { select: { civilite: true, nom: true, prenom: true, role: true } },
      patient: {
        select: { id: true, numeroDossier: true, nom: true, prenom: true, sexe: true, dateNaissance: true, allergies: true },
      },
      consultation: {
        select: {
          signeeLe: true,
          tension: true,
          poidsKg: true,
          pouls: true,
          temperature: true,
          spo2: true,
          glycemie: true,
          examen: true,
          diagnostic: true,
          brouillon: true,
        },
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
              libelle: true,
              medicament: { select: { nom: true, forme: true } },
            },
          },
        },
      },
    },
  });
  if (!passage) throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");
  const consultation = passage.consultation?.signeeLe ? passage.consultation : null;
  if (!passage.ordonnance && !consultation) throw new ErreurHttp(404, "ORDONNANCE_INTROUVABLE");

  const [prochainRendezVous, actes] = await Promise.all([
    prochainRendezVousDuPatient(passage.patient.id),
    consultation
      ? prisma.service.findMany({ where: { id: { in: lireActes(consultation.brouillon) } }, orderBy: { id: "asc" }, select: { nom: true } })
      : [],
  ]);
  // Trace de la lecture des données médicales, comme à l'ouverture de la consultation.
  if (consultation) await journaliserAcces(utilisateurId, "LECTURE_CONSULTATION", "passage", passageId);

  return {
    cabinet: CABINET,
    date: consultation?.signeeLe ?? passage.ordonnance?.creeLe,
    numero: `ORD-${passage.id}`,
    patient: passage.patient,
    prescripteur: passage.ordonnance?.prescripteur ?? passage.praticien,
    consultation: consultation && {
      motif: passage.motif,
      tension: consultation.tension,
      poidsKg: consultation.poidsKg,
      pouls: consultation.pouls,
      temperature: consultation.temperature,
      spo2: consultation.spo2,
      glycemie: consultation.glycemie,
      examen: consultation.examen,
      diagnostic: consultation.diagnostic,
      actes: actes.map((acte) => acte.nom),
    },
    prochainRendezVous,
    // Médicament hors stock : le nom saisi par le praticien, sans forme.
    lignes: (passage.ordonnance?.lignes ?? []).map(({ libelle, medicament, ...ligne }) => ({
      ...ligne,
      doseParPrise: Number(ligne.doseParPrise),
      medicament: medicament ?? { nom: libelle ?? "", forme: "" },
      horsStock: medicament === null,
    })),
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
          // Le bon de délivrance ne contient que les médicaments du stock du centre.
          lignes: {
            where: { medicamentId: { not: null } },
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

  const lignesDuStock = (passage.ordonnance?.lignes ?? []).flatMap(({ medicament, ...ligne }) =>
    medicament ? [{ ...ligne, medicament }] : [],
  );
  const medicamentIds = lignesDuStock.map((ligne) => ligne.medicament.id);
  const stocks = await calculerStocks(prisma, medicamentIds);

  const horsOrdonnance = passage.factures.flatMap((facture) => facture.lignes);

  return {
    cabinet: CABINET,
    numero: `BDL-${passage.id}`,
    date: passage.heureArrivee,
    motif: passage.motif,
    patient: passage.patient,
    lignes: lignesDuStock.map((ligne) => ({
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
