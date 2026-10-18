-- Partenaires et conventions (phase 2) + rendez-vous (phase 4).
-- Migration additive : aucune donnée existante n'est modifiée. Approuvée le 14/10/2026.
BEGIN;

-- CreateEnum
CREATE TYPE "statut_rendez_vous" AS ENUM ('prevu', 'venu', 'absent', 'annule');

-- AlterTable
ALTER TABLE "facture" ADD COLUMN     "partenaire_id" INTEGER;

-- CreateTable
CREATE TABLE "categorie_partenaire" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(50) NOT NULL,

    CONSTRAINT "categorie_partenaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partenaire" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(150) NOT NULL,
    "categorie_id" INTEGER NOT NULL,
    "contact" VARCHAR(255),
    "taux_prise_en_charge" SMALLINT NOT NULL DEFAULT 0,
    "service_couvert_id" INTEGER,
    "couvre_medicaments" BOOLEAN NOT NULL DEFAULT false,
    "debut" DATE,
    "fin" DATE,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partenaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_partenaire" (
    "id" SERIAL NOT NULL,
    "partenaire_id" INTEGER NOT NULL,
    "nom_fichier" VARCHAR(255) NOT NULL,
    "type_mime" VARCHAR(100) NOT NULL,
    "taille_octets" INTEGER NOT NULL,
    "chemin" VARCHAR(255) NOT NULL,
    "ajoute_par_id" INTEGER NOT NULL,
    "ajoute_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_partenaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rendez_vous" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "praticien_id" INTEGER,
    "date_heure" TIMESTAMPTZ(6) NOT NULL,
    "motif" VARCHAR(255) NOT NULL,
    "statut" "statut_rendez_vous" NOT NULL DEFAULT 'prevu',
    "passage_id" INTEGER,
    "consultation_origine_id" INTEGER,
    "cree_par_id" INTEGER NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rendez_vous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PartenaireToProgramme" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PartenaireToProgramme_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorie_partenaire_nom_key" ON "categorie_partenaire"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "partenaire_nom_key" ON "partenaire"("nom");

-- CreateIndex
CREATE INDEX "document_partenaire_partenaire_id_idx" ON "document_partenaire"("partenaire_id");

-- CreateIndex
CREATE UNIQUE INDEX "rendez_vous_passage_id_key" ON "rendez_vous"("passage_id");

-- CreateIndex
CREATE INDEX "rendez_vous_date_heure_idx" ON "rendez_vous"("date_heure");

-- CreateIndex
CREATE INDEX "rendez_vous_patient_id_idx" ON "rendez_vous"("patient_id");

-- CreateIndex
CREATE INDEX "_PartenaireToProgramme_B_index" ON "_PartenaireToProgramme"("B");

-- AddForeignKey
ALTER TABLE "facture" ADD CONSTRAINT "facture_partenaire_id_fkey" FOREIGN KEY ("partenaire_id") REFERENCES "partenaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partenaire" ADD CONSTRAINT "partenaire_categorie_id_fkey" FOREIGN KEY ("categorie_id") REFERENCES "categorie_partenaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partenaire" ADD CONSTRAINT "partenaire_service_couvert_id_fkey" FOREIGN KEY ("service_couvert_id") REFERENCES "service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_partenaire" ADD CONSTRAINT "document_partenaire_partenaire_id_fkey" FOREIGN KEY ("partenaire_id") REFERENCES "partenaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_partenaire" ADD CONSTRAINT "document_partenaire_ajoute_par_id_fkey" FOREIGN KEY ("ajoute_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_consultation_origine_id_fkey" FOREIGN KEY ("consultation_origine_id") REFERENCES "consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_cree_par_id_fkey" FOREIGN KEY ("cree_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PartenaireToProgramme" ADD CONSTRAINT "_PartenaireToProgramme_A_fkey" FOREIGN KEY ("A") REFERENCES "partenaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PartenaireToProgramme" ADD CONSTRAINT "_PartenaireToProgramme_B_fkey" FOREIGN KEY ("B") REFERENCES "programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Règles de convention garanties par la base (maquette « Partenaires ») :
-- taux entre 0 et 100 ; un taux > 0 couvre exactement un objet (un service OU les médicaments) ; validité cohérente.
ALTER TABLE "partenaire" ADD CONSTRAINT "partenaire_taux_check" CHECK ("taux_prise_en_charge" BETWEEN 0 AND 100);
ALTER TABLE "partenaire" ADD CONSTRAINT "partenaire_objet_couvert_check" CHECK (
  ("taux_prise_en_charge" = 0 AND "service_couvert_id" IS NULL AND "couvre_medicaments" = false)
  OR ("taux_prise_en_charge" > 0 AND (("service_couvert_id" IS NOT NULL) <> "couvre_medicaments"))
);
ALTER TABLE "partenaire" ADD CONSTRAINT "partenaire_validite_check" CHECK ("fin" IS NULL OR "debut" IS NULL OR "fin" >= "debut");
ALTER TABLE "document_partenaire" ADD CONSTRAINT "document_partenaire_taille_check" CHECK ("taille_octets" > 0);

-- Catégories proposées par la maquette (renommables ensuite).
INSERT INTO "categorie_partenaire" ("nom") VALUES ('Entreprise'), ('ONG'), ('École'), ('Fondation'), ('Assurance'), ('Autre');

COMMIT;
