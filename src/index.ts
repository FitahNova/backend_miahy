import { environnement, estEnProduction } from "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import routeurApi from "./routes/index.js";
import { gestionnaireErreurs, routeInconnue } from "./middleware/errorHandler.js";
import routeurAuth from "./routes/auth.routes.js";
import sessionRoutes from "./routes/session.routes.js";

const NOMBRE_RELAIS = 2;

const app = express();

// En ligne, les requêtes traversent deux relais (Vercel, puis le répartiteur de Render) :
// l'adresse IP réelle du client est lue dans X-Forwarded-For, sinon la limitation des
// connexions compterait tous les utilisateurs comme une seule adresse.
if (estEnProduction) app.set("trust proxy", NOMBRE_RELAIS);

app.use(helmet());
app.use(cors({ origin: environnement.CLIENT_ORIGIN, credentials: true }));
// Corps JSON limité à 100 ko, sauf l'envoi de documents partenaires qui a sa propre limite (route dédiée).
const ROUTE_DOCUMENTS_PARTENAIRES = /^\/api\/partenaires\/\d+\/documents$/;
const lecteurJson = express.json();
app.use((requete, reponse, suivant) =>
  ROUTE_DOCUMENTS_PARTENAIRES.test(requete.path) ? suivant() : lecteurJson(requete, reponse, suivant),
);
app.use(cookieParser());

app.get("/api/health", (_requete, reponse) => {
  reponse.json({ ok: true });
});

// Authentification : connexion en trois étapes, puis rafraîchissement et déconnexion.
app.use("/api/auth", routeurAuth);
app.use("/api/auth", sessionRoutes);

// Routes métier (patients, file, consultations, pharmacie, caisse, gardes...).
app.use("/api", routeurApi);
app.use("/api", routeInconnue);

// Le gestionnaire d'erreurs doit toujours être déclaré après toutes les routes.
app.use(gestionnaireErreurs);

app.listen(environnement.PORT, () => {
  console.log(`API MIAHY sur http://localhost:${environnement.PORT}`);
});
