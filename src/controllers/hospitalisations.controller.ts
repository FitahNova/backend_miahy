import type { Request, Response } from "express";
import { z } from "zod";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import {
  listerFormulesHospitalisation,
  listerHospitalisations,
  prolongerHospitalisation,
  sortirHospitalisation,
} from "../services/hospitalisations.service.js";

function lireAuteur(requete: Request): number {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return Number(requete.utilisateur.id);
}

const schemaListe = z.object({ etat: z.enum(["en-cours", "sortis"]).default("en-cours") });
const schemaProlongation = z.object({
  serviceId: z.number().int().positive(),
  motif: z.string().trim().min(3, "Motif obligatoire (3 caractères minimum)").max(150),
});

export async function obtenirHospitalisations(requete: Request, reponse: Response) {
  const { etat } = schemaListe.parse(requete.query);
  reponse.json({ hospitalisations: await listerHospitalisations(etat) });
}

export async function obtenirFormules(_requete: Request, reponse: Response) {
  const formules = await listerFormulesHospitalisation();
  reponse.json({ formules: formules.map((formule) => ({ id: formule.id, nom: formule.nom, duree: formule.duree })) });
}

export async function prolonger(requete: Request, reponse: Response) {
  const resultat = await prolongerHospitalisation(lireIdentifiant(requete.params.id), schemaProlongation.parse(requete.body), lireAuteur(requete));
  diffuser([EVENEMENTS.HOSPITALISATIONS_MODIFIEES, EVENEMENTS.CAISSE_MODIFIEE, EVENEMENTS.FILE_MODIFIEE]);
  reponse.json(resultat);
}

export async function sortir(requete: Request, reponse: Response) {
  const resultat = await sortirHospitalisation(lireIdentifiant(requete.params.id), lireAuteur(requete));
  diffuser(EVENEMENTS.HOSPITALISATIONS_MODIFIEES);
  reponse.json(resultat);
}
