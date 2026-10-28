import type { Request, Response } from "express";
import { z } from "zod";
import {
  enregistrerConsultationDuPassage,
  obtenirConsultationDuPassage,
  signerEtTerminerConsultation,
} from "../services/consultations.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";

const schemaConsultation = z
  .object({
    motif: z.string().trim().min(1).max(255).optional(),
    actes: z.array(z.number().int().positive()).min(1).max(20).optional(),
    tension: z.string().trim().regex(/^\d{2,3}\/\d{2,3}$/, "Format attendu : 120/80").nullish(),
    poidsKg: z.number().positive().max(400).nullish(),
    pouls: z.number().int().min(20).max(250).nullish(),
    temperature: z.number().min(30).max(45).nullish(),
    spo2: z.number().int().min(0).max(100).nullish(),
    glycemie: z.number().min(0.1).max(10).nullish(),
    examen: z.string().trim().max(5000).nullish(),
    diagnostic: z.string().trim().max(5000).nullish(),
    note: z.string().trim().max(5000).nullish(),
    suiviDelaiJours: z.number().int().positive().max(365).nullish(),
    suiviMotif: z.string().trim().max(50).nullish(),
    suiviHeure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format attendu : 09:30").nullish(),
  })
  .strict();

function lireUtilisateur(requete: Request) {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  return { id: Number(requete.utilisateur.id), role: requete.utilisateur.role };
}

export async function obtenirConsultation(requete: Request, reponse: Response) {
  reponse.json(await obtenirConsultationDuPassage(lireIdentifiant(requete.params.passageId), lireUtilisateur(requete)));
}

export async function enregistrerConsultation(requete: Request, reponse: Response) {
  const donnees = schemaConsultation.parse(requete.body);
  const consultation = await enregistrerConsultationDuPassage(
    lireIdentifiant(requete.params.passageId),
    lireUtilisateur(requete),
    donnees,
  );
  reponse.json({ consultation });
}

export async function signerConsultation(requete: Request, reponse: Response) {
  const passageId = lireIdentifiant(requete.params.passageId);
  const consultation = await signerEtTerminerConsultation(passageId, lireUtilisateur(requete));
  // Signature : le passage part en pharmacie ou en caisse, et une facture est créée.
  diffuser(
    [
      EVENEMENTS.FILE_MODIFIEE,
      EVENEMENTS.PHARMACIE_MODIFIEE,
      EVENEMENTS.CAISSE_MODIFIEE,
      EVENEMENTS.RENDEZ_VOUS_MODIFIE,
      EVENEMENTS.SUIVIS_MODIFIES,
    ],
    { passageId },
  );
  reponse.json({ consultation });
}
