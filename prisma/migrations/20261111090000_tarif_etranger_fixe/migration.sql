-- Tarif étranger : x2 fixe sur les services (décision de la Direction du 10/11/2026).
-- La majoration étranger n'est plus un paramètre : la colonne et sa borne sont retirées.
-- Les factures gardent le taux appliqué sur chaque ligne (ligne_facture.taux_etranger) : l'historique ne change pas.

ALTER TABLE "parametres_tarification" DROP CONSTRAINT IF EXISTS "parametres_tarification_etranger_borne";
ALTER TABLE "parametres_tarification" DROP COLUMN IF EXISTS "majoration_etranger_pourcent";
