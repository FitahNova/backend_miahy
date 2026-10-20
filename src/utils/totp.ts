import { authenticator } from "otplib";

// Code à 6 chiffres qui change toutes les 30 s ; ±30 s tolérées (horloge du téléphone un peu décalée).
const PAS_SECONDES = 30;
const TOLERANCE_PAS = 1;

export function genererCleTotp(): string {
  return authenticator.generateSecret(20); // 32 caractères base32
}

/** « JBSWY3DPEHPK3PXP… » → « JBSW Y3DP EHPK 3PXP … », plus facile à recopier dans l'application. */
export function cleLisible(cle: string): string {
  return cle.match(/.{1,4}/g)?.join(" ") ?? cle;
}

/** Lien standard (otpauth://) : certaines applications l'ouvrent directement depuis le téléphone. */
export function lienTotp(compte: string, cle: string): string {
  return authenticator.keyuri(compte, "MIAHY", cle);
}

/**
 * Vérifie le code et renvoie son numéro de pas (période de 30 s), ou null s'il est faux.
 * Un code dont le pas n'est pas plus récent que `dernierPas` a déjà servi : il est refusé (anti-rejeu).
 */
export function verifierCodeTotp(code: string, cle: string, dernierPas: number | null, maintenant: number = Date.now()): number | null {
  const verificateur = authenticator.clone({ window: TOLERANCE_PAS, step: PAS_SECONDES, epoch: maintenant });
  const decalage = verificateur.checkDelta(code, cle);
  if (decalage === null) return null;
  const pas = Math.floor(maintenant / 1000 / PAS_SECONDES) + decalage;
  if (dernierPas !== null && pas <= dernierPas) return null;
  return pas;
}

/** Pour les tests : le code attendu à un instant donné. */
export function codeTotpA(cle: string, instant: number): string {
  return authenticator.clone({ step: PAS_SECONDES, epoch: instant }).generate(cle);
}
