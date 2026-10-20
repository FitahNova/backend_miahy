import "dotenv/config";
import { z } from "zod";

const schemaEnvironnement = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL manquant"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET trop court (16 caractères minimum)"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Étape après le mot de passe : code par e-mail, ou code d'une application (TOTP). « inactif » tant que le front ne la gère pas.
  DOUBLE_AUTHENTIFICATION: z.enum(["inactif", "email", "totp"]).default("inactif"),
  // Clé de chiffrement des clés TOTP en base : 32 octets en base64 (obligatoire en mode « totp »).
  TOTP_CLE: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.DOUBLE_AUTHENTIFICATION === "totp" && Buffer.from(env.TOTP_CLE ?? "", "base64").length !== 32) {
    ctx.addIssue({ code: "custom", path: ["TOTP_CLE"], message: "TOTP_CLE manquante ou invalide (32 octets en base64)" });
  }
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