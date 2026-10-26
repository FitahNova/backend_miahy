import { prisma } from "../config/prisma.js";
import { Prisma, TypeMouvement } from "../generated/prisma/client.js";
import { TAILLE_PAGE } from "../config/constants.js";
import { ErreurHttp } from "../utils/errors.js";
import { estPerime, observationInventaire } from "../utils/peremption.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";

const CODE_VIOLATION_UNIQUE = "P2002";
const LIMITE_RECHERCHE = 20;

// Liste fermée des formes.
export const FORMES_MEDICAMENT = [
  "comprimé",
  "gélule",
  "sachet",
  "sirop",
  "suspension",
  "pommade",
  "injectable",
  "suppositoire",
  "collyre",
] as const;

export type EtatStock = "RUPTURE" | "SOUS_ALERTE" | "OK";

const selectionMedicament = {
  id: true,
  nom: true,
  forme: true,
  prixAchat: true,
  prixVente: true,
  seuilAlerte: true,
  datePeremption: true,
  actif: true,
  categorie: { select: { id: true, nom: true } },
} as const;

export interface DonneesMedicament {
  nom: string;
  forme: string;
  categorieId: number;
  prixAchat: number;
  prixVente: number;
  seuilAlerte: number;
  datePeremption?: string | null;
}

export interface DonneesModificationMedicament extends Partial<DonneesMedicament> {
  confirmationPrix?: boolean;
}

export interface LigneApprovisionnement {
  medicamentId: number;
  quantite: number;
  prixAchatUnitaire: number;
}

export interface DonneesApprovisionnement {
  fournisseurId: number;
  dateReception: string;
  reference?: string | null;
  lignes: LigneApprovisionnement[];
}

function estViolationUnique(erreur: unknown): boolean {
  return erreur instanceof Error && "code" in erreur && erreur.code === CODE_VIOLATION_UNIQUE;
}

// ---------- Stock : somme des mouvements (R064) ----------
// La quantité est enregistrée SIGNÉE : ENTREE > 0, SORTIE < 0, AJUSTEMENT ±.
// Le stock est donc la simple somme des quantités. Seule fonction de calcul du stock du projet.

export async function calculerStocks(
  client: Prisma.TransactionClient,
  medicamentIds?: number[],
): Promise<Map<number, number>> {
  const stocks = new Map<number, number>((medicamentIds ?? []).map((id) => [id, 0]));
  if (medicamentIds && medicamentIds.length === 0) return stocks;

  const groupes = await client.mouvementStock.groupBy({
    by: ["medicamentId"],
    where: medicamentIds ? { medicamentId: { in: medicamentIds } } : {},
    _sum: { quantite: true },
  });
  for (const groupe of groupes) {
    stocks.set(groupe.medicamentId, groupe._sum.quantite ?? 0);
  }
  return stocks;
}

// Verrou de lignes : deux opérations simultanées ne lisent pas le même stock en même temps.
export async function verrouillerMedicaments(client: Prisma.TransactionClient, medicamentIds: number[]) {
  if (medicamentIds.length === 0) return;
  await client.$queryRaw`SELECT id FROM medicament WHERE id IN (${Prisma.join(medicamentIds)}) ORDER BY id FOR UPDATE`;
}

// R067 : rupture si stock nul ; sous alerte si stock inférieur ou égal au seuil.
function etatDuStock(stock: number, seuilAlerte: number): EtatStock {
  if (stock <= 0) return "RUPTURE";
  if (stock <= seuilAlerte) return "SOUS_ALERTE";
  return "OK";
}

// R070 : marge sur coût, en pourcentage entier.
function margePourcent(prixAchat: number, prixVente: number): number | null {
  if (prixAchat <= 0) return null;
  return Math.round(((prixVente - prixAchat) / prixAchat) * 100);
}

// R069 : avertissement non bloquant.
function avertissementPrix(prixAchat: number, prixVente: number): string | null {
  return prixVente < prixAchat ? "Le prix de vente est inférieur au prix d'achat" : null;
}

async function lireMedicamentsAvecStock() {
  const medicaments = await prisma.medicament.findMany({
    select: selectionMedicament,
    orderBy: [{ actif: "desc" }, { nom: "asc" }],
  });
  const stocks = await calculerStocks(prisma, medicaments.map((medicament) => medicament.id));

  return medicaments.map((medicament) => {
    const stock = stocks.get(medicament.id) ?? 0;
    return {
      ...medicament,
      stock,
      etat: etatDuStock(stock, medicament.seuilAlerte),
      marge: margePourcent(medicament.prixAchat, medicament.prixVente),
    };
  });
}

