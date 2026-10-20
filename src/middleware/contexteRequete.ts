import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

// Contexte de la requête en cours, lisible depuis les services sans passer la requête en paramètre.
// Sert au journal de connexion pour noter l'adresse IP.
interface ContexteRequete {
  ip: string | null;
}

const stockage = new AsyncLocalStorage<ContexteRequete>();

export function contexteRequete(requete: Request, _reponse: Response, suivant: NextFunction): void {
  // requete.ip tient compte de « trust proxy » (adresse réelle derrière Render/Vercel).
  stockage.run({ ip: requete.ip ?? null }, suivant);
}

/** Adresse IP de la requête en cours, ou null hors requête (script, seed). */
export function ipCourante(): string | null {
  return stockage.getStore()?.ip ?? null;
}
