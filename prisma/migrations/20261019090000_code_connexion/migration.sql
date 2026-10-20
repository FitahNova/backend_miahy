-- Code de connexion envoyé par e-mail ou SMS (double authentification). Ajout seulement.

-- AlterTable
ALTER TABLE "defi_connexion" ADD COLUMN     "canal" VARCHAR(10),
ADD COLUMN     "code_hache" VARCHAR(64),
ADD COLUMN     "envoye_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tentatives" SMALLINT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "defi_connexion_utilisateur_id_idx" ON "defi_connexion"("utilisateur_id");
