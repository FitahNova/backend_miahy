-- CreateTable
CREATE TABLE "garde_jour" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "utilisateur_id" INTEGER NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "garde_jour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglement_garde" (
    "id" SERIAL NOT NULL,
    "ordre" INTEGER NOT NULL,
    "texte" VARCHAR(255) NOT NULL,

    CONSTRAINT "reglement_garde_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "garde_jour_date_key" ON "garde_jour"("date");

-- CreateIndex
CREATE UNIQUE INDEX "reglement_garde_ordre_key" ON "reglement_garde"("ordre");

-- AddForeignKey
ALTER TABLE "garde_jour" ADD CONSTRAINT "garde_jour_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
