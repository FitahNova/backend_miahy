/*
 * Double authentification par application (TOTP), sans QR code : à la première connexion, la personne
 * recopie une clé dans son application (Google ou Microsoft Authenticator…), puis saisit à chaque
 * connexion le code à 6 chiffres affiché. La clé est chiffrée en base ; un code ne sert qu'une fois.
 * Téléphone perdu : la Direction réinitialise, la personne reçoit une nouvelle clé à la connexion suivante.
 */
import { prisma } from "../config/prisma.js";
import { environnement } from "../config/env.js";
import { chiffrer, dechiffrer } from "../utils/chiffrement.js";
import { normaliserCode } from "../utils/codeConnexion.js";
import { ErreurHttp } from "../utils/errors.js";
import { cleLisible, genererCleTotp, lienTotp, verifierCodeTotp } from "../utils/totp.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { lireDefiOuvert, refuserCode, terminerDefi } from "./codeConnexion.service.js";
import { journaliserConnexion } from "./journal.service.js";
import { revoquerToutesLesSessions } from "./sessions.service.js";

function cleChiffrement(): string {
  // Vérifiée au démarrage en mode « totp » (env.ts).
  if (!environnement.TOTP_CLE) throw new ErreurHttp(503, "TOTP_NON_CONFIGURE");
  return environnement.TOTP_CLE;
}

/**
 * Première connexion : génère la clé à recopier dans l'application (une nouvelle à chaque appel,
 * tant que le TOTP n'est pas activé).
 * @throws 401 CODE_EXPIRE ; 409 TOTP_DEJA_ACTIF
 */
export async function preparerCleTotp(defiId: string) {
  const defi = await lireDefiOuvert(defiId, "TOTP");
  const { utilisateur } = defi;
  if (utilisateur.totpActif) throw new ErreurHttp(409, "TOTP_DEJA_ACTIF");

  const cle = genererCleTotp();
  await prisma.utilisateur.update({
    where: { id: utilisateur.id },
    data: { totpSecretChiffre: chiffrer(cle, cleChiffrement()), totpActif: false, totpDernierPas: null },
  });
  const compte = utilisateur.email ?? utilisateur.telephone ?? utilisateur.nom;
  return { cle: cleLisible(cle), compte, emetteur: "MIAHY", lien: lienTotp(compte, cle) };
}

/** Code de l'application → numéro de pas accepté, ou refus (essai compté). */
async function controlerCode(defi: Awaited<ReturnType<typeof lireDefiOuvert>>, saisie: string) {
  const code = normaliserCode(saisie);
  if (!code) throw new ErreurHttp(400, "CODE_FORMAT");
  const { utilisateur } = defi;
  if (!utilisateur.totpSecretChiffre) throw new ErreurHttp(409, "TOTP_NON_PREPARE");
  const cle = dechiffrer(utilisateur.totpSecretChiffre, cleChiffrement());
  const pas = verifierCodeTotp(code, cle, utilisateur.totpDernierPas);
  if (pas === null) return refuserCode(defi.id, utilisateur.id);
  return pas;
}

/**
 * Première connexion : le premier code prouve que la clé est bien dans l'application ; le TOTP
 * devient actif et la session s'ouvre.
 * @throws 400 CODE_FORMAT ; 401 CODE_INCORRECT, CODE_EXPIRE ; 409 TOTP_DEJA_ACTIF, TOTP_NON_PREPARE ; 423
 */
export async function activerTotp(defiId: string, saisie: string) {
  const defi = await lireDefiOuvert(defiId, "TOTP");
  if (defi.utilisateur.totpActif) throw new ErreurHttp(409, "TOTP_DEJA_ACTIF");
  const pas = await controlerCode(defi, saisie);
  await prisma.utilisateur.update({
    where: { id: defi.utilisateurId },
    data: { totpActif: true, totpActiveLe: new Date(), totpDernierPas: pas },
  });
  await journaliserConnexion(defi.utilisateurId, "TOTP_ACTIVE");
  return terminerDefi(defi.id, defi.utilisateurId);
}

/**
 * Connexions suivantes : code de l'application.
 * @throws 400 CODE_FORMAT ; 401 CODE_INCORRECT, CODE_EXPIRE ; 409 TOTP_NON_ACTIF ; 423
 */
export async function verifierTotp(defiId: string, saisie: string) {
  const defi = await lireDefiOuvert(defiId, "TOTP");
  if (!defi.utilisateur.totpActif) throw new ErreurHttp(409, "TOTP_NON_ACTIF");
  const pas = await controlerCode(defi, saisie);
  // Écriture conditionnelle : le même code envoyé deux fois en même temps n'est accepté qu'une fois.
  const accepte = await prisma.utilisateur.updateMany({
    where: { id: defi.utilisateurId, OR: [{ totpDernierPas: null }, { totpDernierPas: { lt: pas } }] },
    data: { totpDernierPas: pas },
  });
  if (accepte.count === 0) return refuserCode(defi.id, defi.utilisateurId);
  return terminerDefi(defi.id, defi.utilisateurId);
}

/**
 * Téléphone perdu ou changé : la Direction efface la clé ; la personne en reçoit une nouvelle à sa
 * prochaine connexion. Ses sessions sont coupées. Personne ne réinitialise son propre TOTP.
 * @throws 400 REINITIALISATION_SOI_MEME ; 404 UTILISATEUR_INTROUVABLE
 */
export async function reinitialiserTotp(cibleId: number, auteurId: number) {
  if (cibleId === auteurId) throw new ErreurHttp(400, "REINITIALISATION_SOI_MEME");
  await prisma.$transaction(async (tx) => {
    const resultat = await tx.utilisateur.updateMany({
      where: { id: cibleId },
      data: { totpActif: false, totpSecretChiffre: null, totpActiveLe: null, totpDernierPas: null },
    });
    if (resultat.count === 0) throw new ErreurHttp(404, "UTILISATEUR_INTROUVABLE");
    await enregistrerAudit(tx, {
      utilisateurId: auteurId,
      action: "REINITIALISATION_TOTP",
      entite: "utilisateur",
      entiteId: cibleId,
    });
  }, OPTIONS_TRANSACTION);
  await revoquerToutesLesSessions(cibleId);
  await journaliserConnexion(cibleId, "TOTP_REINITIALISE");
}
