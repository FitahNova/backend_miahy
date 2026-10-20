import type { Request, Response } from "express";
import { z } from "zod";
import { connecterUtilisateur } from "../services/auth.service.js";
import { renvoyerCode, verifierCodeConnexion } from "../services/codeConnexion.service.js";
import { activerTotp, preparerCleTotp, verifierTotp } from "../services/totp.service.js";
import { choisirMotDePasse, decrireLien } from "../services/liensMotDePasse.service.js";
import { demanderNouveauMotDePasse } from "../services/demandesAcces.service.js";
import { diffuser } from "../realtime/sse.js";
import { EVENEMENTS } from "../realtime/events.js";
import { poserCookiesSession } from "../utils/cookies.js";

const schemaJeton = z.string().trim().min(20).max(100);

const schemaChoixMotDePasse = z.object({
  jeton: schemaJeton,
  motDePasse: z.string().min(1).max(200),
  confirmation: z.string().min(1).max(200),
});

const schemaConnexion = z.object({
  identifiant: z.string().trim().min(1).max(150),
  motDePasse: z.string().min(1).max(200),
});

const schemaDefi = z.string().regex(/^[0-9a-f]{64}$/);
const schemaCode = z.object({ defi: schemaDefi, code: z.string().trim().min(1).max(20) });

// Identifiant et mot de passe : soit une étape de double authentification (aucun cookie encore),
// soit la session directement. Étapes : CODE (e-mail), TOTP, ACTIVATION_TOTP.
export async function connexion(requete: Request, reponse: Response) {
  const { identifiant, motDePasse } = schemaConnexion.parse(requete.body);
  const resultat = await connecterUtilisateur(identifiant, motDePasse);
  if (resultat.etape !== "CONNECTE") {
    reponse.json(resultat);
    return;
  }
  const { session } = resultat;
  poserCookiesSession(reponse, session.jeton, session.refreshToken, session.expireLe);
  reponse.json({ etape: "CONNECTE", utilisateur: session.utilisateur });
}

// Code reçu par e-mail : ouvre la session.
export async function verifierCode(requete: Request, reponse: Response) {
  const { defi, code } = schemaCode.parse(requete.body);
  const session = await verifierCodeConnexion(defi, code);
  poserCookiesSession(reponse, session.jeton, session.refreshToken, session.expireLe);
  reponse.json({ etape: "CONNECTE", utilisateur: session.utilisateur });
}

// TOTP, première connexion : clé à recopier dans l'application.
export async function preparerTotp(requete: Request, reponse: Response) {
  const defi = schemaDefi.parse((requete.body as { defi?: unknown }).defi);
  reponse.json(await preparerCleTotp(defi));
}

// TOTP, première connexion : le premier code active le TOTP et ouvre la session.
export async function activerTotpConnexion(requete: Request, reponse: Response) {
  const { defi, code } = schemaCode.parse(requete.body);
  const session = await activerTotp(defi, code);
  poserCookiesSession(reponse, session.jeton, session.refreshToken, session.expireLe);
  reponse.json({ etape: "CONNECTE", utilisateur: session.utilisateur });
}

// TOTP : code de l'application, puis session.
export async function verifierTotpConnexion(requete: Request, reponse: Response) {
  const { defi, code } = schemaCode.parse(requete.body);
  const session = await verifierTotp(defi, code);
  poserCookiesSession(reponse, session.jeton, session.refreshToken, session.expireLe);
  reponse.json({ etape: "CONNECTE", utilisateur: session.utilisateur });
}

// Nouveau code : renvoie le nouvel identifiant de défi (l'ancien ne sert plus).
export async function renvoyerCodeConnexion(requete: Request, reponse: Response) {
  const defi = schemaDefi.parse((requete.body as { defi?: unknown }).defi);
  reponse.json({ etape: "CODE", ...(await renvoyerCode(defi)) });
}

// Page « Choisir mon mot de passe » : le jeton vient de l'ancre du lien, envoyé dans le corps (jamais dans l'URL).
export async function lireLien(requete: Request, reponse: Response) {
  const jeton = schemaJeton.parse((requete.body as { jeton?: unknown }).jeton);
  reponse.json(await decrireLien(jeton));
}

export async function enregistrerMotDePasse(requete: Request, reponse: Response) {
  const { jeton, motDePasse, confirmation } = schemaChoixMotDePasse.parse(requete.body);
  await choisirMotDePasse(jeton, motDePasse, confirmation);
  reponse.status(204).end();
}

const schemaOubli = z.object({ identifiant: z.string().trim().min(1).max(150) });

// Mot de passe oublié : même réponse que le compte existe ou non (aucune information sur les comptes).
export async function motDePasseOublie(requete: Request, reponse: Response) {
  const { identifiant } = schemaOubli.parse(requete.body);
  if (await demanderNouveauMotDePasse(identifiant)) diffuser(EVENEMENTS.DEMANDES_MODIFIEES);
  reponse.status(202).json({ ok: true });
}
