-- CreateEnum
CREATE TYPE "role" AS ENUM ('direction', 'medecin_chef', 'medecin', 'sage_femme', 'secretaire');

-- CreateEnum
CREATE TYPE "sexe" AS ENUM ('H', 'F');

-- CreateEnum
CREATE TYPE "orientation" AS ENUM ('medecin', 'sage_femme');

-- CreateEnum
CREATE TYPE "statut_passage" AS ENUM ('en_attente', 'en_consultation', 'pharmacie', 'caisse', 'termine');

-- CreateEnum
CREATE TYPE "statut_facture" AS ENUM ('pharmacie', 'a_payer', 'partiel', 'paye');

-- CreateEnum
CREATE TYPE "type_ligne_facture" AS ENUM ('acte', 'medicament');

-- CreateEnum
CREATE TYPE "type_mouvement" AS ENUM ('entree', 'sortie', 'ajustement');

-- CreateTable
CREATE TABLE "programme" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(50) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150),
    "telephone" VARCHAR(20),
    "mot_de_passe_hash" VARCHAR(255) NOT NULL,
    "role" "role" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "tentatives_echec" SMALLINT NOT NULL DEFAULT 0,
    "verrouille_jusqua" TIMESTAMPTZ(6),

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient" (
    "id" SERIAL NOT NULL,
    "numero_dossier" VARCHAR(8) NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "prenom" VARCHAR(100) NOT NULL,
    "sexe" "sexe" NOT NULL,
    "date_naissance" DATE NOT NULL,
    "telephone" VARCHAR(20),
    "adresse" VARCHAR(255),
    "allergies" TEXT,
    "programme_id" INTEGER,
    "contact_confiance" VARCHAR(255),
    "financement" VARCHAR(30) NOT NULL DEFAULT 'Personnel',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passage" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "praticien_id" INTEGER,
    "motif" VARCHAR(255) NOT NULL,
    "orientation" "orientation",
    "statut" "statut_passage" NOT NULL DEFAULT 'en_attente',
    "urgence" BOOLEAN NOT NULL DEFAULT false,
    "heure_arrivee" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heure_debut" TIMESTAMPTZ(6),
    "heure_fin" TIMESTAMPTZ(6),

    CONSTRAINT "passage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation" (
    "id" SERIAL NOT NULL,
    "passage_id" INTEGER NOT NULL,
    "tension" VARCHAR(10),
    "poids_kg" DECIMAL(5,2),
    "glycemie" DECIMAL(4,2),
    "examen" TEXT,
    "diagnostic" TEXT,
    "note" TEXT,
    "signee_le" TIMESTAMPTZ(6),

    CONSTRAINT "consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordonnance" (
    "id" SERIAL NOT NULL,
    "passage_id" INTEGER NOT NULL,
    "prescripteur_id" INTEGER NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordonnance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_ordonnance" (
    "id" SERIAL NOT NULL,
    "ordonnance_id" INTEGER NOT NULL,
    "medicament_id" INTEGER NOT NULL,
    "dose_par_prise" DECIMAL(4,2) NOT NULL,
    "prises_par_jour" SMALLINT NOT NULL,
    "duree_jours" SMALLINT NOT NULL,
    "quantite_prescrite" INTEGER NOT NULL,
    "quantite_delivree" INTEGER NOT NULL DEFAULT 0,
    "instruction" VARCHAR(255),

    CONSTRAINT "ligne_ordonnance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facture" (
    "id" SERIAL NOT NULL,
    "numero" VARCHAR(10) NOT NULL,
    "passage_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "part_partenaire" INTEGER NOT NULL DEFAULT 0,
    "part_patient" INTEGER NOT NULL,
    "remise" INTEGER NOT NULL DEFAULT 0,
    "montant_paye" INTEGER NOT NULL DEFAULT 0,
    "statut" "statut_facture" NOT NULL DEFAULT 'pharmacie',

    CONSTRAINT "facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_facture" (
    "id" SERIAL NOT NULL,
    "facture_id" INTEGER NOT NULL,
    "type" "type_ligne_facture" NOT NULL,
    "service_id" INTEGER,
    "medicament_id" INTEGER,
    "libelle" VARCHAR(150) NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prix_unitaire" INTEGER NOT NULL,

    CONSTRAINT "ligne_facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement" (
    "id" SERIAL NOT NULL,
    "facture_id" INTEGER NOT NULL,
    "utilisateur_id" INTEGER NOT NULL,
    "montant" INTEGER NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "reference" VARCHAR(50),
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloture_caisse" (
    "id" SERIAL NOT NULL,
    "utilisateur_id" INTEGER NOT NULL,
    "jour" DATE NOT NULL,
    "total_attendu" INTEGER NOT NULL,
    "total_compte" INTEGER NOT NULL,
    "ecart" INTEGER NOT NULL,
    "commentaire" TEXT,

    CONSTRAINT "cloture_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorie_medicament" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(80) NOT NULL,

    CONSTRAINT "categorie_medicament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicament" (
    "id" SERIAL NOT NULL,
    "categorie_id" INTEGER NOT NULL,
    "nom" VARCHAR(150) NOT NULL,
    "forme" VARCHAR(30) NOT NULL,
    "prix_achat" INTEGER NOT NULL,
    "prix_vente" INTEGER NOT NULL,
    "seuil_alerte" INTEGER NOT NULL,
    "date_peremption" DATE,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "medicament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvement_stock" (
    "id" SERIAL NOT NULL,
    "medicament_id" INTEGER NOT NULL,
    "type" "type_mouvement" NOT NULL,
    "quantite" INTEGER NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateur_id" INTEGER NOT NULL,
    "approvisionnement_id" INTEGER,
    "ligne_ordonnance_id" INTEGER,
    "prix_achat_unitaire" INTEGER,
    "motif" VARCHAR(255),

    CONSTRAINT "mouvement_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fournisseur" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(150) NOT NULL,
    "telephone" VARCHAR(20),
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvisionnement" (
    "id" SERIAL NOT NULL,
    "fournisseur_id" INTEGER NOT NULL,
    "date_reception" DATE NOT NULL,
    "reference" VARCHAR(50),

    CONSTRAINT "approvisionnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "prix" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_audit" (
    "id" BIGSERIAL NOT NULL,
    "utilisateur_id" INTEGER,
    "action" VARCHAR(50) NOT NULL,
    "entite" VARCHAR(50) NOT NULL,
    "entite_id" INTEGER,
    "detail" JSONB,
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programme_nom_key" ON "programme"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_telephone_key" ON "utilisateur"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "patient_numero_dossier_key" ON "patient"("numero_dossier");

-- CreateIndex
CREATE INDEX "patient_nom_telephone_idx" ON "patient"("nom", "telephone");

-- CreateIndex
CREATE INDEX "passage_statut_idx" ON "passage"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_passage_id_key" ON "consultation"("passage_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordonnance_passage_id_key" ON "ordonnance"("passage_id");

-- CreateIndex
CREATE UNIQUE INDEX "facture_numero_key" ON "facture"("numero");

-- CreateIndex
CREATE INDEX "facture_patient_id_statut_idx" ON "facture"("patient_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "cloture_caisse_jour_key" ON "cloture_caisse"("jour");

-- CreateIndex
CREATE UNIQUE INDEX "categorie_medicament_nom_key" ON "categorie_medicament"("nom");

-- CreateIndex
CREATE INDEX "mouvement_stock_medicament_id_idx" ON "mouvement_stock"("medicament_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_nom_key" ON "service"("nom");

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passage" ADD CONSTRAINT "passage_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passage" ADD CONSTRAINT "passage_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordonnance" ADD CONSTRAINT "ordonnance_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordonnance" ADD CONSTRAINT "ordonnance_prescripteur_id_fkey" FOREIGN KEY ("prescripteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_ordonnance" ADD CONSTRAINT "ligne_ordonnance_ordonnance_id_fkey" FOREIGN KEY ("ordonnance_id") REFERENCES "ordonnance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_ordonnance" ADD CONSTRAINT "ligne_ordonnance_medicament_id_fkey" FOREIGN KEY ("medicament_id") REFERENCES "medicament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture" ADD CONSTRAINT "facture_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture" ADD CONSTRAINT "facture_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_medicament_id_fkey" FOREIGN KEY ("medicament_id") REFERENCES "medicament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloture_caisse" ADD CONSTRAINT "cloture_caisse_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicament" ADD CONSTRAINT "medicament_categorie_id_fkey" FOREIGN KEY ("categorie_id") REFERENCES "categorie_medicament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_medicament_id_fkey" FOREIGN KEY ("medicament_id") REFERENCES "medicament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_approvisionnement_id_fkey" FOREIGN KEY ("approvisionnement_id") REFERENCES "approvisionnement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_ligne_ordonnance_id_fkey" FOREIGN KEY ("ligne_ordonnance_id") REFERENCES "ligne_ordonnance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvisionnement" ADD CONSTRAINT "approvisionnement_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
