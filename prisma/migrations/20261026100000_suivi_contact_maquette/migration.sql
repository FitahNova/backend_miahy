-- Options de canal et de résultat affichées dans la maquette Suivi & rappels.
-- Ajout de valeurs uniquement : les entrées d'historique existantes restent valides.
ALTER TYPE "canal_contact" ADD VALUE 'visite';

ALTER TYPE "resultat_contact" ADD VALUE 'rendez_vous_fixe';
ALTER TYPE "resultat_contact" ADD VALUE 'a_rappeler';
ALTER TYPE "resultat_contact" ADD VALUE 'pas_de_reponse';
ALTER TYPE "resultat_contact" ADD VALUE 'refus';
ALTER TYPE "resultat_contact" ADD VALUE 'numero_incorrect';
ALTER TYPE "resultat_contact" ADD VALUE 'autre';
