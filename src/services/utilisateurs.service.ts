import { prisma } from "../config/prisma.js";
import { Role, StatutDemandeAcces, TypeDemandeAcces, type Civilite, type Prisma } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { hacherMotDePasse, hacherMotDePasseInutilisable, verifierNouveauMotDePasse } from "../utils/motDePasse.js";
import { choisirCanal, envoyerLienMotDePasse, type CanalEnvoi } from "../utils/envoiMotDePasse.js";
import { verifierDomaineEmail } from "../utils/domaineEmail.js";
import { normaliserTelephone, MESSAGE_TELEPHONE } from "../utils/telephone.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { revoquerToutesLesSessions } from "./sessions.service.js";
import { adresseLien, emettreLien, TYPES_LIEN, type TypeLien } from "./liensMotDePasse.service.js";

// Ne jamais renvoyer motDePasseHash ni les compteurs d'échec.
const selectionUtilisateur = {
  id: true,
  civilite: true,
  nom: true,
  prenom: true,
  email: true,
  telephone: true,
  role: true,
  actif: true,
  verrouilleJusqua: true,
} as const;

export interface DonneesNouvelUtilisateur {
  civilite?: Civilite | null;
  nom: string;
  prenom: string;
  email?: string | null;
  telephone?: string | null;
  role: Role;
  canal?: CanalEnvoi | null;
  /** Présents ensemble : la Direction choisit le mot de passe, le serveur n'en garde que l'empreinte. */
  motDePasse?: string | null;
  confirmation?: string | null;
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_VIOLATION_UNIQUE = "P2002";

function estViolationUnique(erreur: unknown): boolean {
  return erreur instanceof Error && "code" in erreur && erreur.code === CODE_VIOLATION_UNIQUE;
}

// Numéro optionnel : vide = null, valide = +261…, invalide = refus avant toute écriture.
function telephoneCanonique(saisie: string | null | undefined): string | null {
  if (!saisie || !saisie.trim()) return null;
  const telephone = normaliserTelephone(saisie);
  if (!telephone) throw new ErreurHttp(400, MESSAGE_TELEPHONE);
  return telephone;
}

/**
 * État du lien de mot de passe d'un compte qui n'a pas encore choisi le sien : lien envoyé et valable,
 * ou expiré. null quand le compte a un mot de passe choisi (ou date d'avant les liens).
 */
function etatLien(
  motDePasseTemporaire: boolean,
  dernierLien: { utiliseLe: Date | null; expireLe: Date; creeLe: Date } | undefined,
) {
  if (!motDePasseTemporaire || !dernierLien || dernierLien.utiliseLe) return null;
  return {
    etat: dernierLien.expireLe > new Date() ? ("ENVOYE" as const) : ("EXPIRE" as const),
    envoyeLe: dernierLien.creeLe,
  };
}

/**
 * Comptes pour l'écran de la Direction, avec l'état du lien de mot de passe en attente :
 * ni empreinte ni compteur d'erreurs ne quittent le serveur.
 */
export async function listerUtilisateurs() {
  const utilisateurs = await prisma.utilisateur.findMany({
    select: {
      ...selectionUtilisateur,
      motDePasseTemporaire: true,
      jetons: {
        where: { type: { in: TYPES_LIEN } },
        orderBy: { creeLe: "desc" },
        take: 1,
        select: { utiliseLe: true, expireLe: true, creeLe: true },
      },
    },
    orderBy: [{ actif: "desc" }, { nom: "asc" }],
  });
  return utilisateurs.map(({ motDePasseTemporaire, jetons, ...utilisateur }) => ({
    ...utilisateur,
    lienMotDePasse: etatLien(motDePasseTemporaire, jetons[0]),
  }));
}

/**
 * Émet un lien et l'envoie dans la transaction en cours : si l'envoi échoue, rien n'est enregistré
 * (ni compte créé, ni mot de passe annulé). Renvoie la destination masquée.
 */
async function envoyerNouveauLien(
  tx: Prisma.TransactionClient,
  cible: { id: number; nom: string; email: string | null; telephone: string | null },
  type: TypeLien,
  canal: CanalEnvoi,
) {
  const jeton = await emettreLien(tx, cible.id, type);
  return envoyerLienMotDePasse(cible, cible.nom, adresseLien(jeton), type, canal);
}

/**
 * Création d'un compte par la Direction.
 * Avec mot de passe : l'empreinte seule est enregistrée, le compte peut se connecter tout de suite,
 * et le mot de passe en clair n'est jamais renvoyé. Sans mot de passe : compte en attente, lien 8 h.
 * Ordre : champs, domaine, doublons, règles du mot de passe, puis écriture (et envoi s'il y a un lien).
 * @throws 400 PRENOM_OBLIGATOIRE, EMAIL_INVALIDE, EMAIL_DOMAINE_INVALIDE, CONTACT_OBLIGATOIRE,
 *         MOT_DE_PASSE_NON_CONFIRME, MOT_DE_PASSE_TROP_COURT, MOT_DE_PASSE_TROP_SIMPLE ;
 *         409 DOUBLON_EMAIL, DOUBLON_TELEPHONE ; 503 ENVOI_COURRIEL_IMPOSSIBLE, SMS_NON_CONFIGURE
 */
export async function creerUtilisateur(donnees: DonneesNouvelUtilisateur, auteurId: number) {
  if (!donnees.prenom.trim()) throw new ErreurHttp(400, "PRENOM_OBLIGATOIRE");

  const { email, telephone } = await validerContact(donnees.email, donnees.telephone);
  if (!email && !telephone) throw new ErreurHttp(400, "CONTACT_OBLIGATOIRE");
  await verifierDoublonsContact(email, telephone);

  const motDePasse = donnees.motDePasse?.trim() ?? "";
  const choisiParLaDirection = motDePasse.length > 0;
  if (choisiParLaDirection) {
    verifierNouveauMotDePasse(motDePasse, donnees.confirmation ?? "", [email, telephone]);
  }
  const canal = choisiParLaDirection ? null : choisirCanal({ email, telephone }, donnees.canal ?? undefined);
  const motDePasseHash = choisiParLaDirection
    ? await hacherMotDePasse(motDePasse)
    : await hacherMotDePasseInutilisable();

  try {
    return await prisma.$transaction(async (transaction) => {
      const utilisateur = await transaction.utilisateur.create({
        data: {
          civilite: donnees.civilite ?? null,
          nom: donnees.nom,
          prenom: donnees.prenom,
          email,
          telephone,
          role: donnees.role,
          motDePasseHash,
          motDePasseTemporaire: !choisiParLaDirection,
          actif: true,
        },
        select: selectionUtilisateur,
      });

      let envoyeA: string | undefined;
      if (!choisiParLaDirection && canal) {
        const destinataire = { ...utilisateur, nom: utilisateur.prenom || utilisateur.nom };
        envoyeA = await envoyerNouveauLien(transaction, destinataire, "ACTIVATION", canal);
      }

      await enregistrerAudit(transaction, {
        utilisateurId: auteurId,
        action: "CREATION_UTILISATEUR",
        entite: "utilisateur",
        entiteId: utilisateur.id,
        detail: choisiParLaDirection
          ? { role: donnees.role, mode: "EMPREINTE" }
          : { role: donnees.role, canal, envoyeA },
      });

      return envoyeA ? { utilisateur, envoyeA } : { utilisateur };
    }, OPTIONS_TRANSACTION);
  } catch (erreur) {
    if (estViolationUnique(erreur)) throw new ErreurHttp(409, "DOUBLON_UTILISATEUR");
    throw erreur;
  }
}

/** Nouveau rôle. Le menu du titulaire suit à sa prochaine connexion. */
export async function changerRoleUtilisateur(cibleId: number, role: Role, auteurId: number) {
  return prisma.$transaction(async (transaction) => {
    const existant = await transaction.utilisateur.findUnique({
      where: { id: cibleId },
      select: { id: true, role: true },
    });
    if (!existant) throw new ErreurHttp(404, "UTILISATEUR_INTROUVABLE");

    if (existant.role === role) {
      return transaction.utilisateur.findUniqueOrThrow({
        where: { id: cibleId },
        select: selectionUtilisateur,
      });
    }

    const utilisateur = await transaction.utilisateur.update({
      where: { id: cibleId },
      data: { role },
      select: selectionUtilisateur,
    });

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "CHANGEMENT_ROLE",
      entite: "utilisateur",
      entiteId: cibleId,
      detail: { avant: existant.role, apres: role },
    });

    return utilisateur;
  }, OPTIONS_TRANSACTION);
}

