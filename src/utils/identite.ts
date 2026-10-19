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

// ---------- Âge saisi à la place de la date de naissance (R016) ----------

const AGE_MAX_ANS = 130;
const AGE_MAX_MOIS = 23; // à partir de 2 ans, l'âge se saisit en ans
const DECALAGE_MADAGASCAR_MS = 3 * 60 * 60 * 1000;

export type UniteAge = "ans" | "mois";

type SaisieNaissance = { dateNaissance?: Date; age?: number; uniteAge?: UniteAge };

/** Champs acceptés : la date de naissance, ou l'âge (1 à 130 ans, ou 1 à 23 mois pour un bébé). */
export const champsNaissance = {
  dateNaissance: schemaDateNaissance.optional(),
  age: z.number().int().min(1).max(AGE_MAX_ANS).optional(),
  uniteAge: z.enum(["ans", "mois"]).optional(),
};

/** Date ou âge, jamais les deux. Un nouveau-né de moins d'un mois se saisit avec sa date de naissance. */
export function regleNaissance(obligatoire: boolean) {
  return (saisie: SaisieNaissance, ctx: z.RefinementCtx) => {
    const avecAge = saisie.age !== undefined;
    if (saisie.dateNaissance && avecAge) {
      ctx.addIssue({ code: "custom", path: ["age"], message: "Saisir la date de naissance ou l'âge, pas les deux" });
    } else if (obligatoire && !saisie.dateNaissance && !avecAge) {
      ctx.addIssue({ code: "custom", path: ["dateNaissance"], message: "Date de naissance ou âge obligatoire" });
    }
    if (saisie.uniteAge && !avecAge) {
      ctx.addIssue({ code: "custom", path: ["uniteAge"], message: "Unité donnée sans âge" });
    }
    if (saisie.uniteAge === "mois" && avecAge && saisie.age! > AGE_MAX_MOIS) {
      ctx.addIssue({ code: "custom", path: ["age"], message: "À partir de 24 mois, saisir l'âge en ans" });
    }
  };
}

/** Pour les tests : les mêmes règles, seules. */
export function schemaSaisieNaissance(obligatoire: boolean) {
  return z.object(champsNaissance).superRefine(regleNaissance(obligatoire));
}

function jourMadagascar(date: Date): Date {
  return new Date(date.getTime() + DECALAGE_MADAGASCAR_MS);
}

/** Même jour, N ans ou N mois plus tôt (31 mars - 1 mois = 28 ou 29 février). */
export function naissanceDepuisAge(age: number, unite: UniteAge, aujourdhui: Date = new Date()): Date {
  const jour = jourMadagascar(aujourdhui);
  const totalMois = jour.getUTCFullYear() * 12 + jour.getUTCMonth() - (unite === "ans" ? age * 12 : age);
  const annee = Math.floor(totalMois / 12);
  const mois = totalMois % 12;
  const dernierJour = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(annee, mois, Math.min(jour.getUTCDate(), dernierJour)));
}

/** Date de naissance à enregistrer : celle saisie, sinon celle calculée depuis l'âge. */
export function naissanceDepuisSaisie(saisie: SaisieNaissance, aujourdhui: Date = new Date()): Date | undefined {
  if (saisie.dateNaissance) return saisie.dateNaissance;
  if (saisie.age === undefined) return undefined;
  return naissanceDepuisAge(saisie.age, saisie.uniteAge ?? "ans", aujourdhui);
}

/** Mois entiers écoulés depuis la naissance, à l'heure de Madagascar. */
export function moisEcoules(dateNaissance: Date, date: Date = new Date()): number {
  const jour = jourMadagascar(date);
  let mois = (jour.getUTCFullYear() - dateNaissance.getUTCFullYear()) * 12 + jour.getUTCMonth() - dateNaissance.getUTCMonth();
  if (jour.getUTCDate() < dateNaissance.getUTCDate()) mois -= 1;
  return mois;
}

/** « 7 mois » avant 2 ans, « 42 ans » ensuite. */
export function ageLisible(dateNaissance: Date, date: Date = new Date()): string {
  const mois = moisEcoules(dateNaissance, date);
  if (mois < 1) return "moins d'un mois";
  if (mois < 24) return `${mois} mois`;
  return `${Math.floor(mois / 12)} ans`;
}
