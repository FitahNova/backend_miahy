import type { Request, Response } from "express";
import { listerProgrammesActifs } from "../services/programmes.service.js";

export async function listerProgrammes(_requete: Request, reponse: Response) {
  reponse.json({ programmes: await listerProgrammesActifs() });
}