/** Format de l'e-mail, domaine qui reçoit du courrier, téléphone au format +261. */
async function validerContact(saisieEmail: string | null | undefined, saisieTelephone: string | null | undefined) {
  const email = saisieEmail?.trim().toLowerCase() || null;
  const telephone = telephoneCanonique(saisieTelephone);
  if (email && !REGEX_EMAIL.test(email)) throw new ErreurHttp(400, "EMAIL_INVALIDE");
  if (email) await verifierDomaineEmail(email);
  return { email, telephone };
}

async function verifierDoublonsContact(email: string | null, telephone: string | null, saufId?: number) {
  if (email) {
    const doublon = await prisma.utilisateur.findFirst({ where: { email, id: { not: saufId } }, select: { id: true } });
    if (doublon) throw new ErreurHttp(409, "DOUBLON_EMAIL");
  }
  if (telephone) {
    const doublon = await prisma.utilisateur.findFirst({ where: { telephone, id: { not: saufId } }, select: { id: true } });
    if (doublon) throw new ErreurHttp(409, "DOUBLON_TELEPHONE");
  }
}

export async function changerStatutUtilisateur(cibleId: number, actif: boolean, auteurId: number) {
  if (!actif && cibleId === auteurId) {
    throw new ErreurHttp(400, "DESACTIVATION_SOI_MEME");
  }

  const utilisateur = await prisma.$transaction(async (transaction) => {
    const existant = await transaction.utilisateur.findUnique({ where: { id: cibleId }, select: { id: true } });
    if (!existant) throw new ErreurHttp(404, "UTILISATEUR_INTROUVABLE");

    const miseAJour = await transaction.utilisateur.update({
      where: { id: cibleId },
      data: { actif },
      select: selectionUtilisateur,
    });

    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: actif ? "ACTIVATION_UTILISATEUR" : "DESACTIVATION_UTILISATEUR",
      entite: "utilisateur",
      entiteId: cibleId,
    });

    return miseAJour;
  }, OPTIONS_TRANSACTION);

  if (!actif) {
    await revoquerToutesLesSessions(cibleId);
  }

  return utilisateur;
}

