import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ageEnAnnees, determinerProgrammeParAgeSexe } from "./programmes.js";

describe("Programme selon l'âge et le sexe", () => {
  it("place les moins de 16 ans dans Ankizy", () => {
    assert.equal(determinerProgrammeParAgeSexe(0, "F"), "Ankizy");
    assert.equal(determinerProgrammeParAgeSexe(15, "H"), "Ankizy");
  });

  it("place les 16 à 25 ans dans Tanora, quel que soit le sexe", () => {
    assert.equal(determinerProgrammeParAgeSexe(16, "F"), "Tanora");
    assert.equal(determinerProgrammeParAgeSexe(25, "H"), "Tanora");
  });

  it("place les 26 à 60 ans dans Vehivavy ou Lehilahy selon le sexe", () => {
    assert.equal(determinerProgrammeParAgeSexe(26, "F"), "Vehivavy");
    assert.equal(determinerProgrammeParAgeSexe(26, "H"), "Lehilahy");
    assert.equal(determinerProgrammeParAgeSexe(60, "F"), "Vehivavy");
    assert.equal(determinerProgrammeParAgeSexe(60, "H"), "Lehilahy");
  });

  it("place les plus de 60 ans dans Zokiolona", () => {
    assert.equal(determinerProgrammeParAgeSexe(61, "F"), "Zokiolona");
    assert.equal(determinerProgrammeParAgeSexe(90, "H"), "Zokiolona");
  });
});

describe("Âge en années révolues", () => {
  const reference = new Date("2026-10-27T09:00:00Z");

  it("compte l'anniversaire du jour comme acquis", () => {
    assert.equal(ageEnAnnees(new Date("2000-10-27T00:00:00Z"), reference), 26);
  });

  it("n'ajoute pas l'année tant que l'anniversaire n'est pas passé", () => {
    assert.equal(ageEnAnnees(new Date("2000-10-28T00:00:00Z"), reference), 25);
  });

  it("gère les nouveau-nés", () => {
    assert.equal(ageEnAnnees(new Date("2026-10-25T00:00:00Z"), reference), 0);
  });
});
