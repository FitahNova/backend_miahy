import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** Code à 6 chiffres tiré au hasard (000000 à 999999). */
export function genererCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Saisie « 123 456 » → « 123456 » ; null si ce ne sont pas exactement 6 chiffres. */
export function normaliserCode(saisie: string): string | null {
  const code = saisie.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/** Empreinte du code, liée à son défi : un code relevé en base ne sert à rien ailleurs. */
export function hacherCode(code: string, defiId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${defiId}:${code}`).digest("hex");
}

export function codeCorrespond(code: string, defiId: string, secret: string, empreinte: string): boolean {
  const attendue = Buffer.from(empreinte, "hex");
  const recue = Buffer.from(hacherCode(code, defiId, secret), "hex");
  return attendue.length === recue.length && timingSafeEqual(attendue, recue);
}
