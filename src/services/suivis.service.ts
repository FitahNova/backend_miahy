import { prisma } from "../config/prisma.js";
import { JOURS_AVANT_A_CONTACTER } from "../config/constants.js";
import {
  CanalContact,
  MotifClotureSuivi,
  OrigineSuivi,
  ResultatContact,
  Role,
  type Prisma,
} from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { bornesListe, classerSuivi, decalerJour, jourDuCentre, joursDeRetard, typeDepuisMotif, type ListeSuivi } from "../utils/suivis.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { coordonneesVisibles } from "./patients.service.js";

export interface UtilisateurConnecte {
  id: number;
  role: Role;
}

const LIMITE_HISTORIQUE = 100;

const jourEnDate = (jour: string) => new Date(`${jour}T00:00:00.000Z`);
const dateEnJour = (date: Date) => date.toISOString().slice(0, 10);

const selectionSuivi = {
  id: true,
  echeance: true,
  origine: true,
  note: true,
  creeLe: true,
  clotureLe: true,
  motifCloture: true,
  rendezVousId: true,
  type: { select: { id: true, nom: true } },
  patient: {
    select: {
      id: true,
      numeroDossier: true,
      nom: true,
      prenom: true,
      sexe: true,
      dateNaissance: true,
      telephone: true,
      programme: { select: { nom: true } },
    },
  },
  contacts: { orderBy: { date: "desc" }, take: 1, select: { date: true, canal: true, resultat: true, note: true } },
  _count: { select: { contacts: true } },
} satisfies Prisma.SuiviSelect;

type SuiviLu = Prisma.SuiviGetPayload<{ select: typeof selectionSuivi }>;

/** Forme envoyée au front : liste calculée, retard, nombre de contacts ; téléphone masqué selon le rôle (R130). */
function presenter(suivi: SuiviLu, role: Role, aujourdhui: string) {
  const { _count, contacts, patient, ...reste } = suivi;
  const echeance = dateEnJour(suivi.echeance);
  return {
    ...reste,
    echeance,
    liste: suivi.clotureLe ? ("historique" as const) : classerSuivi(echeance, aujourdhui),
    joursRetard: suivi.clotureLe ? 0 : joursDeRetard(echeance, aujourdhui),
    nombreContacts: _count.contacts,
    dernierContact: contacts[0] ?? null,
    patient: { ...patient, telephone: coordonneesVisibles(role) ? patient.telephone : null },
  };
}

function filtreListe(liste: ListeSuivi, aujourdhui: string): Prisma.SuiviWhereInput {
  const { du, au } = bornesListe(liste, aujourdhui);
  return {
    clotureLe: null,
    echeance: { ...(du ? { gte: jourEnDate(du) } : {}), ...(au ? { lte: jourEnDate(au) } : {}) },
  };
}

/** Une liste : à contacter, en retard, perdus de vue (échéance la plus ancienne d'abord), ou historique. */
export async function listerSuivis(liste: ListeSuivi | "historique", utilisateur: UtilisateurConnecte) {
  const aujourdhui = jourDuCentre();
  const suivis =
    liste === "historique"
      ? await prisma.suivi.findMany({
          where: { clotureLe: { not: null } },
          orderBy: { clotureLe: "desc" },
          take: LIMITE_HISTORIQUE,
          select: selectionSuivi,
        })
      : await prisma.suivi.findMany({
          where: filtreListe(liste, aujourdhui),
          orderBy: [{ echeance: "asc" }, { id: "asc" }],
          select: selectionSuivi,
        });
  return suivis.map((suivi) => presenter(suivi, utilisateur.role, aujourdhui));
}

/** Nombre de suivis par liste (onglets et compteur du menu). */
export async function compterSuivis() {
  const aujourdhui = jourDuCentre();
  const [aContacter, enRetard, perdusDeVue] = await Promise.all(
    (["a-contacter", "en-retard", "perdus-de-vue"] as const).map((liste) =>
      prisma.suivi.count({ where: filtreListe(liste, aujourdhui) }),
    ),
  );
  return { aContacter, enRetard, perdusDeVue };
}

