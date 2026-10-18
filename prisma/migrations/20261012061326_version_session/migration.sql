-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN     "version_session" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "session_utilisateur" (
    "id" SERIAL NOT NULL,
    "utilisateur_id" INTEGER NOT NULL,
    "refresh_hache" VARCHAR(64) NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expire_le" TIMESTAMP(3) NOT NULL,
    "revoque_le" TIMESTAMP(3),

    CONSTRAINT "session_utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_utilisateur_refresh_hache_key" ON "session_utilisateur"("refresh_hache");

-- AddForeignKey
ALTER TABLE "session_utilisateur" ADD CONSTRAINT "session_utilisateur_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
