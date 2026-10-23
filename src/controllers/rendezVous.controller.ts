import type { Request, Response } from "express";
import { z } from "zod";
import {
  chercherPatientsRendezVous,
  cloreRendezVous,
  creerRendezVous,
  lireCompteurs,
  listerPraticiens,
  listerRendezVous,
  marquerVenu,
} from "../services/rendezVous.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";

const schemaPeriode = z.object({ du: z.iso.date(), au: z.iso.date() }).refine((p) => p.du <= p.au, {
  path: ["au"],
  message: "PERIODE_INVALIDE",
});

const schemaRendezVous = z
  .object({
    patientId: z.number().int().positive(),
    praticienId: z.number().int().positive(),
    dateHeure: z.iso.datetime({ offset: true }),
    motif: z.string().trim().min(2).max(255),
  })
  .strict();

const schemaRecherchePatient = z.object({ q: z.string().optional() });

const schemaCloture = z.object({ statut: z.enum(["ABSENT", "ANNULE"]) }).strict();

function lireUtilisateur(requete: Request) {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return { id: Number(requete.utilisateur.id), role: requete.utilisateur.role };
}

/** GET /api/rendez-vous?du=AAAA-MM-JJ&au=AAAA-MM-JJ */
export async function lister(requete: Request, reponse: Response) {
  const periode = schemaPeriode.parse(requete.query);
  reponse.json({ rendezVous: await listerRendezVous(periode, lireUtilisateur(requete)) });
}

/** POST /api/rendez-vous */
export async function creer(requete: Request, reponse: Response) {
  const donnees = schemaRendezVous.parse(requete.body);
  const rdv = await creerRendezVous({ ...donnees, dateHeure: new Date(donnees.dateHeure) }, lireUtilisateur(requete));
  diffuser(EVENEMENTS.RENDEZ_VOUS_MODIFIE, { rendezVousId: rdv.id });
  reponse.status(201).json({ rendezVous: rdv });
}

/** POST /api/rendez-vous/:id/venu — crée le passage dans la file. */
export async function venu(requete: Request, reponse: Response) {
  const id = lireIdentifiant(requete.params.id);
  const resultat = await marquerVenu(id, lireUtilisateur(requete));
  diffuser([EVENEMENTS.RENDEZ_VOUS_MODIFIE, EVENEMENTS.FILE_MODIFIEE], { rendezVousId: id, passageId: resultat.passageId });
  reponse.json(resultat);
}

/** POST /api/rendez-vous/:id/cloture — absent ou annulé. */
export async function clore(requete: Request, reponse: Response) {
  const id = lireIdentifiant(requete.params.id);
  const { statut } = schemaCloture.parse(requete.body);
  await cloreRendezVous(id, statut, lireUtilisateur(requete));
  diffuser(EVENEMENTS.RENDEZ_VOUS_MODIFIE, { rendezVousId: id });
  reponse.status(204).end();
}

/** GET /api/rendez-vous/compteurs — compteurs du menu pour le rôle connecté. */
export async function compteurs(requete: Request, reponse: Response) {
  reponse.json(await lireCompteurs(lireUtilisateur(requete)));
}

/** GET /api/rendez-vous/praticiens */
export async function praticiens(_requete: Request, reponse: Response) {
  reponse.json({ praticiens: await listerPraticiens() });
}

/** GET /api/rendez-vous/patients?q= — recherche pour poser un créneau. */
export async function patients(requete: Request, reponse: Response) {
  const { q } = schemaRecherchePatient.parse(requete.query);
  const utilisateur = lireUtilisateur(requete);
  reponse.json({ patients: await chercherPatientsRendezVous(utilisateur.role, q) });
}
