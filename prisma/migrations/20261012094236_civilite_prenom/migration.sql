-- CreateEnum
CREATE TYPE "civilite" AS ENUM ('dr', 'mme', 'm');

-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN     "civilite" "civilite",
ADD COLUMN     "prenom" VARCHAR(100);
