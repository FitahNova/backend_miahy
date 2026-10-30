import type { Request, Response } from "express";
import { z } from "zod";
import {
  calculerApercuCloture,
  calculerResteDuDuPatient,
  cloturerLaJournee,
  enregistrerNouveauPaiement,
  listerClotures,
  listerFacturesEnAttenteDePaiement,
  modifierRemiseFacture,
  obtenirRecuFacture,
  rouvrirLaJournee,
} from "../services/caisse.service.js";
import { COUPURES } from "../utils/comptageCaisse.js";
import { choisirConvention } from "../services/conventions.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";
import { TAILLE_PAGE, TAILLE_PAGE_MAXIMALE } from "../config/constants.js";

// R098 (décision du 13/10/2026) : espèces et Mobile Money ; pas de carte pour l'instant.
const MODES_PAIEMENT = ["ESPECES", "MOBILE_MONEY"] as const;

const schemaPaiement = z.object({
  montant: z.number().int().positive(),
  mode: z.enum(MODES_PAIEMENT),
  reference: z.string().trim().max(50).nullish(),
  montantRecu: z.number().int().positive().nullish(),
});

const schemaRemise = z.object({
  montant: z.number().int().nonnegative(),
});

// partenaireId : null = « sans convention » (le patient n'en bénéficie pas pour cette facture).
const schemaConvention = z.object({ partenaireId: z.number().int().positive().nullable() }).strict();

const schemaJour = z.iso.date();

const schemaCloture = z.object({
  jour: schemaJour,
  fondDeCaisse: z.number().int().nonnegative(),
  coupures: z.array(z.object({
    valeur: z.number().int().positive(),
    quantite: z.number().int().nonnegative(),
  })).length(COUPURES.length),
  commentaire: z.string().trim().nullish(),
});

const schemaPage = z.object({
  page: z.coerce.number().int().min(1).default(1),
  taille: z.coerce.number().int().min(1).max(TAILLE_PAGE_MAXIMALE).default(TAILLE_PAGE),
});

// Réouverture : motif et mot de passe de la Direction (confirmation de l'action).
const schemaReouverture = z.object({ motif: z.string().trim().min(5).max(255), motDePasse: z.string().min(1).max(200) }).strict();

function lireUtilisateurId(requete: Request): number {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return Number(requete.utilisateur.id);
}

export async function listerFacturesAEncaisser(_requete: Request, reponse: Response) {
  const factures = await listerFacturesEnAttenteDePaiement();
  reponse.json({ factures });
}

export async function enregistrerPaiement(requete: Request, reponse: Response) {
  const donnees = schemaPaiement.parse(requete.body);
  const resultat = await enregistrerNouveauPaiement(
    lireIdentifiant(requete.params.factureId),
    donnees,
    lireUtilisateurId(requete),
  );
  diffuser([EVENEMENTS.FILE_MODIFIEE, EVENEMENTS.CAISSE_MODIFIEE], { factureId: resultat.facture.id });
  reponse.status(201).json(resultat);
}

// R089 : la secrétaire choisit la convention (ou aucune) avant le premier paiement.
export async function choisirConventionFacture(requete: Request, reponse: Response) {
  const { partenaireId } = schemaConvention.parse(requete.body);
  const facture = await choisirConvention(lireIdentifiant(requete.params.factureId), partenaireId, lireUtilisateurId(requete));
  diffuser([EVENEMENTS.FILE_MODIFIEE, EVENEMENTS.CAISSE_MODIFIEE], { factureId: facture.id });
  reponse.json({ facture });
}

export async function modifierRemise(requete: Request, reponse: Response) {
  const { montant } = schemaRemise.parse(requete.body);
  const resultat = await modifierRemiseFacture(lireIdentifiant(requete.params.factureId), montant, lireUtilisateurId(requete));
  diffuser(EVENEMENTS.CAISSE_MODIFIEE, { factureId: resultat.facture.id });
  reponse.json(resultat);
}

export async function obtenirRecu(requete: Request, reponse: Response) {
  const recu = await obtenirRecuFacture(lireIdentifiant(requete.params.factureId));
  reponse.json(recu);
}

export async function calculerResteDuPatient(requete: Request, reponse: Response) {
  const resultat = await calculerResteDuDuPatient(lireIdentifiant(requete.params.patientId));
  reponse.json(resultat);
}

export async function calculerCloture(requete: Request, reponse: Response) {
  const jour = schemaJour.parse(requete.params.jour);
  const cloture = await calculerApercuCloture(jour);
  reponse.json(cloture);
}

export async function cloturerJournee(requete: Request, reponse: Response) {
  const donnees = schemaCloture.parse(requete.body);
  const cloture = await cloturerLaJournee(donnees, lireUtilisateurId(requete));
  diffuser(EVENEMENTS.CAISSE_MODIFIEE, { clotureId: cloture.id });
  reponse.status(201).json({ cloture });
}

/** GET /api/caisse/clotures (Direction) : historique des clôtures, 10 par page. */
export async function historiqueClotures(requete: Request, reponse: Response) {
  const { page, taille } = schemaPage.parse(requete.query);
  reponse.json(await listerClotures(page, taille));
}

/** POST /api/caisse/cloture/:jour/reouverture (Direction) : rouvre la caisse du jour, avec un motif. */
export async function rouvrirJournee(requete: Request, reponse: Response) {
  const jour = schemaJour.parse(requete.params.jour);
  const { motif, motDePasse } = schemaReouverture.parse(requete.body);
  await rouvrirLaJournee(jour, motif, motDePasse, lireUtilisateurId(requete));
  diffuser(EVENEMENTS.CAISSE_MODIFIEE, { jour });
  reponse.status(204).end();
}
