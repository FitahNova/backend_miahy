import { prisma } from "../config/prisma.js";
import { StatutRendezVous } from "../generated/prisma/client.js";

export function listerProgrammesActifs() {
  return prisma.programme.findMany({
    where: { actif: true },
    orderBy: { nom: "asc" },
    select: { id: true, nom: true },
  });
}

function calculerAge(dateNaissance: Date): number {
  const aujourdhui = new Date();
  let age = aujourdhui.getFullYear() - dateNaissance.getFullYear();
  const mois = aujourdhui.getMonth() - dateNaissance.getMonth();
  if (mois < 0 || (mois === 0 && aujourdhui.getDate() < dateNaissance.getDate())) {
    age--;
  }
  return age;
}

function joursEcoules(date: Date): number {
  const maintenant = Date.now();
  const diff = maintenant - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export async function obtenirDetailProgramme(nomProgramme: string) {
  const programme = await prisma.programme.findFirst({
    where: { actif: true, nom: { equals: nomProgramme, mode: "insensitive" } },
    select: { id: true, nom: true },
  });
  if (!programme) throw new Error("PROGRAMME_INTROUVABLE");

  const [patients, rdvEnRetard] = await Promise.all([
    prisma.patient.findMany({
      where: { actif: true, programmeId: programme.id },
      select: {
        id: true,
        numeroDossier: true,
        nom: true,
        prenom: true,
        sexe: true,
        dateNaissance: true,
        telephone: true,
      },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    prisma.rendezVous.findMany({
      where: {
        statut: StatutRendezVous.PREVU,
        dateHeure: { lt: new Date() },
        patient: { programmeId: programme.id, actif: true },
      },
      select: {
        id: true,
        dateHeure: true,
        motif: true,
        patientId: true,
        patient: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            sexe: true,
            dateNaissance: true,
          },
        },
      },
      orderBy: { dateHeure: "asc" },
    }),
  ]);

  const aRevoirSet = new Set(rdvEnRetard.map((r) => r.patientId));
  const aRevoir = rdvEnRetard.map((rdv) => {
    const age = calculerAge(rdv.patient.dateNaissance);
    return {
      rdvId: rdv.id,
      patientId: rdv.patient.id,
      nom: rdv.patient.nom,
      prenom: rdv.patient.prenom,
      age,
      sexe: rdv.patient.sexe,
      motif: rdv.motif,
      dateRdv: rdv.dateHeure.toISOString(),
      joursRetard: joursEcoules(rdv.dateHeure),
    };
  });

  const inscrits = patients.map((p) => {
    const age = calculerAge(p.dateNaissance);
    const enRetard = aRevoirSet.has(p.id);
    // Chercher le rdv en retard le plus récent pour ce patient
    const rdvPatient = rdvEnRetard
      .filter((r) => r.patientId === p.id)
      .sort((a, b) => b.dateHeure.getTime() - a.dateHeure.getTime())[0];
    return {
      patientId: p.id,
      numeroDossier: p.numeroDossier,
      nom: p.nom,
      prenom: p.prenom,
      age,
      sexe: p.sexe,
      telephone: p.telephone,
      aRevoir: enRetard,
      motif: rdvPatient?.motif || null,
      joursRetard: rdvPatient ? joursEcoules(rdvPatient.dateHeure) : null,
    };
  });

  return {
    programme: { id: programme.id, nom: programme.nom },
    stats: {
      inscrits: patients.length,
      aRevoir: aRevoir.length,
      perdusDeVue: 0,
    },
    aRevoir,
    inscrits,
  };
}
