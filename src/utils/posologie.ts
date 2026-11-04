/**
 * Rythme des prises (décision du 04/11/2026) : une prise peut se répéter chaque jour, tous les N jours, chaque
 * semaine ou chaque mois. La durée est gardée en jours (1 semaine = 7 jours, 1 mois = 30 jours) avec l'unité
 * choisie par le médecin, pour réafficher ce qu'il a écrit. Mêmes règles que le front.
 */
export const UNITES_DUREE = ["jours", "semaines", "mois"] as const;
export type UniteDuree = (typeof UNITES_DUREE)[number];

export const JOURS_PAR_UNITE: Record<UniteDuree, number> = { jours: 1, semaines: 7, mois: 30 };

/** Quantité prescrite = dose × prises × nombre de périodes sur la durée, arrondie à l'unité supérieure. */
export function calculerQuantitePrescrite(ligne: { doseParPrise: number; prisesParJour: number; dureeJours: number; intervalleJours?: number }): number {
  const periodes = Math.ceil(ligne.dureeJours / Math.max(1, ligne.intervalleJours ?? 1));
  const quantiteExacte = Math.round(ligne.doseParPrise * ligne.prisesParJour * periodes * 100) / 100;
  return Math.ceil(quantiteExacte);
}

/** « par jour », « tous les 3 jours », « par semaine », « toutes les 2 semaines », « par mois », « tous les 3 mois ». */
export function libelleRythme(intervalleJours: number): string {
  if (intervalleJours <= 1) return "par jour";
  if (intervalleJours === 7) return "par semaine";
  if (intervalleJours === 30) return "par mois";
  if (intervalleJours % 30 === 0) return `tous les ${intervalleJours / 30} mois`;
  if (intervalleJours % 7 === 0) return `toutes les ${intervalleJours / 7} semaines`;
  return `tous les ${intervalleJours} jours`;
}

/** « 10 jours », « 1 semaine », « 3 mois » : la durée dans l'unité choisie par le médecin. */
export function libelleDuree(dureeJours: number, unite: string): string {
  const choisie = (UNITES_DUREE as readonly string[]).includes(unite) ? (unite as UniteDuree) : "jours";
  const facteur = JOURS_PAR_UNITE[choisie];
  const nombre = dureeJours % facteur === 0 ? dureeJours / facteur : dureeJours;
  const retenue = dureeJours % facteur === 0 ? choisie : "jours";
  if (retenue === "mois") return `${nombre} mois`;
  const mot = retenue === "semaines" ? "semaine" : "jour";
  return `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;
}

/** Mesure d'une dose : « 1 cp », « 2 sachets », « 5 ml » ; vide pour une forme inconnue (hors stock). */
function mesure(dose: number, forme: string): string {
  switch (forme) {
    case "comprimé":
      return "cp";
    case "gélule":
      return "gél.";
    case "suppositoire":
      return "supp.";
    case "sachet":
      return dose > 1 ? "sachets" : "sachet";
    case "sirop":
      return "ml";
    default:
      return "";
  }
}

/** Phrase de posologie : « 1 cp, 3 fois par jour, pendant 5 jours » ; l'instruction seule pour une quantité écrite. */
export function textePosologie(ligne: {
  doseParPrise: number | null;
  prisesParJour: number | null;
  dureeJours: number | null;
  intervalleJours?: number | null;
  uniteDuree?: string | null;
  instruction: string | null;
  forme: string;
}): string {
  if (ligne.doseParPrise === null || ligne.prisesParJour === null || ligne.dureeJours === null) return ligne.instruction ?? "";
  const unite = mesure(ligne.doseParPrise, ligne.forme);
  const dose = `${String(ligne.doseParPrise).replace(".", ",")}${unite ? ` ${unite}` : ""}`;
  return `${dose}, ${ligne.prisesParJour} fois ${libelleRythme(ligne.intervalleJours ?? 1)}, pendant ${libelleDuree(ligne.dureeJours, ligne.uniteDuree ?? "jours")}`;
}
