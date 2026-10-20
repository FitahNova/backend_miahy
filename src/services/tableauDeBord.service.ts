/*
 * Tableaux de bord (dossier §6.13, maquette « Direction »).
 * - Direction : activité ET finances.
 * - Médecin chef : activité seulement (matrice de droits : « Partiel (activité) ») ; aucun montant n'est calculé.
 * Définitions (dossier §6.13) :
 * - Patients vus = patients distincts ayant un passage sur la période ; Passages = nombre de passages.
 * - Chiffre d'affaires = total encaissé (paiements) ; panier moyen = CA ÷ patients ayant payé.
 * - Attente moyenne = moyenne de (début de consultation − arrivée).
 * - Nouveaux patients = patients dont le premier passage a lieu sur la période.
 * - Variation = comparaison avec la période de même durée qui précède.
 * Toutes les dates sont lues dans le fuseau du centre (Madagascar, UTC+3).
 */
import { prisma } from "../config/prisma.js";
import { Role, StatutFacture, StatutRendezVous } from "../generated/prisma/client.js";
import { calculerStocks } from "./medicaments.service.js";
import { lireTotalMensuel } from "./charges.service.js";

const FUSEAU = "Indian/Antananarivo";
const DECALAGE_FUSEAU = "+03:00";
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
const MS_PAR_MINUTE = 60 * 1000;
const JOURS_SEMAINE = 7;

export type Periode = "7j" | "30j" | "90j" | "12m";

/** Jour AAAA-MM-JJ d'une date, dans le fuseau du centre. */
function jourDuCentre(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(date);
}

function debutDuJour(jour: string): Date {
  return new Date(`${jour}T00:00:00${DECALAGE_FUSEAU}`);
}

function ajouterJours(jour: string, nombre: number): string {
  return jourDuCentre(new Date(debutDuJour(jour).getTime() + nombre * MS_PAR_JOUR + MS_PAR_JOUR / 2));
}

const finances = (role: Role) => role === Role.DIRECTION;

/** Passages (patient + heures) et paiements (montant + patient) entre deux instants. */
async function lireActivite(debut: Date, fin: Date, avecFinances: boolean) {
  const [passages, paiements] = await Promise.all([
    prisma.passage.findMany({
      where: { heureArrivee: { gte: debut, lt: fin } },
      select: { patientId: true, heureArrivee: true, heureDebut: true },
    }),
    avecFinances
      ? prisma.paiement.findMany({
          where: { date: { gte: debut, lt: fin } },
          select: { montant: true, date: true, facture: { select: { patientId: true } } },
        })
      : Promise.resolve([]),
  ]);
  return { passages, paiements };
}

/** Patients dont le premier passage tombe dans l'intervalle. */
async function compterNouveauxPatients(debut: Date, fin: Date): Promise<number> {
  const premiers = await prisma.passage.groupBy({ by: ["patientId"], _min: { heureArrivee: true } });
  return premiers.filter((ligne) => {
    const premier = ligne._min.heureArrivee;
    return premier !== null && premier >= debut && premier < fin;
  }).length;
}

function resumer(
  activite: Awaited<ReturnType<typeof lireActivite>>,
  avecFinances: boolean,
) {
  const patients = new Set(activite.passages.map((passage) => passage.patientId)).size;
  const attentes = activite.passages
    .filter((passage) => passage.heureDebut)
    .map((passage) => (passage.heureDebut!.getTime() - passage.heureArrivee.getTime()) / MS_PAR_MINUTE);
  const attenteMoyenne = attentes.length ? Math.round(attentes.reduce((a, b) => a + b, 0) / attentes.length) : null;
  const resume = { patients, passages: activite.passages.length, attenteMoyenneMinutes: attenteMoyenne };
  if (!avecFinances) return resume;
  const chiffreAffaires = activite.paiements.reduce((somme, paiement) => somme + paiement.montant, 0);
  const payeurs = new Set(activite.paiements.map((paiement) => paiement.facture.patientId)).size;
  return { ...resume, chiffreAffaires, panierMoyen: payeurs ? Math.round(chiffreAffaires / payeurs) : null };
}

