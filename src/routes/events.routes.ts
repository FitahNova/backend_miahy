import { Router } from "express";
import { exigerConnexion } from "../middleware/auth.js";
import { ouvrirFluxEvenements } from "../realtime/sse.js";

const routeur = Router();

routeur.get("/", exigerConnexion, ouvrirFluxEvenements);

export default routeur;
