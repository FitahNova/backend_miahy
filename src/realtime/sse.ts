import type { Request, Response } from "express";
import { INTERVALLE_PING_SSE_SECONDES } from "../config/constants.js";
import type { Evenement } from "./events.js";

const clientsConnectes = new Set<Response>();

function ecrire(client: Response, message: string) {
  // Connexion déjà fermée côté navigateur : on retire le client au lieu d'écrire dans le vide.
  if (client.writableEnded || client.destroyed) {
    clientsConnectes.delete(client);
    return;
  }
  client.write(message);
}

export function ouvrirFluxEvenements(requete: Request, reponse: Response) {
  reponse.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  reponse.flushHeaders();
  reponse.write("retry: 3000\n\n"); // le navigateur se reconnecte seul après 3 s

  clientsConnectes.add(reponse);
  const ping = setInterval(() => ecrire(reponse, ": ping\n\n"), INTERVALLE_PING_SSE_SECONDES * 1000);

  // Nettoyage unique : fermeture normale, coupure réseau ou erreur d'écriture (pas de fuite de connexion).
  const fermer = () => {
    clearInterval(ping);
    clientsConnectes.delete(reponse);
  };
  requete.on("close", fermer);
  reponse.on("error", fermer);
}

// À appeler APRÈS la réussite d'une opération (donc hors transaction).
// Plusieurs événements peuvent partir pour une même action (ex. délivrance : file, pharmacie, caisse, stock).
export function diffuser(evenements: Evenement | Evenement[], donnees: Record<string, number | string> = {}) {
  const liste = Array.isArray(evenements) ? evenements : [evenements];
  const corps = JSON.stringify(donnees);
  for (const evenement of liste) {
    const message = `event: ${evenement}\ndata: ${corps}\n\n`;
    for (const client of clientsConnectes) ecrire(client, message);
  }
}
