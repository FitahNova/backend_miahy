import { DUREE_LIEN_MOT_DE_PASSE_HEURES } from "../config/constants.js";
import { ErreurHttp } from "./errors.js";
import { envoyerCourrielLien, masquerEmail, type ObjetLien } from "./courriel.js";
import { envoyerSms } from "./sms.js";

export type CanalEnvoi = "EMAIL" | "SMS";

interface Contact {
  email: string | null;
  telephone: string | null;
}

// Canal par défaut : e-mail. Si le canal demandé n'a pas de contact, erreur claire.
export function choisirCanal(contact: Contact, canalDemande?: CanalEnvoi): CanalEnvoi {
  if (!contact.email && !contact.telephone) {
    throw new ErreurHttp(400, "CONTACT_OBLIGATOIRE");
  }
  if (canalDemande === "SMS") {
    if (!contact.telephone) throw new ErreurHttp(400, "CANAL_SANS_CONTACT");
    return "SMS";
  }
  if (canalDemande === "EMAIL") {
    if (!contact.email) throw new ErreurHttp(400, "CANAL_SANS_CONTACT");
    return "EMAIL";
  }
  return contact.email ? "EMAIL" : "SMS";
}

/** Envoie le lien de choix du mot de passe par le canal choisi. Renvoie la destination masquée. */
export async function envoyerLienMotDePasse(
  contact: Contact,
  nom: string,
  url: string,
  objet: ObjetLien,
  canal: CanalEnvoi,
): Promise<string> {
  if (canal === "EMAIL" && contact.email) {
    await envoyerCourrielLien(contact.email, nom, url, objet);
    return masquerEmail(contact.email);
  }
  if (canal === "SMS" && contact.telephone) {
    await envoyerSms(
      contact.telephone,
      `MIAHY : choisissez votre mot de passe sur ${url} (lien valable ${DUREE_LIEN_MOT_DE_PASSE_HEURES} h, une seule fois).`,
    );
    return masquerTelephone(contact.telephone);
  }
  throw new ErreurHttp(400, "CANAL_SANS_CONTACT");
}

// +261341234567 → +261341***67
export function masquerTelephone(telephone: string): string {
  return `${telephone.slice(0, 7)}***${telephone.slice(-2)}`;
}
