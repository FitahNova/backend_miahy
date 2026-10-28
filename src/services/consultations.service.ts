import { prisma } from "../config/prisma.js";
import { OrigineSuivi, Role, StatutPassage } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { verifierMotifGrossesse } from "../utils/motifs.js";
import { enregistrerAudit } from "./audit.service.js";
import { journaliserAcces } from "./journal.service.js";
import { terminerPassageDansTransaction } from "./passages.service.js";
import { creerRendezVousDeRevue } from "./rendezVous.service.js";
import { creerSuiviAutomatique } from "./suivis.service.js";
import { jourDuCentre } from "../utils/suivis.js";

export interface UtilisateurConnecte {
  id: number;
  role: Role;
}

export interface DonneesConsultation {
  /** Motif de la visite (pré-rempli à l'arrivée, corrigeable par le praticien). */
  motif?: string;
  /** Actes réalisés (identifiants de services) : facturés à la signature. */
  actes?: number[];
  tension?: string | null;
  poidsKg?: number | null;
  pouls?: number | null;
  temperature?: number | null;
  spo2?: number | null;
  glycemie?: number | null;
  examen?: string | null;
  diagnostic?: string | null;
  note?: string | null;
  suiviDelaiJours?: number | null;
  suiviMotif?: string | null;
  suiviHeure?: string | null;
}

// Un Médecin chef voit toutes les consultations.
// Un Médecin ou une Sage-femme n'accède qu'aux passages dont il est le praticien.
function verifierAccesAuPassage(passage: { praticienId: number | null }, utilisateur: UtilisateurConnecte) {
  if (utilisateur.role === Role.MEDECIN_CHEF) return;
  if (passage.praticienId !== utilisateur.id) {
    throw new ErreurHttp(403, "PATIENT_NON_ASSIGNE");
  }
}


/*
 * Les actes réalisés sont conservés dans le champ JSON « brouillon » de la consultation
 * (aucune colonne dédiée : pas de migration). Ils sont copiés sur la facture à la signature,
 * qui reste la trace définitive.
 */
interface Brouillon {
  actes?: number[];
}

function lireActes(brouillon: Prisma.JsonValue | null | undefined): number[] {
  const actes = (brouillon as Brouillon | null)?.actes;
  return Array.isArray(actes) ? actes.filter((id) => Number.isInteger(id)) : [];
}

const NOM_ACTE_PAR_DEFAUT = "Consultation";
const NOMBRE_VISITES_HISTORIQUE = 3;

/**
 * Consultation d'un passage, avec ce qu'il faut au praticien pour la remplir (maquette) :
 * motif, patient (âge, allergies, programme), dernières visites signées et actes facturables.
 */
export async function obtenirConsultationDuPassage(passageId: number, utilisateur: UtilisateurConnecte) {
  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: {
      id: true,
      statut: true,
      praticienId: true,
      motif: true,
      patient: {
        select: {
          id: true,
          numeroDossier: true,
          nom: true,
          prenom: true,
          sexe: true,
          dateNaissance: true,
          allergies: true,
          sensible: true,
          programme: { select: { nom: true } },
        },
      },
    },
  });
  if (!passage) throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");
  verifierAccesAuPassage(passage, utilisateur);

  // Trace de la lecture avant de renvoyer les données médicales.
  await journaliserAcces(utilisateur.id, "LECTURE_CONSULTATION", "passage", passageId);

  const [consultation, visites, services] = await Promise.all([
    prisma.consultation.findUnique({ where: { passageId } }),
    prisma.consultation.findMany({
      where: { signeeLe: { not: null }, passage: { patientId: passage.patient.id, id: { not: passageId } } },
      orderBy: { signeeLe: "desc" },
      take: NOMBRE_VISITES_HISTORIQUE,
      select: {
        signeeLe: true,
        diagnostic: true,
        tension: true,
        glycemie: true,
        poidsKg: true,
        passage: { select: { praticien: { select: { civilite: true, nom: true, prenom: true } } } },
      },
    }),
    prisma.service.findMany({ where: { actif: true }, orderBy: { id: "asc" }, select: { id: true, nom: true, prix: true } }),
  ]);

  // Par défaut, l'acte « Consultation » est coché (maquette). Le nom peut avoir été retouché
  // dans les paramètres (« Consultations », « consultation générale ») : comparaison souple.
  const acteParDefaut = services.find((service) =>
    service.nom.toLowerCase().startsWith(NOM_ACTE_PAR_DEFAUT.toLowerCase()),
  );
  // Un acte désactivé ou repassé « à fixer » par la Direction depuis le brouillon n'est plus proposé.
  const facturables = new Set(services.filter((service) => service.prix !== null).map((service) => service.id));
  const actesEnregistres = consultation ? lireActes(consultation.brouillon).filter((id) => facturables.has(id)) : [];
  const actes = actesEnregistres.length > 0 ? actesEnregistres : acteParDefaut ? [acteParDefaut.id] : [];

  return {
    consultation: consultation && { ...consultation, actes },
    contexte: {
      motif: passage.motif,
      patient: passage.patient,
      dernieresVisites: visites.map(({ passage: visite, ...reste }) => ({ ...reste, praticien: visite.praticien })),
      services,
      actesParDefaut: actes,
    },
  };
}

