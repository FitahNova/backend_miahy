-- Charges fixes (dossier §6.12, R140). Ajout seulement.

-- CreateEnum
CREATE TYPE "periodicite_charge" AS ENUM ('mensuelle', 'trimestrielle', 'annuelle');

-- CreateTable
CREATE TABLE "charge_fixe" (
    "id" SERIAL NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "montant" INTEGER,
    "periodicite" "periodicite_charge" NOT NULL DEFAULT 'mensuelle',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_fixe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "charge_fixe_libelle_key" ON "charge_fixe"("libelle");


-- Charges de la maquette, montant à fixer par la Direction.
INSERT INTO "charge_fixe" ("libelle") VALUES ('Loyer'), ('Salaires'), ('Électricité et eau'), ('Internet et téléphone');