/**
 * Blocs « Aujourd'hui » et « Ce mois », programmes et alertes.
 * Les montants ne sont présents que pour la Direction.
 */
export async function obtenirSynthese(role: Role) {
  const avecFinances = finances(role);
  const aujourdhui = jourDuCentre(new Date());
  const debutJour = debutDuJour(aujourdhui);
  const finJour = debutDuJour(ajouterJours(aujourdhui, 1));
  const debutMois = debutDuJour(`${aujourdhui.slice(0, 8)}01`);

  const [activiteJour, activiteMois, nouveauxMois, programmes, alertes] = await Promise.all([
    lireActivite(debutJour, finJour, avecFinances),
    lireActivite(debutMois, finJour, avecFinances),
    compterNouveauxPatients(debutMois, finJour),
    syntheseProgrammes(),
    lireAlertes(avecFinances),
  ]);

  const mois = resumer(activiteMois, avecFinances);
  return {
    aujourdhui: resumer(activiteJour, avecFinances),
    ceMois: {
      ...mois,
      nouveauxPatients: nouveauxMois,
      patientsDejaSuivis: Math.max(0, mois.patients - nouveauxMois),
      ...(avecFinances && "chiffreAffaires" in mois ? await calculerResultatDuMois(aujourdhui, mois.chiffreAffaires) : {}),
    },
    programmes,
    alertes,
  };
}

/**
 * Résultat du mois (R140, Direction seule) : encaissements des patients + versements des partenaires
 * − charges fixes du mois (trimestrielles ÷ 3, annuelles ÷ 12). Les charges « à fixer » sont signalées.
 */
async function calculerResultatDuMois(aujourdhui: string, encaisseMois: number) {
  const premierDuMois = new Date(`${aujourdhui.slice(0, 8)}01T00:00:00.000Z`);
  const [versements, charges] = await Promise.all([
    prisma.versementPartenaire.aggregate({ where: { date: { gte: premierDuMois } }, _sum: { montant: true } }),
    lireTotalMensuel(),
  ]);
  const versePartenaires = Math.round(Number(versements._sum.montant ?? 0));
  return {
    versementsPartenaires: versePartenaires,
    chargesFixes: charges.total,
    chargesAFixer: charges.aFixer,
    resultat: encaisseMois + versePartenaires - charges.total,
  };
}

/** Programmes MIAHY : patients inscrits et rendez-vous en retard (prévus et dépassés). */
async function syntheseProgrammes() {
  const [programmes, retards] = await Promise.all([
    prisma.programme.findMany({
      where: { actif: true },
      orderBy: { id: "asc" },
      select: { id: true, nom: true, _count: { select: { patients: { where: { actif: true } } } } },
    }),
    prisma.rendezVous.findMany({
      where: { statut: StatutRendezVous.PREVU, dateHeure: { lt: new Date() } },
      select: { patient: { select: { programmeId: true } } },
    }),
  ]);
  return programmes.map((programme) => ({
    id: programme.id,
    nom: programme.nom,
    patients: programme._count.patients,
    aRevoir: retards.filter((retard) => retard.patient.programmeId === programme.id).length,
  }));
}

/** Alertes de la maquette disponibles avec les données actuelles. */
async function lireAlertes(avecFinances: boolean) {
  const alertes: { cle: string; nombre: number; libelle: string; lien: string; gravite: "erreur" | "avertissement" }[] = [];

  const rdvEnRetard = await prisma.rendezVous.count({
    where: { statut: StatutRendezVous.PREVU, dateHeure: { lt: new Date() } },
  });
  if (rdvEnRetard) {
    alertes.push({ cle: "rdv", nombre: rdvEnRetard, libelle: "rendez-vous dépassés à traiter", lien: "/rendez-vous", gravite: "erreur" });
  }

  const medicaments = await prisma.medicament.findMany({ where: { actif: true }, select: { id: true, seuilAlerte: true } });
  const stocks = await calculerStocks(prisma, medicaments.map((medicament) => medicament.id));
  const sousSeuil = medicaments.filter((medicament) => (stocks.get(medicament.id) ?? 0) < medicament.seuilAlerte).length;
  if (sousSeuil) {
    alertes.push({ cle: "stock", nombre: sousSeuil, libelle: "médicaments sous le seuil d'alerte", lien: "/medicaments", gravite: "avertissement" });
  }

  if (avecFinances) {
    const derniere = await prisma.clotureCaisse.findFirst({ orderBy: { jour: "desc" }, select: { ecart: true } });
    if (derniere && derniere.ecart !== 0) {
      alertes.push({ cle: "ecart", nombre: derniere.ecart, libelle: "écart à la dernière clôture de caisse", lien: "/caisse", gravite: "avertissement" });
    }
    const partiels = await prisma.facture.count({ where: { statut: StatutFacture.PARTIEL } });
    if (partiels) {
      alertes.push({ cle: "partiels", nombre: partiels, libelle: "paiements partiels (reste dû)", lien: "/caisse", gravite: "avertissement" });
    }
  }
  return alertes;
}

