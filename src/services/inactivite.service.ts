import type { Role } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { ErreurHttp } from "../utils/errors.js";
import { journaliserConnexion } from "./journal.service.js";
import {
  DUREE_INACTIVITE_DEFAUT,
  dureeInactiviteValide,
  sessionInactive,
} from "./inactivite.js";

const ID_PARAMETRE = 1;
const DUREE_CACHE_MS = 5_000;

let cacheDuree: { minutes: number; jusqua: number } | null = null;

export function viderCacheDureeInactivite() {
  cacheDuree = null;
}

export async function lireDureeInactiviteMinutes(): Promise<number> {
  const maintenant = Date.now();
  if (cacheDuree && cacheDuree.jusqua > maintenant) return cacheDuree.minutes;

  const ligne = await prisma.parametreCentre.findUnique({
    where: { id: ID_PARAMETRE },
    select: { dureeInactiviteMinutes: true },
  });
  const minutes = ligne?.dureeInactiviteMinutes ?? DUREE_INACTIVITE_DEFAUT;
  cacheDuree = { minutes, jusqua: maintenant + DUREE_CACHE_MS };
  return minutes;
}

export async function enregistrerDureeInactivite(minutes: number): Promise<number> {
  if (!dureeInactiviteValide(minutes)) {
    throw new ErreurHttp(400, "DUREE_INACTIVITE_INVALIDE");
  }
  await prisma.parametreCentre.upsert({
    where: { id: ID_PARAMETRE },
    create: { id: ID_PARAMETRE, dureeInactiviteMinutes: minutes },
    update: { dureeInactiviteMinutes: minutes },
  });
  cacheDuree = { minutes, jusqua: Date.now() + DUREE_CACHE_MS };
  return minutes;
}

// Une seule écriture de journal : la seconde requête trouve la session déjà révoquée.
export async function cloturerPourInactivite(sessionId: number, utilisateurId: number): Promise<void> {
  const coupee = await prisma.sessionUtilisateur.updateMany({
    where: { id: sessionId, revoqueLe: null },
    data: { revoqueLe: new Date() },
  });
  if (coupee.count !== 1) return;
  await journaliserConnexion(utilisateurId, "DECONNEXION_INACTIVITE");
}

// Jeton d'accès périmé : on note l'inactivité seulement si le délai sans geste est vraiment dépassé.
export async function cloturerSiInactive(sessionId: number, utilisateurId: number): Promise<void> {
  const session = await prisma.sessionUtilisateur.findUnique({
    where: { id: sessionId },
    select: { utilisateurId: true, revoqueLe: true, derniereActivite: true },
  });
  if (!session || session.utilisateurId !== utilisateurId || session.revoqueLe) return;
  const duree = await lireDureeInactiviteMinutes();
  if (!sessionInactive(session.derniereActivite, duree, new Date())) return;
  await cloturerPourInactivite(sessionId, utilisateurId);
}

/**
 * Contrôle le jeton d'accès : compte actif, session non révoquée, et délai sans geste non dépassé.
 * Ne repousse pas l'échéance : seul un geste explicite le fait.
 * Retourne null quand la requête doit être refusée (SESSION_EXPIREE).
 */
export async function controlerSession(
  sessionId: number,
  utilisateurId: number,
  version: number,
): Promise<{ id: number; role: Role } | null> {
  const session = await prisma.sessionUtilisateur.findUnique({
    where: { id: sessionId },
    select: {
      utilisateurId: true,
      revoqueLe: true,
      expireLe: true,
      derniereActivite: true,
      utilisateur: { select: { actif: true, role: true, versionSession: true } },
    },
  });
  if (!session || session.utilisateurId !== utilisateurId) return null;
  if (session.revoqueLe || session.expireLe < new Date()) return null;

  const utilisateur = session.utilisateur;
  if (!utilisateur.actif || utilisateur.versionSession !== version) return null;

  const duree = await lireDureeInactiviteMinutes();
  if (sessionInactive(session.derniereActivite, duree, new Date())) {
    await cloturerPourInactivite(sessionId, utilisateurId);
    return null;
  }
  return { id: utilisateurId, role: utilisateur.role };
}
