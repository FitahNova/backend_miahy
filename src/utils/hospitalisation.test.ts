import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dureeHospitalisation, sortieApresProlongation, sortiePrevue } from "./hospitalisation.js";

const categorie = { nom: "Hospitalisation courte" };

describe("Hospitalisation : durée de l'acte", () => {
  it("lit la durée dans le nom des actes du centre", () => {
    assert.equal(dureeHospitalisation({ nom: "Hospitalisation courte - 24 heures", categorie }), 24);
    assert.equal(dureeHospitalisation({ nom: "Hospitalisation courte - 48 heures", categorie }), 48);
    assert.equal(dureeHospitalisation({ nom: "Hospitalisation courte - Demi-journée", categorie }), 6);
    assert.equal(dureeHospitalisation({ nom: "Hospitalisation courte - Journée", categorie }), 12);
  });

  it("préfère la durée saisie sur le service", () => {
    assert.equal(dureeHospitalisation({ nom: "Hospit. 1 jour", dureeHeures: 24, categorie: null }), 24);
  });

  it("ne prend pas un autre acte pour une hospitalisation", () => {
    assert.equal(dureeHospitalisation({ nom: "Consultation générale", categorie: { nom: "Consultation" } }), null);
    assert.equal(dureeHospitalisation({ nom: "Pose de perfusion 2 h", categorie: { nom: "Soins" } }), null);
  });
});

describe("Hospitalisation : sortie prévue", () => {
  const arrivee = new Date("2026-11-19T07:00:00.000Z");

  it("ajoute la durée de l'acte à l'arrivée", () => {
    assert.equal(sortiePrevue(arrivee, 24).toISOString(), "2026-11-20T07:00:00.000Z");
  });

  it("garde la date choisie par le soignant si elle est après l'arrivée", () => {
    const choisie = new Date("2026-11-19T15:30:00.000Z");
    assert.equal(sortiePrevue(arrivee, 24, choisie).toISOString(), choisie.toISOString());
    assert.equal(sortiePrevue(arrivee, 6, new Date("2026-11-18T10:00:00.000Z")).toISOString(), "2026-11-19T13:00:00.000Z");
  });

  it("prolonge à partir de la sortie prévue, ou de maintenant si elle est dépassée", () => {
    const sortie = new Date("2026-11-20T07:00:00.000Z");
    assert.equal(sortieApresProlongation(sortie, 24, new Date("2026-11-20T05:00:00.000Z")).toISOString(), "2026-11-21T07:00:00.000Z");
    assert.equal(sortieApresProlongation(sortie, 12, new Date("2026-11-20T09:00:00.000Z")).toISOString(), "2026-11-20T21:00:00.000Z");
  });
});
