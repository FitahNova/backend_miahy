-- Une ligne de facture concerne un service (acte), un médicament ou une analyse, et un seul des trois.
-- Remplace la règle R080 d'octobre (acte ou médicament seulement), qui refusait les lignes d'analyse.

ALTER TABLE "ligne_facture" DROP CONSTRAINT IF EXISTS "ligne_facture_service_ou_medicament_chk";
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_service_ou_medicament_chk" CHECK (
  ("type" = 'acte' AND "service_id" IS NOT NULL AND "medicament_id" IS NULL AND "analyse_id" IS NULL)
  OR ("type" = 'medicament' AND "medicament_id" IS NOT NULL AND "service_id" IS NULL AND "analyse_id" IS NULL)
  OR ("type" = 'analyse' AND "analyse_id" IS NOT NULL AND "service_id" IS NULL AND "medicament_id" IS NULL)
);
