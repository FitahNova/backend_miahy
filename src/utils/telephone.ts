// Numéros valides dans toute l'application : Madagascar, indicatif +261.
// Mobiles : préfixes 032, 033, 034, 035, 036, 037, 038.
// Même règle que le front (src/utilitaires/telephone.ts) : à garder identique.
export const PREFIXES_MOBILE_MG = ["032", "033", "034", "035", "036", "037", "038"] as const;

// Code envoyé au front, qui affiche le texte (voir messagesErreur.ts).
export const MESSAGE_TELEPHONE = "TELEPHONE_INVALIDE";

// Renvoie le numéro canonique +261XXXXXXXXX, ou null si le numéro n'est pas valide.
export function normaliserTelephone(saisie: string): string | null {
  let chiffres = saisie.replace(/[\s.\-()]/g, "");
  if (chiffres.startsWith("+")) chiffres = chiffres.slice(1);
  if (chiffres.startsWith("261")) chiffres = chiffres.slice(3);
  if (chiffres.startsWith("0")) chiffres = chiffres.slice(1);
  if (!/^3[2-8]\d{7}$/.test(chiffres)) return null;
  return `+261${chiffres}`;
}
