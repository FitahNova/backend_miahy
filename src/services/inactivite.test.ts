import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activiteAEnregistrer,
  dureeInactiviteValide,
  sessionInactive,
} from "./inactivite.js";

const MAINTENANT = new Date("2026-10-23T09:00:00.000Z");

describe("Inactivité", () => {
  it("accepte une durée entre 1 et 240 minutes", () => {
    assert.equal(dureeInactiviteValide(1), true);
    assert.equal(dureeInactiviteValide(15), true);
    assert.equal(dureeInactiviteValide(240), true);
    assert.equal(dureeInactiviteValide(0), false);
    assert.equal(dureeInactiviteValide(241), false);
    assert.equal(dureeInactiviteValide(1.5), false);
  });

  it("ferme la session à l'échéance et pas avant", () => {
    const ilYA14Min = new Date(MAINTENANT.getTime() - 14 * 60_000);
    const ilYA15Min = new Date(MAINTENANT.getTime() - 15 * 60_000);
    assert.equal(sessionInactive(ilYA14Min, 15, MAINTENANT), false);
    assert.equal(sessionInactive(ilYA15Min, 15, MAINTENANT), true);
  });

  it("n'enregistre pas un geste trop rapproché du précédent", () => {
    const ilYA10s = new Date(MAINTENANT.getTime() - 10_000);
    const ilYA15s = new Date(MAINTENANT.getTime() - 15_000);
    assert.equal(activiteAEnregistrer(ilYA10s, MAINTENANT), false);
    assert.equal(activiteAEnregistrer(ilYA15s, MAINTENANT), true);
  });
});
