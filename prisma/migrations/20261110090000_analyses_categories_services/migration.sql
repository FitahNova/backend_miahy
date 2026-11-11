-- Catégories et instructions des services, et nouveau catalogue des analyses (Direction).

CREATE TYPE "domaine_prestation" AS ENUM ('service', 'analyse');

CREATE TABLE "categorie_prestation" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(80) NOT NULL,
    "domaine" "domaine_prestation" NOT NULL,
    CONSTRAINT "categorie_prestation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categorie_prestation_domaine_nom_key" ON "categorie_prestation"("domaine", "nom");

ALTER TABLE "service"
    ADD COLUMN "categorie_id" INTEGER,
    ADD COLUMN "instruction" VARCHAR(500);
ALTER TABLE "service" ADD CONSTRAINT "service_categorie_id_fkey"
    FOREIGN KEY ("categorie_id") REFERENCES "categorie_prestation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "analyse" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "nom" VARCHAR(150) NOT NULL,
    "prix" INTEGER,
    "categorie_id" INTEGER,
    "instruction" VARCHAR(500),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analyse_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "analyse_prix_positif" CHECK ("prix" IS NULL OR "prix" >= 0)
);
CREATE UNIQUE INDEX "analyse_code_key" ON "analyse"("code");
CREATE UNIQUE INDEX "analyse_nom_key" ON "analyse"("nom");
CREATE INDEX "analyse_categorie_id_idx" ON "analyse"("categorie_id");
ALTER TABLE "analyse" ADD CONSTRAINT "analyse_categorie_id_fkey"
    FOREIGN KEY ("categorie_id") REFERENCES "categorie_prestation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
