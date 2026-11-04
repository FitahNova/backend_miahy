-- Pommade, injectable, collyre : le médecin écrit l'instruction et la quantité, sans dose × prises × jours.
-- Les lignes existantes gardent leurs valeurs.
ALTER TABLE "ligne_ordonnance" ALTER COLUMN "dose_par_prise" DROP NOT NULL;
ALTER TABLE "ligne_ordonnance" ALTER COLUMN "prises_par_jour" DROP NOT NULL;
ALTER TABLE "ligne_ordonnance" ALTER COLUMN "duree_jours" DROP NOT NULL;
