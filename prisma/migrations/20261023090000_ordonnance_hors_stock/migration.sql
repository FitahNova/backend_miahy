-- Ordonnance : médicament hors stock du centre (prescription seule, ni délivrée ni facturée).
-- Ajout seulement : les lignes existantes gardent leur médicament.

-- AlterTable
ALTER TABLE "ligne_ordonnance" ALTER COLUMN "medicament_id" DROP NOT NULL,
ADD COLUMN "libelle" VARCHAR(150);

-- Une ligne porte soit un médicament du stock, soit un libellé saisi.
ALTER TABLE "ligne_ordonnance" ADD CONSTRAINT "ligne_ordonnance_medicament_ou_libelle_chk" CHECK (
  "medicament_id" IS NOT NULL OR ("libelle" IS NOT NULL AND length(trim("libelle")) > 0)
);
