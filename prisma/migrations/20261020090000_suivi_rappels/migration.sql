-- Suivi et rappels (R120 à R130) : types de suivi, suivis, contacts. Ajout seulement.

-- CreateEnum
CREATE TYPE "origine_suivi" AS ENUM ('consultation', 'rendez_vous_absent', 'manuel');

-- CreateEnum
CREATE TYPE "motif_cloture_suivi" AS ENUM ('retour_patient', 'manuelle');

-- CreateEnum
CREATE TYPE "canal_contact" AS ENUM ('appel', 'sms', 'autre');

-- CreateEnum
CREATE TYPE "resultat_contact" AS ENUM ('joint', 'injoignable', 'message_laisse');

-- CreateTable
CREATE TABLE "type_suivi" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(50) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "type_suivi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suivi" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "type_id" INTEGER NOT NULL,
    "echeance" DATE NOT NULL,
    "origine" "origine_suivi" NOT NULL,
    "note" VARCHAR(255),
    "rendez_vous_id" INTEGER,
    "cree_par_id" INTEGER NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cloture_le" TIMESTAMPTZ(6),
    "motif_cloture" "motif_cloture_suivi",
    "cloture_par_id" INTEGER,

    CONSTRAINT "suivi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_suivi" (
    "id" SERIAL NOT NULL,
    "suivi_id" INTEGER NOT NULL,
    "canal" "canal_contact" NOT NULL,
    "resultat" "resultat_contact" NOT NULL,
    "note" VARCHAR(255),
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteur_id" INTEGER NOT NULL,

    CONSTRAINT "contact_suivi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "type_suivi_nom_key" ON "type_suivi"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "suivi_rendez_vous_id_key" ON "suivi"("rendez_vous_id");

-- CreateIndex
CREATE INDEX "suivi_cloture_le_echeance_idx" ON "suivi"("cloture_le", "echeance");

-- CreateIndex
CREATE INDEX "suivi_patient_id_idx" ON "suivi"("patient_id");

-- CreateIndex
CREATE INDEX "contact_suivi_suivi_id_idx" ON "contact_suivi"("suivi_id");

-- AddForeignKey
ALTER TABLE "suivi" ADD CONSTRAINT "suivi_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suivi" ADD CONSTRAINT "suivi_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "type_suivi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suivi" ADD CONSTRAINT "suivi_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suivi" ADD CONSTRAINT "suivi_cree_par_id_fkey" FOREIGN KEY ("cree_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suivi" ADD CONSTRAINT "suivi_cloture_par_id_fkey" FOREIGN KEY ("cloture_par_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_suivi" ADD CONSTRAINT "contact_suivi_suivi_id_fkey" FOREIGN KEY ("suivi_id") REFERENCES "suivi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_suivi" ADD CONSTRAINT "contact_suivi_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Types de suivi de départ (la Direction peut en ajouter).
INSERT INTO "type_suivi" ("nom") VALUES ('Grossesse'), ('Contrôle'), ('Résultats'), ('Vaccination'), ('Pansement'), ('Chronique'), ('Autre');
