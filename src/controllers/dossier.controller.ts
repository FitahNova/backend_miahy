import type { Request, Response } from "express";
import { z } from "zod";
import { corrigerConsultation, lireDossierPatient } from "../services/dossier.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

const schemaCorrection = z.object({ texte: z.string().trim().min(3).max(2000) }).strict();

function lireUtilisateur(requete: Request) {
  if (!requete.utilisateur) {
    throw new ErreurHttp(401, "CONNEXION_REQUISE");
  }
  return { id: Number(requete.utilisateur.id), role: requete.utilisateur.role };
}

export async function obtenirDossier(requete: Request, reponse: Response) {
  const dossier = await lireDossierPatient(lireIdentifiant(requete.params.patientId), lireUtilisateur(requete));
  reponse.json(dossier);
}

/** POST /api/dossiers/consultations/:consultationId/corrections : correction tracée (soignants). */
export async function ajouterCorrection(requete: Request, reponse: Response) {
  const { texte } = schemaCorrection.parse(requete.body);
  const correction = await corrigerConsultation(
    lireIdentifiant(requete.params.consultationId),
    texte,
    lireUtilisateur(requete).id,
  );
  reponse.status(201).json({ correction });
}
