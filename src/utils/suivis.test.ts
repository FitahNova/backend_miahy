import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bornesListe, classerSuivi, decalerJour, jourDuCentre, joursDeRetard, typeDepuisMotif } from "./suivis.js";

const AUJOURDHUI = "2026-10-20";

describe("Suivi et rappels : classement", () => {
  it("classe « à contacter » de aujourd'hui à J+3, rien au-delà", () => {
    assert.equal(classerSuivi("2026-10-20", AUJOURDHUI), "a-contacter");
    assert.equal(classerSuivi("2026-10-23", AUJOURDHUI), "a-contacter");
    assert.equal(classerSuivi("2026-10-24", AUJOURDHUI), null);
  });

  it("classe « en retard » de 1 à 30 jours, « perdus de vue » au-delà", () => {
    assert.equal(classerSuivi("2026-10-19", AUJOURDHUI), "en-retard");
    assert.equal(classerSuivi("2026-09-20", AUJOURDHUI), "en-retard"); // 30 jours
    assert.equal(classerSuivi("2026-09-19", AUJOURDHUI), "perdus-de-vue"); // 31 jours
  });

  it("donne des bornes de liste cohérentes avec le classement", () => {
    assert.deepEqual(bornesListe("a-contacter", AUJOURDHUI), { du: "2026-10-20", au: "2026-10-23" });
    assert.deepEqual(bornesListe("en-retard", AUJOURDHUI), { du: "2026-09-20", au: "2026-10-19" });
    assert.deepEqual(bornesListe("perdus-de-vue", AUJOURDHUI), { au: "2026-09-19" });
  });

  it("compte les jours de retard, et les changements de mois", () => {
    assert.equal(joursDeRetard("2026-10-15", AUJOURDHUI), 5);
    assert.equal(joursDeRetard("2026-10-25", AUJOURDHUI), 0);
    assert.equal(decalerJour("2026-10-30", 3), "2026-11-02");
    assert.equal(decalerJour("2026-03-01", -1), "2026-02-28");
  });

  it("compte la journée à l'heure de Madagascar", () => {
    assert.equal(jourDuCentre(new Date("2026-10-19T21:00:00.000Z")), "2026-10-20"); // 0 h à Madagascar
    assert.equal(jourDuCentre(new Date("2026-10-19T20:59:00.000Z")), "2026-10-19");
  });
});

describe("Suivi et rappels : type d'après le motif", () => {
  const TYPES = ["Grossesse", "Contrôle", "Résultats", "Vaccination", "Pansement", "Chronique", "Autre"];

  it("reconnaît le type sans tenir compte des accents ni des majuscules", () => {
    assert.equal(typeDepuisMotif("Contrôle tension", TYPES), "Contrôle");
    assert.equal(typeDepuisMotif("SUIVI GROSSESSE", TYPES), "Grossesse");
    assert.equal(typeDepuisMotif("resultats prise de sang", TYPES), "Résultats");
  });

  it("met « Autre » quand aucun type ne correspond", () => {
    assert.equal(typeDepuisMotif("Malaise", TYPES), "Autre");
  });
});
