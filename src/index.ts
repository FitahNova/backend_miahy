import { environnement, estEnProduction } from "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import routeurApi from "./routes/index.js";
import { gestionnaireErreurs, routeInconnue } from "./middleware/errorHandler.js";
import { contexteRequete } from "./middleware/contexteRequete.js";
import routeurAuth from "./routes/auth.routes.js";
import sessionRoutes from "./routes/session.routes.js";

const NOMBRE_RELAIS = 2;

const app = express();

if (estEnProduction) app.set("trust proxy", NOMBRE_RELAIS);

app.use(helmet());
app.use(cors({ origin: environnement.CLIENT_ORIGIN, credentials: true }));

const ROUTE_DOCUMENTS_PARTENAIRES = /^\/api\/partenaires\/\d+\/documents$/;
const lecteurJson = express.json();
app.use((requete, reponse, suivant) =>
  ROUTE_DOCUMENTS_PARTENAIRES.test(requete.path) ? suivant() : lecteurJson(requete, reponse, suivant),
);
app.use(cookieParser());
app.use(contexteRequete);

app.get("/api/health", (_requete, reponse) => {
  reponse.json({ ok: true });
});

// Authentification : connexion en trois étapes, puis rafraîchissement et déconnexion.
app.use("/api/auth", routeurAuth);
app.use("/api/auth", sessionRoutes);

// Routes métier (patients, file, consultations, pharmacie, caisse, gardes...).
app.use("/api", routeurApi);
app.use("/api", routeInconnue);

app.use(gestionnaireErreurs);

app.listen(environnement.PORT, () => {
  console.log(`API MIAHY sur http://localhost:${environnement.PORT}`);
});
