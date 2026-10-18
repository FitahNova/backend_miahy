/*
 * Partenaires et conventions (dossier §6.11, maquette « Partenaires »). Direction seule.
 * - Une convention = un taux (0 à 100 %) appliqué à UN objet : un service, ou les médicaments.
 * - Pas de suppression : un partenaire est suspendu puis réactivé (décision du 14/10/2026).
 * - Documents joints stockés sur le disque du serveur (dossier §8.1), jamais exposés par leur chemin.
 * - Chaque modification est tracée dans le journal.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../config/prisma.js";
import { StatutFacture } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";

/** Dossier de stockage des documents (relatif au dossier de lancement du serveur). */
const DOSSIER_DOCUMENTS = path.resolve("stockage", "partenaires");

/** Types de fichiers acceptés (maquette : « .pdf, image, .doc, .docx »). */
export const TYPES_DOCUMENT_ACCEPTES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};
export const TAILLE_MAX_DOCUMENT_OCTETS = 5 * 1024 * 1024;

export interface DonneesPartenaire {
  nom: string;
  categorieId: number;
  contact?: string | null;
  /** 0 = aucune prise en charge. */
  tauxPriseEnCharge: number;
  /** Objet couvert quand le taux est > 0 : un service OU les médicaments. */
  serviceCouvertId?: number | null;
  couvreMedicaments?: boolean;
  programmeIds: number[];
  debut?: string | null;
  fin?: string | null;
}

const SELECTION_PARTENAIRE = {
  id: true,
  nom: true,
  contact: true,
  tauxPriseEnCharge: true,
  couvreMedicaments: true,
  debut: true,
  fin: true,
  actif: true,
  creeLe: true,
  categorie: { select: { id: true, nom: true } },
  serviceCouvert: { select: { id: true, nom: true } },
  programmes: { select: { id: true, nom: true }, orderBy: { id: "asc" as const } },
  documents: {
    orderBy: { ajouteLe: "desc" as const },
    select: { id: true, nomFichier: true, typeMime: true, tailleOctets: true, ajouteLe: true },
  },
};

/** Vérifie la cohérence d'une convention avant écriture (mêmes règles que les contraintes en base). */
async function verifierConvention(donnees: DonneesPartenaire) {
  if (donnees.tauxPriseEnCharge > 0) {
    const objets = Number(Boolean(donnees.serviceCouvertId)) + Number(Boolean(donnees.couvreMedicaments));
    if (objets !== 1) throw new ErreurHttp(400, "OBJET_COUVERT_REQUIS");
  }
  if (donnees.debut && donnees.fin && donnees.fin < donnees.debut) throw new ErreurHttp(400, "PERIODE_INVALIDE");

  const [categorie, service, programmes] = await Promise.all([
    prisma.categoriePartenaire.findUnique({ where: { id: donnees.categorieId }, select: { id: true } }),
    donnees.serviceCouvertId
      ? prisma.service.findUnique({ where: { id: donnees.serviceCouvertId }, select: { actif: true } })
      : Promise.resolve(null),
    prisma.programme.count({ where: { id: { in: donnees.programmeIds } } }),
  ]);
  if (!categorie) throw new ErreurHttp(400, "CATEGORIE_PARTENAIRE_INTROUVABLE");
  if (donnees.serviceCouvertId && !service?.actif) throw new ErreurHttp(400, "SERVICE_INACTIF");
  if (programmes !== new Set(donnees.programmeIds).size) throw new ErreurHttp(400, "PROGRAMME_INCONNU");
}

/** Champs écrits en base à partir de la saisie (l'objet couvert est vidé si le taux est nul). */
function versDonneesPrisma(donnees: DonneesPartenaire) {
  const couvre = donnees.tauxPriseEnCharge > 0;
  return {
    nom: donnees.nom,
    categorieId: donnees.categorieId,
    contact: donnees.contact || null,
    tauxPriseEnCharge: donnees.tauxPriseEnCharge,
    serviceCouvertId: couvre ? (donnees.serviceCouvertId ?? null) : null,
    couvreMedicaments: couvre ? Boolean(donnees.couvreMedicaments) : false,
    debut: donnees.debut ? new Date(donnees.debut) : null,
    fin: donnees.fin ? new Date(donnees.fin) : null,
  };
}

