-- Heure de la clôture de caisse (historique des clôtures).
ALTER TABLE "cloture_caisse" ADD COLUMN "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
