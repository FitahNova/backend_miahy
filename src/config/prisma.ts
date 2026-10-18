
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { environnement } from "./env.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";

const DELAI_CONNEXION_MS = 30_000;
const TAILLE_POOL = 10;

// Node 22+ fournit WebSocket nativement : aucune dépendance supplémentaire.
neonConfig.webSocketConstructor = WebSocket;

const adaptateur =
  process.env.BD_CONNEXION === "tcp"
    ? new PrismaPg({ connectionString: environnement.DATABASE_URL, connectionTimeoutMillis: DELAI_CONNEXION_MS, max: TAILLE_POOL })
    : new PrismaNeon({ connectionString: environnement.DATABASE_URL, connectionTimeoutMillis: DELAI_CONNEXION_MS, max: TAILLE_POOL });

// Délais de transaction par défaut, pour TOUTES les transactions (y compris celles sans options) :
// l'ouverture d'une connexion WebSocket vers la région de la base peut dépasser les 2 s par défaut de Prisma.
export const prisma = new PrismaClient({
  adapter: adaptateur,
  transactionOptions: OPTIONS_TRANSACTION,
});
