-- TOTP : numéro du dernier code accepté, pour qu'un même code ne serve pas deux fois. Ajout seulement.

-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN     "totp_dernier_pas" INTEGER;
