import { Router } from "express";
import { exigerConnexion } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { listerProgrammes, obtenirProgramme } from "../controllers/programmes.controller.js";

const routeur = Router();

routeur.get("/", exigerConnexion, gererAsync(listerProgrammes));
routeur.get("/:nom", exigerConnexion, gererAsync(obtenirProgramme));

export default routeur;
