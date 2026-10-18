/*
 * Demandes d'accès à la Direction (R013), décisions du 14/10/2026 :
 * - mot de passe oublié : demande faite depuis la page de connexion, sans être connecté.
 * La Direction valide (lien de mot de passe envoyé) ou refuse (demande suspecte).
 * Personne ne traite sa propre demande. Une seule demande en attente par personne et par type.
 */
import { prisma } from "../config/prisma.js";
import { StatutDemandeAcces, TypeDemandeAcces } from "../generated/prisma/client.js";
import { ErreurHttp } from "../utils/errors.js";
import { OPTIONS_TRANSACTION } from "../utils/transactions.js";
import { enregistrerAudit } from "./audit.service.js";
import { chercherUtilisateurParIdentifiant } from "./auth.service.js";
import { journaliserConnexion } from "./journal.service.js";
import { reinitialiserMotDePasse } from "./utilisateurs.service.js";

const CODE_VIOLATION_UNIQUE = "P2002";

/** Crée la demande ; si une demande du même type attend déjà, ne fait rien (index unique partiel). */
async function creerDemande(utilisateurId: number, type: TypeDemandeAcces): Promise<boolean> {
  try {
    await prisma.demandeAcces.create({ data: { utilisateurId, type } });
  } catch (erreur) {
    if (erreur instanceof Error && "code" in erreur && erreur.code === CODE_VIOLATION_UNIQUE) return false;
    throw erreur;
  }
  await journaliserConnexion(utilisateurId, "DEMANDE_ACCES", { type });
  return true;
}

/**
 * Mot de passe oublié. La réponse ne dit jamais si le compte existe : un compte inconnu ou désactivé
 * ne produit simplement aucune demande.
 * @returns true si une nouvelle demande attend la Direction (pour prévenir les écrans en temps réel)
 */
export async function demanderNouveauMotDePasse(identifiant: string): Promise<boolean> {
  const utilisateur = await chercherUtilisateurParIdentifiant(identifiant);
  if (!utilisateur || !utilisateur.actif) return false;
  return creerDemande(utilisateur.id, TypeDemandeAcces.MOT_DE_PASSE);
}

/** Demandes en attente pour l'écran de la Direction, les plus anciennes d'abord. */
export function listerDemandesEnAttente() {
  return prisma.demandeAcces.findMany({
    where: { statut: StatutDemandeAcces.EN_ATTENTE },
    orderBy: { creeLe: "asc" },
    select: {
      id: true,
      type: true,
      creeLe: true,
      utilisateur: { select: { id: true, civilite: true, nom: true, prenom: true, role: true, email: true, telephone: true } },
    },
  });
}

/**
 * Validation ou refus par la Direction.
 * Valider un mot de passe oublié envoie un lien de réinitialisation (8 h).
 * @throws 404 DEMANDE_INTROUVABLE ; 409 DEMANDE_DEJA_TRAITEE ; 400 TRAITEMENT_SOI_MEME ; erreurs d'envoi du lien
 */
export async function traiterDemande(demandeId: number, accepter: boolean, auteurId: number) {
  const demande = await prisma.demandeAcces.findUnique({ where: { id: demandeId } });
  if (!demande) throw new ErreurHttp(404, "DEMANDE_INTROUVABLE");
  if (demande.statut !== StatutDemandeAcces.EN_ATTENTE) throw new ErreurHttp(409, "DEMANDE_DEJA_TRAITEE");
  if (demande.utilisateurId === auteurId) throw new ErreurHttp(400, "TRAITEMENT_SOI_MEME");

  const audit = {
    utilisateurId: auteurId,
    action: accepter ? "DEMANDE_ACCES_VALIDEE" : "DEMANDE_ACCES_REFUSEE",
    entite: "utilisateur",
    entiteId: demande.utilisateurId,
    detail: { demandeId, type: demande.type },
  };

  if (accepter) {
    // La réinitialisation ferme elle-même la demande en attente ; si l'envoi du lien échoue,
    // rien n'est modifié et la demande reste en attente.
    const { envoyeA } = await reinitialiserMotDePasse(demande.utilisateurId, auteurId);
    await enregistrerAudit(prisma, audit);
    return { envoyeA };
  }

  await prisma.$transaction(async (tx) => {
    const marquee = await tx.demandeAcces.updateMany({
      where: { id: demandeId, statut: StatutDemandeAcces.EN_ATTENTE },
      data: { statut: StatutDemandeAcces.REFUSEE, traiteParId: auteurId, traiteLe: new Date() },
    });
    // Deux membres de la Direction ont cliqué en même temps : la première décision compte.
    if (marquee.count === 0) throw new ErreurHttp(409, "DEMANDE_DEJA_TRAITEE");
    await enregistrerAudit(tx, audit);
  }, OPTIONS_TRANSACTION);
  return { envoyeA: null };
}
