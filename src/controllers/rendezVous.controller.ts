import type { Request, Response } from "express";
import { z } from "zod";
import {
  cloreRendezVous,
  creerRendezVous,
  lireCompteurs,
  listerPraticiens,
  listerCreneauxOccupes,
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
const schemaDisponibilites = z.object({ jour: z.iso.date(), praticienId: z.coerce.number().int().positive() });

const schemaRendezVous = z
  .object({
    patientId: z.number().int().positive(),
    // Le praticien est obligatoire : au « Venu », le patient arrive directement dans sa file.
    praticienId: z.number().int().positive(),
    dateHeure: z.iso.datetime({ offset: true }),
    motif: z.string().trim().min(2).max(255),
  })
  .strict();

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

/** GET /api/rendez-vous/disponibilites?jour=AAAA-MM-JJ&praticienId=123 */
export async function disponibilites(requete: Request, reponse: Response) {
  const { jour, praticienId } = schemaDisponibilites.parse(requete.query);
  reponse.json({ creneauxOccupes: await listerCreneauxOccupes(jour, praticienId) });
}

/** POST /api/rendez-vous */
export async function creer(requete: Request, reponse: Response) {
  const donnees = schemaRendezVous.parse(requete.body);
  const rdv = await creerRendezVous({ ...donnees, dateHeure: new Date(donnees.dateHeure) }, lireUtilisateur(requete));
  diffuser([EVENEMENTS.RENDEZ_VOUS_MODIFIE, EVENEMENTS.SUIVIS_MODIFIES], { rendezVousId: rdv.id });
  reponse.status(201).json({ rendezVous: rdv });
}

/** POST /api/rendez-vous/:id/venu : crée le passage dans la file. */
export async function venu(requete: Request, reponse: Response) {
  const id = lireIdentifiant(requete.params.id);
  const resultat = await marquerVenu(id, lireUtilisateur(requete));
  diffuser([EVENEMENTS.RENDEZ_VOUS_MODIFIE, EVENEMENTS.FILE_MODIFIEE, EVENEMENTS.SUIVIS_MODIFIES], {
    rendezVousId: id,
    passageId: resultat.passageId,
  });
  reponse.json(resultat);
}

/** POST /api/rendez-vous/:id/cloture : absent ou annulé. */
export async function clore(requete: Request, reponse: Response) {
  const id = lireIdentifiant(requete.params.id);
  const { statut } = schemaCloture.parse(requete.body);
  await cloreRendezVous(id, statut, lireUtilisateur(requete));
  diffuser([EVENEMENTS.RENDEZ_VOUS_MODIFIE, EVENEMENTS.SUIVIS_MODIFIES], {
    rendezVousId: id,
  });
  reponse.status(204).end();
}

/** GET /api/rendez-vous/compteurs : compteurs du menu pour le rôle connecté. */
export async function compteurs(requete: Request, reponse: Response) {
  reponse.json(await lireCompteurs(lireUtilisateur(requete)));
}

/** GET /api/rendez-vous/praticiens */
export async function praticiens(_requete: Request, reponse: Response) {
  reponse.json({ praticiens: await listerPraticiens() });
}
