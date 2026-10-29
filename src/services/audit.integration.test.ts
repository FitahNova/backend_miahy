/*
 * Test sur une vraie base : le journal refuse toute modification et toute suppression.
 * Ne tourne que si DATABASE_URL_TEST pointe vers une base de TEST (jamais la base de production :
 * l'entrée créée ici ne peut plus être supprimée). Les migrations y sont appliquées avant les tests,
 * pour qu'une base vide (celle de la CI) ait ses tables.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const url = process.env.DATABASE_URL_TEST;

describe("Journal d'audit : inaltérable en base", { skip: !url && "DATABASE_URL_TEST absent" }, () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  // Crée les tables sur la base de TEST seulement : DATABASE_URL est remplacée par DATABASE_URL_TEST
  // pour ce seul processus (dotenv ne l'écrase pas).
  before(() => {
    const cliPrisma = createRequire(import.meta.url).resolve("prisma/build/index.js");
    execFileSync(process.execPath, [cliPrisma, "migrate", "deploy", "--config", "prisma7.config.ts"], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
    });
  });
  after(() => prisma.$disconnect());

  it("enregistre une entrée et fige le rôle de l'auteur", async () => {
    const auteur = await prisma.utilisateur.findFirst({ select: { id: true, role: true } });
    const entree = await prisma.journalAudit.create({
      data: { utilisateurId: auteur?.id ?? null, action: "TEST_AUDIT", entite: "test" },
    });
    assert.equal(entree.role, auteur?.role ?? null);
  });

  it("refuse la modification d'une entrée", async () => {
    const entree = await prisma.journalAudit.create({ data: { utilisateurId: null, action: "TEST_AUDIT", entite: "test" } });
    await assert.rejects(
      prisma.journalAudit.update({ where: { id: entree.id }, data: { action: "FALSIFIE" } }),
      /JOURNAL_AUDIT_INALTERABLE/,
    );
  });

  it("refuse la suppression d'une entrée", async () => {
    const entree = await prisma.journalAudit.create({ data: { utilisateurId: null, action: "TEST_AUDIT", entite: "test" } });
    await assert.rejects(prisma.journalAudit.delete({ where: { id: entree.id } }), /JOURNAL_AUDIT_INALTERABLE/);
    await assert.rejects(prisma.$executeRaw`DELETE FROM journal_audit`, /JOURNAL_AUDIT_INALTERABLE/);
  });
});
