-- Statut des patients pour la Direction (Nouveau, Fidèle, Inactif).
-- « Nouveau » dépend de chaque compte Direction : patients créés depuis la fin de sa session précédente.

ALTER TABLE "utilisateur"
    ADD COLUMN "derniere_activite_le" TIMESTAMPTZ(6),
    ADD COLUMN "nouveaux_depuis" TIMESTAMPTZ(6);
