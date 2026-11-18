import { prisma } from "../config/prisma.js";
import { calculerStocks } from "./medicaments.service.js";
import { estPerime } from "../utils/peremption.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { ErreurHttp } from "../utils/errors.js";
import { nomCompare } from "../utils/demandes.js";
import { enregistrerAudit } from "./audit.service.js";

const CIVILITES: Record<string, string> = { DR: "Dr", MME: "Mme", M: "M." };
/** « Dr Patrick » : civilité et prénom (le nom s'il n'y a pas de prénom), comme dans l'application. */
const libelleDemandeur = (personne: { civilite: string | null; nom: string; prenom: string | null }) =>
  [personne.civilite ? CIVILITES[personne.civilite] : null, personne.prenom?.trim() || personne.nom].filter(Boolean).join(" ");

export interface DonneesDemande {
  /** Médicament du centre en rupture ; sinon le nom saisi (et la forme) d'un médicament absent du centre. */
  medicamentId?: number | null;
  nom?: string | null;
  forme?: string | null;
  passageId?: number | null;
}

/**
 * Demande de commande envoyée par un soignant. Une demande encore ouverte du même soignant pour le même médicament
 * n'est pas recréée (un double clic ou une 2e ordonnance ne multiplie pas les alertes).
 * @throws 404 MEDICAMENT_INTROUVABLE · 400 NOM_OBLIGATOIRE
 */
export async function creerDemandeMedicament(donnees: DonneesDemande, demandeurId: number) {
  let nom = donnees.nom?.trim() ?? "";
  let forme = donnees.forme?.trim() || null;
  if (donnees.medicamentId) {
    const medicament = await prisma.medicament.findUnique({ where: { id: donnees.medicamentId }, select: { nom: true, forme: true } });
    if (!medicament) throw new ErreurHttp(404, "MEDICAMENT_INTROUVABLE");
    nom = medicament.nom;
    forme = medicament.forme;
  }
  if (!nom) throw new ErreurHttp(400, "NOM_OBLIGATOIRE");

  return prisma.$transaction(async (transaction) => {
    const ouvertes = await transaction.demandeMedicament.findMany({
      where: { demandeurId, traiteeLe: null },
      select: { id: true, nom: true },
    });
    const existante = ouvertes.find((demande) => nomCompare(demande.nom) === nomCompare(nom));
    if (existante) return { id: existante.id, dejaEnvoyee: true };

    const demande = await transaction.demandeMedicament.create({
      data: { nom, forme, medicamentId: donnees.medicamentId ?? null, demandeurId, passageId: donnees.passageId ?? null },
      select: { id: true },
    });
    await enregistrerAudit(transaction, {
      utilisateurId: demandeurId,
      action: "DEMANDE_MEDICAMENT",
      entite: "demande_medicament",
      entiteId: demande.id,
      detail: { nom, forme, medicamentId: donnees.medicamentId ?? null },
    });
    return { id: demande.id, dejaEnvoyee: false };
  }, OPTIONS_TRANSACTION);
}

export interface DemandesRegroupees {
  /** Nom comparé (sans majuscules ni accents) : un médicament, quelle que soit l'écriture. */
  cle: string;
  nom: string;
  forme: string | null;
  medicamentId: number | null;
  nombre: number;
  demandeurs: string[];
  derniere: Date;
}

/** Noms (comparés) des médicaments disponibles au centre : en stock et non périmés. */
async function nomsDisponibles(): Promise<Set<string>> {
  const medicaments = await prisma.medicament.findMany({ where: { actif: true }, select: { id: true, nom: true, datePeremption: true } });
  const stocks = await calculerStocks(prisma, medicaments.map((medicament) => medicament.id));
  return new Set(
    medicaments
      .filter((medicament) => (stocks.get(medicament.id) ?? 0) > 0 && !estPerime(medicament.datePeremption))
      .map((medicament) => nomCompare(medicament.nom)),
  );
}

/**
 * Demandes encore ouvertes, regroupées par médicament, la plus récente d'abord. Seuls les médicaments hors stock comptent :
 * une demande d'un médicament disponible au centre (stock revenu, ou saisi hors stock par erreur) n'est pas à commander.
 */
export async function listerDemandesOuvertes(): Promise<DemandesRegroupees[]> {
  const demandes = await prisma.demandeMedicament.findMany({
    where: { traiteeLe: null },
    select: {
      nom: true,
      forme: true,
      medicamentId: true,
      creeLe: true,
      demandeur: { select: { civilite: true, nom: true, prenom: true } },
    },
    orderBy: { creeLe: "desc" },
  });
  const groupes = new Map<string, DemandesRegroupees>();
  for (const demande of demandes) {
    const cle = nomCompare(demande.nom);
    const groupe = groupes.get(cle) ?? {
      cle,
      nom: demande.nom,
      forme: demande.forme,
      medicamentId: demande.medicamentId,
      nombre: 0,
      demandeurs: [],
      derniere: demande.creeLe,
    };
    groupe.nombre += 1;
    groupe.forme ??= demande.forme;
    groupe.medicamentId ??= demande.medicamentId;
    const auteur = libelleDemandeur(demande.demandeur);
    if (!groupe.demandeurs.includes(auteur)) groupe.demandeurs.push(auteur);
    groupes.set(cle, groupe);
  }
  if (groupes.size === 0) return [];
  const disponibles = await nomsDisponibles();
  return [...groupes.values()].filter((groupe) => !disponibles.has(groupe.cle));
}

/** La Direction a commandé (ou décidé) : toutes les demandes ouvertes de ce médicament sont traitées. */
export async function traiterDemandes(cle: string, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const ouvertes = await transaction.demandeMedicament.findMany({ where: { traiteeLe: null }, select: { id: true, nom: true } });
    const ids = ouvertes.filter((demande) => nomCompare(demande.nom) === cle).map((demande) => demande.id);
    if (ids.length === 0) throw new ErreurHttp(404, "DEMANDE_INTROUVABLE");
    await transaction.demandeMedicament.updateMany({ where: { id: { in: ids } }, data: { traiteeLe: new Date(), traiteeParId: auteurId } });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "DEMANDE_MEDICAMENT_TRAITEE",
      entite: "demande_medicament",
      entiteId: ids[0],
      detail: { nom: ouvertes.find((demande) => demande.id === ids[0])?.nom ?? cle, demandes: ids.length },
    });
    return { traitees: ids.length };
  }, OPTIONS_TRANSACTION);
}
