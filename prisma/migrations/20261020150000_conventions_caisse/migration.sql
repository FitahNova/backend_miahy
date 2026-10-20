-- Conventions en caisse (R084 à R089) et recouvrement des partenaires (R095). Ajout seulement.

-- AlterTable
ALTER TABLE "facture" ADD COLUMN     "convention_figee_le" TIMESTAMPTZ(6),
ADD COLUMN     "part_partenaire_exacte" DECIMAL(12,2),
ADD COLUMN     "taux_partenaire" SMALLINT;

-- CreateTable
CREATE TABLE "versement_partenaire" (
    "id" SERIAL NOT NULL,
    "partenaire_id" INTEGER NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "reference" VARCHAR(100),
    "note" VARCHAR(255),
    "auteur_id" INTEGER NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versement_partenaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "versement_partenaire_partenaire_id_idx" ON "versement_partenaire"("partenaire_id");

-- AddForeignKey
ALTER TABLE "versement_partenaire" ADD CONSTRAINT "versement_partenaire_partenaire_id_fkey" FOREIGN KEY ("partenaire_id") REFERENCES "partenaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versement_partenaire" ADD CONSTRAINT "versement_partenaire_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

