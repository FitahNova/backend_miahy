import { Router } from "express";
import routeurPatients from "./patients.routes.js";
import routeurPassages from "./passages.routes.js";
import routeurConsultations from "./consultations.routes.js";
import routeurOrdonnances from "./ordonnances.routes.js";
import routeurPharmacie from "./pharmacie.routes.js";
import routeurCaisse from "./caisse.routes.js";
import routeurFactures from "./factures.routes.js";
import routeurServices from "./services.routes.js";
import routeurEvenements from "./events.routes.js";
import routeurProgrammes from "./programmes.routes.js";
import routeurDossiers from "./dossiers.routes.js";
import routeurUtilisateurs from "./utilisateurs.routes.js";
import routeurMedicaments from "./medicaments.routes.js";
import routeurGardes from "./gardes.routes.js";
import routeurPartenaires from "./partenaires.routes.js";
import routeurTableauDeBord from "./tableauDeBord.routes.js";
import routeurRendezVous from "./rendezVous.routes.js";

const routeur = Router();

// Les routes d'authentification sont montées dans src/index.ts, sous /api/auth.
routeur.use("/patients", routeurPatients);
routeur.use("/passages", routeurPassages);
routeur.use("/consultations", routeurConsultations);
routeur.use("/ordonnances", routeurOrdonnances);
routeur.use("/pharmacie", routeurPharmacie);
routeur.use("/caisse", routeurCaisse);
routeur.use("/factures", routeurFactures);
routeur.use("/services", routeurServices);
routeur.use("/evenements", routeurEvenements);
routeur.use("/programmes", routeurProgrammes);
routeur.use("/dossiers", routeurDossiers);
routeur.use("/utilisateurs", routeurUtilisateurs);
routeur.use("/medicaments", routeurMedicaments);
routeur.use("/gardes", routeurGardes);
routeur.use("/partenaires", routeurPartenaires);
routeur.use("/tableau-de-bord", routeurTableauDeBord);
routeur.use("/rendez-vous", routeurRendezVous);

export default routeur;
