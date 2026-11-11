import { Router } from "express";
import { z } from "zod";
import { Role } from "../generated/prisma/client.js";
import { exigerConnexion, exigerRole } from "../middleware/auth.js";
import { EVENEMENTS } from "../realtime/events.js";
import { diffuser } from "../realtime/sse.js";
import {
  fixerDateRetour,
  listerResultatsAnalyses,
  marquerResultatRemis,
  obtenirTicketAnalyses,
} from "../services/resultatsAnalyses.service.js";
import { gererAsync } from "../utils/asyncHandler.js";
import { lireIdentifiant, lireUtilisateur } from "../utils/parametres.js";
import { jourDuCentre } from "../utils/suivis.js";

const schemaListe = z.object({
  etat: z.enum(["attente", "remis"]).default("attente"),
  recherche: z.string().trim().max(100).optional(),
});
// Date de retour : aujourd'hui ou plus tard (heure du centre).
const schemaDate = z
  .object({
    dateRetour: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((jour) => jour >= jourDuCentre(new Date()), "La date de retour ne peut pas être passée"),
  })
  .strict();
const schemaRemis = z.object({ remis: z.boolean() }).strict();

// Résultats d'analyses : la secrétaire (accueil et caisse) et la Direction.
const routeur = Router();
routeur.use(exigerConnexion, exigerRole(Role.SECRETAIRE, Role.DIRECTION));

routeur.get(
  "/",
  gererAsync(async (requete, reponse) => {
    reponse.json({ resultats: await listerResultatsAnalyses(schemaListe.parse(requete.query)) });
  }),
);

routeur.get(
  "/:passageId/ticket",
  gererAsync(async (requete, reponse) => {
    reponse.json(await obtenirTicketAnalyses(lireIdentifiant(requete.params.passageId)));
  }),
);

routeur.patch(
  "/:passageId/date-retour",
  gererAsync(async (requete, reponse) => {
    const passageId = lireIdentifiant(requete.params.passageId);
    const { dateRetour } = schemaDate.parse(requete.body);
    const resultat = await fixerDateRetour(passageId, dateRetour, lireUtilisateur(requete).id);
    diffuser([EVENEMENTS.CAISSE_MODIFIEE], { passageId });
    reponse.json({ resultat });
  }),
);

routeur.patch(
  "/:passageId/remis",
  gererAsync(async (requete, reponse) => {
    const passageId = lireIdentifiant(requete.params.passageId);
    const { remis } = schemaRemis.parse(requete.body);
    const resultat = await marquerResultatRemis(passageId, remis, lireUtilisateur(requete).id);
    diffuser([EVENEMENTS.CAISSE_MODIFIEE], { passageId });
    reponse.json({ resultat });
  }),
);

export default routeur;