// ---------- Médicaments (Direction) ----------

// R071 : valeur d'achat = somme des stocks × prix d'achat ; valeur de vente = somme des stocks × prix de vente.
export async function listerMedicaments() {
  const medicaments = await lireMedicamentsAvecStock();
  const actifs = medicaments.filter((medicament) => medicament.actif);

  // Un stock périmé ne se vend plus : il est retiré de la valeur de vente.
  const vendables = actifs.filter((medicament) => !estPerime(medicament.datePeremption));
  const valeurDeVente = (liste: typeof actifs) =>
    liste.reduce((somme, medicament) => somme + medicament.stock * medicament.prixVente, 0);
  const indicateurs = {
    produits: actifs.length,
    enRupture: vendables.filter((medicament) => medicament.etat === "RUPTURE").length,
    valeurAchat: actifs.reduce((somme, medicament) => somme + medicament.stock * medicament.prixAchat, 0),
    valeurVente: valeurDeVente(vendables),
  };

  return { medicaments, indicateurs };
}

async function verifierCategorie(categorieId: number) {
  const categorie = await prisma.categorieMedicament.findUnique({ where: { id: categorieId }, select: { id: true } });
  if (!categorie) {
    throw new ErreurHttp(400, "CATEGORIE_INTROUVABLE");
  }
}

export async function creerMedicament(donnees: DonneesMedicament, auteurId: number) {
  await verifierCategorie(donnees.categorieId);

  return prisma.$transaction(async (transaction) => {
    const medicament = await transaction.medicament.create({
      data: {
        nom: donnees.nom,
        forme: donnees.forme,
        categorieId: donnees.categorieId,
        prixAchat: donnees.prixAchat,
        prixVente: donnees.prixVente,
        seuilAlerte: donnees.seuilAlerte,
        datePeremption: donnees.datePeremption ? new Date(donnees.datePeremption) : null,
        actif: true,
      },
      select: selectionMedicament,
    });

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "CREATION_MEDICAMENT",
      entite: "medicament",
      entiteId: medicament.id,
      detail: { nom: medicament.nom },
    });

    return medicament;
  }, OPTIONS_TRANSACTION);
}

/**
 * Ajout en stock depuis la ligne du tableau.
 * Même nom, forme, catégorie, prix d'achat, prix de vente et date de péremption qu'un médicament actif :
 * la quantité s'ajoute à son stock. Sinon, une nouvelle ligne (nouveau médicament) est créée avec ce stock.
 */
export async function ajouterAuStock(donnees: DonneesMedicament & { quantite: number }, auteurId: number) {
  await verifierCategorie(donnees.categorieId);
  const datePeremption = donnees.datePeremption ? new Date(donnees.datePeremption) : null;

  return prisma.$transaction(async (transaction) => {
    const identique = await transaction.medicament.findFirst({
      where: {
        actif: true,
        nom: { equals: donnees.nom, mode: "insensitive" },
        forme: donnees.forme,
        categorieId: donnees.categorieId,
        prixAchat: donnees.prixAchat,
        prixVente: donnees.prixVente,
        datePeremption,
      },
      select: { id: true },
    });

    const medicament = identique
      ? await transaction.medicament.findUniqueOrThrow({ where: { id: identique.id }, select: selectionMedicament })
      : await transaction.medicament.create({
          data: {
            nom: donnees.nom,
            forme: donnees.forme,
            categorieId: donnees.categorieId,
            prixAchat: donnees.prixAchat,
            prixVente: donnees.prixVente,
            seuilAlerte: donnees.seuilAlerte,
            datePeremption,
            actif: true,
          },
          select: selectionMedicament,
        });

    if (identique) await verrouillerMedicaments(transaction, [medicament.id]);
    await transaction.mouvementStock.create({
      data: {
        medicamentId: medicament.id,
        type: TypeMouvement.ENTREE,
        quantite: donnees.quantite,
        prixAchatUnitaire: donnees.prixAchat,
        motif: "Ajout en stock",
        utilisateurId: auteurId,
      },
    });

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: identique ? "AJOUT_STOCK" : "CREATION_MEDICAMENT",
      entite: "medicament",
      entiteId: medicament.id,
      detail: { nom: medicament.nom, quantite: donnees.quantite, fusionne: Boolean(identique) },
    });

    return { medicament, fusionne: Boolean(identique) };
  }, OPTIONS_TRANSACTION);
}

