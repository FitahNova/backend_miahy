import type { Request, Response } from "express";
import { z } from "zod";
import { connecterUtilisateur } from "../services/auth.service.js";
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

// Identifiant et mot de passe : pose les cookies de session et renvoie l'utilisateur.
export async function connexion(requete: Request, reponse: Response) {
  const { identifiant, motDePasse } = schemaConnexion.parse(requete.body);
  const session = await connecterUtilisateur(identifiant, motDePasse);
  poserCookiesSession(reponse, session.jeton, session.refreshToken, session.expireLe, session.dureeInactiviteMinutes);
  reponse.json({ etape: "CONNECTE", utilisateur: session.utilisateur });
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
