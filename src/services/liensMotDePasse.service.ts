/*
 * Liens de choix du mot de passe (décision du 14/10/2026) : personne ne connaît le mot de passe
 * d'un autre, pas même la Direction.
 * - ACTIVATION : à la création du compte. Le clic prouve que la boîte (ou le téléphone) existe et appartient
 *   à la personne ; avant, le compte est « en attente » et aucune connexion n'est possible.
 * - REINITIALISATION : mot de passe oublié, validé par la Direction.
 * Un lien est aléatoire, stocké haché (SHA-256), valable 8 heures, à usage unique ; un nouveau lien annule
 * les précédents. Il circule dans l'ancre de l'URL (#jeton=…) : jamais envoyé aux serveurs ni journalisé.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { environnement } from "../config/env.js";
import { DUREE_LIEN_MOT_DE_PASSE_HEURES } from "../config/constants.js";
import type { Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { hacherMotDePasse, verifierNouveauMotDePasse } from "../utils/motDePasse.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { journaliserConnexion } from "./journal.service.js";
import { revoquerToutesLesSessions } from "./sessions.service.js";

export type TypeLien = "ACTIVATION" | "REINITIALISATION";
export const TYPES_LIEN: TypeLien[] = ["ACTIVATION", "REINITIALISATION"];

function hacher(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

/** Adresse de la page « Choisir mon mot de passe » du front, avec le jeton dans l'ancre. */
export function adresseLien(jeton: string): string {
  return `${environnement.CLIENT_ORIGIN}/mot-de-passe#jeton=${jeton}`;
}

/**
 * Émet un nouveau lien pour un compte et annule les liens encore valables. À appeler dans une transaction.
 * @returns le jeton en clair, à envoyer à la personne (jamais stocké tel quel)
 */
export async function emettreLien(tx: Prisma.TransactionClient, utilisateurId: number, type: TypeLien): Promise<string> {
  const maintenant = new Date();
  await tx.jetonUsage.updateMany({
    where: { utilisateurId, type: { in: TYPES_LIEN }, utiliseLe: null },
    data: { utiliseLe: maintenant },
  });
  const jeton = randomBytes(32).toString("base64url");
  await tx.jetonUsage.create({
    data: {
      utilisateurId,
      type,
      hache: hacher(jeton),
      expireLe: new Date(maintenant.getTime() + DUREE_LIEN_MOT_DE_PASSE_HEURES * 60 * 60 * 1000),
    },
  });
  return jeton;
}

/**
 * Lien encore utilisable, avec son titulaire.
 * @throws 400 LIEN_INVALIDE (inconnu, déjà utilisé ou remplacé, compte désactivé) ; 410 LIEN_EXPIRE
 */
async function lireLienValide(jeton: string) {
  const lien = await prisma.jetonUsage.findUnique({
    where: { hache: hacher(jeton) },
    include: { utilisateur: { select: { id: true, prenom: true, nom: true, email: true, telephone: true, actif: true } } },
  });
  if (!lien || !TYPES_LIEN.includes(lien.type as TypeLien) || lien.utiliseLe || !lien.utilisateur.actif) {
    throw new ErreurHttp(400, "LIEN_INVALIDE");
  }
  if (lien.expireLe < new Date()) throw new ErreurHttp(410, "LIEN_EXPIRE");
  return lien;
}

/** Ouverture de la page du lien : prénom à afficher et objet du lien, rien d'autre. */
export async function decrireLien(jeton: string) {
  const lien = await lireLienValide(jeton);
  return { prenom: lien.utilisateur.prenom || lien.utilisateur.nom, type: lien.type as TypeLien };
}

/**
 * La personne choisit son mot de passe : le lien est consommé une seule fois (même avec deux clics
 * simultanés), le compte devient actif, les sessions existantes sont fermées.
 * @throws 400 LIEN_INVALIDE et règles du mot de passe ; 410 LIEN_EXPIRE
 */
export async function choisirMotDePasse(jeton: string, motDePasse: string, confirmation: string) {
  const lien = await lireLienValide(jeton);
  verifierNouveauMotDePasse(motDePasse, confirmation, [lien.utilisateur.email, lien.utilisateur.telephone]);
  const motDePasseHash = await hacherMotDePasse(motDePasse);

  await prisma.$transaction(async (tx) => {
    const consomme = await tx.jetonUsage.updateMany({
      where: { id: lien.id, utiliseLe: null, expireLe: { gt: new Date() } },
      data: { utiliseLe: new Date() },
    });
    if (consomme.count === 0) throw new ErreurHttp(400, "LIEN_INVALIDE");
    await tx.utilisateur.update({
      where: { id: lien.utilisateurId },
      data: {
        motDePasseHash,
        motDePasseTemporaire: false,
        motDePasseExpireLe: null,
        tentativesEchec: 0,
        verrouilleJusqua: null,
      },
    });
  }, OPTIONS_TRANSACTION);

  await revoquerToutesLesSessions(lien.utilisateurId);
  await journaliserConnexion(lien.utilisateurId, "MOT_DE_PASSE_DEFINI", { lien: lien.type });
}