// Catégorie des produits créés depuis un approvisionnement, à reclasser ensuite par la Direction.
const CATEGORIE_A_CLASSER = "À classer";

/**
 * Création rapide depuis l'approvisionnement : nom et forme seulement.
 * Catégorie « À classer » (créée au besoin), prix et seuil à 0, à compléter ensuite dans la fiche.
 */
export async function creerMedicamentRapide(nom: string, forme: string, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const categorie = await transaction.categorieMedicament.upsert({
      where: { nom: CATEGORIE_A_CLASSER },
      update: {},
      create: { nom: CATEGORIE_A_CLASSER },
      select: { id: true },
    });
    const medicament = await transaction.medicament.create({
      data: { nom, forme, categorieId: categorie.id, prixAchat: 0, prixVente: 0, seuilAlerte: 0, actif: true },
      select: selectionMedicament,
    });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "CREATION_MEDICAMENT",
      entite: "medicament",
      entiteId: medicament.id,
      detail: { nom: medicament.nom, rapide: true },
    });
    return medicament;
  }, OPTIONS_TRANSACTION);
}

/**
 * Création de plusieurs médicaments en une fois (saisie en tableau) : tout ou rien.
 * @throws 400 CATEGORIE_INTROUVABLE
 */
export async function creerMedicamentsEnLot(liste: DonneesMedicament[], auteurId: number) {
  for (const categorieId of new Set(liste.map((donnees) => donnees.categorieId))) {
    await verifierCategorie(categorieId);
  }

  return prisma.$transaction(async (transaction) => {
    const crees = [];
    for (const donnees of liste) {
      const medicament = await transaction.medicament.create({
        data: {
          nom: donnees.nom,
          forme: donnees.forme,
          categorieId: donnees.categorieId,
          prixAchat: donnees.prixAchat,
          prixVente: donnees.prixVente,
          seuilAlerte: donnees.seuilAlerte,
          datePeremption: donnees.datePeremption ? new Date(donnees.datePeremption) : null,
          actif: true,
        },
        select: selectionMedicament,
      });
      await enregistrerAudit(transaction, {
        utilisateurId: auteurId,
        action: "CREATION_MEDICAMENT",
        entite: "medicament",
        entiteId: medicament.id,
        detail: { nom: medicament.nom, enLot: true },
      });
      crees.push(medicament);
    }
    return crees;
  }, OPTIONS_TRANSACTION);
}

// R068 : modifier un prix exige une confirmation et est tracé avec les anciennes valeurs.
export async function modifierMedicament(id: number, donnees: DonneesModificationMedicament, auteurId: number) {
  const existant = await prisma.medicament.findUnique({
    where: { id },
    select: { id: true, prixAchat: true, prixVente: true },
  });
  if (!existant) {
    throw new ErreurHttp(404, "MEDICAMENT_INTROUVABLE");
  }

  const prixAchatModifie = donnees.prixAchat !== undefined && donnees.prixAchat !== existant.prixAchat;
  const prixVenteModifie = donnees.prixVente !== undefined && donnees.prixVente !== existant.prixVente;
  const prixModifie = prixAchatModifie || prixVenteModifie;

  if (prixModifie && !donnees.confirmationPrix) {
    throw new ErreurHttp(400, "CONFIRMATION_PRIX_REQUISE");
  }

  if (donnees.categorieId !== undefined) {
    await verifierCategorie(donnees.categorieId);
  }

  const miseAJour = {
    ...(donnees.nom !== undefined ? { nom: donnees.nom } : {}),
    ...(donnees.forme !== undefined ? { forme: donnees.forme } : {}),
    ...(donnees.categorieId !== undefined ? { categorieId: donnees.categorieId } : {}),
    ...(donnees.prixAchat !== undefined ? { prixAchat: donnees.prixAchat } : {}),
    ...(donnees.prixVente !== undefined ? { prixVente: donnees.prixVente } : {}),
    ...(donnees.seuilAlerte !== undefined ? { seuilAlerte: donnees.seuilAlerte } : {}),
    ...(donnees.datePeremption !== undefined
      ? { datePeremption: donnees.datePeremption ? new Date(donnees.datePeremption) : null }
      : {}),
  };

  return prisma.$transaction(async (transaction) => {
    const medicament = await transaction.medicament.update({
      where: { id },
      data: miseAJour,
      select: selectionMedicament,
    });

    if (prixModifie) {
      await enregistrerAudit(transaction, {
        utilisateurId: auteurId,
        action: "MODIFICATION_PRIX",
        entite: "medicament",
        entiteId: id,
        detail: {
          ancienPrixAchat: existant.prixAchat,
          nouveauPrixAchat: medicament.prixAchat,
          ancienPrixVente: existant.prixVente,
          nouveauPrixVente: medicament.prixVente,
        },
      });
    }

    return { medicament, avertissement: avertissementPrix(medicament.prixAchat, medicament.prixVente) };
  }, OPTIONS_TRANSACTION);
}

