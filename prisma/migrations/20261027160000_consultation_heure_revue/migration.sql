-- Heure du rendez-vous de revue choisie par le praticien (« HH:MM ») ; vide = 09:00.
ALTER TABLE "consultation" ADD COLUMN "suivi_heure" VARCHAR(5);