/** Suivis d'un patient (fiche patient), ouverts d'abord. */
export async function listerSuivisDuPatient(patientId: number, utilisateur: UtilisateurConnecte) {
  const aujourdhui = jourDuCentre();
  const suivis = await prisma.suivi.findMany({
    where: { patientId },
    orderBy: [{ clotureLe: { sort: "desc", nulls: "first" } }, { echeance: "asc" }],
    select: selectionSuivi,
  });
  return suivis.map((suivi) => presenter(suivi, utilisateur.role, aujourdhui));
}

async function lireTypeActif(client: Prisma.TransactionClient, typeId: number) {
  const type = await client.typeSuivi.findUnique({ where: { id: typeId }, select: { actif: true } });
  if (!type?.actif) throw new ErreurHttp(400, "TYPE_SUIVI_INVALIDE");
}

/**
 * Suivi saisi à la main (R121).
 * @throws 404 PATIENT_INTROUVABLE ; 400 TYPE_SUIVI_INVALIDE
 */
export async function creerSuivi(
  donnees: { patientId: number; typeId: number; echeance: string; note?: string | null },
  auteur: UtilisateurConnecte,
) {
  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({ where: { id: donnees.patientId }, select: { actif: true } });
    if (!patient?.actif) throw new ErreurHttp(404, "PATIENT_INTROUVABLE");
    await lireTypeActif(tx, donnees.typeId);
    const suivi = await tx.suivi.create({
      data: {
        patientId: donnees.patientId,
        typeId: donnees.typeId,
        echeance: jourEnDate(donnees.echeance),
        origine: OrigineSuivi.MANUEL,
        note: donnees.note ?? null,
        creeParId: auteur.id,
      },
      select: { id: true },
    });
    await enregistrerAudit(tx, { utilisateurId: auteur.id, action: "SUIVI_CREE", entite: "suivi", entiteId: suivi.id });
    return suivi;
  }, OPTIONS_TRANSACTION);
}

/**
 * Suivi créé par l'application : revue programmée en consultation, ou rendez-vous manqué.
 * Le type est deviné d'après le motif (« Contrôle tension » → Contrôle, sinon « Autre »).
 */
export async function creerSuiviAutomatique(
  tx: Prisma.TransactionClient,
  donnees: { patientId: number; motif: string; echeance: string; origine: OrigineSuivi; rendezVousId?: number; creeParId: number },
) {
  const types = await tx.typeSuivi.findMany({ where: { actif: true }, select: { id: true, nom: true } });
  const nom = typeDepuisMotif(donnees.motif, types.map((type) => type.nom));
  const type = types.find((candidat) => candidat.nom === nom) ?? types[0];
  if (!type) return null; // aucun type actif : la Direction a tout désactivé
  return tx.suivi.create({
    data: {
      patientId: donnees.patientId,
      typeId: type.id,
      echeance: jourEnDate(donnees.echeance),
      origine: donnees.origine,
      note: donnees.motif.slice(0, 255),
      rendezVousId: donnees.rendezVousId ?? null,
      creeParId: donnees.creeParId,
    },
    select: { id: true },
  });
}

/**
 * Le patient revient (nouveau passage) : ses suivis échus ou proches sont clôturés (R128).
 * Un suivi à échéance lointaine reste ouvert. Renvoie le nombre de suivis clôturés.
 */
export async function cloturerSuivisAuRetour(tx: Prisma.TransactionClient, patientId: number) {
  const limite = decalerJour(jourDuCentre(), JOURS_AVANT_A_CONTACTER);
  const { count } = await tx.suivi.updateMany({
    where: { patientId, clotureLe: null, echeance: { lte: jourEnDate(limite) } },
    data: { clotureLe: new Date(), motifCloture: MotifClotureSuivi.RETOUR_PATIENT },
  });
  return count;
}

