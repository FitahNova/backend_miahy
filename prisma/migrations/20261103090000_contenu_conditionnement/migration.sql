-- Comprimés par plaquette (décision du 03/11/2026) : 1 par défaut, les lignes existantes ne changent pas.
ALTER TABLE "medicament" ADD COLUMN "contenu_conditionnement" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "medicament" ADD CONSTRAINT "medicament_contenu_conditionnement_positif" CHECK ("contenu_conditionnement" >= 1);
