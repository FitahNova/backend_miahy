import { z } from "zod";

const schemaIdentifiant = z.coerce.number().int().positive();

export function lireIdentifiant(valeur: unknown): number {
  return schemaIdentifiant.parse(valeur);
}