import type { Request, Response } from "express";
import { z } from "zod";
import { Civilite, Role } from "../generated/prisma/client.js";
import {
  changerStatutUtilisateur,
  corrigerContact,
  creerUtilisateur,
  listerUtilisateurs,
  reinitialiserMotDePasse,
} from "../services/utilisateurs.service.js";
import { listerJournalConnexion } from "../services/journal.service.js";
import { listerDemandesEnAttente, traiterDemande } from "../services/demandesAcces.service.js";
import { diffuser } from "../realtime/sse.js";
import { EVENEMENTS } from "../realtime/events.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

// Validation fine dans le service (codes d'erreur). Ici : seulement la forme des données.
const schemaCreation = z.object({
  civilite: z.enum(Civilite).nullish(),
  nom: z.string().trim().min(1).max(100),
  prenom: z.string().trim().max(100),
  email: z.string().trim().max(150).nullish(),
  telephone: z.string().trim().max(30).nullish(),
  canal: z.enum(["EMAIL", "SMS"]).nullish(),
  role: z.enum(Role),
});

const schemaStatut = z.object({ actif: z.boolean() });

const schemaContact = z.object({
  email: z.string().trim().max(150).nullish(),
  telephone: z.string().trim().max(30).nullish(),
  canal: z.enum(["EMAIL", "SMS"]).nullish(),
});

function lireAuteur(requete: Request): number {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  return Number(requete.utilisateur.id);
}

// Noms utilisés par utilisateurs.routes.ts : ne pas les renommer sans changer les routes.

export async function obtenirListeUtilisateurs(_requete: Request, reponse: Response) {
  const utilisateurs = await listerUtilisateurs();
  reponse.json({ utilisateurs });
}

export async function ajouterUtilisateur(requete: Request, reponse: Response) {
  const donnees = schemaCreation.parse(requete.body);
  const resultat = await creerUtilisateur(
    {
      civilite: donnees.civilite ?? null,
      nom: donnees.nom,
      prenom: donnees.prenom,
      email: donnees.email || null,
      telephone: donnees.telephone || null,
      canal: donnees.canal ?? null,
      role: donnees.role,
    },
    lireAuteur(requete),
  );
  reponse.status(201).json(resultat);
}

export async function modifierStatutUtilisateur(requete: Request, reponse: Response) {
  const { actif } = schemaStatut.parse(requete.body);
  const utilisateur = await changerStatutUtilisateur(lireIdentifiant(requete.params.id), actif, lireAuteur(requete));
  reponse.json({ utilisateur });
}

export async function reinitialiserMdp(requete: Request, reponse: Response) {
  const resultat = await reinitialiserMotDePasse(lireIdentifiant(requete.params.id), lireAuteur(requete));
  diffuser(EVENEMENTS.DEMANDES_MODIFIEES);
  reponse.json(resultat);
}

// Compte en attente : correction de l'adresse ou du téléphone, puis nouvel envoi du lien.
export async function modifierContact(requete: Request, reponse: Response) {
  const donnees = schemaContact.parse(requete.body);
  reponse.json(await corrigerContact(lireIdentifiant(requete.params.id), donnees, lireAuteur(requete)));
}

export async function obtenirJournalConnexion(_requete: Request, reponse: Response) {
  const entrees = await listerJournalConnexion();
  reponse.json({ entrees });
}

export async function obtenirDemandes(_requete: Request, reponse: Response) {
  reponse.json({ demandes: await listerDemandesEnAttente() });
}

// Validation (lien de mot de passe envoyé) ou refus d'une demande d'accès.
export async function validerDemande(requete: Request, reponse: Response) {
  const resultat = await traiterDemande(lireIdentifiant(requete.params.id), true, lireAuteur(requete));
  diffuser(EVENEMENTS.DEMANDES_MODIFIEES);
  reponse.json(resultat);
}

export async function refuserDemande(requete: Request, reponse: Response) {
  await traiterDemande(lireIdentifiant(requete.params.id), false, lireAuteur(requete));
  diffuser(EVENEMENTS.DEMANDES_MODIFIEES);
  reponse.status(204).end();
}
