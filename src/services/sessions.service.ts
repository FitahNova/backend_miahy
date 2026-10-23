import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { DUREE_SESSION_HEURES } from "../config/constants.js";
import { signerJeton } from "../middleware/auth.js";
import { ErreurHttp } from "../utils/errors.js";
import { journaliserConnexion } from "./journal.service.js";

// Un refresh token est une valeur aléatoire longue : un hachage SHA-256 suffit (pas besoin de bcrypt).
function hacher(valeur: string): string {
  return createHash("sha256").update(valeur).digest("hex");
}

export async function creerSession(utilisateurId: number) {
  const refreshToken = randomBytes(32).toString("base64url");
  const expireLe = new Date(Date.now() + DUREE_SESSION_HEURES * 60 * 60 * 1000);
  await prisma.sessionUtilisateur.create({
    data: { utilisateurId, refreshHache: hacher(refreshToken), expireLe },
  });
  return { refreshToken, expireLe };
}

/**
 * Ouvre une session après une connexion réussie : jeton d'accès, refresh token, et l'utilisateur
 * sous la même forme que /api/auth/moi.
 */
export async function ouvrirSession(utilisateurId: number) {
  const utilisateur = await prisma.utilisateur.findUniqueOrThrow({
    where: { id: utilisateurId },
    select: { id: true, civilite: true, nom: true, prenom: true, email: true, role: true, versionSession: true },
  });
  const session = await creerSession(utilisateur.id);
  return {
    jeton: signerJeton({ id: utilisateur.id, role: utilisateur.role, versionSession: utilisateur.versionSession }),
    utilisateur: {
      id: utilisateur.id,
      civilite: utilisateur.civilite,
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      email: utilisateur.email,
      role: utilisateur.role,
    },
    refreshToken: session.refreshToken,
    expireLe: session.expireLe,
  };
}

// Révoque toutes les sessions d'un compte : désactivation, réinitialisation, vol présumé.
// L'incrément de versionSession coupe aussi les jetons d'accès déjà émis, sans attendre leur expiration.
export async function revoquerToutesLesSessions(utilisateurId: number) {
  await prisma.$transaction([
    prisma.sessionUtilisateur.updateMany({
      where: { utilisateurId, revoqueLe: null },
      data: { revoqueLe: new Date() },
    }),
    prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { versionSession: { increment: 1 } },
    }),
  ]);
}

// Rotation : chaque renouvellement remplace le refresh token.
// S'il est réutilisé après rotation, c'est qu'il a été volé : toutes les sessions du compte sont coupées.
export async function rafraichirSession(refreshToken: string) {
  const session = await prisma.sessionUtilisateur.findUnique({
    where: { refreshHache: hacher(refreshToken) },
    include: { utilisateur: true },
  });
  if (!session) {
    throw new ErreurHttp(401, "SESSION_EXPIREE");
  }

  const utilisateur = session.utilisateur;

  if (session.revoqueLe) {
    await revoquerToutesLesSessions(utilisateur.id);
    await journaliserConnexion(utilisateur.id, "CONNEXION_ECHEC", {
      raison: "Refresh token réutilisé : toutes les sessions révoquées",
    });
    throw new ErreurHttp(401, "SESSION_COMPROMISE");
  }

  if (session.expireLe < new Date()) {
    throw new ErreurHttp(401, "SESSION_EXPIREE");
  }

  if (!utilisateur.actif) {
    await revoquerToutesLesSessions(utilisateur.id);
    throw new ErreurHttp(401, "COMPTE_DESACTIVE");
  }

  // Révocation conditionnelle : deux renouvellements simultanés ne peuvent pas réussir tous les deux.
  const coupee = await prisma.sessionUtilisateur.updateMany({
    where: { id: session.id, revoqueLe: null },
    data: { revoqueLe: new Date() },
  });
  if (coupee.count === 0) {
    await revoquerToutesLesSessions(utilisateur.id);
    throw new ErreurHttp(401, "SESSION_COMPROMISE");
  }

  const nouvelle = await creerSession(utilisateur.id);
  return {
    jeton: signerJeton({
      id: utilisateur.id,
      role: utilisateur.role,
      versionSession: utilisateur.versionSession,
    }),
    // Même forme que /api/auth/moi : le front remplace la session sans transformation.
    utilisateur: {
      id: utilisateur.id,
      civilite: utilisateur.civilite,
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      email: utilisateur.email,
      role: utilisateur.role,
    },
    refreshToken: nouvelle.refreshToken,
    expireLe: nouvelle.expireLe,
  };
}

// Déconnexion : révoque la session courante, et coupe aussi le jeton d'accès encore valable.
// Une session ne peut pas être révoquée deux fois : on lit l'état avant d'agir.
export async function revoquerSession(refreshToken: string): Promise<number | null> {
  const session = await prisma.sessionUtilisateur.findUnique({ where: { refreshHache: hacher(refreshToken) } });
  if (!session || session.revoqueLe) return null;

  await prisma.$transaction([
    prisma.sessionUtilisateur.update({ where: { id: session.id }, data: { revoqueLe: new Date() } }),
    prisma.utilisateur.update({
      where: { id: session.utilisateurId },
      data: { versionSession: { increment: 1 } },
    }),
  ]);

  return session.utilisateurId;
}