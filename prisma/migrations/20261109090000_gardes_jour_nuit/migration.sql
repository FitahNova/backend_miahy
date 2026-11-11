-- Planning des gardes : garde de jour (7 h 30 à 18 h) ou de nuit (18 h à 7 h 30).
-- Les gardes déjà enregistrées duraient 24 h : chacune devient une garde de jour et une garde de nuit.

CREATE TYPE "periode_garde" AS ENUM ('jour', 'nuit');

ALTER TABLE "garde_jour" ADD COLUMN "periode" "periode_garde" NOT NULL DEFAULT 'jour';

-- L'ancienne unicité (jour, personne) empêcherait la copie en garde de nuit : on la remplace.
DROP INDEX "garde_jour_date_utilisateur_id_key";

INSERT INTO "garde_jour" ("date", "utilisateur_id", "periode", "cree_le")
SELECT "date", "utilisateur_id", 'nuit', "cree_le" FROM "garde_jour" WHERE "periode" = 'jour';

CREATE UNIQUE INDEX "garde_jour_date_utilisateur_id_periode_key" ON "garde_jour"("date", "utilisateur_id", "periode");