/**
 * Partenaires avec leurs statistiques (maquette : « n factures · montant pris en charge »).
 * Les factures annulées ne comptent pas.
 */
export async function listerPartenaires() {
  const [partenaires, statistiques] = await Promise.all([
    prisma.partenaire.findMany({ orderBy: [{ actif: "desc" }, { nom: "asc" }], select: SELECTION_PARTENAIRE }),
    prisma.facture.groupBy({
      by: ["partenaireId"],
      where: { partenaireId: { not: null }, statut: { not: StatutFacture.ANNULEE } },
      _count: { _all: true },
      _sum: { partPartenaire: true },
    }),
  ]);
  const parPartenaire = new Map(statistiques.map((ligne) => [ligne.partenaireId, ligne]));
  return partenaires.map((partenaire) => {
    const ligne = parPartenaire.get(partenaire.id);
    return {
      ...partenaire,
      nombreFactures: ligne?._count._all ?? 0,
      montantPrisEnCharge: ligne?._sum.partPartenaire ?? 0,
    };
  });
}

/** Crée un partenaire et sa convention. @throws 409 DOUBLON (nom déjà utilisé, via Prisma P2002). */
export async function creerPartenaire(donnees: DonneesPartenaire, auteurId: number) {
  await verifierConvention(donnees);
  return prisma.$transaction(async (tx) => {
    const partenaire = await tx.partenaire.create({
      data: { ...versDonneesPrisma(donnees), programmes: { connect: donnees.programmeIds.map((id) => ({ id })) } },
      select: SELECTION_PARTENAIRE,
    });
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "PARTENAIRE_CREE",
      entite: "partenaire",
      entiteId: partenaire.id,
      detail: { nom: partenaire.nom, taux: partenaire.tauxPriseEnCharge },
    });
    return partenaire;
  }, OPTIONS_TRANSACTION);
}

/** Modifie un partenaire et sa convention (les programmes soutenus sont remplacés). */
export async function modifierPartenaire(partenaireId: number, donnees: DonneesPartenaire, auteurId: number) {
  await verifierConvention(donnees);
  return prisma.$transaction(async (tx) => {
    const avant = await tx.partenaire.findUnique({
      where: { id: partenaireId },
      select: { nom: true, tauxPriseEnCharge: true },
    });
    if (!avant) throw new ErreurHttp(404, "PARTENAIRE_INTROUVABLE");
    const partenaire = await tx.partenaire.update({
      where: { id: partenaireId },
      data: { ...versDonneesPrisma(donnees), programmes: { set: donnees.programmeIds.map((id) => ({ id })) } },
      select: SELECTION_PARTENAIRE,
    });
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "PARTENAIRE_MODIFIE",
      entite: "partenaire",
      entiteId: partenaireId,
      detail: { avant, apres: { nom: partenaire.nom, taux: partenaire.tauxPriseEnCharge } },
    });
    return partenaire;
  }, OPTIONS_TRANSACTION);
}

/** Suspend ou réactive un partenaire (aucune suppression). */
export async function changerActifPartenaire(partenaireId: number, actif: boolean, auteurId: number) {
  return prisma.$transaction(async (tx) => {
    const resultat = await tx.partenaire.updateMany({ where: { id: partenaireId }, data: { actif } });
    if (resultat.count === 0) throw new ErreurHttp(404, "PARTENAIRE_INTROUVABLE");
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: actif ? "PARTENAIRE_REACTIVE" : "PARTENAIRE_SUSPENDU",
      entite: "partenaire",
      entiteId: partenaireId,
    });
    return tx.partenaire.findUniqueOrThrow({ where: { id: partenaireId }, select: SELECTION_PARTENAIRE });
  }, OPTIONS_TRANSACTION);
}

// ---------- Catégories ----------

/** Catégories avec le nombre de partenaires de chacune (maquette : « n partenaire(s) »). */
export async function listerCategoriesPartenaires() {
  const categories = await prisma.categoriePartenaire.findMany({
    orderBy: { id: "asc" },
    select: { id: true, nom: true, _count: { select: { partenaires: true } } },
  });
  return categories.map(({ _count, ...categorie }) => ({ ...categorie, nombrePartenaires: _count.partenaires }));
}

