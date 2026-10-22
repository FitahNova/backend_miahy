-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN     "totp_actif" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totp_active_le" TIMESTAMPTZ(6),
ADD COLUMN     "totp_secret_chiffre" TEXT;

-- CreateTable
CREATE TABLE "defi_connexion" (
    "id" VARCHAR(64) NOT NULL,
    "utilisateur_id" INTEGER NOT NULL,
    "expire_le" TIMESTAMPTZ(6) NOT NULL,
    "utilise_le" TIMESTAMPTZ(6),

    CONSTRAINT "defi_connexion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_secours_utilisateur" (
    "id" SERIAL NOT NULL,
    "utilisateur_id" INTEGER NOT NULL,
    "code_hache" VARCHAR(100) NOT NULL,
    "utilise_le" TIMESTAMPTZ(6),

    CONSTRAINT "code_secours_utilisateur_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "defi_connexion" ADD CONSTRAINT "defi_connexion_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_secours_utilisateur" ADD CONSTRAINT "code_secours_utilisateur_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
