import { randomBytes } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { environnement } from "../config/env.js";
import {
  DELAI_RENVOI_CODE_SECONDES,
  DUREE_CODE_CONNEXION_MINUTES,
  MAX_ESSAIS_CODE_CONNEXION,
} from "../config/constants.js";
import { codeCorrespond, genererCode, hacherCode, normaliserCode } from "../utils/codeConnexion.js";
import { choisirCanal, envoyerCodeConnexion } from "../utils/envoiMotDePasse.js";
import { ErreurHttp } from "../utils/errors.js";
import { journaliserConnexion } from "./journal.service.js";
import { ouvrirSession } from "./sessions.service.js";

interface Destinataire {
  id: number;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
}

export async function ouvrirDefi(utilisateurId: number, canal: string, codeHache?: (defi: string) => string) {
  const defi = randomBytes(32).toString("hex");
  const maintenant = new Date();
  await prisma.$transaction([
    prisma.defiConnexion.updateMany({ where: { utilisateurId, utiliseLe: null }, data: { utiliseLe: maintenant } }),
    prisma.defiConnexion.create({
      data: {
        id: defi,
        utilisateurId,
        canal,
        codeHache: codeHache ? codeHache(defi) : null,
        envoyeLe: maintenant,
        expireLe: new Date(maintenant.getTime() + DUREE_CODE_CONNEXION_MINUTES * 60 * 1000),
      },
    }),
  ]);
  return defi;
}

/** Défi encore utilisable pour cette méthode, avec son titulaire. @throws 401 CODE_EXPIRE ; 423 TROP_DE_CODES_INCORRECTS */
export async function lireDefiOuvert(defiId: string, methode: "EMAIL" | "TOTP") {
  const defi = await prisma.defiConnexion.findUnique({
    where: { id: defiId },
    include: {
      utilisateur: {
        select: {
          id: true, nom: true, prenom: true, email: true, telephone: true, actif: true,
          totpActif: true, totpSecretChiffre: true, totpDernierPas: true,
        },
      },
    },
  });
  const bonneMethode = defi && (methode === "TOTP" ? defi.canal === "TOTP" : defi.canal !== "TOTP");
  if (!defi || !bonneMethode || defi.utiliseLe || defi.expireLe < new Date() || !defi.utilisateur.actif) {
    throw new ErreurHttp(401, "CODE_EXPIRE");
  }
  if (defi.tentatives >= MAX_ESSAIS_CODE_CONNEXION) throw new ErreurHttp(423, "TROP_DE_CODES_INCORRECTS");
  return defi;
}

/** Code faux : compte l'essai, ferme le défi au 5e. @throws toujours 401 CODE_INCORRECT ou 423 */
export async function refuserCode(defiId: string, utilisateurId: number): Promise<never> {
  // Incrément atomique : deux essais simultanés comptent pour deux.
  const { tentatives } = await prisma.defiConnexion.update({
    where: { id: defiId },
    data: { tentatives: { increment: 1 } },
    select: { tentatives: true },
  });
  const essaisRestants = Math.max(MAX_ESSAIS_CODE_CONNEXION - tentatives, 0);
  await journaliserConnexion(utilisateurId, "CODE_CONNEXION_INCORRECT", { essaisRestants });
  if (essaisRestants === 0) {
    await prisma.defiConnexion.update({ where: { id: defiId }, data: { utiliseLe: new Date() } });
    throw new ErreurHttp(423, "TROP_DE_CODES_INCORRECTS");
  }
  throw new ErreurHttp(401, "CODE_INCORRECT", { essaisRestants });
}

/** Bon code : ferme le défi (une seule session même si le code arrive deux fois) et ouvre la session. */
export async function terminerDefi(defiId: string, utilisateurId: number) {
  const consomme = await prisma.defiConnexion.updateMany({
    where: { id: defiId, utiliseLe: null },
    data: { utiliseLe: new Date() },
  });
  if (consomme.count === 0) throw new ErreurHttp(401, "CODE_EXPIRE");
  await journaliserConnexion(utilisateurId, "CONNEXION");
  return ouvrirSession(utilisateurId);
}

// ---------- Méthode « email » ----------

/**
 * Ouvre un défi et envoie le code. Si l'envoi échoue, le défi est fermé et personne n'est connecté.
 * @returns l'identifiant du défi (à renvoyer avec le code) et la destination masquée
 * @throws 503 ENVOI_COURRIEL_IMPOSSIBLE, SMS_NON_CONFIGURE ; 400 CONTACT_OBLIGATOIRE
 */
export async function envoyerNouveauCode(utilisateur: Destinataire) {
  const canal = choisirCanal(utilisateur);
  const code = genererCode();
  const defi = await ouvrirDefi(utilisateur.id, canal, (id) => hacherCode(code, id, environnement.JWT_SECRET));

  let envoyeA: string;
  try {
    envoyeA = await envoyerCodeConnexion(utilisateur, utilisateur.prenom || utilisateur.nom, code, canal);
  } catch (erreur) {
    await prisma.defiConnexion.update({ where: { id: defi }, data: { utiliseLe: new Date() } });
    throw erreur;
  }

  await journaliserConnexion(utilisateur.id, "CODE_CONNEXION_ENVOYE", { canal });
  return { defi, envoyeA };
}

/**
 * Vérifie le code reçu par e-mail et ouvre la session.
 * @throws 400 CODE_FORMAT ; 401 CODE_INCORRECT (essais restants), CODE_EXPIRE ; 423 TROP_DE_CODES_INCORRECTS
 */
export async function verifierCodeConnexion(defiId: string, saisie: string) {
  const code = normaliserCode(saisie);
  if (!code) throw new ErreurHttp(400, "CODE_FORMAT");
  const defi = await lireDefiOuvert(defiId, "EMAIL");
  if (!defi.codeHache || !codeCorrespond(code, defi.id, environnement.JWT_SECRET, defi.codeHache)) {
    return refuserCode(defi.id, defi.utilisateurId);
  }
  return terminerDefi(defi.id, defi.utilisateurId);
}

/**
 * Nouveau code par e-mail (l'ancien ne marche plus), au plus une fois par minute.
 * @throws 401 CODE_EXPIRE ; 429 RENVOI_TROP_TOT (attenteSecondes)
 */
export async function renvoyerCode(defiId: string) {
  const defi = await lireDefiOuvert(defiId, "EMAIL");
  const ecouleSecondes = (Date.now() - defi.envoyeLe.getTime()) / 1000;
  if (ecouleSecondes < DELAI_RENVOI_CODE_SECONDES) {
    throw new ErreurHttp(429, "RENVOI_TROP_TOT", { attenteSecondes: Math.ceil(DELAI_RENVOI_CODE_SECONDES - ecouleSecondes) });
  }
  return envoyerNouveauCode(defi.utilisateur);
}