/**
 * Réinitialisation par la Direction (ou renvoi du lien d'un compte en attente) : l'ancien mot de passe est
 * annulé, les sessions sont fermées, et la personne reçoit un lien (8 h) pour en choisir un nouveau.
 * Le canal est l'e-mail s'il existe, sinon le SMS. Si l'envoi échoue, rien n'est modifié.
 * @throws 404 UTILISATEUR_INTROUVABLE ; 503 ENVOI_COURRIEL_IMPOSSIBLE
 */
export async function reinitialiserMotDePasse(cibleId: number, auteurId: number) {
  const cible = await prisma.utilisateur.findUnique({
    where: { id: cibleId },
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      telephone: true,
      motDePasseTemporaire: true,
      jetons: { where: { type: "ACTIVATION" }, take: 1, select: { id: true } },
    },
  });
  if (!cible) throw new ErreurHttp(404, "UTILISATEUR_INTROUVABLE");

  const canal = choisirCanal({ email: cible.email, telephone: cible.telephone });
  // Compte jamais activé : on renvoie une invitation ; sinon c'est une réinitialisation.
  const type: TypeLien = cible.motDePasseTemporaire && cible.jetons.length > 0 ? "ACTIVATION" : "REINITIALISATION";
  const motDePasseHash = await hacherMotDePasseInutilisable();

  const envoyeA = await prisma.$transaction(async (transaction) => {
    await transaction.utilisateur.update({
      where: { id: cibleId },
      data: { motDePasseHash, motDePasseTemporaire: true, motDePasseExpireLe: null, tentativesEchec: 0, verrouilleJusqua: null },
    });
    const destinataire = { ...cible, nom: cible.prenom || cible.nom };
    const destination = await envoyerNouveauLien(transaction, destinataire, type, canal);
    // Une demande « mot de passe oublié » en attente est satisfaite par cette réinitialisation.
    await transaction.demandeAcces.updateMany({
      where: { utilisateurId: cibleId, type: TypeDemandeAcces.MOT_DE_PASSE, statut: StatutDemandeAcces.EN_ATTENTE },
      data: { statut: StatutDemandeAcces.TRAITEE, traiteParId: auteurId, traiteLe: new Date() },
    });
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "REINITIALISATION_MOT_DE_PASSE",
      entite: "utilisateur",
      entiteId: cibleId,
      detail: { canal, envoyeA: destination, lien: type },
    });
    return destination;
  }, OPTIONS_TRANSACTION);

  await revoquerToutesLesSessions(cibleId);
  return { envoyeA };
}

/**
 * Correction de l'adresse ou du téléphone d'un compte encore en attente (lien jamais utilisé), puis
 * nouvel envoi du lien d'activation. Un compte déjà activé garde son contact : il a prouvé qu'il est le bon.
 * @throws 409 COMPTE_DEJA_ACTIVE ; mêmes contrôles que la création
 */
export async function corrigerContact(
  cibleId: number,
  donnees: { email?: string | null; telephone?: string | null; canal?: CanalEnvoi | null },
  auteurId: number,
) {
  const cible = await prisma.utilisateur.findUnique({
    where: { id: cibleId },
    select: {
      id: true,
      nom: true,
      prenom: true,
      motDePasseTemporaire: true,
      jetons: { where: { type: "ACTIVATION" }, take: 1, select: { id: true } },
    },
  });
  if (!cible) throw new ErreurHttp(404, "UTILISATEUR_INTROUVABLE");
  if (!cible.motDePasseTemporaire || cible.jetons.length === 0) throw new ErreurHttp(409, "COMPTE_DEJA_ACTIVE");

  const { email, telephone } = await validerContact(donnees.email, donnees.telephone);
  const canal = choisirCanal({ email, telephone }, donnees.canal ?? undefined);
  await verifierDoublonsContact(email, telephone, cibleId);

  const envoyeA = await prisma.$transaction(async (transaction) => {
    await transaction.utilisateur.update({ where: { id: cibleId }, data: { email, telephone } });
    const destinataire = { id: cibleId, nom: cible.prenom || cible.nom, email, telephone };
    const destination = await envoyerNouveauLien(transaction, destinataire, "ACTIVATION", canal);
    await enregistrerAudit(transaction, {
      utilisateurId: auteurId,
      action: "CORRECTION_CONTACT_UTILISATEUR",
      entite: "utilisateur",
      entiteId: cibleId,
      detail: { canal, envoyeA: destination },
    });
    return destination;
  }, OPTIONS_TRANSACTION);

  return { envoyeA };
}