// R075 : un médicament n'est jamais supprimé, il est désactivé.
export async function changerActifMedicament(id: number, actif: boolean, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const existant = await transaction.medicament.findUnique({ where: { id }, select: { id: true } });
    if (!existant) {
      throw new ErreurHttp(404, "MEDICAMENT_INTROUVABLE");
    }

    const medicament = await transaction.medicament.update({ where: { id }, data: { actif }, select: selectionMedicament });

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: actif ? "ACTIVATION_MEDICAMENT" : "DESACTIVATION_MEDICAMENT",
      entite: "medicament",
      entiteId: id,
    });

    return medicament;
  }, OPTIONS_TRANSACTION);
}

// R066 : ajustement d'inventaire avec motif obligatoire. R056 : le stock ne devient jamais négatif.
export async function ajusterStock(id: number, quantite: number, motif: string, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const existant = await transaction.medicament.findUnique({ where: { id }, select: { id: true } });
    if (!existant) {
      throw new ErreurHttp(404, "MEDICAMENT_INTROUVABLE");
    }

    await verrouillerMedicaments(transaction, [id]);
    const stockActuel = (await calculerStocks(transaction, [id])).get(id) ?? 0;
    if (stockActuel + quantite < 0) {
      throw new ErreurHttp(409, "STOCK_INSUFFISANT", { stock: stockActuel });
    }

    await transaction.mouvementStock.create({
      data: { medicamentId: id, type: TypeMouvement.AJUSTEMENT, quantite, motif, utilisateurId: auteurId },
    });

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "AJUSTEMENT_STOCK",
      entite: "medicament",
      entiteId: id,
      detail: { quantite, motif },
    });

    return { stock: stockActuel + quantite };
  }, OPTIONS_TRANSACTION);
}

export async function listerMouvementsDuMedicament(id: number, page = 1, taille = TAILLE_PAGE) {
  const medicament = await prisma.medicament.findUnique({ where: { id }, select: { id: true } });
  if (!medicament) {
    throw new ErreurHttp(404, "MEDICAMENT_INTROUVABLE");
  }
  const [mouvements, total] = await prisma.$transaction([
    prisma.mouvementStock.findMany({
      where: { medicamentId: id },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: (page - 1) * taille,
      take: taille,
      select: {
        id: true,
        type: true,
        quantite: true,
        date: true,
        motif: true,
        prixAchatUnitaire: true,
        utilisateur: { select: { id: true, nom: true } },
      },
    }),
    prisma.mouvementStock.count({ where: { medicamentId: id } }),
  ]);
  return { mouvements, total, page, taille };
}

// ---------- Recherche pour les soignants et le comptoir ----------
// Le prescripteur ne voit ni stock ni prix. Le comptoir voit le prix de vente et une disponibilité (oui/non), jamais la quantité.

export async function rechercherPourPrescripteur(terme: string) {
  const medicaments = await prisma.medicament.findMany({
    where: { actif: true, nom: { contains: terme.trim(), mode: "insensitive" } },
    select: { id: true, nom: true, forme: true, datePeremption: true, categorie: { select: { nom: true } } },
    orderBy: { nom: "asc" },
    take: LIMITE_RECHERCHE,
  });
  // Un médicament périmé reste affiché (grisé) mais ne peut pas être prescrit.
  return medicaments.map((medicament) => ({
    id: medicament.id,
    nom: medicament.nom,
    forme: medicament.forme,
    categorie: medicament.categorie.nom,
    perime: estPerime(medicament.datePeremption),
  }));
}

