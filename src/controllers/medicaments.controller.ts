import type { Request, Response } from "express";
import { z } from "zod";
import {
  FORMES_MEDICAMENT,
  ajouterAuStock,
  ajusterStock,
  changerActifFournisseur,
  changerActifMedicament,
  creerCategorie,
  creerFournisseur,
  creerMedicament,
  creerMedicamentRapide,
  creerMedicamentsEnLot,
  enregistrerApprovisionnement,
  lireApprovisionnement,
  listerApprovisionnements,
  listerCategories,
  listerFournisseurs,
  listerInventaire,
  listerMedicaments,
  listerMouvementsDuMedicament,
  listerProduitsACommander,
  modifierMedicament,
  rechercherPourComptoir,
  rechercherPourPrescripteur,
  renommerCategorie,
  supprimerCategorie,
} from "../services/medicaments.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_TELEPHONE = /^[0-9+\s.-]{3,20}$/;

const schemaMedicament = z.object({
  nom: z.string().trim().min(1).max(150),
  forme: z.enum(FORMES_MEDICAMENT, { message: "Forme inconnue" }),
  categorieId: z.number().int().positive(),
  prixAchat: z.number().int().nonnegative(),
  prixVente: z.number().int().nonnegative(),
  seuilAlerte: z.number().int().nonnegative(),
  datePeremption: z.string().regex(DATE_ISO, "Date attendue : AAAA-MM-JJ").nullish(),
});

const schemaModification = schemaMedicament.partial().extend({ confirmationPrix: z.boolean().optional() });

const schemaActif = z.object({ actif: z.boolean() });

const schemaAjustement = z.object({
  quantite: z.number().int().refine((valeur) => valeur !== 0, "La quantité ne peut pas être nulle"),
  motif: z.string().trim().min(3, "Motif obligatoire (3 caractères minimum)").max(255),
});

const schemaCategorie = z.object({ nom: z.string().trim().min(2).max(80) });

const schemaFournisseur = z.object({
  nom: z.string().trim().min(2).max(150),
  telephone: z.string().trim().regex(REGEX_TELEPHONE, "Numéro invalide").nullish(),
});

const schemaLigneApprovisionnement = z.object({
  medicamentId: z.number().int().positive(),
  quantite: z.number().int().positive(),
  prixAchatUnitaire: z.number().int().nonnegative(),
});

// Accepte plusieurs lignes (lignes) ou une seule ligne à plat (medicamentId, quantite, prixAchatUnitaire).
const schemaApprovisionnement = z
  .object({
    fournisseurId: z.number().int().positive(),
    dateReception: z.string().regex(DATE_ISO, "Date attendue : AAAA-MM-JJ"),
    reference: z.string().trim().max(50).nullish(),
    lignes: z.array(schemaLigneApprovisionnement).min(1).max(50).optional(),
    medicamentId: z.number().int().positive().optional(),
    quantite: z.number().int().positive().optional(),
    prixAchatUnitaire: z.number().int().nonnegative().optional(),
  })
  .refine((donnees) => donnees.lignes !== undefined || donnees.medicamentId !== undefined, {
    message: "Au moins une ligne d'approvisionnement est requise",
  });

const schemaRecherche = z.object({ q: z.string().trim().min(2, "Saisir au moins 2 caractères") });

function lireAuteur(requete: Request): number {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  return Number(requete.utilisateur.id);
}

export async function obtenirMedicaments(_requete: Request, reponse: Response) {
  reponse.json(await listerMedicaments());
}

export async function obtenirMouvements(requete: Request, reponse: Response) {
  reponse.json({ mouvements: await listerMouvementsDuMedicament(lireIdentifiant(requete.params.id)) });
}

export async function ajouterMedicament(requete: Request, reponse: Response) {
  const medicament = await creerMedicament(schemaMedicament.parse(requete.body), lireAuteur(requete));
  reponse.status(201).json({ medicament });
}

const schemaAjoutStock = schemaMedicament.extend({ quantite: z.number().int().positive() });

/** POST /api/medicaments/ajout-stock : s'ajoute au médicament identique, sinon crée une nouvelle ligne. */
export async function ajouterEnStock(requete: Request, reponse: Response) {
  const resultat = await ajouterAuStock(schemaAjoutStock.parse(requete.body), lireAuteur(requete));
  diffuser(EVENEMENTS.STOCK_MODIFIE, { medicamentId: resultat.medicament.id });
  reponse.status(resultat.fusionne ? 200 : 201).json(resultat);
}

const schemaMedicamentRapide = schemaMedicament.pick({ nom: true, forme: true });

/** POST /api/medicaments/rapide : produit absent de la liste, créé depuis l'approvisionnement. */
export async function ajouterMedicamentRapide(requete: Request, reponse: Response) {
  const { nom, forme } = schemaMedicamentRapide.parse(requete.body);
  reponse.status(201).json({ medicament: await creerMedicamentRapide(nom, forme, lireAuteur(requete)) });
}

