import { promises as dns } from "node:dns";
import { ErreurHttp } from "./errors.js";

// Réponses DNS qui prouvent que le domaine n'existe pas ou ne reçoit pas de courrier.
const DOMAINE_INEXISTANT = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

/**
 * Vérifie que le domaine d'une adresse reçoit des e-mails (enregistrement MX) : « gmial.com » ou
 * « miahy.mgg » sont refusés tout de suite. La preuve que la BOÎTE existe reste le clic sur le lien envoyé.
 * Si le DNS ne répond pas (réseau coupé), la création n'est pas bloquée : le lien fera la vérification.
 * @throws 400 EMAIL_DOMAINE_INVALIDE
 */
export async function verifierDomaineEmail(email: string): Promise<void> {
  const domaine = email.split("@")[1];
  try {
    const serveurs = await dns.resolveMx(domaine);
    if (serveurs.length === 0) throw new ErreurHttp(400, "EMAIL_DOMAINE_INVALIDE", { domaine });
  } catch (erreur) {
    if (erreur instanceof ErreurHttp) throw erreur;
    const code = (erreur as NodeJS.ErrnoException).code ?? "";
    if (DOMAINE_INEXISTANT.has(code)) throw new ErreurHttp(400, "EMAIL_DOMAINE_INVALIDE", { domaine });
    console.warn(`Vérification DNS de ${domaine} impossible (${code}) : création autorisée, le lien vérifiera l'adresse.`);
  }
}
