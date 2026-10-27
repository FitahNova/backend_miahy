import { prisma } from "../config/prisma.js";
import { SOIGNANTS } from "../config/constants.js";
import { Role } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { journaliserAcces } from "./journal.service.js";
import { coordonneesVisibles } from "./patients.service.js";

export interface UtilisateurConsultant {
  id: number;
  role: Role;
}

// Maquette : les données cliniques (mesures, prescriptions, allergies…) sont visibles de tous les rôles
// sauf la Direction. Les gestes de soin (corriger une consultation) restent aux soignants.
export const estClinique = (role: Role) => role !== Role.DIRECTION;
export const estSoignant = (role: Role) => (SOIGNANTS as readonly Role[]).includes(role);

const LIBELLES_CANAL: Record<string, string> = { APPEL: "Appel", SMS: "SMS", WHATSAPP: "WhatsApp", AUTRE: "Autre", VISITE: "Visite" };
const LIBELLES_RESULTAT: Record<string, string> = {
  JOINT: "Joint",
  INJOIGNABLE: "Injoignable",
  MESSAGE_LAISSE: "Message laiss\u00e9",
  RENDEZ_VOUS_FIXE: "Rendez-vous fix\u00e9",
  A_RAPPELER: "\u00c0 rappeler",
  PAS_DE_REPONSE: "Pas de r\u00e9ponse",
  REFUS: "Refus",
  NUMERO_INCORRECT: "Num\u00e9ro incorrect",
  AUTRE: "Autre",
};
const LIBELLES_STATUT_RDV: Record<string, string> = { PREVU: "prévu", VENU: "venu", ABSENT: "absent", ANNULE: "annulé" };

const versNombre = (valeur: unknown): number | null =>
  valeur === null || valeur === undefined ? null : Number(valeur);

function posologie(ligne: { doseParPrise: unknown; prisesParJour: number; dureeJours: number }): string {
  return `${versNombre(ligne.doseParPrise)} par prise · ${ligne.prisesParJour}/j · ${ligne.dureeJours} j`;
}

type TypeEvenement = "ARRIVEE" | "CONSULTATION" | "ORDONNANCE" | "PAIEMENT" | "RENDEZ_VOUS" | "RAPPEL" | "MODIFICATION";

interface Evenement {
  date: Date;
  type: TypeEvenement;
  libelle: string;
  detail: string | null;
  consultationId?: number;
  passageId?: number;
  factureId?: number;
  corrections?: { date: Date; auteur: string; texte: string }[];
}

