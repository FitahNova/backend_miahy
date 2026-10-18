import { z } from "zod";

// Lettres (accents compris), séparées par un espace, un tiret ou une apostrophe. Vide accepté : « obligatoire » se règle avec .min(1).
const FORMAT_NOM = /^(?:\p{L}+(?:[ '’-]\p{L}+)*)?$/u;

const NAISSANCE_MINIMALE = new Date("1800-01-01T00:00:00.000Z");

/** « jean-pierre » → « Jean-Pierre », « marie claire » → « Marie Claire ». Le reste du mot est gardé tel quel. */
export function majusculeAuDebutDesMots(texte: string): string {
  return texte.replace(/(^|[ -])(\p{L})/gu, (_tout, separateur: string, lettre: string) => separateur + lettre.toLocaleUpperCase("fr"));
}

/** Nom de famille : espaces superflus retirés, ni chiffre ni symbole. */
export function champNom() {
  return z
    .string()
    .trim()
    .overwrite((texte) => texte.replace(/\s+/g, " "))
    .max(100)
    .regex(FORMAT_NOM);
}

/** Prénom : mêmes règles que le nom, avec une majuscule au début de chaque mot. */
export function champPrenom() {
  return champNom().overwrite(majusculeAuDebutDesMots);
}

/** Date de naissance AAAA-MM-JJ : date réelle, ni future, ni avant 1800. */
export const schemaDateNaissance = z.iso
  .date()
  .transform((texte) => new Date(`${texte}T00:00:00.000Z`))
  .refine((date) => date <= new Date(), "La date de naissance ne peut pas être dans le futur")
  .refine((date) => date >= NAISSANCE_MINIMALE, "La date de naissance ne peut pas être avant 1800");
