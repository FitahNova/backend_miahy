-- Détail du comptage de la clôture de caisse (billets et pièces). Ajout seulement.

ALTER TABLE "cloture_caisse" ADD COLUMN "detail_comptage" JSONB;
