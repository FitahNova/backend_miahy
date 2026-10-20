import { prisma } from "../config/prisma.js";
import { PREFIXE_NUMERO_DOSSIER } from "../config/constants.js";
import { Role } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { normaliserTelephone, MESSAGE_TELEPHONE } from "../utils/telephone.js";
import { champsModifies } from "../utils/audit.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";

const NOMBRE_CHIFFRES_NUMERO_DOSSIER = 4; // MIA-0001 : 8 caractères au total
const NOMBRE_ESSAIS_CREATION = 3;
const LIMITE_RESULTATS_RECHERCHE = 50;
const NOMBRE_MINIMAL_CHIFFRES_TELEPHONE = 3;

// Le téléphone est déjà normalisé par ce service : on accepte la saisie brute, et on la transforme ici.
type DonneesCreationPatient = Omit<Prisma.PatientUncheckedCreateInput, "numeroDossier" | "telephone"> & {
  telephone?: string | null;
};

type DonneesModificationPatient = Omit<Prisma.PatientUncheckedUpdateInput, "telephone"> & {
  telephone?: string | null;
};

async function verifierProgrammeExistant(programmeId: number | null | undefined) {
  if (programmeId == null) return;
  const programme = await prisma.programme.findUnique({ where: { id: programmeId } });
  if (!programme) {
    throw new ErreurHttp(400, "PROGRAMME_INCONNU");
  }
}

// Numéro optionnel : vide = null, valide = +261XXXXXXXXX, invalide = refus avant toute écriture.
function telephoneCanonique(saisie: string | null | undefined): string | null {
  if (saisie === undefined || saisie === null || saisie.trim() === "") return null;
  const telephone = normaliserTelephone(saisie);
  if (!telephone) {
    throw new ErreurHttp(400, MESSAGE_TELEPHONE);
  }
  return telephone;
}

async function calculerProchainNumeroDossier(): Promise<string> {
  const dernierPatient = await prisma.patient.findFirst({
    orderBy: { numeroDossier: "desc" },
    select: { numeroDossier: true },
  });
  const dernierNumero = dernierPatient
    ? Number.parseInt(dernierPatient.numeroDossier.slice(PREFIXE_NUMERO_DOSSIER.length), 10)
    : 0;
  return `${PREFIXE_NUMERO_DOSSIER}${String(dernierNumero + 1).padStart(NOMBRE_CHIFFRES_NUMERO_DOSSIER, "0")}`;
}

// Recherche :
// - un numéro complet (034 12 345 67, +261 34 12 345 67, 261341234567) : correspondance exacte ;
// - une saisie de chiffres seulement (ex : 3412) : correspondance partielle sur le téléphone ;
// - sinon : chaque mot doit correspondre à un nom, un prénom ou un numéro de dossier.
function construireFiltreRecherche(recherche: string | undefined): Prisma.PatientWhereInput {
  const brut = (recherche ?? "").trim();
  if (brut === "") {
    return { actif: true };
  }

  const telephoneComplet = normaliserTelephone(brut);
  if (telephoneComplet) {
    return { actif: true, telephone: telephoneComplet };
  }

  const sansLettres = !/[a-zA-ZÀ-ÿ]/.test(brut);
  if (sansLettres) {
    // Le 0 initial du format local n'est pas enregistré après +261 : on le retire pour la recherche partielle.
    const chiffres = brut.replace(/\D/g, "").replace(/^0/, "");
    if (chiffres.length >= NOMBRE_MINIMAL_CHIFFRES_TELEPHONE) {
      return { actif: true, telephone: { contains: chiffres } };
    }
  }

  const mots = brut.split(/\s+/);
  return {
    actif: true,
    AND: mots.map((mot) => ({
      OR: [
        { nom: { contains: mot, mode: "insensitive" as const } },
        { prenom: { contains: mot, mode: "insensitive" as const } },
        { numeroDossier: { contains: mot, mode: "insensitive" as const } },
      ],
    })),
  };
}

