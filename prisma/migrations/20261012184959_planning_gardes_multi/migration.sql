/*
  Warnings:

  - A unique constraint covering the columns `[date,utilisateur_id]` on the table `garde_jour` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "garde_jour_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "garde_jour_date_utilisateur_id_key" ON "garde_jour"("date", "utilisateur_id");
