import nodemailer from "nodemailer";
import { DUREE_LIEN_MOT_DE_PASSE_HEURES } from "../config/constants.js";
import { environnement } from "../config/env.js";
import { ErreurHttp } from "./errors.js";
import { gabaritCode, gabaritLien } from "./gabaritCourriel.js";

// En ligne (Render bloque le SMTP) : API Brevo en HTTPS si BREVO_CLE est définie.
// En local : Gmail avec mot de passe d'application (GMAIL_USER, GMAIL_APP_PASSWORD).
const URL_BREVO = "https://api.brevo.com/v3/smtp/email";
const DELAI_ENVOI_MS = 15_000;
const expediteur = () => process.env.COURRIEL_EXPEDITEUR ?? process.env.GMAIL_USER ?? "";
const urlLogo = () => `${environnement.CLIENT_ORIGIN}/logo-miahy.jpeg`;

const transporteurGmail = nodemailer.createTransport({
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

const TITRES: Record<ObjetLien, string> = {
  ACTIVATION: "Bienvenue sur MIAHY",
  REINITIALISATION: "Nouveau mot de passe",
};

const BOUTONS: Record<ObjetLien, string> = {
  ACTIVATION: "Activer mon compte",
  REINITIALISATION: "Choisir mon mot de passe",
};

async function envoyerParBrevo(cle: string, destinataire: string, sujet: string, texte: string, html: string) {
  const reponse = await fetch(URL_BREVO, {
    method: "POST",
    headers: { "api-key": cle, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "MIAHY", email: expediteur() },
      to: [{ email: destinataire }],
      subject: sujet,
      htmlContent: html,
      textContent: texte,
    }),
    signal: AbortSignal.timeout(DELAI_ENVOI_MS),
  });
  if (!reponse.ok) throw new Error(`Brevo ${reponse.status} : ${await reponse.text()}`);
}

/** @throws 503 ENVOI_COURRIEL_IMPOSSIBLE */
async function envoyer(destinataire: string, sujet: string, texte: string, html: string) {
  try {
    const cleBrevo = process.env.BREVO_CLE;
    if (cleBrevo) await envoyerParBrevo(cleBrevo, destinataire, sujet, texte, html);
    else await transporteurGmail.sendMail({ from: `"MIAHY" <${expediteur()}>`, to: destinataire, subject: sujet, text: texte, html });
  } catch (erreur) {
    console.error("Envoi du courriel impossible :", erreur);
    throw new ErreurHttp(503, "ENVOI_COURRIEL_IMPOSSIBLE");
  }
}

/**
 * Envoie le lien de choix du mot de passe. Aucun mot de passe ne circule par courriel :
 * le lien ne sert qu'une fois et expire au bout de quelques heures.
 * @throws 503 ENVOI_COURRIEL_IMPOSSIBLE
 */
export async function envoyerCourrielLien(destinataire: string, nom: string, url: string, objet: ObjetLien) {
  await envoyer(
    destinataire,
    SUJETS[objet],
    `Bonjour ${nom},\n\n` +
      `${INTRODUCTIONS[objet]}\n\n${url}\n\n` +
      `Ce lien est valable ${DUREE_LIEN_MOT_DE_PASSE_HEURES} heures et ne sert qu'une fois. Ne le transmettez à personne.\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, prévenez immédiatement la Direction.`,
    gabaritLien({
      titre: TITRES[objet],
      nom,
      introduction: INTRODUCTIONS[objet],
      libelleBouton: BOUTONS[objet],
      url,
      dureeHeures: DUREE_LIEN_MOT_DE_PASSE_HEURES,
      urlLogo: urlLogo(),
    }),
  );
}

/**
 * Envoie le code de connexion à 6 chiffres (double authentification).
 * @throws 503 ENVOI_COURRIEL_IMPOSSIBLE
 */
export async function envoyerCourrielCode(destinataire: string, nom: string, code: string, dureeMinutes: number) {
  await envoyer(
    destinataire,
    `MIAHY : votre code de connexion ${code}`,
    `Bonjour ${nom},\n\n` +
      `Votre code de connexion MIAHY est : ${code}\n\n` +
      `Il est valable ${dureeMinutes} minutes et ne sert qu'une fois. Ne le communiquez à personne.\n\n` +
      `Si vous n'essayez pas de vous connecter, votre mot de passe est peut-être connu : prévenez la Direction.`,
    gabaritCode(nom, code, dureeMinutes, urlLogo()),
  );
}

// Pour l'affichage à la Direction : jamais l'adresse complète.
export function masquerEmail(email: string): string {
  const [local, domaine] = email.split("@");
  return `${local.slice(0, 1)}***@${domaine}`;
}