// R024 : téléphone, adresse et contact de confiance masqués pour le Médecin et la Sage-femme.
const ROLES_SANS_COORDONNEES: Role[] = [Role.MEDECIN, Role.SAGE_FEMME];

export function coordonneesVisibles(role: Role): boolean {
  return !ROLES_SANS_COORDONNEES.includes(role);
}

export function masquerCoordonnees<
  T extends { telephone: string | null; adresse: string | null; contactConfiance: string | null },
>(patient: T, role: Role): T {
  if (coordonneesVisibles(role)) return patient;
  return { ...patient, telephone: null, adresse: null, contactConfiance: null };
}

export async function listerPatientsParRecherche(role: Role, recherche?: string) {
  const patients = await prisma.patient.findMany({
    where: construireFiltreRecherche(recherche),
    include: { programme: { select: { id: true, nom: true } } },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    take: LIMITE_RESULTATS_RECHERCHE,
  });
  return patients.map((patient) => masquerCoordonnees(patient, role));
}

async function lirePatient(identifiant: number) {
  const patient = await prisma.patient.findUnique({
    where: { id: identifiant },
    include: { programme: true },
  });
  if (!patient) {
    throw new ErreurHttp(404, "PATIENT_INTROUVABLE");
  }
  return patient;
}

export async function obtenirPatientParIdentifiant(identifiant: number, role: Role) {
  return masquerCoordonnees(await lirePatient(identifiant), role);
}

// R017 : même nom et même téléphone qu'un patient existant → doublon probable, à confirmer.
async function chercherDoublon(nom: string, telephone: string | null) {
  if (!telephone) return null;
  return prisma.patient.findFirst({
    where: { telephone, nom: { equals: nom.trim(), mode: "insensitive" } },
    select: { numeroDossier: true },
  });
}

export async function creerNouveauPatient(donnees: DonneesCreationPatient, auteurId: number, confirmerDoublon = false) {
  // Validation du téléphone avant toute écriture.
  const telephone = telephoneCanonique(donnees.telephone);
  await verifierProgrammeExistant(donnees.programmeId);

  if (!confirmerDoublon) {
    const doublon = await chercherDoublon(donnees.nom, telephone);
    if (doublon) throw new ErreurHttp(409, "DOUBLON_POSSIBLE", { numeroDossier: doublon.numeroDossier });
  }

  for (let essai = 1; essai <= NOMBRE_ESSAIS_CREATION; essai++) {
    const numeroDossier = await calculerProchainNumeroDossier();
    try {
      return await prisma.$transaction(async (tx) => {
        const patient = await tx.patient.create({
          data: { ...donnees, telephone, numeroDossier },
          include: { programme: true },
        });
        await enregistrerAudit(tx, { utilisateurId: auteurId, action: "PATIENT_CREE", entite: "patient", entiteId: patient.id });
        return patient;
      }, OPTIONS_TRANSACTION);
    } catch (erreur) {
      // P2002 : numéro déjà pris par une création simultanée, on recalcule.
      const numeroDejaPris = (erreur as { code?: string }).code === "P2002";
      if (!numeroDejaPris || essai === NOMBRE_ESSAIS_CREATION) throw erreur;
    }
  }

  throw new ErreurHttp(500, "NUMERO_DOSSIER_ECHEC");
}

export async function modifierPatientExistant(identifiant: number, donnees: DonneesModificationPatient, auteurId: number) {
  await lirePatient(identifiant);
  await verifierProgrammeExistant(donnees.programmeId as number | null | undefined);

  // Le téléphone n'est modifié que s'il est fourni dans la requête.
  const telephone = donnees.telephone !== undefined ? telephoneCanonique(donnees.telephone) : undefined;

  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.update({
      where: { id: identifiant },
      data: { ...donnees, telephone },
      include: { programme: true },
    });
    // Données de santé : seuls les noms des champs sont journalisés, jamais les valeurs.
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "PATIENT_MODIFIE",
      entite: "patient",
      entiteId: identifiant,
      detail: { champs: champsModifies(donnees) },
    });
    return patient;
  }, OPTIONS_TRANSACTION);
}