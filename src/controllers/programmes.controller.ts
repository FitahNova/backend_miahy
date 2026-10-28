import type { Request, Response } from "express";
import { listerProgrammesActifs, obtenirDetailProgramme } from "../services/programmes.service.js";
import { lireUtilisateur } from "../utils/parametres.js";

export async function listerProgrammes(_requete: Request, reponse: Response) {
  reponse.json({ programmes: await listerProgrammesActifs() });
}

export async function obtenirProgramme(requete: Request, reponse: Response) {
  try {
    const brut = requete.params.nom;
    const nom = decodeURIComponent(typeof brut === "string" ? brut : brut?.[0] ?? "");
    const detail = await obtenirDetailProgramme(nom, lireUtilisateur(requete).role);
    reponse.json(detail);
  } catch (erreur) {
    if ((erreur as Error).message === "PROGRAMME_INTROUVABLE") {
      reponse.status(404).json({ erreur: "Programme introuvable" });
      return;
    }
    throw erreur;
  }
}
