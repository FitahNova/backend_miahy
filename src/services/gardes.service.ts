import { prisma } from "../config/prisma.js";
import { PeriodeGarde, Role } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { compterGardes, type PersonneGarde } from "../utils/gardes.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { CABINET } from "./impression.service.js";

// Personnes pouvant être de garde : médecin chef, médecin et sage-femme (comme dans la maquette).
const ROLES_DE_GARDE: Role[] = [Role.MEDECIN, Role.MEDECIN_CHEF, Role.SAGE_FEMME];
const MILLISECONDES_PAR_JOUR = 24 * 60 * 60 * 1000;
const FUSEAU_HORAIRE = "Indian/Antananarivo";

// Dates au format AAAA-MM-JJ, sans heure : pas de décalage de fuseau.
function lireJour(texte: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) throw new ErreurHttp(400, "DATE_INVALIDE");
  return new Date(`${texte}T00:00:00.000Z`);
}

function ajouterJours(date: Date, nombre: number): Date {
  return new Date(date.getTime() + nombre * MILLISECONDES_PAR_JOUR);
}

function versTexte(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Date du jour à Madagascar (AAAA-MM-JJ).
export function aujourdhuiMada(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU_HORAIRE }).format(new Date());
}

// Un jour passé ne se modifie plus : seuls aujourd'hui et les jours à venir sont modifiables.
function verifierJourModifiable(date: string): void {
  if (date < aujourdhuiMada()) throw new ErreurHttp(400, "GARDE_JOUR_PASSE");
}

const SELECTION_PERSONNE = { select: { id: true, civilite: true, nom: true, prenom: true } } as const;

// Semaine de 7 jours à partir du lundi : pour chaque jour, les personnes de garde de jour et de nuit.
export async function lireSemaine(debut: string) {
  const premier = lireJour(debut);
  const gardes = await prisma.gardeJour.findMany({
    where: { date: { gte: premier, lt: ajouterJours(premier, 7) } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: { date: true, periode: true, utilisateur: SELECTION_PERSONNE },
  });

  const parCreneau = new Map<string, PersonneGarde[]>();
  for (const garde of gardes) {
    const cle = `${versTexte(garde.date)}|${garde.periode}`;
    parCreneau.set(cle, [...(parCreneau.get(cle) ?? []), garde.utilisateur]);
  }

  const jours = Array.from({ length: 7 }, (_, index) => {
    const date = versTexte(ajouterJours(premier, index));
    return { date, jour: parCreneau.get(`${date}|JOUR`) ?? [], nuit: parCreneau.get(`${date}|NUIT`) ?? [] };
  });

  return { debut, jours, compteurs: compterGardes(gardes) };
}

// Gardes de jour, de nuit et au total par personne sur un mois civil, personnes à zéro comprises.
export async function lireCompteursMois(mois: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) throw new ErreurHttp(400, "DATE_INVALIDE");
  const [annee, numeroMois] = mois.split("-").map(Number);
  const debut = new Date(Date.UTC(annee, numeroMois - 1, 1));
  const fin = new Date(Date.UTC(annee, numeroMois, 1));

  const [personnes, gardes] = await Promise.all([
    listerPersonnesDeGarde(),
    prisma.gardeJour.findMany({
      where: { date: { gte: debut, lt: fin } },
      select: { periode: true, utilisateur: SELECTION_PERSONNE },
    }),
  ]);
  return compterGardes(gardes, personnes);
}

// Personnes pouvant être de garde (actives uniquement).
export function listerPersonnesDeGarde() {
  return prisma.utilisateur.findMany({
    where: { actif: true, role: { in: ROLES_DE_GARDE } },
    select: { id: true, civilite: true, nom: true, prenom: true, role: true },
    orderBy: { nom: "asc" },
  });
}

// Ajoute une personne à la garde de jour ou de nuit d'un jour (aujourd'hui ou à venir), sans toucher aux autres.
export async function ajouterPersonneGarde(date: string, periode: PeriodeGarde, utilisateurId: number, auteurId: number) {
  const jour = lireJour(date);
  verifierJourModifiable(date);

  const personne = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { actif: true, role: true },
  });
  if (!personne) throw new ErreurHttp(404, "UTILISATEUR_INTROUVABLE");
  if (!personne.actif || !ROLES_DE_GARDE.includes(personne.role)) {
    throw new ErreurHttp(400, "GARDE_ROLE_INVALIDE");
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.gardeJour.upsert({
      where: { date_utilisateurId_periode: { date: jour, utilisateurId, periode } },
      create: { date: jour, utilisateurId, periode },
      update: {},
    });

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "AJOUT_GARDE",
      entite: "garde",
      entiteId: utilisateurId,
      detail: { date, periode },
    });

    return { date, periode, utilisateurId };
  }, OPTIONS_TRANSACTION);
}

