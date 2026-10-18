import { Router } from "express";
import { exigerConnexion } from "../middleware/auth.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { listerProgrammes } from "../controllers/programmes.controller.js";

const routeur = Router();

routeur.get("/", exigerConnexion, gererAsync(listerProgrammes));

export default routeur;
