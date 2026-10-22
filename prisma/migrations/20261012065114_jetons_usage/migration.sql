-- CreateTable
CREATE TABLE "jeton_usage" (
    "id" SERIAL NOT NULL,
    "utilisateur_id" INTEGER NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "hache" VARCHAR(64) NOT NULL,
    "expire_le" TIMESTAMPTZ(6) NOT NULL,
    "utilise_le" TIMESTAMPTZ(6),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jeton_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jeton_usage_hache_key" ON "jeton_usage"("hache");

-- CreateIndex
CREATE INDEX "jeton_usage_utilisateur_id_type_idx" ON "jeton_usage"("utilisateur_id", "type");

-- AddForeignKey
ALTER TABLE "jeton_usage" ADD CONSTRAINT "jeton_usage_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
