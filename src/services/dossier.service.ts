import { prisma } from "../config/prisma.js";
import { Role } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { journaliserAcces } from "./journal.service.js";
import { coordonneesVisibles } from "./patients.service.js";

export interface UtilisateurConsultant {
  id: number;
  role: Role;
}

// Données cliniques (consultations, mesures, ordonnances) : soignants uniquement.
const ROLES_CLINIQUES: Role[] = [Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME];

const versNombre = (valeur: unknown): number | null =>
  valeur === null || valeur === undefined ? null : Number(valeur);

function ajouterJours(date: Date, jours: number): Date {
  const resultat = new Date(date);
  resultat.setDate(resultat.getDate() + jours);
  return resultat;
}

function posologie(ligne: { doseParPrise: unknown; prisesParJour: number; dureeJours: number }): string {
  return `${versNombre(ligne.doseParPrise)} par prise · ${ligne.prisesParJour}/j · ${ligne.dureeJours} j`;
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

  const clinique = ROLES_CLINIQUES.includes(utilisateur.role);
  const visibles = coordonneesVisibles(utilisateur.role); // R024

  const passages = await prisma.passage.findMany({
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
          tension: true,
          poidsKg: true,
          pouls: true,
          temperature: true,
          spo2: true,
          glycemie: true,
          diagnostic: true,
          signeeLe: true,
          suiviDelaiJours: true,
          suiviMotif: true,
        },
      },
      ordonnance: {
        select: {
          creeLe: true,
          lignes: {
            select: {
              quantitePrescrite: true,
              doseParPrise: true,
              prisesParJour: true,
              dureeJours: true,
              medicament: { select: { nom: true, forme: true } },
            },
          },
        },
      },
      factures: {
        select: { paiements: { select: { montant: true, mode: true, date: true } } },
      },
    },
  });

  const signees = passages
    .flatMap((passage) =>
      passage.consultation?.signeeLe ? [{ passage, signeeLe: passage.consultation.signeeLe }] : [],
    )
    .sort((a, b) => b.signeeLe.getTime() - a.signeeLe.getTime());

  const consultationRecente = signees[0];
  const derniereConsultation =
    clinique && consultationRecente
      ? {
          date: consultationRecente.signeeLe,
          diagnostic: consultationRecente.passage.consultation?.diagnostic ?? null,
          praticien: consultationRecente.passage.praticien?.nom ?? null,
        }
      : null;

  const maintenant = new Date();
  const prochainSuivi = clinique
    ? signees
        .flatMap((signee) => {
          const jours = signee.passage.consultation?.suiviDelaiJours;
          return jours
            ? [
                {
                  date: ajouterJours(signee.signeeLe, jours),
                  motif: signee.passage.consultation?.suiviMotif ?? "Suivi",
                },
              ]
            : [];
        })
        .filter((suivi) => suivi.date >= maintenant)
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null
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

  const ordonnances = clinique
    ? passages.flatMap((passage) =>
        passage.ordonnance
          ? [
              {
                date: passage.ordonnance.creeLe,
                lignes: passage.ordonnance.lignes.map((ligne) => ({
                  medicament: ligne.medicament.nom,
                  forme: ligne.medicament.forme,
                  posologie: posologie(ligne),
                  quantite: ligne.quantitePrescrite,
                })),
              },
            ]
          : [],
      )
    : [];

  type Evenement = {
    date: Date;
    type: "ARRIVEE" | "CONSULTATION" | "ORDONNANCE" | "PAIEMENT";
    libelle: string;
    detail: string | null;
  };

  const evenements: Evenement[] = [];
  for (const passage of passages) {
    evenements.push({
      date: passage.heureArrivee,
      type: "ARRIVEE",
      libelle: `Arrivée · ${passage.motif}`,
      detail: passage.urgence ? "Urgence" : null,
    });

    if (clinique && passage.consultation?.signeeLe) {
      evenements.push({
        date: passage.consultation.signeeLe,
        type: "CONSULTATION",
        libelle: `Consultation signée${passage.praticien ? ` · ${passage.praticien.nom}` : ""}`,
        detail: passage.consultation.diagnostic ?? null,
      });
    }

    if (clinique && passage.ordonnance) {
      evenements.push({
        date: passage.ordonnance.creeLe,
        type: "ORDONNANCE",
        libelle: `Ordonnance · ${passage.ordonnance.lignes.length} ligne(s)`,
        detail: null,
      });
    }

    for (const facture of passage.factures) {
      for (const paiement of facture.paiements) {
        evenements.push({
          date: paiement.date,
          type: "PAIEMENT",
          libelle: `Paiement · ${paiement.montant} Ar`,
          detail: paiement.mode,
        });
      }
    }
  }
  evenements.sort((a, b) => b.date.getTime() - a.date.getTime());

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
      allergies: patient.allergies,
      programmeId: patient.programmeId,
      programme: patient.programme,
      contactConfiance: visibles ? patient.contactConfiance : null,
      financement: patient.financement,
      actif: patient.actif,
    },
    droits: { clinique, coordonneesVisibles: visibles },
    synthese: { derniereConsultation, prochainSuivi },
    mesures,
    ordonnances,
    chronologie: evenements,
  };
}
