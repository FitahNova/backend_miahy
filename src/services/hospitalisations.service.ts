import { prisma } from "../config/prisma.js";
import { StatutFacture, StatutPassage, TypeLigneFacture } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { calculerTarif } from "../utils/tarification.js";
import { dureeHospitalisation, sortieApresProlongation, sortiePrevue } from "../utils/hospitalisation.js";
import { enregistrerAudit } from "./audit.service.js";
import { creerFactureComplementaire, recalculerStatutsDuPassage } from "./facturation.service.js";
import { lireParametresTarification } from "./tarification.service.js";

const LIMITE_SORTIS = 100;
/** Rappel aux soignants : sortie dans moins d'une heure (prolonger si besoin). */
const RAPPEL_SORTIE_MS = 60 * 60 * 1000;

const CIVILITES: Record<string, string> = { DR: "Dr", MME: "Mme", M: "M." };
const libellePersonne = (personne: { civilite: string | null; nom: string; prenom: string | null }) =>
  [personne.civilite ? CIVILITES[personne.civilite] : null, personne.prenom?.trim() || personne.nom].filter(Boolean).join(" ");
const personne = { select: { civilite: true, nom: true, prenom: true } } as const;

const heure = (date: Date) =>
  date.toLocaleString("fr-FR", { timeZone: "Indian/Antananarivo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Actes d'hospitalisation courte du catalogue (actifs), avec leur durée : pour admettre et pour prolonger. */
export async function listerFormulesHospitalisation(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const services = await client.service.findMany({
    where: { actif: true },
    select: { id: true, nom: true, prix: true, dureeHeures: true, categorie: { select: { nom: true } } },
    orderBy: { id: "asc" },
  });
  return services
    .map((service) => ({ ...service, duree: dureeHospitalisation(service) }))
    .filter((service): service is typeof service & { duree: number } => service.duree !== null)
    .sort((a, b) => a.duree - b.duree);
}

/**
 * À la signature d'une consultation : un acte d'hospitalisation parmi les actes crée le séjour (arrivée maintenant,
 * sortie prévue choisie par le soignant ou calculée). Rien sinon. À appeler dans la transaction de la signature.
 */
export async function admettreSiHospitalisation(
  transaction: Prisma.TransactionClient,
  donnees: { passageId: number; actes: number[]; sortieChoisie?: string | null; motif?: string | null; auteurId: number },
) {
  const formules = await listerFormulesHospitalisation(transaction);
  const formule = formules.find((service) => donnees.actes.includes(service.id));
  if (!formule) return null;
  const arrivee = new Date();
  const choisie = donnees.sortieChoisie ? new Date(donnees.sortieChoisie) : null;
  const sortie = sortiePrevue(arrivee, formule.duree, choisie && !Number.isNaN(choisie.getTime()) ? choisie : null);
  const hospitalisation = await transaction.hospitalisation.create({
    data: {
      passageId: donnees.passageId,
      admisParId: donnees.auteurId,
      motif: donnees.motif?.trim() || null,
      arrivee,
      sortiePrevue: sortie,
      evenements: { create: { type: "ADMISSION", texte: `Admission · ${formule.nom} · sortie prévue le ${heure(sortie)}`, auteurId: donnees.auteurId } },
    },
    select: { id: true },
  });
  await enregistrerAudit(transaction, {
    utilisateurId: donnees.auteurId,
    action: "HOSPITALISATION_ADMISSION",
    entite: "hospitalisation",
    entiteId: hospitalisation.id,
    detail: { passageId: donnees.passageId, formule: formule.nom, sortiePrevue: sortie.toISOString() },
  });
  return hospitalisation;
}

const selectionHospitalisation = {
  id: true,
  passageId: true,
  motif: true,
  arrivee: true,
  sortiePrevue: true,
  sortieLe: true,
  admisPar: personne,
  passage: { select: { patient: { select: { id: true, nom: true, prenom: true, numeroDossier: true } } } },
  evenements: { select: { type: true, texte: true, creeLe: true, auteur: personne }, orderBy: { creeLe: "asc" } },
} satisfies Prisma.HospitalisationSelect;

type HospitalisationLue = Prisma.HospitalisationGetPayload<{ select: typeof selectionHospitalisation }>;

const versVue = (hospitalisation: HospitalisationLue) => ({
  id: hospitalisation.id,
  passageId: hospitalisation.passageId,
  patient: hospitalisation.passage.patient,
  motif: hospitalisation.motif,
  arrivee: hospitalisation.arrivee,
  sortiePrevue: hospitalisation.sortiePrevue,
  sortieLe: hospitalisation.sortieLe,
  admisPar: libellePersonne(hospitalisation.admisPar),
  historique: hospitalisation.evenements.map((evenement) => ({
    type: evenement.type,
    texte: evenement.texte,
    le: evenement.creeLe,
    par: libellePersonne(evenement.auteur),
  })),
});

/**
 * Sortie automatique (décision du 24/11/2026) : un séjour dont l'heure de sortie prévue est passée se termine à cette
 * heure-là, sans action du soignant. Appelé avant chaque lecture ; l'événement est tracé au nom du soignant qui a admis.
 */
export async function cloturerSejoursEchus(maintenant = new Date()) {
  const echus = await prisma.hospitalisation.findMany({
    where: { sortieLe: null, sortiePrevue: { lte: maintenant } },
    select: { id: true, sortiePrevue: true, admisParId: true },
  });
  for (const sejour of echus) {
    await prisma.hospitalisation.updateMany({
      where: { id: sejour.id, sortieLe: null },
      data: { sortieLe: sejour.sortiePrevue },
    });
    await prisma.evenementHospitalisation.create({
      data: { hospitalisationId: sejour.id, type: "SORTIE", texte: "Sortie automatique à l'heure prévue", auteurId: sejour.admisParId, creeLe: sejour.sortiePrevue },
    });
  }
  return echus.length;
}

/** En cours (sortie prévue la plus proche d'abord) ou sortis (les plus récents d'abord). */
export async function listerHospitalisations(etat: "en-cours" | "sortis") {
  await cloturerSejoursEchus();
  const liste = await prisma.hospitalisation.findMany({
    where: { sortieLe: etat === "en-cours" ? null : { not: null } },
    select: selectionHospitalisation,
    orderBy: etat === "en-cours" ? { sortiePrevue: "asc" } : { sortieLe: "desc" },
    ...(etat === "sortis" ? { take: LIMITE_SORTIS } : {}),
  });
  return liste.map(versVue);
}

/** Hospitalisations dont la sortie arrive dans moins d'une heure (cloche des soignants : prolonger si besoin). */
export async function compterSortiesProches(maintenant = new Date()) {
  await cloturerSejoursEchus(maintenant);
  return prisma.hospitalisation.count({
    where: { sortieLe: null, sortiePrevue: { gt: maintenant, lte: new Date(maintenant.getTime() + RAPPEL_SORTIE_MS) } },
  });
}

async function lireEnCours(transaction: Prisma.TransactionClient, id: number) {
  await cloturerSejoursEchus();
  const hospitalisation = await transaction.hospitalisation.findUnique({
    where: { id },
    select: { id: true, passageId: true, sortiePrevue: true, sortieLe: true, passage: { select: { patientId: true, statut: true } } },
  });
  if (!hospitalisation) throw new ErreurHttp(404, "HOSPITALISATION_INTROUVABLE");
  if (hospitalisation.sortieLe) throw new ErreurHttp(409, "HOSPITALISATION_TERMINEE");
  return hospitalisation;
}

/**
 * Prolongation : une formule de plus. Elle s'ajoute comme acte sur une facture du passage non encore payée (sinon une
 * facture complémentaire) et la sortie prévue recule d'autant. Le passage revient en caisse s'il était soldé.
 * @throws 404 HOSPITALISATION_INTROUVABLE · 409 HOSPITALISATION_TERMINEE · 400 FORMULE_INCONNUE · 409 PRIX_SERVICE_A_FIXER
 */
export async function prolongerHospitalisation(id: number, donnees: { serviceId: number; motif: string }, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const hospitalisation = await lireEnCours(transaction, id);
    const formule = (await listerFormulesHospitalisation(transaction)).find((service) => service.id === donnees.serviceId);
    if (!formule) throw new ErreurHttp(400, "FORMULE_INCONNUE");
    if (formule.prix === null) throw new ErreurHttp(409, "PRIX_SERVICE_A_FIXER", { service: formule.nom });

    const [patient, parametres] = await Promise.all([
      transaction.patient.findUniqueOrThrow({ where: { id: hospitalisation.passage.patientId }, select: { nationalite: true } }),
      lireParametresTarification(transaction),
    ]);
    const tarif = calculerTarif(formule.prix, { nationalite: patient.nationalite, date: new Date() }, parametres);

    // Facture sans paiement ni convention figée, sinon une facture complémentaire (comme pour la pharmacie).
    const cible =
      (await transaction.facture.findFirst({
        where: { passageId: hospitalisation.passageId, statut: StatutFacture.A_PAYER, montantPaye: 0, conventionFigeeLe: null },
        orderBy: { id: "asc" },
        select: { id: true },
      })) ?? (await creerFactureComplementaire(transaction, { passageId: hospitalisation.passageId, patientId: hospitalisation.passage.patientId }));
    await transaction.ligneFacture.create({
      data: {
        factureId: cible.id,
        type: TypeLigneFacture.ACTE,
        serviceId: formule.id,
        libelle: formule.nom,
        quantite: 1,
        prixUnitaire: tarif.prix,
        prixBase: tarif.prixBase,
        nationalite: tarif.nationalite,
        tauxEtranger: tarif.tauxEtranger,
        tauxSoir: tarif.tauxSoir,
      },
    });
    await transaction.facture.update({
      where: { id: cible.id },
      data: { total: { increment: tarif.prix }, partPatient: { increment: tarif.prix } },
    });
    // Passage déjà soldé : il revient en caisse pour la prolongation.
    if (hospitalisation.passage.statut === StatutPassage.TERMINE) {
      await transaction.passage.update({ where: { id: hospitalisation.passageId }, data: { statut: StatutPassage.CAISSE, heureFin: null } });
    }
    await recalculerStatutsDuPassage(transaction, hospitalisation.passageId);

    const sortie = sortieApresProlongation(hospitalisation.sortiePrevue, formule.duree);
    await transaction.hospitalisation.update({
      where: { id },
      data: {
        sortiePrevue: sortie,
        evenements: {
          create: { type: "PROLONGATION", texte: `Prolongation · + ${formule.nom} · ${donnees.motif.trim()} · sortie prévue le ${heure(sortie)}`.slice(0, 255), auteurId },
        },
      },
    });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "HOSPITALISATION_PROLONGATION",
      entite: "hospitalisation",
      entiteId: id,
      detail: { formule: formule.nom, motif: donnees.motif.trim(), sortiePrevue: sortie.toISOString(), factureId: cible.id },
    });
    return { sortiePrevue: sortie };
  }, OPTIONS_TRANSACTION);
}

/** Sortie anticipée, avant l'heure prévue : le séjour se termine maintenant (la facture s'encaisse à la caisse). */
export async function sortirHospitalisation(id: number, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    await lireEnCours(transaction, id);
    const sortieLe = new Date();
    await transaction.hospitalisation.update({
      where: { id },
      data: { sortieLe, evenements: { create: { type: "SORTIE", texte: "Sortie anticipée", auteurId } } },
    });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "HOSPITALISATION_SORTIE",
      entite: "hospitalisation",
      entiteId: id,
      detail: { sortieLe: sortieLe.toISOString() },
    });
    return { sortieLe };
  }, OPTIONS_TRANSACTION);
}