export async function rechercherPourComptoir(terme: string) {
  const medicaments = await prisma.medicament.findMany({
    where: { actif: true, nom: { contains: terme.trim(), mode: "insensitive" } },
    select: { id: true, nom: true, forme: true, prixVente: true, datePeremption: true },
    orderBy: { nom: "asc" },
    take: LIMITE_RECHERCHE,
  });
  const stocks = await calculerStocks(prisma, medicaments.map((medicament) => medicament.id));
  return medicaments.map((medicament) => ({
    id: medicament.id,
    nom: medicament.nom,
    forme: medicament.forme,
    prixVente: medicament.prixVente,
    disponible: (stocks.get(medicament.id) ?? 0) > 0,
    perime: estPerime(medicament.datePeremption),
  }));
}

// ---------- Catégories ----------

export async function listerCategories() {
  const categories = await prisma.categorieMedicament.findMany({
    select: { id: true, nom: true, _count: { select: { medicaments: true } } },
    orderBy: { nom: "asc" },
  });
  return categories.map((categorie) => ({ id: categorie.id, nom: categorie.nom, nombre: categorie._count.medicaments }));
}

export async function creerCategorie(nom: string, auteurId: number) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const categorie = await transaction.categorieMedicament.create({ data: { nom }, select: { id: true, nom: true } });
      await enregistrerAudit(transaction, {
        utilisateurId: auteurId,
        action: "CREATION_CATEGORIE",
        entite: "categorie_medicament",
        entiteId: categorie.id,
        detail: { nom },
      });
      return categorie;
    }, OPTIONS_TRANSACTION);
  } catch (erreur) {
    if (estViolationUnique(erreur)) {
      throw new ErreurHttp(409, "CATEGORIE_EXISTANTE");
    }
    throw erreur;
  }
}

export async function renommerCategorie(id: number, nom: string, auteurId: number) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const categorie = await transaction.categorieMedicament.update({ where: { id }, data: { nom }, select: { id: true, nom: true } });
      await enregistrerAudit(transaction, {
        utilisateurId: auteurId,
        action: "MODIFICATION_CATEGORIE",
        entite: "categorie_medicament",
        entiteId: id,
        detail: { nom },
      });
      return categorie;
    }, OPTIONS_TRANSACTION);
  } catch (erreur) {
    if (estViolationUnique(erreur)) {
      throw new ErreurHttp(409, "CATEGORIE_EXISTANTE");
    }
    throw erreur;
  }
}

// R074 : une catégorie utilisée ne peut pas être supprimée.
export async function supprimerCategorie(id: number, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const categorie = await transaction.categorieMedicament.findUnique({
      where: { id },
      select: { id: true, nom: true, _count: { select: { medicaments: true } } },
    });
    if (!categorie) {
      throw new ErreurHttp(404, "CATEGORIE_INTROUVABLE");
    }
    if (categorie._count.medicaments > 0) {
      throw new ErreurHttp(409, "CATEGORIE_UTILISEE");
    }
    await transaction.categorieMedicament.delete({ where: { id } });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "SUPPRESSION_CATEGORIE",
      entite: "categorie_medicament",
      entiteId: id,
      detail: { nom: categorie.nom },
    });
    return { id };
  }, OPTIONS_TRANSACTION);
}

// ---------- Fournisseurs ----------

export async function listerFournisseurs() {
  const fournisseurs = await prisma.fournisseur.findMany({
    select: {
      id: true,
      nom: true,
      telephone: true,
      actif: true,
      approvisionnements: {
        select: { mouvements: { where: { type: TypeMouvement.ENTREE }, select: { quantite: true, prixAchatUnitaire: true } } },
      },
    },
    orderBy: { nom: "asc" },
  });

  return fournisseurs.map((fournisseur) => {
    const mouvements = fournisseur.approvisionnements.flatMap((approvisionnement) => approvisionnement.mouvements);
    return {
      id: fournisseur.id,
      nom: fournisseur.nom,
      telephone: fournisseur.telephone,
      actif: fournisseur.actif,
      nombreApprovisionnements: fournisseur.approvisionnements.length,
      montantTotal: mouvements.reduce((somme, mouvement) => somme + mouvement.quantite * (mouvement.prixAchatUnitaire ?? 0), 0),
    };
  });
}

