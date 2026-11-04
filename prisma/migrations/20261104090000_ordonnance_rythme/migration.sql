-- Rythme des prises (décision du 04/11/2026) : par jour, tous les N jours, par semaine, par mois.
-- Les lignes existantes valent « par jour », durée en jours : rien ne change pour elles.
ALTER TABLE "ligne_ordonnance" ADD COLUMN "intervalle_jours" SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE "ligne_ordonnance" ADD COLUMN "unite_duree" VARCHAR(10) NOT NULL DEFAULT 'jours';
ALTER TABLE "ligne_ordonnance" ADD CONSTRAINT "ligne_ordonnance_intervalle_jours_valide" CHECK ("intervalle_jours" BETWEEN 1 AND 365);
ALTER TABLE "ligne_ordonnance" ADD CONSTRAINT "ligne_ordonnance_unite_duree_valide" CHECK ("unite_duree" IN ('jours', 'semaines', 'mois'));
