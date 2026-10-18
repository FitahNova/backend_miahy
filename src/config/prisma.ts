/*
 * Connexion à la base Neon.
 * Par défaut : pilote serverless de Neon, par WebSocket sur le port 443 (celui du web).
 * Pourquoi : beaucoup de réseaux (Wi-Fi d'université, d'entreprise, public) bloquent le port 5432
 * de PostgreSQL ; le port 443 est ouvert partout où un navigateur fonctionne.
 * Repli possible en connexion PostgreSQL directe (port 5432) : variable d'environnement BD_CONNEXION=tcp.
 * Les migrations (`prisma migrate`) passent toujours par le port 5432 : à lancer depuis un réseau qui l'autorise.
 */
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
