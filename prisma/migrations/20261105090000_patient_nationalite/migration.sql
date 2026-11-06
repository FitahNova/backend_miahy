-- Nationalité du patient, précisée à l'arrivée : Malagasy ou étranger.
-- Colonne facultative : les patients déjà enregistrés la reçoivent à leur prochaine venue.
CREATE TYPE "nationalite" AS ENUM ('malagasy', 'etranger');

ALTER TABLE "patient" ADD COLUMN "nationalite" "nationalite";
