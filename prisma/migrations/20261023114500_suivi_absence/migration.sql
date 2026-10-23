-- Relance créée lorsqu'un rendez-vous passe à Absent. Annulé n'écrit rien ici.
BEGIN;

CREATE TYPE "type_suivi" AS ENUM ('rendez_vous_manque');

CREATE TABLE "suivi" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "rendez_vous_id" INTEGER,
    "type" "type_suivi" NOT NULL,
    "echeance" DATE NOT NULL,
    "motif" VARCHAR(255) NOT NULL,
    "cloture_le" TIMESTAMPTZ(6),
    "cree_par" INTEGER,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suivi_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suivi_rendez_vous_id_key" ON "suivi"("rendez_vous_id");
CREATE INDEX "suivi_patient_id_cloture_le_idx" ON "suivi"("patient_id", "cloture_le");

ALTER TABLE "suivi" ADD CONSTRAINT "suivi_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suivi" ADD CONSTRAINT "suivi_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "suivi" ADD CONSTRAINT "suivi_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
