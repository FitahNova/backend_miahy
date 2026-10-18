import { ErreurHttp } from "./errors.js";

// Fournisseur SMS : à choisir (Twilio, Africa's Talking, opérateur malgache...).
// Tant qu'il n'est pas configuré, aucun compte n'est créé avec un canal SMS qui ne marche pas.
export function smsConfigure(): boolean {
  return Boolean(process.env.SMS_FOURNISSEUR && process.env.SMS_CLE);
}

export async function envoyerSms(telephone: string, texte: string): Promise<void> {
  if (!smsConfigure()) {
    throw new ErreurHttp(503, "SMS_NON_CONFIGURE");
  }
  // A BRANCHER : appel au fournisseur choisi, avec telephone (+261...) et texte.
  void telephone;
  void texte;
  throw new ErreurHttp(503, "SMS_INDISPONIBLE");
}