export async function enregistrerConsultationDuPassage(
  passageId: number,
  utilisateur: UtilisateurConnecte,
  donnees: DonneesConsultation,
) {
  return prisma.$transaction(async (transaction) => {
    const passage = await transaction.passage.findUnique({
      where: { id: passageId },
      select: { id: true, statut: true, praticienId: true, patient: { select: { sexe: true, dateNaissance: true } } },
    });
    if (!passage) {
      throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");
    }
    verifierAccesAuPassage(passage, utilisateur);

    if (passage.statut !== StatutPassage.EN_CONSULTATION) {
      throw new ErreurHttp(409, "CONSULTATION_NON_MODIFIABLE");
    }
    verifierMotifGrossesse(donnees.motif, passage.patient);
    verifierMotifGrossesse(donnees.suiviMotif, passage.patient);

    const { motif, actes, ...constantes } = donnees;
    if (actes) {
      // Les actes viennent du catalogue de la Direction (Paramètres → Services) : actifs et tarifés seulement.
      const services = await transaction.service.findMany({ where: { id: { in: actes } }, select: { nom: true, actif: true, prix: true } });
      if (services.length !== new Set(actes).size || services.some((service) => !service.actif)) {
        throw new ErreurHttp(400, "SERVICE_INACTIF");
      }
      const aFixer = services.find((service) => service.prix === null);
      if (aFixer) throw new ErreurHttp(409, "PRIX_SERVICE_A_FIXER", { service: aFixer.nom });
    }
    if (motif !== undefined) {
      await transaction.passage.update({ where: { id: passageId }, data: { motif } });
    }
    const data = { ...constantes, ...(actes ? { brouillon: { actes } } : {}) };

    const modifiee = await transaction.consultation.updateMany({
      where: { passageId, signeeLe: null },
      data,
    });

    let resultat;
    if (modifiee.count === 0) {
      const existante = await transaction.consultation.findUnique({ where: { passageId } });
      if (existante) {
        throw new ErreurHttp(409, "CONSULTATION_SIGNEE");
      }
      resultat = await transaction.consultation.create({ data: { passageId, ...data } });
    } else {
      resultat = await transaction.consultation.findUniqueOrThrow({ where: { passageId } });
    }

    // Chaque enregistrement de brouillon est tracé : qui a saisi quoi, et quand.
    await enregistrerAudit(transaction, {
      utilisateurId: utilisateur.id,
      action: "MODIFICATION_CONSULTATION",
      entite: "passage",
      entiteId: passageId,
    });

    return { ...resultat, actes: lireActes(resultat.brouillon) };
  }, OPTIONS_TRANSACTION);
}

// Signature (R050) : la consultation est verrouillée, la facture est créée avec les actes réalisés,
// puis le passage part en pharmacie s'il y a une ordonnance, sinon en caisse. Tout ou rien.
export async function signerEtTerminerConsultation(passageId: number, utilisateur: UtilisateurConnecte) {
  return prisma.$transaction(async (transaction) => {
    const passage = await transaction.passage.findUnique({
      where: { id: passageId },
      select: { id: true, statut: true, praticienId: true },
    });
    if (!passage) {
      throw new ErreurHttp(404, "PASSAGE_INTROUVABLE");
    }
    verifierAccesAuPassage(passage, utilisateur);

    if (passage.statut !== StatutPassage.EN_CONSULTATION) {
      throw new ErreurHttp(409, "PAS_EN_CONSULTATION");
    }

    const existante = await transaction.consultation.findUnique({ where: { passageId } });
    if (!existante) throw new ErreurHttp(404, "CONSULTATION_ABSENTE");
    if (existante.signeeLe) throw new ErreurHttp(409, "CONSULTATION_SIGNEE");
    // Maquette : un diagnostic et au moins un acte sont obligatoires pour signer.
    if (!existante.diagnostic?.trim()) throw new ErreurHttp(400, "DIAGNOSTIC_REQUIS");
    const actes = lireActes(existante.brouillon);
    if (actes.length === 0) throw new ErreurHttp(400, "ACTE_REQUIS");

    const signee = await transaction.consultation.updateMany({
      where: { passageId, signeeLe: null },
      data: { signeeLe: new Date() },
    });
    if (signee.count === 0) throw new ErreurHttp(409, "CONSULTATION_SIGNEE");

    // Facture des actes réalisés + orientation pharmacie / caisse, dans la même transaction que la signature.
    await terminerPassageDansTransaction(
      transaction,
      passageId,
      utilisateur.id,
      actes.map((serviceId) => ({ serviceId, quantite: 1 })),
    );

    // « Ce patient doit-il être revu ? » Oui : rendez-vous avec le signataire, et un suivi pour le relancer
    // s'il ne vient pas (R052, R121).
    if (existante.suiviDelaiJours) {
      const patient = await transaction.passage.findUniqueOrThrow({ where: { id: passageId }, select: { patientId: true } });
      const motif = existante.suiviMotif ?? "Revue";
      const revue = await creerRendezVousDeRevue(transaction, {
        patientId: patient.patientId,
        praticienId: utilisateur.id,
        consultationId: existante.id,
        delaiJours: existante.suiviDelaiJours,
        heure: existante.suiviHeure,
        motif,
      });
      await creerSuiviAutomatique(transaction, {
        patientId: patient.patientId,
        motif,
        echeance: jourDuCentre(revue.dateHeure),
        origine: OrigineSuivi.CONSULTATION,
        rendezVousId: revue.id,
        creeParId: utilisateur.id,
      });
    }

    await enregistrerAudit(transaction, {
      utilisateurId: utilisateur.id,
      action: "SIGNATURE_CONSULTATION",
      entite: "passage",
      entiteId: passageId,
    });

    const signeeFinale = await transaction.consultation.findUniqueOrThrow({ where: { passageId } });
    return { ...signeeFinale, actes };
  }, OPTIONS_TRANSACTION);
}
