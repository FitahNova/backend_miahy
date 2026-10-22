import type { Request, Response } from "express";
import { z } from "zod";
import {
  calculerApercuCloture,
  calculerResteDuDuPatient,
  cloturerLaJournee,
  enregistrerNouveauPaiement,
  listerFacturesEnAttenteDePaiement,
  modifierRemiseFacture,
  obtenirRecuFacture,
} from "../services/caisse.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";

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

const schemaJour = z.iso.date();

const schemaCloture = z.object({
  jour: schemaJour,
  totalCompte: z.number().int().nonnegative(),
  commentaire: z.string().trim().nullish(),
});

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
