import type { Request, Response } from "express";
import { z } from "zod";
import { PeriodiciteCharge } from "../generated/prisma/client.js";
import { changerActifCharge, creerCharge, listerCharges, modifierCharge } from "../services/charges.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

// Montant en Ariary entiers ; null = « à fixer ».
const champsCharge = {
  libelle: z.string().trim().min(2).max(100),
  montant: z.number().int().positive().nullable(),
  periodicite: z.enum(PeriodiciteCharge),
};
const schemaCharge = z.object({ ...champsCharge, periodicite: champsCharge.periodicite.default("MENSUELLE") }).strict();
const schemaModification = z.object(champsCharge).partial().strict();
const schemaActif = z.object({ actif: z.boolean() }).strict();

function lireAuteur(requete: Request): number {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return Number(requete.utilisateur.id);
}

/** GET /api/charges */
export async function lister(_requete: Request, reponse: Response) {
  reponse.json(await listerCharges());
}

/** POST /api/charges */
export async function creer(requete: Request, reponse: Response) {
  const donnees = schemaCharge.parse(requete.body);
  reponse.status(201).json({ charge: await creerCharge(donnees, lireAuteur(requete)) });
}

/** PATCH /api/charges/:id */
export async function modifier(requete: Request, reponse: Response) {
  const donnees = schemaModification.parse(requete.body);
  reponse.json({ charge: await modifierCharge(lireIdentifiant(requete.params.id), donnees, lireAuteur(requete)) });
}

/** PATCH /api/charges/:id/actif */
export async function changerActif(requete: Request, reponse: Response) {
  const { actif } = schemaActif.parse(requete.body);
  reponse.json({ charge: await changerActifCharge(lireIdentifiant(requete.params.id), actif, lireAuteur(requete)) });
}
