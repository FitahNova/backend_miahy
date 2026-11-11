// Calculs du planning des gardes, sans accès à la base (testés à part).

export type Periode = "JOUR" | "NUIT";
export type PersonneGarde = { id: number; civilite: string | null; nom: string; prenom: string | null };
export type CompteurGarde = PersonneGarde & { jour: number; nuit: number; total: number };

/**
 * Nombre de gardes de jour, de nuit et au total par personne. Les personnes de la liste de départ
 * apparaissent même à zéro ; une personne qui n'y est plus (compte désactivé) apparaît si elle a des gardes.
 * Tri : le plus de gardes d'abord, puis par nom.
 */
export function compterGardes(
  gardes: readonly { periode: Periode; utilisateur: PersonneGarde }[],
  personnes: readonly PersonneGarde[] = [],
): CompteurGarde[] {
  const compteurs = new Map<number, CompteurGarde>();
  for (const personne of personnes) compteurs.set(personne.id, { ...personne, jour: 0, nuit: 0, total: 0 });
  for (const { periode, utilisateur } of gardes) {
    const actuel = compteurs.get(utilisateur.id) ?? { ...utilisateur, jour: 0, nuit: 0, total: 0 };
    compteurs.set(utilisateur.id, {
      ...actuel,
      jour: actuel.jour + (periode === "JOUR" ? 1 : 0),
      nuit: actuel.nuit + (periode === "NUIT" ? 1 : 0),
      total: actuel.total + 1,
    });
  }
  return [...compteurs.values()].sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, "fr"));
}