// ---------- Évolution ----------

const NOMS_MOIS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const NOMS_JOURS = ["D", "L", "M", "M", "J", "V", "S"];
const MOIS_PAR_AN = 12;

interface Tranche {
  libelle: string;
  debut: string;
  fin: string; // exclu
}

/** Découpe de la période en tranches (jours, semaines ou mois), de la plus ancienne à la plus récente. */
function decouper(periode: Periode, aujourdhui: string): Tranche[] {
  const tranches: Tranche[] = [];
  if (periode === "12m") {
    const [annee, mois] = aujourdhui.split("-").map(Number);
    for (let k = MOIS_PAR_AN - 1; k >= 0; k--) {
      const date = new Date(Date.UTC(annee, mois - 1 - k, 1));
      const suivant = new Date(Date.UTC(annee, mois - k, 1));
      tranches.push({
        libelle: NOMS_MOIS[date.getUTCMonth()],
        debut: date.toISOString().slice(0, 10),
        fin: suivant.toISOString().slice(0, 10),
      });
    }
    return tranches;
  }
  const [nombre, pas] = periode === "7j" ? [7, 1] : periode === "30j" ? [30, 1] : [13, JOURS_SEMAINE];
  const demain = ajouterJours(aujourdhui, 1);
  for (let k = nombre - 1; k >= 0; k--) {
    const fin = ajouterJours(demain, -k * pas);
    const debut = ajouterJours(fin, -pas);
    const date = debutDuJour(debut);
    const jourSemaine = new Date(date.getTime() + MS_PAR_JOUR / 2).getUTCDay();
    const [, m, j] = debut.split("-").map(Number);
    tranches.push({
      libelle: pas === 1 ? (k === 0 ? "Auj." : `${NOMS_JOURS[jourSemaine]} ${j}`) : `S ${j}/${m}`,
      debut,
      fin,
    });
  }
  return tranches;
}


export async function obtenirEvolution(periode: Periode, role: Role) {
  const avecFinances = finances(role);
  const aujourdhui = jourDuCentre(new Date());
  const tranches = decouper(periode, aujourdhui);
  const debut = debutDuJour(tranches[0].debut);
  const fin = debutDuJour(tranches[tranches.length - 1].fin);
  const duree = fin.getTime() - debut.getTime();
  const debutPrecedent = new Date(debut.getTime() - duree);

  const [activite, precedente] = await Promise.all([
    lireActivite(debut, fin, avecFinances),
    lireActivite(debutPrecedent, debut, avecFinances),
  ]);

  const points = tranches.map((tranche) => {
    const a = debutDuJour(tranche.debut).getTime();
    const b = debutDuJour(tranche.fin).getTime();
    const dans = (date: Date) => date.getTime() >= a && date.getTime() < b;
    const patients = new Set(activite.passages.filter((p) => dans(p.heureArrivee)).map((p) => p.patientId)).size;
    const revenus = avecFinances
      ? activite.paiements.filter((p) => dans(p.date)).reduce((somme, p) => somme + p.montant, 0)
      : undefined;
    return { libelle: tranche.libelle, debut: tranche.debut, patients, ...(avecFinances ? { revenus } : {}) };
  });

  const jours = Math.round(duree / MS_PAR_JOUR);
  return {
    periode,
    jours,
    points,
    total: resumer(activite, avecFinances),
    precedent: resumer(precedente, avecFinances),
  };
}
