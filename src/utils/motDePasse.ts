import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "../config/constants.js";
import { ErreurHttp } from "./errors.js";

// Même méthode que auth.service.ts (bcryptjs). Ne pas changer sans changer aussi la connexion.
const COUT_BCRYPT = 10;

export function hacherMotDePasse(motDePasse: string): Promise<string> {
  return bcrypt.hash(motDePasse, COUT_BCRYPT);
}

/**
 * Empreinte d'un mot de passe que personne ne connaît : compte en attente d'activation, ou mot de passe
 * annulé par une réinitialisation. Aucune connexion n'est possible avant le choix d'un mot de passe par lien.
 */
export function hacherMotDePasseInutilisable(): Promise<string> {
  return hacherMotDePasse(randomBytes(32).toString("base64url"));
}

/**
 * Règles du mot de passe choisi par son titulaire : 8 caractères au moins, au moins une lettre et un chiffre,
 * différent de son identifiant, saisi deux fois.
 * @throws 400 MOT_DE_PASSE_NON_CONFIRME, MOT_DE_PASSE_TROP_COURT, MOT_DE_PASSE_TROP_SIMPLE
 */
export function verifierNouveauMotDePasse(motDePasse: string, confirmation: string, identifiants: (string | null)[]) {
  if (motDePasse !== confirmation) throw new ErreurHttp(400, "MOT_DE_PASSE_NON_CONFIRME");
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    throw new ErreurHttp(400, "MOT_DE_PASSE_TROP_COURT", { minimum: LONGUEUR_MIN_MOT_DE_PASSE });
  }
  // Reprendre son identifiant (début de l'e-mail, numéro) rend le mot de passe facile à deviner.
  const minuscule = motDePasse.toLowerCase();
  const reprendIdentifiant = identifiants.some((id) => {
    const radical = id?.toLowerCase().split("@")[0].replace(/^\+261/, "") ?? "";
    return radical.length >= 4 && minuscule.includes(radical);
  });
  if (!/[a-zA-Z]/.test(motDePasse) || !/\d/.test(motDePasse) || reprendIdentifiant) {
    throw new ErreurHttp(400, "MOT_DE_PASSE_TROP_SIMPLE");
  }
}
