import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Programmes
  for (const nom of ["Ankizy", "Tanora", "Vehivavy", "Lehilahy", "Zokiolona"]) {
    await prisma.programme.upsert({ where: { nom }, update: {}, create: { nom } });
  }

  // Premier compte Direction : il crée ensuite les autres comptes, les services, les médicaments, etc.
  // Identifiants lus dans le .env, jamais écrits dans le code.
  const email = process.env.SEED_DIRECTION_EMAIL;
  const motDePasse = process.env.SEED_DIRECTION_MOT_DE_PASSE;
  if (!email || !motDePasse || motDePasse.length < 8) {
    throw new Error("SEED_DIRECTION_EMAIL et SEED_DIRECTION_MOT_DE_PASSE (8 caractères minimum) sont requis dans le .env");
  }
  await prisma.utilisateur.upsert({
    where: { email },
    update: {},
    create: { nom: "Direction", email, role: Role.DIRECTION, motDePasseHash: await bcrypt.hash(motDePasse, 10) },
  });

  console.log("Seed terminé");
}

main().finally(() => prisma.$disconnect());