export async function lireDossierPatient(patientId: number, utilisateur: UtilisateurConsultant) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { programme: { select: { id: true, nom: true } } },
  });
  if (!patient) {
    throw new ErreurHttp(404, "PATIENT_INTROUVABLE");
  }

  // Trace avant de renvoyer la moindre donnée : si la trace échoue, rien n'est affiché.
  await journaliserAcces(utilisateur.id, "LECTURE_DOSSIER", "patient", patientId);

  const clinique = estClinique(utilisateur.role);
  const soignant = estSoignant(utilisateur.role);
  const visibles = coordonneesVisibles(utilisateur.role); // R024

  const [passages, rendezVous, suivis, modifications] = await Promise.all([
    prisma.passage.findMany({
      where: { patientId },
      orderBy: { heureArrivee: "desc" },
      select: {
        id: true,
        motif: true,
        urgence: true,
        heureArrivee: true,
        praticien: { select: { nom: true } },
        consultation: {
          select: {
            id: true,
            tension: true,
            poidsKg: true,
            pouls: true,
            temperature: true,
            spo2: true,
            glycemie: true,
            diagnostic: true,
            signeeLe: true,
            corrections: {
              orderBy: { creeLe: "asc" },
              select: { texte: true, creeLe: true, auteur: { select: { nom: true } } },
            },
          },
        },
        ordonnance: {
          select: {
            creeLe: true,
            prescripteur: { select: { nom: true } },
            lignes: {
              select: {
                quantitePrescrite: true,
                quantiteDelivree: true,
                doseParPrise: true,
                prisesParJour: true,
                dureeJours: true,
                libelle: true,
                medicament: { select: { nom: true, forme: true } },
              },
            },
          },
        },
        factures: {
          select: {
            id: true,
            numero: true,
            statut: true,
            montantPaye: true,
            paiements: { orderBy: { date: "desc" }, select: { montant: true, mode: true, date: true } },
          },
        },
      },
    }),
    prisma.rendezVous.findMany({
      where: { patientId },
      orderBy: { dateHeure: "asc" },
      select: { id: true, dateHeure: true, motif: true, statut: true, praticien: { select: { nom: true } } },
    }),
    prisma.suivi.findMany({
      where: { patientId },
      select: {
        type: { select: { nom: true } },
        contacts: { select: { canal: true, resultat: true, date: true } },
      },
    }),
    prisma.journalAudit.findMany({
      where: { entite: "patient", entiteId: patientId, action: "PATIENT_MODIFIE" },
      orderBy: { date: "desc" },
      // Toutes les modifications : le dossier les affiche 10 par page.
      select: { date: true, detail: true, utilisateur: { select: { nom: true } } },
    }),
  ]);

  const signees = passages
    .flatMap((passage) => (passage.consultation?.signeeLe ? [{ passage, signeeLe: passage.consultation.signeeLe }] : []))
    .sort((a, b) => b.signeeLe.getTime() - a.signeeLe.getTime());

  const recente = signees[0];
  // Date et soignant pour tous ; le diagnostic reste clinique.
  const derniereConsultation = recente
    ? {
        date: recente.signeeLe,
        diagnostic: clinique ? (recente.passage.consultation?.diagnostic ?? null) : null,
        praticien: recente.passage.praticien?.nom ?? null,
      }
    : null;

  const maintenant = new Date();
  const prochain = rendezVous.find((rdv) => rdv.statut === "PREVU" && rdv.dateHeure >= maintenant);
  const prochainSuivi = prochain
    ? { date: prochain.dateHeure, motif: prochain.motif, avec: prochain.praticien?.nom ?? null }
    : null;

  const mesures = clinique
    ? signees.map(({ passage, signeeLe }) => ({
        date: signeeLe,
        tension: passage.consultation?.tension ?? null,
        poidsKg: versNombre(passage.consultation?.poidsKg),
        pouls: passage.consultation?.pouls ?? null,
        temperature: versNombre(passage.consultation?.temperature),
        spo2: passage.consultation?.spo2 ?? null,
        glycemie: versNombre(passage.consultation?.glycemie),
      }))
    : [];

  // Prescriptions avec leur état de délivrance (onglet « Prescriptions »).
  const ordonnances = clinique
    ? passages.flatMap((passage) =>
        passage.ordonnance
          ? [
              {
                passageId: passage.id,
                date: passage.ordonnance.creeLe,
                prescripteur: passage.ordonnance.prescripteur.nom,
                lignes: passage.ordonnance.lignes.map((ligne) => ({
                  // Médicament hors stock : nom saisi par le praticien.
                  medicament: ligne.medicament?.nom ?? ligne.libelle ?? "",
                  forme: ligne.medicament?.forme ?? "hors stock",
                  posologie: posologie(ligne),
                  quantite: ligne.quantitePrescrite,
                  quantiteDelivree: ligne.quantiteDelivree,
                })),
              },
            ]
          : [],
      )
    : [];

  // Documents à réimprimer : ordonnances (clinique) et reçus (tous).
  const documents = [
    ...ordonnances.map((ordonnance) => ({
      type: "ORDONNANCE" as const,
      date: ordonnance.date,
      libelle: `Ordonnance · ${ordonnance.prescripteur}`,
      passageId: ordonnance.passageId,
      factureId: null,
    })),
    ...passages.flatMap((passage) =>
      passage.factures
        .filter((facture) => facture.montantPaye > 0 && facture.statut !== "ANNULEE")
        .map((facture) => ({
          type: "RECU" as const,
          date: facture.paiements[0]?.date ?? passage.heureArrivee,
          libelle: `Reçu ${facture.numero}`,
          passageId: null,
          factureId: facture.id,
        })),
    ),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const evenements: Evenement[] = [];
  for (const passage of passages) {
    evenements.push({
      date: passage.heureArrivee,
      type: "ARRIVEE",
      libelle: `Arrivée · ${passage.motif}`,
      detail: passage.urgence ? "Urgence" : null,
    });

    const consultation = passage.consultation;
    if (consultation?.signeeLe) {
      evenements.push({
        date: consultation.signeeLe,
        type: "CONSULTATION",
        libelle: `Consultation${passage.praticien ? ` · ${passage.praticien.nom}` : ""}`,
        detail: clinique ? (consultation.diagnostic ?? null) : null,
        consultationId: clinique ? consultation.id : undefined,
        corrections: clinique
          ? consultation.corrections.map((c) => ({ date: c.creeLe, auteur: c.auteur.nom, texte: c.texte }))
          : [],
      });
    }

    if (clinique && passage.ordonnance) {
      evenements.push({
        date: passage.ordonnance.creeLe,
        type: "ORDONNANCE",
        libelle: `Ordonnance · ${passage.ordonnance.lignes.length} ligne(s)`,
        detail: null,
        passageId: passage.id,
      });
    }

    for (const facture of passage.factures) {
      for (const paiement of facture.paiements) {
        evenements.push({
          date: paiement.date,
          type: "PAIEMENT",
          libelle: `Paiement · ${paiement.montant} Ar`,
          detail: paiement.mode,
          factureId: facture.id,
        });
      }
    }
  }

  for (const rdv of rendezVous) {
    evenements.push({
      date: rdv.dateHeure,
      type: "RENDEZ_VOUS",
      libelle: `Rendez-vous · ${rdv.motif}`,
      detail: [rdv.praticien?.nom, LIBELLES_STATUT_RDV[rdv.statut]].filter(Boolean).join(" · "),
    });
  }

  for (const suivi of suivis) {
    for (const contact of suivi.contacts) {
      evenements.push({
        date: contact.date,
        type: "RAPPEL",
        libelle: `Rappel · ${suivi.type.nom}`,
        detail: `${LIBELLES_CANAL[contact.canal] ?? contact.canal} · ${LIBELLES_RESULTAT[contact.resultat] ?? contact.resultat}`,
      });
    }
  }

  for (const modification of modifications) {
    const champs = (modification.detail as { champs?: string[] } | null)?.champs ?? [];
    evenements.push({
      date: modification.date,
      type: "MODIFICATION",
      libelle: `Fiche modifiée${modification.utilisateur ? ` · ${modification.utilisateur.nom}` : ""}`,
      detail: champs.length ? champs.join(", ") : null,
    });
  }
  evenements.sort((a, b) => b.date.getTime() - a.date.getTime());

  const derniere = modifications[0];

  return {
    patient: {
      id: patient.id,
      numeroDossier: patient.numeroDossier,
      nom: patient.nom,
      prenom: patient.prenom,
      sexe: patient.sexe,
      dateNaissance: patient.dateNaissance,
      telephone: visibles ? patient.telephone : null,
      adresse: visibles ? patient.adresse : null,
      allergies: clinique ? patient.allergies : null,
      maladies: clinique ? patient.maladies : null,
      traitements: clinique ? patient.traitements : null,
      sensible: patient.sensible,
      programmeId: patient.programmeId,
      programme: patient.programme,
      financement: patient.financement,
      actif: patient.actif,
    },
    droits: { clinique, soignant, coordonneesVisibles: visibles },
    synthese: {
      derniereConsultation,
      prochainSuivi,
      derniereModification: derniere ? { date: derniere.date, auteur: derniere.utilisateur?.nom ?? null } : null,
    },
    mesures,
    ordonnances,
    documents,
    rendezVous: rendezVous.map((rdv) => ({
      id: rdv.id,
      dateHeure: rdv.dateHeure,
      motif: rdv.motif,
      statut: rdv.statut,
      praticien: rdv.praticien?.nom ?? null,
    })),
    chronologie: evenements,
  };
}

/**
 * Correction tracée d'une consultation signée (soignants) : le texte d'origine n'est jamais modifié.
 * @throws 404 CONSULTATION_INTROUVABLE ; 409 CONSULTATION_NON_SIGNEE
 */
export async function corrigerConsultation(consultationId: number, texte: string, auteurId: number) {
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    select: { signeeLe: true, passage: { select: { patientId: true } } },
  });
  if (!consultation) throw new ErreurHttp(404, "CONSULTATION_INTROUVABLE");
  if (!consultation.signeeLe) throw new ErreurHttp(409, "CONSULTATION_NON_SIGNEE");

  return prisma.$transaction(async (tx) => {
    const correction = await tx.correctionConsultation.create({
      data: { consultationId, auteurId, texte },
      select: { id: true, creeLe: true },
    });
    // Données de santé : on trace le geste, pas le texte.
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "CONSULTATION_CORRIGEE",
      entite: "consultation",
      entiteId: consultationId,
      detail: { patientId: consultation.passage.patientId },
    });
    return correction;
  }, OPTIONS_TRANSACTION);
}
