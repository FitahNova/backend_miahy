import type { Request, Response } from "express";
import { z } from "zod";
import {
  ajouterDocumentPartenaire,
  changerActifPartenaire,
  creerCategoriePartenaire,
  creerPartenaire,
  lireDocumentPartenaire,
  listerCategoriesPartenaires,
  listerPartenaires,
  modifierPartenaire,
  renommerCategoriePartenaire,
  TYPES_DOCUMENT_ACCEPTES,
} from "../services/partenaires.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { lireIdentifiant } from "../utils/parametres.js";

const TAUX_MAX = 100;

const schemaPartenaire = z
  .object({
    nom: z.string().trim().min(2).max(150),
    categorieId: z.number().int().positive(),
    contact: z.string().trim().max(255).nullish(),
    tauxPriseEnCharge: z.number().int().min(0).max(TAUX_MAX),
    serviceCouvertId: z.number().int().positive().nullish(),
    couvreMedicaments: z.boolean().optional(),
    programmeIds: z.array(z.number().int().positive()).max(20).default([]),
    debut: z.iso.date().nullish(),
    fin: z.iso.date().nullish(),
  })
  .strict();

const schemaActif = z.object({ actif: z.boolean() }).strict();
const schemaCategorie = z.object({ nom: z.string().trim().min(2).max(50) }).strict();

const schemaDocument = z
  .object({
    nom: z.string().trim().min(1).max(255),
    typeMime: z.enum(Object.keys(TYPES_DOCUMENT_ACCEPTES) as [string, ...string[]]),
    contenuBase64: z.string().min(1),
  })
  .strict();

function lireAuteur(requete: Request): number {
  if (!requete.utilisateur) throw new ErreurHttp(401, "CONNEXION_REQUISE");
  return Number(requete.utilisateur.id);
}

/** GET /api/partenaires */
export async function obtenirPartenaires(_requete: Request, reponse: Response) {
  reponse.json({ partenaires: await listerPartenaires() });
}

/** POST /api/partenaires */
export async function ajouterPartenaire(requete: Request, reponse: Response) {
  const donnees = schemaPartenaire.parse(requete.body);
  reponse.status(201).json({ partenaire: await creerPartenaire(donnees, lireAuteur(requete)) });
}

/** PUT /api/partenaires/:id */
export async function mettreAJourPartenaire(requete: Request, reponse: Response) {
  const donnees = schemaPartenaire.parse(requete.body);
  reponse.json({ partenaire: await modifierPartenaire(lireIdentifiant(requete.params.id), donnees, lireAuteur(requete)) });
}

/** PATCH /api/partenaires/:id/actif — suspendre ou réactiver. */
export async function basculerActifPartenaire(requete: Request, reponse: Response) {
  const { actif } = schemaActif.parse(requete.body);
  reponse.json({ partenaire: await changerActifPartenaire(lireIdentifiant(requete.params.id), actif, lireAuteur(requete)) });
}

/** GET /api/partenaires/categories */
export async function obtenirCategoriesPartenaires(_requete: Request, reponse: Response) {
  reponse.json({ categories: await listerCategoriesPartenaires() });
}

/** POST /api/partenaires/categories */
export async function ajouterCategoriePartenaire(requete: Request, reponse: Response) {
  const { nom } = schemaCategorie.parse(requete.body);
  reponse.status(201).json({ categorie: await creerCategoriePartenaire(nom, lireAuteur(requete)) });
}

/** PATCH /api/partenaires/categories/:id */
export async function renommerCategorie(requete: Request, reponse: Response) {
  const { nom } = schemaCategorie.parse(requete.body);
  reponse.json({ categorie: await renommerCategoriePartenaire(lireIdentifiant(requete.params.id), nom, lireAuteur(requete)) });
}

/** POST /api/partenaires/:id/documents — fichier en base64 (5 Mo au plus). */
export async function joindreDocument(requete: Request, reponse: Response) {
  const fichier = schemaDocument.parse(requete.body);
  reponse
    .status(201)
    .json({ document: await ajouterDocumentPartenaire(lireIdentifiant(requete.params.id), fichier, lireAuteur(requete)) });
}

/** Prépare le téléchargement. Le type du contenu est choisi ensuite, parmi les types acceptés. */
function preparerTelechargement(reponse: Response, nomFichier: string): Response {
  reponse.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(nomFichier)}`);
  reponse.setHeader("X-Content-Type-Options", "nosniff");
  return reponse;
}

/**
 * Envoie le fichier avec un type connu, écrit en clair.
 * Le type enregistré n'est jamais recopié dans l'en-tête : un contenu HTML ne peut pas s'afficher comme une page.
 */
function envoyerDocument(reponse: Response, nomFichier: string, typeMime: string, contenu: Buffer): void {
  switch (typeMime) {
    case "application/pdf":
      preparerTelechargement(reponse, nomFichier).type("application/pdf").send(contenu);
      return;
    case "image/jpeg":
      preparerTelechargement(reponse, nomFichier).type("image/jpeg").send(contenu);
      return;
    case "image/png":
      preparerTelechargement(reponse, nomFichier).type("image/png").send(contenu);
      return;
    case "image/webp":
      preparerTelechargement(reponse, nomFichier).type("image/webp").send(contenu);
      return;
    case "application/msword":
      preparerTelechargement(reponse, nomFichier).type("application/msword").send(contenu);
      return;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      preparerTelechargement(reponse, nomFichier)
        .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        .send(contenu);
      return;
    default:
      throw new ErreurHttp(415, "TYPE_DOCUMENT_REFUSE");
  }
}

/** GET /api/partenaires/documents/:documentId — téléchargement (ouverture dans le navigateur). */
export async function telechargerDocument(requete: Request, reponse: Response) {
  const document = await lireDocumentPartenaire(lireIdentifiant(requete.params.documentId));
  envoyerDocument(reponse, document.nomFichier, document.typeMime, document.contenu);
}