export async function creerFournisseur(nom: string, telephone: string | null, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const fournisseur = await transaction.fournisseur.create({
      data: { nom, telephone },
      select: { id: true, nom: true, telephone: true, actif: true },
    });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "CREATION_FOURNISSEUR",
      entite: "fournisseur",
      entiteId: fournisseur.id,
      detail: { nom },
    });
    return fournisseur;
  }, OPTIONS_TRANSACTION);
}

export async function changerActifFournisseur(id: number, actif: boolean, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const existant = await transaction.fournisseur.findUnique({ where: { id }, select: { id: true } });
    if (!existant) {
      throw new ErreurHttp(404, "FOURNISSEUR_INTROUVABLE");
    }
    const fournisseur = await transaction.fournisseur.update({
      where: { id },
      data: { actif },
      select: { id: true, nom: true, telephone: true, actif: true },
    });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: actif ? "ACTIVATION_FOURNISSEUR" : "DESACTIVATION_FOURNISSEUR",
      entite: "fournisseur",
      entiteId: id,
    });
    return fournisseur;
  }, OPTIONS_TRANSACTION);
}

// ---------- Approvisionnements (R072) ----------

/** Lignes d'approvisionnement, les plus récentes d'abord, page par page (15 par page). */
export async function listerApprovisionnements(page = 1, taille = TAILLE_PAGE) {
  const where = { type: TypeMouvement.ENTREE, approvisionnementId: { not: null } };
  const [mouvements, total] = await prisma.$transaction([
    prisma.mouvementStock.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: (page - 1) * taille,
      take: taille,
      select: {
        id: true,
        quantite: true,
        prixAchatUnitaire: true,
        date: true,
        approvisionnementId: true,
        medicament: { select: { nom: true } },
        approvisionnement: { select: { dateReception: true, reference: true, fournisseur: { select: { nom: true } } } },
      },
    }),
    prisma.mouvementStock.count({ where }),
  ]);

  const lignes = mouvements.map((mouvement) => ({
    id: mouvement.id,
    approvisionnementId: mouvement.approvisionnementId,
    date: mouvement.approvisionnement?.dateReception ?? mouvement.date,
    reference: mouvement.approvisionnement?.reference ?? null,
    fournisseur: mouvement.approvisionnement?.fournisseur.nom ?? null,
    medicament: mouvement.medicament.nom,
    quantite: mouvement.quantite,
    prixAchatUnitaire: mouvement.prixAchatUnitaire,
    montant: mouvement.quantite * (mouvement.prixAchatUnitaire ?? 0),
  }));
  return { approvisionnements: lignes, total, page, taille };
}

/**
 * Un approvisionnement complet, toutes ses lignes : bon de réception à revoir ou à réimprimer.
 * @throws 404 APPROVISIONNEMENT_INTROUVABLE
 */
export async function lireApprovisionnement(id: number) {
  const approvisionnement = await prisma.approvisionnement.findUnique({
    where: { id },
    select: {
      id: true,
      dateReception: true,
      reference: true,
      fournisseur: { select: { nom: true, telephone: true } },
      mouvements: {
        where: { type: TypeMouvement.ENTREE },
        orderBy: { id: "asc" },
        select: {
          id: true,
          quantite: true,
          prixAchatUnitaire: true,
          date: true,
          utilisateur: { select: { nom: true } },
          medicament: { select: { nom: true, forme: true } },
        },
      },
    },
  });
  if (!approvisionnement) throw new ErreurHttp(404, "APPROVISIONNEMENT_INTROUVABLE");

  const lignes = approvisionnement.mouvements.map((mouvement) => ({
    id: mouvement.id,
    medicament: mouvement.medicament.nom,
    forme: mouvement.medicament.forme,
    quantite: mouvement.quantite,
    prixAchatUnitaire: mouvement.prixAchatUnitaire ?? 0,
    montant: mouvement.quantite * (mouvement.prixAchatUnitaire ?? 0),
  }));
  const premier = approvisionnement.mouvements[0];
  return {
    id: approvisionnement.id,
    dateReception: approvisionnement.dateReception,
    reference: approvisionnement.reference,
    fournisseur: approvisionnement.fournisseur.nom,
    telephoneFournisseur: approvisionnement.fournisseur.telephone,
    enregistreLe: premier?.date ?? null,
    enregistrePar: premier?.utilisateur?.nom ?? null,
    lignes,
    total: lignes.reduce((somme, ligne) => somme + ligne.montant, 0),
  };
}

