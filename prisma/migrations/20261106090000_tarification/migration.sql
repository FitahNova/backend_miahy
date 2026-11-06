-- Tarification des actes selon la nationalité et l'heure : paramètres de la Direction (une seule ligne)
-- et détail du calcul copié sur chaque ligne d'acte de facture (les anciennes factures ne changent jamais).

CREATE TABLE "parametres_tarification" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "majoration_soir_pourcent" SMALLINT NOT NULL DEFAULT 30,
    "heure_debut_soir" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "heure_ouverture" VARCHAR(5) NOT NULL DEFAULT '07:30',
    "majoration_etranger_pourcent" SMALLINT NOT NULL DEFAULT 25,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_par_id" INTEGER,
    CONSTRAINT "parametres_tarification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "parametres_tarification_une_ligne" CHECK ("id" = 1),
    CONSTRAINT "parametres_tarification_soir_borne" CHECK ("majoration_soir_pourcent" BETWEEN 0 AND 500),
    CONSTRAINT "parametres_tarification_etranger_borne" CHECK ("majoration_etranger_pourcent" BETWEEN 0 AND 500),
    CONSTRAINT "parametres_tarification_heure_soir" CHECK ("heure_debut_soir" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "parametres_tarification_heure_ouverture" CHECK ("heure_ouverture" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "parametres_tarification_plage" CHECK ("heure_ouverture" < "heure_debut_soir")
);

-- Valeurs par défaut : soir +30 % à partir de 18:00, ouverture à 07:30, étranger +25 %.
INSERT INTO "parametres_tarification" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "ligne_facture"
    ADD COLUMN "prix_base" INTEGER,
    ADD COLUMN "nationalite" "nationalite",
    ADD COLUMN "taux_etranger" SMALLINT,
    ADD COLUMN "taux_soir" SMALLINT;