export async function creerCategoriePartenaire(nom: string, auteurId: number) {
  return prisma.$transaction(async (tx) => {
    const categorie = await tx.categoriePartenaire.create({ data: { nom }, select: { id: true, nom: true } });
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "CATEGORIE_PARTENAIRE_CREEE",
      entite: "categorie_partenaire",
      entiteId: categorie.id,
      detail: { nom },
    });
    return categorie;
  }, OPTIONS_TRANSACTION);
}

export async function renommerCategoriePartenaire(categorieId: number, nom: string, auteurId: number) {
  return prisma.$transaction(async (tx) => {
    const avant = await tx.categoriePartenaire.findUnique({ where: { id: categorieId }, select: { nom: true } });
    if (!avant) throw new ErreurHttp(404, "CATEGORIE_PARTENAIRE_INTROUVABLE");
    const categorie = await tx.categoriePartenaire.update({
      where: { id: categorieId },
      data: { nom },
      select: { id: true, nom: true },
    });
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "CATEGORIE_PARTENAIRE_RENOMMEE",
      entite: "categorie_partenaire",
      entiteId: categorieId,
      detail: { avant: avant.nom, apres: nom },
    });
    return categorie;
  }, OPTIONS_TRANSACTION);
}

// ---------- Documents joints ----------

/**
 * Enregistre un document reçu en base64 : type et taille contrôlés, nom de fichier tiré au sort
 * sur le disque (le nom d'origine n'est conservé qu'en base, pour l'affichage).
 * @throws 400 TYPE_DOCUMENT_REFUSE, 413 DOCUMENT_TROP_VOLUMINEUX, 404 PARTENAIRE_INTROUVABLE
 */
export async function ajouterDocumentPartenaire(
  partenaireId: number,
  fichier: { nom: string; typeMime: string; contenuBase64: string },
  auteurId: number,
) {
  const extension = TYPES_DOCUMENT_ACCEPTES[fichier.typeMime];
  if (!extension) throw new ErreurHttp(400, "TYPE_DOCUMENT_REFUSE");
  const contenu = Buffer.from(fichier.contenuBase64, "base64");
  if (contenu.length === 0) throw new ErreurHttp(400, "DOCUMENT_VIDE");
  if (contenu.length > TAILLE_MAX_DOCUMENT_OCTETS) throw new ErreurHttp(413, "DOCUMENT_TROP_VOLUMINEUX");

  const partenaire = await prisma.partenaire.findUnique({ where: { id: partenaireId }, select: { id: true } });
  if (!partenaire) throw new ErreurHttp(404, "PARTENAIRE_INTROUVABLE");

  const nomStockage = `${partenaireId}-${randomUUID()}${extension}`;
  await mkdir(DOSSIER_DOCUMENTS, { recursive: true });
  await writeFile(path.join(DOSSIER_DOCUMENTS, nomStockage), contenu);

  return prisma.$transaction(async (tx) => {
    const document = await tx.documentPartenaire.create({
      data: {
        partenaireId,
        nomFichier: fichier.nom,
        typeMime: fichier.typeMime,
        tailleOctets: contenu.length,
        chemin: nomStockage,
        ajouteParId: auteurId,
      },
      select: { id: true, nomFichier: true, typeMime: true, tailleOctets: true, ajouteLe: true },
    });
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "DOCUMENT_PARTENAIRE_AJOUTE",
      entite: "partenaire",
      entiteId: partenaireId,
      detail: { fichier: fichier.nom },
    });
    return document;
  }, OPTIONS_TRANSACTION);
}

/** Contenu d'un document pour le téléchargement. @throws 404 DOCUMENT_INTROUVABLE */
export async function lireDocumentPartenaire(documentId: number) {
  const document = await prisma.documentPartenaire.findUnique({
    where: { id: documentId },
    select: { nomFichier: true, typeMime: true, chemin: true },
  });
  if (!document) throw new ErreurHttp(404, "DOCUMENT_INTROUVABLE");
  // Le chemin vient de la base (nom tiré au sort) : basename empêche toute sortie du dossier.
  const contenu = await readFile(path.join(DOSSIER_DOCUMENTS, path.basename(document.chemin))).catch(() => {
    throw new ErreurHttp(404, "DOCUMENT_INTROUVABLE");
  });
  return { ...document, contenu };
}
