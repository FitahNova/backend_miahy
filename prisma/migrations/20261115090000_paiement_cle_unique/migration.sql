-- Paiement : clé unique par encaissement (idempotence). Une demande renvoyée après une coupure réseau
-- retrouve le paiement déjà enregistré au lieu d'en créer un second. Les paiements existants gardent une clé vide.

ALTER TABLE "paiement" ADD COLUMN IF NOT EXISTS "cle_idempotence" VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS "paiement_cle_idempotence_key" ON "paiement"("cle_idempotence");
