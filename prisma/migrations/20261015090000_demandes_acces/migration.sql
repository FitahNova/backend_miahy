-- Demandes d'accès à la Direction (R013) : mot de passe oublié, PIN bloqué.
-- Ajout seulement : aucune table ni donnée existante n'est modifiée.
BEGIN;

-- CreateEnum
CREATE TYPE "type_demande_acces" AS ENUM ('mot_de_passe', 'pin');

-- CreateEnum
CREATE TYPE "statut_demande_acces" AS ENUM ('en_attente', 'traitee', 'refusee');

-- CreateTable
CREATE TABLE "demande_acces" (
    "id" SERIAL NOT NULL,
    "utilisateur_id" INTEGER NOT NULL,
    "type" "type_demande_acces" NOT NULL,
    "statut" "statut_demande_acces" NOT NULL DEFAULT 'en_attente',
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traite_par_id" INTEGER,
    "traite_le" TIMESTAMPTZ(6),

    CONSTRAINT "demande_acces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demande_acces_statut_idx" ON "demande_acces"("statut");

-- AddForeignKey
ALTER TABLE "demande_acces" ADD CONSTRAINT "demande_acces_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_acces" ADD CONSTRAINT "demande_acces_traite_par_id_fkey" FOREIGN KEY ("traite_par_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Une seule demande en attente par personne et par type (Prisma ne sait pas déclarer un index partiel).
CREATE UNIQUE INDEX "demande_acces_une_en_attente" ON "demande_acces"("utilisateur_id", "type") WHERE "statut" = 'en_attente';

-- Une demande traitée ou refusée dit par qui et quand ; une demande en attente n'a ni l'un ni l'autre.
ALTER TABLE "demande_acces" ADD CONSTRAINT "demande_acces_traitement_check" CHECK (
  ("statut" = 'en_attente' AND "traite_par_id" IS NULL AND "traite_le" IS NULL)
  OR ("statut" <> 'en_attente' AND "traite_le" IS NOT NULL)
);

COMMIT;