// Saisie en tableau : 50 médicaments au plus par envoi.
const schemaLot = z.object({ medicaments: z.array(schemaMedicament).min(1).max(50) });

/** POST /api/medicaments/lot : plusieurs médicaments en une fois, tout ou rien. */
export async function ajouterMedicamentsEnLot(requete: Request, reponse: Response) {
  const { medicaments } = schemaLot.parse(requete.body);
  const crees = await creerMedicamentsEnLot(medicaments, lireAuteur(requete));
  reponse.status(201).json({ medicaments: crees });
}

export async function mettreAJourMedicament(requete: Request, reponse: Response) {
  const donnees = schemaModification.parse(requete.body);
  const resultat = await modifierMedicament(lireIdentifiant(requete.params.id), donnees, lireAuteur(requete));
  reponse.json(resultat);
}

export async function changerActif(requete: Request, reponse: Response) {
  const { actif } = schemaActif.parse(requete.body);
  const medicament = await changerActifMedicament(lireIdentifiant(requete.params.id), actif, lireAuteur(requete));
  reponse.json({ medicament });
}

export async function ajusterStockMedicament(requete: Request, reponse: Response) {
  const { quantite, motif } = schemaAjustement.parse(requete.body);
  const medicamentId = lireIdentifiant(requete.params.id);
  const resultat = await ajusterStock(medicamentId, quantite, motif, lireAuteur(requete));
  diffuser(EVENEMENTS.STOCK_MODIFIE, { medicamentId });
  reponse.json(resultat);
}

export async function rechercherPrescripteur(requete: Request, reponse: Response) {
  const { q } = schemaRecherche.parse(requete.query);
  reponse.json({ medicaments: await rechercherPourPrescripteur(q) });
}

export async function rechercherComptoir(requete: Request, reponse: Response) {
  const { q } = schemaRecherche.parse(requete.query);
  reponse.json({ medicaments: await rechercherPourComptoir(q) });
}

export async function obtenirCategories(_requete: Request, reponse: Response) {
  reponse.json({ categories: await listerCategories() });
}

export async function ajouterCategorie(requete: Request, reponse: Response) {
  const { nom } = schemaCategorie.parse(requete.body);
  reponse.status(201).json({ categorie: await creerCategorie(nom, lireAuteur(requete)) });
}

export async function modifierCategorie(requete: Request, reponse: Response) {
  const { nom } = schemaCategorie.parse(requete.body);
  reponse.json({ categorie: await renommerCategorie(lireIdentifiant(requete.params.id), nom, lireAuteur(requete)) });
}

export async function retirerCategorie(requete: Request, reponse: Response) {
  reponse.json(await supprimerCategorie(lireIdentifiant(requete.params.id), lireAuteur(requete)));
}

export async function obtenirFournisseurs(_requete: Request, reponse: Response) {
  reponse.json({ fournisseurs: await listerFournisseurs() });
}

export async function ajouterFournisseur(requete: Request, reponse: Response) {
  const { nom, telephone } = schemaFournisseur.parse(requete.body);
  const fournisseur = await creerFournisseur(nom, telephone ? telephone.replace(/[\s.-]/g, "") : null, lireAuteur(requete));
  reponse.status(201).json({ fournisseur });
}

export async function modifierActifFournisseur(requete: Request, reponse: Response) {
  const { actif } = schemaActif.parse(requete.body);
  reponse.json({ fournisseur: await changerActifFournisseur(lireIdentifiant(requete.params.id), actif, lireAuteur(requete)) });
}

export async function obtenirApprovisionnements(_requete: Request, reponse: Response) {
  reponse.json({ approvisionnements: await listerApprovisionnements() });
}

/** GET /api/medicaments/approvisionnements/:id : bon de réception complet. */
export async function obtenirApprovisionnement(requete: Request, reponse: Response) {
  reponse.json({ approvisionnement: await lireApprovisionnement(lireIdentifiant(requete.params.id)) });
}

export async function ajouterApprovisionnement(requete: Request, reponse: Response) {
  const donnees = schemaApprovisionnement.parse(requete.body);
  const lignes = donnees.lignes ?? [
    {
      medicamentId: donnees.medicamentId as number,
      quantite: donnees.quantite as number,
      prixAchatUnitaire: donnees.prixAchatUnitaire as number,
    },
  ];
  const resultat = await enregistrerApprovisionnement(
    { fournisseurId: donnees.fournisseurId, dateReception: donnees.dateReception, reference: donnees.reference ?? null, lignes },
    lireAuteur(requete),
  );
  diffuser(EVENEMENTS.STOCK_MODIFIE, { approvisionnementId: resultat.approvisionnementId });
  reponse.status(201).json(resultat);
}

export async function obtenirProduitsACommander(_requete: Request, reponse: Response) {
  reponse.json({ produits: await listerProduitsACommander() });
}

export async function obtenirInventaire(_requete: Request, reponse: Response) {
  reponse.json({ lignes: await listerInventaire() });
}
