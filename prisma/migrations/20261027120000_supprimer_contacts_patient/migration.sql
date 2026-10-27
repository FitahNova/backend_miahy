-- Ces deux champs ne sont plus utilisés dans le dossier patient.
ALTER TABLE "patient"
DROP COLUMN "contact_confiance",
DROP COLUMN "contact_autorise";
