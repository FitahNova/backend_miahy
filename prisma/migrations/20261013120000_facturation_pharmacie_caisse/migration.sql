-- Facturation, pharmacie et caisse.
-- Généré par `prisma migrate diff`, puis corrigé à la main :
--   1. paiement.mode est CONVERTI (Prisma proposait de supprimer la colonne : perte des modes existants) ;
--   2. facture.cree_le reprend l'heure d'arrivée du passage pour les factures existantes ;
--   3. contraintes CHECK ajoutées (Prisma ne sait pas les déclarer dans le schéma) ;
--   4. script enveloppé dans une transaction (Prisma ne le fait pas pour PostgreSQL).

-- Tout ou rien : en cas d'échec, la base reste dans son état précédent.
BEGIN;

-- Garde-fou : la carte n'est pas acceptée (R098, décision du 13/10/2026). S'il existe déjà des paiements
-- par carte, la migration s'arrête ici sans rien modifier (transaction annulée) : à traiter avec la Direction.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "paiement" WHERE upper("mode") NOT IN ('ESPECES', 'MOBILE_MONEY')) THEN
    RAISE EXCEPTION 'Paiements avec un mode non pris en charge (ex. CARTE) : migration interrompue';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "mode_paiement" AS ENUM ('especes', 'mobile_money');

-- AlterEnum
ALTER TYPE "statut_facture" ADD VALUE 'annulee';

-- AlterEnum
ALTER TYPE "type_mouvement" ADD VALUE 'retour';

-- AlterTable : facture
ALTER TABLE "facture" ADD COLUMN     "annulee_le" TIMESTAMPTZ(6),
ADD COLUMN     "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "motif_annulation" VARCHAR(255);

-- Factures existantes : date de création = arrivée du patient (meilleure approximation disponible).
UPDATE "facture" f SET "cree_le" = p."heure_arrivee" FROM "passage" p WHERE p."id" = f."passage_id";

-- AlterTable : ligne_facture
ALTER TABLE "ligne_facture" ADD COLUMN     "ligne_ordonnance_id" INTEGER;

-- AlterTable : paiement (conversion du texte 'ESPECES' / 'MOBILE_MONEY' vers l'énumération)
ALTER TABLE "paiement" ADD COLUMN     "cloture_id" INTEGER;
ALTER TABLE "paiement"
  ALTER COLUMN "mode" TYPE "mode_paiement" USING (lower("mode")::"mode_paiement");

-- AlterTable : cloture_caisse
ALTER TABLE "cloture_caisse" ADD COLUMN     "fond_de_caisse" INTEGER NOT NULL DEFAULT 0;

-- AlterTable : mouvement_stock
ALTER TABLE "mouvement_stock" ADD COLUMN     "ligne_facture_id" INTEGER;

-- CreateIndex
CREATE INDEX "facture_passage_id_idx" ON "facture"("passage_id");

-- CreateIndex
CREATE INDEX "paiement_date_idx" ON "paiement"("date");

-- AddForeignKey
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_ligne_ordonnance_id_fkey" FOREIGN KEY ("ligne_ordonnance_id") REFERENCES "ligne_ordonnance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_cloture_id_fkey" FOREIGN KEY ("cloture_id") REFERENCES "cloture_caisse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_ligne_facture_id_fkey" FOREIGN KEY ("ligne_facture_id") REFERENCES "ligne_facture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Contraintes d'intégrité (dernier rempart si le code a un bug)
-- R080 : une ligne de facture concerne soit un service, soit un médicament, jamais les deux.
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_service_ou_medicament_chk" CHECK (
  ("type" = 'acte' AND "service_id" IS NOT NULL AND "medicament_id" IS NULL)
  OR ("type" = 'medicament' AND "medicament_id" IS NOT NULL AND "service_id" IS NULL)
);
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_quantite_positive_chk" CHECK ("quantite" > 0);
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_prix_positif_chk" CHECK ("prix_unitaire" >= 0);
-- R097 : un paiement est strictement positif.
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_montant_positif_chk" CHECK ("montant" > 0);
-- Montants de facture jamais négatifs ; la remise ne dépasse pas la part patient (R088).
ALTER TABLE "facture" ADD CONSTRAINT "facture_montants_chk" CHECK (
  "total" >= 0 AND "part_patient" >= 0 AND "remise" >= 0 AND "montant_paye" >= 0 AND "remise" <= "part_patient"
);

COMMIT;
