import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { DUREE_VERROUILLAGE_MINUTES, MAX_ECHECS_CONNEXION } from "../config/constants.js";
import { environnement } from "../config/env.js";
import { envoyerNouveauCode, ouvrirDefi } from "./codeConnexion.service.js";
import { ErreurHttp } from "../utils/errors.js";
import { normaliserTelephone } from "../utils/telephone.js";
import { journaliserConnexion } from "./journal.service.js";
import { ouvrirSession } from "./sessions.service.js";

const CODE_IDENTIFIANTS_INCORRECTS = "IDENTIFIANTS_INCORRECTS";

// Hash fictif : même durée de réponse quand le compte n'existe pas ou est désactivé.
const HASH_FICTIF = bcrypt.hashSync("mot-de-passe-fictif-sans-valeur", 12);

function journaliser(...args: Parameters<typeof journaliserConnexion>) {
  return journaliserConnexion(...args).catch((erreur: unknown) => {
    console.error("Journal de connexion : écriture impossible", erreur);
  });
}

// E-mail si « @ » est présent, sinon téléphone normalisé. Un numéro invalide ne trouve personne.
export function chercherUtilisateurParIdentifiant(identifiant: string) {
  const saisie = identifiant.trim();
  if (saisie.includes("@")) {
    return prisma.utilisateur.findUnique({ where: { email: saisie.toLowerCase() } });
  }
  const telephone = normaliserTelephone(saisie);
  if (!telephone) return Promise.resolve(null);
  return prisma.utilisateur.findUnique({ where: { telephone } });
}

// Connexion : identifiant et mot de passe, puis code envoyé par e-mail si la double authentification
// est active (CODE_CONNEXION=actif), sinon ouverture directe de la session.
export async function connecterUtilisateur(identifiant: string, motDePasse: string) {
  const utilisateur = await chercherUtilisateurParIdentifiant(identifiant);

  if (!utilisateur) {
    await bcrypt.compare(motDePasse, HASH_FICTIF);
    await journaliser(null, "CONNEXION_ECHEC", { raison: "Identifiant inconnu" });
    throw new ErreurHttp(401, CODE_IDENTIFIANTS_INCORRECTS);
  }

  if (!utilisateur.actif) {
    await bcrypt.compare(motDePasse, HASH_FICTIF);
    await journaliser(utilisateur.id, "CONNEXION_ECHEC", { raison: "Compte désactivé" });
    throw new ErreurHttp(401, CODE_IDENTIFIANTS_INCORRECTS);
  }

  const maintenant = new Date();
  if (utilisateur.verrouilleJusqua && utilisateur.verrouilleJusqua > maintenant) {
    await journaliser(utilisateur.id, "CONNEXION_ECHEC", { raison: "Compte verrouillé" });
    throw new ErreurHttp(423, "COMPTE_VERROUILLE");
  }

  const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.motDePasseHash);

  if (!motDePasseValide) {
    const { tentativesEchec } = await prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { tentativesEchec: { increment: 1 } },
      select: { tentativesEchec: true },
    });

    if (tentativesEchec >= MAX_ECHECS_CONNEXION) {
      await prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: {
          tentativesEchec: 0,
          verrouilleJusqua: new Date(maintenant.getTime() + DUREE_VERROUILLAGE_MINUTES * 60 * 1000),
        },
      });
    }

    await journaliser(utilisateur.id, "CONNEXION_ECHEC", { raison: "Mot de passe incorrect" });
    throw new ErreurHttp(401, CODE_IDENTIFIANTS_INCORRECTS);
  }

  if (utilisateur.tentativesEchec > 0 || utilisateur.verrouilleJusqua) {
    await prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { tentativesEchec: 0, verrouilleJusqua: null },
    });
  }

  // Double authentification : aucune session avant le bon code.
  if (environnement.DOUBLE_AUTHENTIFICATION === "email") {
    return { etape: "CODE" as const, ...(await envoyerNouveauCode(utilisateur)) };
  }
  if (environnement.DOUBLE_AUTHENTIFICATION === "totp") {
    const defi = await ouvrirDefi(utilisateur.id, "TOTP");
    return { etape: utilisateur.totpActif ? ("TOTP" as const) : ("ACTIVATION_TOTP" as const), defi };
  }
  await journaliser(utilisateur.id, "CONNEXION");
  return { etape: "CONNECTE" as const, session: await ouvrirSession(utilisateur.id) };
}

export async function obtenirUtilisateurConnecte(identifiant: number) {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: identifiant },
    select: { id: true, civilite: true, nom: true, prenom: true, email: true, role: true, actif: true },
  });
  if (!utilisateur || !utilisateur.actif) {
    throw new ErreurHttp(401, "SESSION_INVALIDE");
  }
  return {
    id: utilisateur.id,
    civilite: utilisateur.civilite,
    nom: utilisateur.nom,
    prenom: utilisateur.prenom,
    email: utilisateur.email,
    role: utilisateur.role,
  };
}