// Retire une personne de la garde de jour ou de nuit d'un jour (aujourd'hui ou à venir seulement).
export async function retirerPersonneGarde(date: string, periode: PeriodeGarde, utilisateurId: number, auteurId: number) {
  const jour = lireJour(date);
  verifierJourModifiable(date);

  return prisma.$transaction(async (transaction) => {
    const resultat = await transaction.gardeJour.deleteMany({ where: { date: jour, utilisateurId, periode } });
    if (resultat.count === 0) throw new ErreurHttp(404, "GARDE_INTROUVABLE");

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "RETRAIT_GARDE",
      entite: "garde",
      entiteId: utilisateurId,
      detail: { date, periode },
    });

    return { date, periode, utilisateurId };
  }, OPTIONS_TRANSACTION);
}

// Copie la semaine précédente : pour chaque jour de la semaine source qui a des gardes, remplace le jour
// correspondant de la semaine cible. Les jours passés de la cible ne sont jamais modifiés.
export async function copierSemaine(debutSource: string, debutCible: string, auteurId: number) {
  const source = await lireSemaine(debutSource);
  const premierCible = lireJour(debutCible);
  const aujourdhui = aujourdhuiMada();

  const jourCibles = source.jours
    .map((jour, index) => ({ date: ajouterJours(premierCible, index), jour: jour.jour, nuit: jour.nuit }))
    .filter((jour) => jour.jour.length + jour.nuit.length > 0)
    .filter((jour) => versTexte(jour.date) >= aujourdhui);

  const aCreer = jourCibles.flatMap((jour) => [
    ...jour.jour.map((personne) => ({ date: jour.date, periode: PeriodeGarde.JOUR, utilisateurId: personne.id })),
    ...jour.nuit.map((personne) => ({ date: jour.date, periode: PeriodeGarde.NUIT, utilisateurId: personne.id })),
  ]);

  return prisma.$transaction(async (transaction) => {
    if (jourCibles.length > 0) {
      await transaction.gardeJour.deleteMany({ where: { date: { in: jourCibles.map((jour) => jour.date) } } });
    }
    const resultat = await transaction.gardeJour.createMany({ data: aCreer });

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "COPIE_SEMAINE_GARDES",
      entite: "garde",
      entiteId: null,
      detail: { debutSource, debutCible, copiees: resultat.count },
    });

    return { copiees: resultat.count };
  }, OPTIONS_TRANSACTION);
}

// Règlement affiché sur le planning : une règle par ligne, dans l'ordre.
export function lireReglement() {
  return prisma.reglementGarde.findMany({
    orderBy: { ordre: "asc" },
    select: { id: true, ordre: true, texte: true },
  });
}

export async function remplacerReglement(lignes: string[], auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    await transaction.reglementGarde.deleteMany({});
    if (lignes.length > 0) {
      await transaction.reglementGarde.createMany({
        data: lignes.map((texte, index) => ({ ordre: index + 1, texte })),
      });
    }

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "MODIFICATION_REGLEMENT_GARDES",
      entite: "reglement_garde",
      entiteId: null,
      detail: { regles: lignes.length },
    });

    return transaction.reglementGarde.findMany({
      orderBy: { ordre: "asc" },
      select: { id: true, ordre: true, texte: true },
    });
  }, OPTIONS_TRANSACTION);
}

// Données du planning imprimable : semaine, règlement, médecin chef.
export async function obtenirPlanningImpression(debut: string) {
  const semaine = await lireSemaine(debut);
  const reglement = await lireReglement();
  const chef = await prisma.utilisateur.findFirst({
    where: { actif: true, role: Role.MEDECIN_CHEF },
    select: { civilite: true, nom: true, prenom: true },
  });
  return { cabinet: CABINET, semaine, reglement, chef, date: new Date().toISOString() };
}
