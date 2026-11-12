import { prisma } from "../config/prisma.js";
import { activiteSuivante } from "../utils/statutPatient.js";

/*
 * Repère des patients « nouveaux » pour un compte Direction : patients créés depuis la fin de sa session précédente.
 * Fin de session = déconnexion, ou 1 h sans aucune activité (navigateur fermé sans se déconnecter).
 */

/** Requête d'un compte Direction : activité notée, et repère avancé si une nouvelle session commence. */
export async function noterActiviteDirection(utilisateurId: number, derniereActivite: Date | null) {
  const ecriture = activiteSuivante(derniereActivite, new Date());
  if (!ecriture) return;
  await prisma.utilisateur.update({ where: { id: utilisateurId }, data: ecriture });
}

/** Connexion : les nouveaux sont ceux créés depuis la dernière activité (fin de la session précédente). */
export async function commencerSessionDirection(utilisateurId: number) {
  const { derniereActiviteLe } = await prisma.utilisateur.findUniqueOrThrow({
    where: { id: utilisateurId },
    select: { derniereActiviteLe: true },
  });
  const maintenant = new Date();
  await prisma.utilisateur.update({
    where: { id: utilisateurId },
    data: { nouveauxDepuis: derniereActiviteLe ?? maintenant, derniereActiviteLe: maintenant },
  });
}

/** Déconnexion : fin de session ; à la prochaine connexion, les patients d'aujourd'hui ne seront plus « nouveaux ». */
export async function terminerSessionDirection(utilisateurId: number) {
  await prisma.utilisateur.update({ where: { id: utilisateurId }, data: { derniereActiviteLe: new Date() } });
}

/** Repère des nouveaux pour ce compte (maintenant s'il n'en a pas encore : aucun nouveau). */
export async function repereNouveaux(utilisateurId: number): Promise<Date> {
  const utilisateur = await prisma.utilisateur.findUnique({ where: { id: utilisateurId }, select: { nouveauxDepuis: true } });
  return utilisateur?.nouveauxDepuis ?? new Date();
}
