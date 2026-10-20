import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM : chiffre et authentifie (une valeur modifiée en base est refusée au déchiffrement).
// Format stocké : iv.tag.donnees, en base64.

function lireCle(cleBase64: string): Buffer {
  const cle = Buffer.from(cleBase64, "base64");
  if (cle.length !== 32) throw new Error("Clé de chiffrement invalide : 32 octets attendus");
  return cle;
}

export function chiffrer(texte: string, cleBase64: string): string {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", lireCle(cleBase64), iv);
  const donnees = Buffer.concat([chiffreur.update(texte, "utf8"), chiffreur.final()]);
  return [iv, chiffreur.getAuthTag(), donnees].map((partie) => partie.toString("base64")).join(".");
}

export function dechiffrer(valeur: string, cleBase64: string): string {
  const [iv, tag, donnees] = valeur.split(".").map((partie) => Buffer.from(partie, "base64"));
  const dechiffreur = createDecipheriv("aes-256-gcm", lireCle(cleBase64), iv);
  dechiffreur.setAuthTag(tag);
  return Buffer.concat([dechiffreur.update(donnees), dechiffreur.final()]).toString("utf8");
}
