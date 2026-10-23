-- Durée d'inactivité réglée par la Direction, et horloge de chaque session.
BEGIN;

ALTER TABLE "session_utilisateur"
ADD COLUMN "derniere_activite" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "parametre_centre" (
    "id" INTEGER NOT NULL,
    "duree_inactivite_minutes" INTEGER NOT NULL DEFAULT 15,
    CONSTRAINT "parametre_centre_pkey" PRIMARY KEY ("id")
);

INSERT INTO "parametre_centre" ("id", "duree_inactivite_minutes") VALUES (1, 15);

COMMIT;
