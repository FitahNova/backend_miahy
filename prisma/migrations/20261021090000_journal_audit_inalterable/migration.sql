-- Journal d'audit : rôle figé, adresse IP, index de consultation, et journal en ajout seul.

-- Nouvelles colonnes
ALTER TABLE "journal_audit" ADD COLUMN "role" "role";
ALTER TABLE "journal_audit" ADD COLUMN "ip" VARCHAR(45);

-- Rôle des entrées existantes : rôle actuel de l'auteur (meilleure information disponible)
UPDATE "journal_audit" j SET "role" = u."role" FROM "utilisateur" u WHERE u."id" = j."utilisateur_id";

-- Données de santé : les notes de clôture de suivi déjà journalisées en clair sont retirées
-- (dernière modification possible, avant que le journal devienne inaltérable)
UPDATE "journal_audit" SET "detail" = '{"avecNote": true}'::jsonb
  WHERE "action" = 'SUIVI_CLOTURE' AND "detail" ? 'note';

-- Index pour les filtres de l'écran Journal
CREATE INDEX "journal_audit_date_idx" ON "journal_audit"("date");
CREATE INDEX "journal_audit_utilisateur_id_date_idx" ON "journal_audit"("utilisateur_id", "date");

-- Un utilisateur cité dans le journal ne peut pas être supprimé (les comptes sont désactivés, jamais supprimés)
ALTER TABLE "journal_audit" DROP CONSTRAINT "journal_audit_utilisateur_id_fkey";
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_utilisateur_id_fkey"
  FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- À l'insertion : le rôle de l'auteur est figé par la base
CREATE FUNCTION journal_audit_figer_role() RETURNS trigger AS $$
BEGIN
  IF NEW."role" IS NULL AND NEW."utilisateur_id" IS NOT NULL THEN
    SELECT "role" INTO NEW."role" FROM "utilisateur" WHERE "id" = NEW."utilisateur_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_audit_role
  BEFORE INSERT ON "journal_audit"
  FOR EACH ROW EXECUTE FUNCTION journal_audit_figer_role();

-- Ajout seul : aucune modification ni suppression, quel que soit l'utilisateur
CREATE FUNCTION journal_audit_interdire_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'JOURNAL_AUDIT_INALTERABLE' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_audit_inalterable
  BEFORE UPDATE OR DELETE ON "journal_audit"
  FOR EACH ROW EXECUTE FUNCTION journal_audit_interdire_modification();

CREATE TRIGGER journal_audit_inalterable_truncate
  BEFORE TRUNCATE ON "journal_audit"
  FOR EACH STATEMENT EXECUTE FUNCTION journal_audit_interdire_modification();