// Un approvisionnement peut contenir plusieurs lignes. Le prix d'achat du médicament n'est pas modifié (R073 à valider).
export async function enregistrerApprovisionnement(donnees: DonneesApprovisionnement, auteurId: number) {
  const fournisseur = await prisma.fournisseur.findUnique({ where: { id: donnees.fournisseurId }, select: { actif: true } });
  if (!fournisseur || !fournisseur.actif) {
    throw new ErreurHttp(400, "FOURNISSEUR_INACTIF");
  }

  const identifiants = [...new Set(donnees.lignes.map((ligne) => ligne.medicamentId))];
  const medicaments = await prisma.medicament.findMany({ where: { id: { in: identifiants }, actif: true }, select: { id: true } });
  if (medicaments.length !== identifiants.length) {
    throw new ErreurHttp(400, "MEDICAMENT_INACTIF");
  }

  return prisma.$transaction(async (transaction) => {
    const approvisionnement = await transaction.approvisionnement.create({
      data: {
        fournisseurId: donnees.fournisseurId,
        dateReception: new Date(donnees.dateReception),
        reference: donnees.reference ?? null,
      },
    });

    await transaction.mouvementStock.createMany({
      data: donnees.lignes.map((ligne) => ({
        medicamentId: ligne.medicamentId,
        type: TypeMouvement.ENTREE,
        quantite: ligne.quantite,
        prixAchatUnitaire: ligne.prixAchatUnitaire,
        approvisionnementId: approvisionnement.id,
        utilisateurId: auteurId,
      })),
    });

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "APPROVISIONNEMENT",
      entite: "approvisionnement",
      entiteId: approvisionnement.id,
      detail: { lignes: donnees.lignes.length },
    });

    return { approvisionnementId: approvisionnement.id, lignes: donnees.lignes.length };
  }, OPTIONS_TRANSACTION);
}

// ---------- Bon de commande et inventaire ----------

// R076 : médicaments en rupture ou sous leur seuil d'alerte.
export async function listerProduitsACommander() {
  const medicaments = await lireMedicamentsAvecStock();
  return medicaments
    .filter((medicament) => medicament.actif && medicament.etat !== "OK")
    .sort((a, b) => (a.etat === "RUPTURE" ? 0 : 1) - (b.etat === "RUPTURE" ? 0 : 1) || a.nom.localeCompare(b.nom))
    .map((medicament) => ({
      id: medicament.id,
      nom: medicament.nom,
      forme: medicament.forme,
      stock: medicament.stock,
      seuilAlerte: medicament.seuilAlerte,
      etat: medicament.etat,
    }));
}

// R077 : fiche d'inventaire avec le stock système.
/**
 * Fiche d'inventaire : prix, marge, quantité commandée (entrées en stock), quantité délivrée ou vendue
 * (sorties, moins les retours) et observation selon l'état (périmé, rupture, proche de péremption…).
 */
export async function listerInventaire() {
  const medicaments = (await lireMedicamentsAvecStock()).filter((medicament) => medicament.actif);
  const mouvements = await prisma.mouvementStock.groupBy({
    by: ["medicamentId", "type"],
    where: {
      medicamentId: { in: medicaments.map((medicament) => medicament.id) },
      type: { in: [TypeMouvement.ENTREE, TypeMouvement.SORTIE, TypeMouvement.RETOUR] },
    },
    _sum: { quantite: true },
  });
  const somme = (medicamentId: number, type: TypeMouvement) =>
    mouvements.find((ligne) => ligne.medicamentId === medicamentId && ligne.type === type)?._sum.quantite ?? 0;

  return medicaments
    .sort((a, b) => a.nom.localeCompare(b.nom))
    .map((medicament) => ({
      id: medicament.id,
      nom: medicament.nom,
      forme: medicament.forme,
      prixAchat: medicament.prixAchat,
      prixVente: medicament.prixVente,
      marge: medicament.marge,
      stockSysteme: medicament.stock,
      quantiteCommandee: somme(medicament.id, TypeMouvement.ENTREE),
      // Les sorties sont négatives ; un retour (annulation, retrait) les compense.
      quantiteDelivree: Math.max(0, -somme(medicament.id, TypeMouvement.SORTIE) - somme(medicament.id, TypeMouvement.RETOUR)),
      observation: observationInventaire(medicament),
    }));
}
