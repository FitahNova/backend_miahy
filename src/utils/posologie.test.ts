import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculerQuantitePrescrite, libelleDuree, libelleRythme, textePosologie } from "./posologie.js";

describe("calculerQuantitePrescrite", () => {
  it("garde le calcul habituel pour une prise par jour", () => {
    assert.equal(calculerQuantitePrescrite({ doseParPrise: 1, prisesParJour: 3, dureeJours: 5 }), 15);
    assert.equal(calculerQuantitePrescrite({ doseParPrise: 0.5, prisesParJour: 3, dureeJours: 5, intervalleJours: 1 }), 8);
  });

  it("compte une prise par période : par semaine, tous les 2 jours, par mois", () => {
    assert.equal(calculerQuantitePrescrite({ doseParPrise: 1, prisesParJour: 1, dureeJours: 90, intervalleJours: 7 }), 13);
    assert.equal(calculerQuantitePrescrite({ doseParPrise: 1, prisesParJour: 1, dureeJours: 30, intervalleJours: 2 }), 15);
    assert.equal(calculerQuantitePrescrite({ doseParPrise: 1, prisesParJour: 1, dureeJours: 180, intervalleJours: 30 }), 6);
    assert.equal(calculerQuantitePrescrite({ doseParPrise: 5, prisesParJour: 1, dureeJours: 28, intervalleJours: 7 }), 20);
  });
});

describe("libellés", () => {
  it("écrit le rythme en français courant", () => {
    assert.equal(libelleRythme(1), "par jour");
    assert.equal(libelleRythme(3), "tous les 3 jours");
    assert.equal(libelleRythme(7), "par semaine");
    assert.equal(libelleRythme(14), "toutes les 2 semaines");
    assert.equal(libelleRythme(30), "par mois");
    assert.equal(libelleRythme(90), "tous les 3 mois");
  });

  it("réaffiche la durée dans l'unité choisie", () => {
    assert.equal(libelleDuree(10, "jours"), "10 jours");
    assert.equal(libelleDuree(7, "semaines"), "1 semaine");
    assert.equal(libelleDuree(90, "mois"), "3 mois");
    assert.equal(libelleDuree(1, "jours"), "1 jour");
  });

  it("compose la phrase de posologie, ou l'instruction pour une quantité écrite", () => {
    assert.equal(
      textePosologie({ doseParPrise: 1, prisesParJour: 1, dureeJours: 90, intervalleJours: 7, uniteDuree: "mois", instruction: null, forme: "comprimé" }),
      "1 cp, 1 fois par semaine, pendant 3 mois",
    );
    assert.equal(
      textePosologie({ doseParPrise: 2.5, prisesParJour: 3, dureeJours: 5, instruction: null, forme: "sirop" }),
      "2,5 ml, 3 fois par jour, pendant 5 jours",
    );
    assert.equal(
      textePosologie({ doseParPrise: null, prisesParJour: null, dureeJours: null, instruction: "Appliquer 2 fois par jour", forme: "pommade" }),
      "Appliquer 2 fois par jour",
    );
  });
});
