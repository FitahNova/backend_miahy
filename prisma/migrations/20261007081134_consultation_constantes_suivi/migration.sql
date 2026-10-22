-- AlterTable
ALTER TABLE "consultation" ADD COLUMN     "brouillon" JSONB,
ADD COLUMN     "pouls" SMALLINT,
ADD COLUMN     "spo2" SMALLINT,
ADD COLUMN     "suivi_delai_jours" SMALLINT,
ADD COLUMN     "suivi_motif" VARCHAR(50),
ADD COLUMN     "temperature" DECIMAL(3,1);
