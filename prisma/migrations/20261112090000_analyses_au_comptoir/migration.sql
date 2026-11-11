-- Analyses facturées : venue « analyse seule » (secrétaire, directement en caisse) ou prescrites en consultation.
-- Date de retour du résultat et remise au patient, sur le passage.

ALTER TYPE "orientation" ADD VALUE IF NOT EXISTS 'analyse';
ALTER TYPE "type_ligne_facture" ADD VALUE IF NOT EXISTS 'analyse';

ALTER TABLE "ligne_facture" ADD COLUMN "analyse_id" INTEGER;
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_analyse_id_fkey"
    FOREIGN KEY ("analyse_id") REFERENCES "analyse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ligne_facture_analyse_id_idx" ON "ligne_facture"("analyse_id");

ALTER TABLE "passage"
    ADD COLUMN "date_retour_resultat" DATE,
    ADD COLUMN "resultat_remis_le" TIMESTAMPTZ(6);
