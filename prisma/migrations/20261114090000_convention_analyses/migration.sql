-- Conventions : un partenaire peut aussi prendre en charge une analyse.
-- La règle d'octobre (un service OU les médicaments, jamais les deux) refusait aussi « service et médicaments »,
-- que le formulaire permet : elle devient « au moins un objet couvert » (service, analyse, médicaments).

ALTER TABLE "partenaire" ADD COLUMN IF NOT EXISTS "analyse_couverte_id" INTEGER;
ALTER TABLE "partenaire" DROP CONSTRAINT IF EXISTS "partenaire_analyse_couverte_id_fkey";
ALTER TABLE "partenaire" ADD CONSTRAINT "partenaire_analyse_couverte_id_fkey"
    FOREIGN KEY ("analyse_couverte_id") REFERENCES "analyse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "partenaire" DROP CONSTRAINT IF EXISTS "partenaire_objet_couvert_check";
ALTER TABLE "partenaire" ADD CONSTRAINT "partenaire_objet_couvert_check" CHECK (
  ("taux_prise_en_charge" = 0 AND "service_couvert_id" IS NULL AND "analyse_couverte_id" IS NULL AND "couvre_medicaments" = false)
  OR ("taux_prise_en_charge" > 0 AND ("service_couvert_id" IS NOT NULL OR "analyse_couverte_id" IS NOT NULL OR "couvre_medicaments"))
);
