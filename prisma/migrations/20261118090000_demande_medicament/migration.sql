-- Demandes de commande de médicament envoyées par les soignants depuis l'ordonnance (Direction et Médecin chef les voient).
CREATE TABLE "demande_medicament" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(150) NOT NULL,
    "forme" VARCHAR(30),
    "medicament_id" INTEGER,
    "demandeur_id" INTEGER NOT NULL,
    "passage_id" INTEGER,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traitee_le" TIMESTAMPTZ(6),
    "traitee_par_id" INTEGER,

    CONSTRAINT "demande_medicament_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "demande_medicament_traitee_le_idx" ON "demande_medicament"("traitee_le");

ALTER TABLE "demande_medicament" ADD CONSTRAINT "demande_medicament_medicament_id_fkey" FOREIGN KEY ("medicament_id") REFERENCES "medicament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demande_medicament" ADD CONSTRAINT "demande_medicament_demandeur_id_fkey" FOREIGN KEY ("demandeur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demande_medicament" ADD CONSTRAINT "demande_medicament_traitee_par_id_fkey" FOREIGN KEY ("traitee_par_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
