import nodemailer from "nodemailer";
import { DUREE_LIEN_MOT_DE_PASSE_HEURES } from "../config/constants.js";
import { ErreurHttp } from "./errors.js";

// Gmail avec mot de passe d'application (jamais le mot de passe habituel) : GMAIL_USER et GMAIL_APP_PASSWORD dans .env
const transporteur = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

export type ObjetLien = "ACTIVATION" | "REINITIALISATION";

const SUJETS: Record<ObjetLien, string> = {
  ACTIVATION: "MIAHY : activez votre compte",
  REINITIALISATION: "MIAHY : choisissez un nouveau mot de passe",
};

const INTRODUCTIONS: Record<ObjetLien, string> = {
  ACTIVATION: "La Direction du centre médical MIAHY vous a créé un compte. Pour l'activer, choisissez votre mot de passe :",
  REINITIALISATION: "Une réinitialisation de votre mot de passe MIAHY a été validée. Choisissez un nouveau mot de passe :",
};

/**
 * Envoie le lien de choix du mot de passe. Aucun mot de passe ne circule par courriel :
 * le lien ne sert qu'une fois et expire au bout de quelques heures.
 * @throws 503 ENVOI_COURRIEL_IMPOSSIBLE
 */
export async function envoyerCourrielLien(destinataire: string, nom: string, url: string, objet: ObjetLien) {
  try {
    await transporteur.sendMail({
      from: `"MIAHY" <${process.env.GMAIL_USER}>`,
      to: destinataire,
      subject: SUJETS[objet],
      text:
        `Bonjour ${nom},\n\n` +
        `${INTRODUCTIONS[objet]}\n\n${url}\n\n` +
        `Ce lien est valable ${DUREE_LIEN_MOT_DE_PASSE_HEURES} heures et ne sert qu'une fois. Ne le transmettez à personne.\n\n` +
        `Si vous n'êtes pas à l'origine de cette demande, prévenez immédiatement la Direction.`,
    });
  } catch (erreur) {
    console.error("Envoi du courriel impossible :", erreur);
    throw new ErreurHttp(503, "ENVOI_COURRIEL_IMPOSSIBLE");
  }
}

/**
 * Envoie le code de connexion à 6 chiffres (double authentification).
 * @throws 503 ENVOI_COURRIEL_IMPOSSIBLE
 */
export async function envoyerCourrielCode(destinataire: string, nom: string, code: string, dureeMinutes: number) {
  try {
    await transporteur.sendMail({
      from: `"MIAHY" <${process.env.GMAIL_USER}>`,
      to: destinataire,
      subject: `MIAHY : votre code de connexion ${code}`,
      text:
        `Bonjour ${nom},\n\n` +
        `Votre code de connexion MIAHY est : ${code}\n\n` +
        `Il est valable ${dureeMinutes} minutes et ne sert qu'une fois. Ne le communiquez à personne.\n\n` +
        `Si vous n'essayez pas de vous connecter, votre mot de passe est peut-être connu : prévenez la Direction.`,
    });
  } catch (erreur) {
    console.error("Envoi du courriel impossible :", erreur);
    throw new ErreurHttp(503, "ENVOI_COURRIEL_IMPOSSIBLE");
  }
}

// Pour l'affichage à la Direction : jamais l'adresse complète.
export function masquerEmail(email: string): string {
  const [local, domaine] = email.split("@");
  return `${local.slice(0, 1)}***@${domaine}`;
}
