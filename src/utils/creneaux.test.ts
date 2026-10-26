import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memeCreneau, premierCreneauLibre } from "./creneaux.js";

const heure = (texte: string) => new Date(`2026-11-02T${texte}:00+03:00`);

describe("Rendez-vous : un patient, un seul rendez-vous par créneau", () => {
  it("considère le même créneau à moins de 30 minutes d'écart", () => {
    assert.equal(memeCreneau(heure("09:00"), heure("09:00")), true);
    assert.equal(memeCreneau(heure("09:00"), heure("09:20")), true);
    assert.equal(memeCreneau(heure("09:00"), heure("09:30")), false);
  });

  it("décale une revue au premier créneau libre", () => {
    assert.deepEqual(premierCreneauLibre(heure("09:00"), [heure("09:00"), heure("09:30")]), heure("10:00"));
    assert.deepEqual(premierCreneauLibre(heure("09:00"), [heure("11:00")]), heure("09:00"));
  });
});
