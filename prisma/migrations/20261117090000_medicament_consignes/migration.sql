-- Consignes d'un médicament, montrées au praticien quand il le prescrit.
ALTER TABLE "medicament" ADD COLUMN IF NOT EXISTS "consignes" VARCHAR(1000);
