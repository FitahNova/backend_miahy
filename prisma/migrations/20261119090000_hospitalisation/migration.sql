-- Hospitalisation courte : durée des actes d'hospitalisation, séjours et leur historique (admission, prolongation, sortie).
-- AlterTable
ALTER TABLE "service" ADD COLUMN     "duree_heures" SMALLINT;

-- CreateTable
CREATE TABLE "hospitalisation" (
    "id" SERIAL NOT NULL,
    "passage_id" INTEGER NOT NULL,
    "admis_par_id" INTEGER NOT NULL,
    "motif" VARCHAR(255),
    "arrivee" TIMESTAMPTZ(6) NOT NULL,
    "sortie_prevue" TIMESTAMPTZ(6) NOT NULL,
    "sortie_le" TIMESTAMPTZ(6),

    CONSTRAINT "hospitalisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenement_hospitalisation" (
    "id" SERIAL NOT NULL,
    "hospitalisation_id" INTEGER NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "texte" VARCHAR(255) NOT NULL,
    "auteur_id" INTEGER NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_hospitalisation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospitalisation_passage_id_key" ON "hospitalisation"("passage_id");

-- CreateIndex
CREATE INDEX "hospitalisation_sortie_le_idx" ON "hospitalisation"("sortie_le");

-- CreateIndex
CREATE INDEX "evenement_hospitalisation_hospitalisation_id_idx" ON "evenement_hospitalisation"("hospitalisation_id");

-- AddForeignKey
ALTER TABLE "hospitalisation" ADD CONSTRAINT "hospitalisation_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalisation" ADD CONSTRAINT "hospitalisation_admis_par_id_fkey" FOREIGN KEY ("admis_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenement_hospitalisation" ADD CONSTRAINT "evenement_hospitalisation_hospitalisation_id_fkey" FOREIGN KEY ("hospitalisation_id") REFERENCES "hospitalisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenement_hospitalisation" ADD CONSTRAINT "evenement_hospitalisation_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

