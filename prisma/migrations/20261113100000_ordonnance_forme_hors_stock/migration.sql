-- Médicament hors stock sur l'ordonnance : le praticien précise sa forme (comprimé, sirop, injectable…),
-- pour écrire la bonne posologie. Vide pour les médicaments du stock (leur forme vient de la fiche) et les anciennes lignes.

ALTER TABLE "ligne_ordonnance" ADD COLUMN "forme" VARCHAR(30);
