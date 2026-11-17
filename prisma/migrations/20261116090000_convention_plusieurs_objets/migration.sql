-- Conventions : un partenaire peut prendre en charge plusieurs services et plusieurs analyses.
-- Deux tables de liaison remplacent service_couvert_id et analyse_couverte_id (un seul objet chacun).
-- Les conventions existantes sont recopiées ; les anciennes colonnes restent en place, plus lues par l'application.

CREATE TABLE IF NOT EXISTS "_PartenaireServices" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_PartenaireServices_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX IF NOT EXISTS "_PartenaireServices_B_index" ON "_PartenaireServices"("B");
ALTER TABLE "_PartenaireServices" DROP CONSTRAINT IF EXISTS "_PartenaireServices_A_fkey";
ALTER TABLE "_PartenaireServices" ADD CONSTRAINT "_PartenaireServices_A_fkey"
    FOREIGN KEY ("A") REFERENCES "partenaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PartenaireServices" DROP CONSTRAINT IF EXISTS "_PartenaireServices_B_fkey";
ALTER TABLE "_PartenaireServices" ADD CONSTRAINT "_PartenaireServices_B_fkey"
    FOREIGN KEY ("B") REFERENCES "service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "_PartenaireAnalyses" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_PartenaireAnalyses_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX IF NOT EXISTS "_PartenaireAnalyses_B_index" ON "_PartenaireAnalyses"("B");
ALTER TABLE "_PartenaireAnalyses" DROP CONSTRAINT IF EXISTS "_PartenaireAnalyses_A_fkey";
ALTER TABLE "_PartenaireAnalyses" ADD CONSTRAINT "_PartenaireAnalyses_A_fkey"
    FOREIGN KEY ("A") REFERENCES "analyse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PartenaireAnalyses" DROP CONSTRAINT IF EXISTS "_PartenaireAnalyses_B_fkey";
ALTER TABLE "_PartenaireAnalyses" ADD CONSTRAINT "_PartenaireAnalyses_B_fkey"
    FOREIGN KEY ("B") REFERENCES "partenaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recopie des conventions existantes (A = partenaire pour les services, A = analyse pour les analyses).
INSERT INTO "_PartenaireServices" ("A", "B")
SELECT "id", "service_couvert_id" FROM "partenaire" WHERE "service_couvert_id" IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO "_PartenaireAnalyses" ("A", "B")
SELECT "analyse_couverte_id", "id" FROM "partenaire" WHERE "analyse_couverte_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- La règle « au moins un objet couvert » portait sur les anciennes colonnes : elle est vérifiée par le serveur.
ALTER TABLE "partenaire" DROP CONSTRAINT IF EXISTS "partenaire_objet_couvert_check";
