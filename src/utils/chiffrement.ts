import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM : chiffre et authentifie (une valeur modifiée en base est refusée au déchiffrement).
// Format stocké : iv.tag.donnees, en base64.

const LONGUEUR_IV = 12;
const LONGUEUR_TAG = 16;

function lireCle(cleBase64: string): Buffer {
  const cle = Buffer.from(cleBase64, "base64");
  if (cle.length !== 32) throw new Error("Clé de chiffrement invalide : 32 octets attendus");
  return cle;
}

export function chiffrer(texte: string, cleBase64: string): string {
  const cle = lireCle(cleBase64);
  const iv = randomBytes(LONGUEUR_IV);
  const chiffreur = createCipheriv("aes-256-gcm", cle, iv, { authTagLength: LONGUEUR_TAG });
  const donnees = Buffer.concat([chiffreur.update(texte, "utf8"), chiffreur.final()]);
  return [iv, chiffreur.getAuthTag(), donnees].map((partie) => partie.toString("base64")).join(".");
}

export function dechiffrer(valeur: string, cleBase64: string): string {
  const cle = lireCle(cleBase64);
  const parties = valeur.split(".");
  if (parties.length !== 3) throw new Error("Valeur chiffrée invalide");
  const [iv, tag, donnees] = parties.map((partie) => Buffer.from(partie, "base64"));
  if (iv.length !== LONGUEUR_IV || tag.length !== LONGUEUR_TAG) throw new Error("Valeur chiffrée invalide");
  const dechiffreur = createDecipheriv("aes-256-gcm", cle, iv, { authTagLength: LONGUEUR_TAG });
  dechiffreur.setAuthTag(tag);
  return Buffer.concat([dechiffreur.update(donnees), dechiffreur.final()]).toString("utf8");
}
