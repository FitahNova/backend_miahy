-- Dossier patient de la maquette : fiche clinique et corrections tracées. Ajout seulement.

-- AlterTable
ALTER TABLE "patient" ADD COLUMN "maladies" TEXT,
ADD COLUMN "traitements" TEXT,
ADD COLUMN "contact_autorise" VARCHAR(50),
ADD COLUMN "sensible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "correction_consultation" (
    "id" SERIAL NOT NULL,
    "consultation_id" INTEGER NOT NULL,
    "auteur_id" INTEGER NOT NULL,
    "texte" TEXT NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_consultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "correction_consultation_consultation_id_idx" ON "correction_consultation"("consultation_id");

-- AddForeignKey
ALTER TABLE "correction_consultation" ADD CONSTRAINT "correction_consultation_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_consultation" ADD CONSTRAINT "correction_consultation_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
