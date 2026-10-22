/** Détails structurés joints à une erreur (essais restants, montant maximal…), sans texte destiné à l'écran. */
export type DetailsErreur = Record<string, string | number | boolean | null>;

/**
 * Erreur métier renvoyée au front sous la forme { code, details? }.
 * Le code est stable (ex. STOCK_INSUFFISANT) : le front le traduit en message français.
 * Aucun texte technique ni message interne ne doit être placé dans le code ou les détails.
 *
 * @param statut statut HTTP (400, 401, 403, 404, 409, 423…)
 * @param code code stable en MAJUSCULES_SOULIGNEES
 * @param details valeurs utiles à l'affichage (facultatif)
 */
export class ErreurHttp extends Error {
  readonly statut: number;
  readonly code: string;
  readonly details?: DetailsErreur;

  constructor(statut: number, code: string, details?: DetailsErreur) {
    super(code);
    this.name = "ErreurHttp";
    this.statut = statut;
    this.code = code;
    this.details = details;
  }
}