/**
 * Note un appel ou un message (R126). Un suivi clôturé ne reçoit plus de contact.
 * @throws 404 SUIVI_INTROUVABLE ; 409 SUIVI_CLOTURE
 */
export async function noterContact(
  suiviId: number,
  donnees: { canal: CanalContact; resultat: ResultatContact; note?: string | null },
  auteur: UtilisateurConnecte,
) {
  const suivi = await prisma.suivi.findUnique({ where: { id: suiviId }, select: { clotureLe: true } });
  if (!suivi) throw new ErreurHttp(404, "SUIVI_INTROUVABLE");
  if (suivi.clotureLe) throw new ErreurHttp(409, "SUIVI_CLOTURE");
  return prisma.contactSuivi.create({
    data: { suiviId, canal: donnees.canal, resultat: donnees.resultat, note: donnees.note ?? null, auteurId: auteur.id },
    select: { id: true, date: true, canal: true, resultat: true, note: true },
  });
}

/**
 * Clôture à la main (le patient a été vu ailleurs, a déménagé, suivi inutile…), avec une note.
 * @throws 404 SUIVI_INTROUVABLE ; 409 SUIVI_CLOTURE
 */
export async function cloturerSuivi(suiviId: number, note: string | null, auteur: UtilisateurConnecte) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.suivi.updateMany({
      where: { id: suiviId, clotureLe: null },
      data: { clotureLe: new Date(), motifCloture: MotifClotureSuivi.MANUELLE, clotureParId: auteur.id },
    });
    if (count === 0) {
      const existe = await tx.suivi.findUnique({ where: { id: suiviId }, select: { id: true } });
      throw existe ? new ErreurHttp(409, "SUIVI_CLOTURE") : new ErreurHttp(404, "SUIVI_INTROUVABLE");
    }
    await enregistrerAudit(tx, {
      utilisateurId: auteur.id,
      action: "SUIVI_CLOTURE",
      entite: "suivi",
      entiteId: suiviId,
      // La note peut contenir une information médicale : jamais recopiée dans le journal.
      detail: { avecNote: Boolean(note) },
    });
  }, OPTIONS_TRANSACTION);
}

// ---------- Types de suivi (liste extensible par la Direction) ----------

export function listerTypesSuivi() {
  return prisma.typeSuivi.findMany({ orderBy: { nom: "asc" }, select: { id: true, nom: true, actif: true } });
}

/** @throws 409 TYPE_SUIVI_EXISTANT */
export async function creerTypeSuivi(nom: string, auteur: UtilisateurConnecte) {
  const existant = await prisma.typeSuivi.findFirst({ where: { nom: { equals: nom, mode: "insensitive" } } });
  if (existant) throw new ErreurHttp(409, "TYPE_SUIVI_EXISTANT");
  return prisma.$transaction(async (tx) => {
    const type = await tx.typeSuivi.create({ data: { nom }, select: { id: true, nom: true, actif: true } });
    await enregistrerAudit(tx, { utilisateurId: auteur.id, action: "TYPE_SUIVI_CREE", entite: "type_suivi", entiteId: type.id });
    return type;
  }, OPTIONS_TRANSACTION);
}

/** Active ou désactive un type (un type désactivé n'est plus proposé ; les suivis existants le gardent). */
export async function changerActifTypeSuivi(typeId: number, actif: boolean, auteur: UtilisateurConnecte) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.typeSuivi.updateMany({ where: { id: typeId }, data: { actif } });
    if (count === 0) throw new ErreurHttp(404, "TYPE_SUIVI_INTROUVABLE");
    await enregistrerAudit(tx, {
      utilisateurId: auteur.id,
      action: actif ? "TYPE_SUIVI_ACTIVE" : "TYPE_SUIVI_DESACTIVE",
      entite: "type_suivi",
      entiteId: typeId,
    });
  }, OPTIONS_TRANSACTION);
}
