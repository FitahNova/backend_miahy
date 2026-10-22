import "dotenv/config";
import { z } from "zod";

const schemaEnvironnement = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL manquant"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET trop court (16 caractères minimum)"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const resultat = schemaEnvironnement.safeParse(process.env);

if (!resultat.success) {
  console.error("Configuration .env invalide :");
  for (const probleme of resultat.error.issues) {
    console.error(` - ${probleme.path.join(".")} : ${probleme.message}`);
  }
  process.exit(1);
}

export const environnement = resultat.data;
export const estEnProduction = environnement.NODE_ENV === "production";