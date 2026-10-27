import { moisEcoules } from "./identite.js";

export type Sexe = "H" | "F";

export type NomProgramme = "Ankizy" | "Tanora" | "Vehivavy" | "Lehilahy" | "Zokiolona";

/** Âge en années révolues (même calcul que le front : `calculerAge`). */
export function ageEnAnnees(dateNaissance: Date, date: Date = new Date()): number {
  return Math.floor(moisEcoules(dateNaissance, date) / 12);
}

/**
 * Programme MIAHY déterminé par l'âge et le sexe :
 * Ankizy moins de 16 ans ; Tanora 16 à 25 ans ; Vehivavy / Lehilahy 25 à 60 ans ;
 * Zokiolona plus de 60 ans.
 */
export function determinerProgrammeParAgeSexe(age: number, sexe: Sexe): NomProgramme {
  if (age < 16) return "Ankizy";
  if (age <= 25) return "Tanora";
  if (age > 60) return "Zokiolona";
  return sexe === "F" ? "Vehivavy" : "Lehilahy";
}
