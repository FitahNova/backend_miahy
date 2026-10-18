-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN     "mot_de_passe_expire_le" TIMESTAMPTZ(6),
ADD COLUMN     "mot_de_passe_temporaire" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pin_hache" VARCHAR(100),
ADD COLUMN     "tentatives_pin" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "verrouille_pin_jusqua" TIMESTAMPTZ(6);
