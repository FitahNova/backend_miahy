-- Suppression du code PIN : colonnes du compte et demandes de déblocage du PIN.
BEGIN;

-- Les demandes de déblocage du PIN n'ont plus d'objet.
DELETE FROM "demande_acces" WHERE "type" = 'pin';

-- PostgreSQL ne sait pas retirer une valeur d'enum : le type est recréé sans 'pin'.
ALTER TYPE "type_demande_acces" RENAME TO "type_demande_acces_old";
CREATE TYPE "type_demande_acces" AS ENUM ('mot_de_passe');
ALTER TABLE "demande_acces" ALTER COLUMN "type" TYPE "type_demande_acces" USING ("type"::text::"type_demande_acces");
DROP TYPE "type_demande_acces_old";

-- AlterTable
ALTER TABLE "utilisateur" DROP COLUMN "pin_hache",
DROP COLUMN "tentatives_pin",
DROP COLUMN "verrouille_pin_jusqua";

COMMIT;
