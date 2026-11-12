import type { Request, Response } from "express";
import { z } from "zod";
import { enregistrerOrdonnanceDuPassage, obtenirOrdonnanceDuPassage } from "../services/ordonnances.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { FORMES_MEDICAMENT } from "../utils/produits.js";

// Une ligne : un médicament du stock (medicamentId) ou un médicament hors stock saisi (libelle), pas les deux.
const schemaLigne = z
  .object({
    medicamentId: z.number().int().positive().nullish(),
    libelle: z.string().trim().min(2).max(150).nullish(),
    // Médicament hors stock : sa forme est obligatoire (elle dit comment écrire la posologie).
    forme: z.enum(FORMES_MEDICAMENT).nullish(),
    // Vides pour pommade, injectable et collyre (le service vérifie selon la forme).
    doseParPrise: z.number().positive().max(99.99).nullish(),
    prisesParJour: z.number().int().min(1).max(24).nullish(),
    dureeJours: z.number().int().min(1).max(365).nullish(),
    // Rythme : prise tous les N jours (1 = chaque jour), durée écrite en jours, semaines ou mois.
    intervalleJours: z.number().int().min(1).max(365).nullish(),
    uniteDuree: z.enum(["jours", "semaines", "mois"]).nullish(),
    quantite: z.number().int().min(1).max(999).nullish(),
    instruction: z.string().trim().max(255).nullish(),
  })
  .refine((ligne) => Boolean(ligne.medicamentId) !== Boolean(ligne.libelle), {
    message: "Choisissez un médicament du stock ou saisissez son nom",
    path: ["libelle"],
  })
  .refine((ligne) => Boolean(ligne.medicamentId) || Boolean(ligne.forme), {
    message: "Précisez la forme du médicament hors stock",
    path: ["forme"],
  });

const schemaOrdonnance = z.object({
  // Liste vide : supprime l'ordonnance (le praticien a retiré tous les médicaments).
  lignes: z.array(schemaLigne).max(30),
});

function lireUtilisateur(requete: Request) {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  return { id: Number(requete.utilisateur.id), role: requete.utilisateur.role };
}

export async function obtenirOrdonnance(requete: Request, reponse: Response) {
  const ordonnance = await obtenirOrdonnanceDuPassage(lireIdentifiant(requete.params.passageId), lireUtilisateur(requete));
  reponse.json({ ordonnance });
}

export async function enregistrerOrdonnance(requete: Request, reponse: Response) {
  const { lignes } = schemaOrdonnance.parse(requete.body);
  const ordonnance = await enregistrerOrdonnanceDuPassage(
    lireIdentifiant(requete.params.passageId),
    lireUtilisateur(requete),
    lignes,
  );
  reponse.json({ ordonnance });
}
