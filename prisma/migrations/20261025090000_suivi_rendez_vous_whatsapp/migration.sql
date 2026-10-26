-- Suivi et rappels : chaque rendez-vous pris a son suivi, annulation tracée, contact par WhatsApp.
-- Ajout de valeurs seulement : rien n'est modifié ni supprimé.

ALTER TYPE "origine_suivi" ADD VALUE 'rendez_vous';
ALTER TYPE "motif_cloture_suivi" ADD VALUE 'rendez_vous_annule';
ALTER TYPE "canal_contact" ADD VALUE 'whatsapp';
