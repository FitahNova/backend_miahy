// Options de toutes les transactions Prisma du projet (une seule source).
// Neon (base distante, mise en veille) peut mettre plusieurs secondes à répondre au réveil :
// - maxWait : attente maximale d'une connexion libre dans le pool ;
// - timeout : durée maximale de la transaction avant annulation (sinon erreur P2028).
// Règle associée : dans une transaction, n'utiliser que le client « transaction », jamais « prisma ».
export const OPTIONS_TRANSACTION = {
  maxWait: 10_000,
  timeout: 15_000,
};
