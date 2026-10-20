import type { Request, Response } from "express";
import { z } from "zod";
import { CanalContact, ResultatContact } from "../generated/prisma/client.js";
import {
  changerActifTypeSuivi,
  cloturerSuivi,
  compterSuivis,
  creerSuivi,
  creerTypeSuivi,
  listerSuivis,
  listerSuivisDuPatient,
  listerTypesSuivi,
  noterContact,
} from "../services/suivis.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";

const schemaListe = z.object({
  liste: z.enum(["a-contacter", "en-retard", "perdus-de-vue", "historique"]).default("a-contacter"),
});

const schemaSuivi = z
  .object({
    patientId: z.number().int().positive(),
    typeId: z.number().int().positive(),
    echeance: z.iso.date(),
    note: z.string().trim().max(255).nullish(),
  })
  .strict();

const schemaContact = z
  .object({
    canal: z.enum(CanalContact),
    resultat: z.enum(ResultatContact),
    note: z.string().trim().max(255).nullish(),
  })
  .strict();

const schemaCloture = z.object({ note: z.string().trim().max(255).nullish() }).strict();
const schemaType = z.object({ nom: z.string().trim().min(2).max(50) }).strict();
const schemaActif = z.object({ actif: z.boolean() }).strict();

function lireUtilisateur(requete: Request) {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return { id: Number(requete.utilisateur.id), role: requete.utilisateur.role };
}

/** GET /api/suivis?liste=a-contacter|en-retard|perdus-de-vue|historique */
export async function lister(requete: Request, reponse: Response) {
  const { liste } = schemaListe.parse(requete.query);
  reponse.json({ suivis: await listerSuivis(liste, lireUtilisateur(requete)) });
}

/** GET /api/suivis/compteurs */
export async function compteurs(_requete: Request, reponse: Response) {
  reponse.json(await compterSuivis());
}

/** GET /api/suivis/patient/:patientId */
export async function listerDuPatient(requete: Request, reponse: Response) {
  reponse.json({ suivis: await listerSuivisDuPatient(lireIdentifiant(requete.params.patientId), lireUtilisateur(requete)) });
}

/** POST /api/suivis */
export async function creer(requete: Request, reponse: Response) {
  const suivi = await creerSuivi(schemaSuivi.parse(requete.body), lireUtilisateur(requete));
  diffuser(EVENEMENTS.SUIVIS_MODIFIES, { suiviId: suivi.id });
  reponse.status(201).json({ suivi });
}

/** POST /api/suivis/:id/contacts — appel ou message noté. */
export async function contacter(requete: Request, reponse: Response) {
  const id = lireIdentifiant(requete.params.id);
  const contact = await noterContact(id, schemaContact.parse(requete.body), lireUtilisateur(requete));
  diffuser(EVENEMENTS.SUIVIS_MODIFIES, { suiviId: id });
  reponse.status(201).json({ contact });
}

/** POST /api/suivis/:id/cloture */
export async function cloturer(requete: Request, reponse: Response) {
  const id = lireIdentifiant(requete.params.id);
  const { note } = schemaCloture.parse(requete.body ?? {});
  await cloturerSuivi(id, note ?? null, lireUtilisateur(requete));
  diffuser(EVENEMENTS.SUIVIS_MODIFIES, { suiviId: id });
  reponse.status(204).end();
}

/** GET /api/suivis/types */
export async function types(_requete: Request, reponse: Response) {
  reponse.json({ types: await listerTypesSuivi() });
}

/** POST /api/suivis/types (Direction) */
export async function ajouterType(requete: Request, reponse: Response) {
  const { nom } = schemaType.parse(requete.body);
  reponse.status(201).json({ type: await creerTypeSuivi(nom, lireUtilisateur(requete)) });
}

/** PATCH /api/suivis/types/:id/actif (Direction) */
export async function changerActifType(requete: Request, reponse: Response) {
  const { actif } = schemaActif.parse(requete.body);
  await changerActifTypeSuivi(lireIdentifiant(requete.params.id), actif, lireUtilisateur(requete));
  reponse.status(204).end();
}
