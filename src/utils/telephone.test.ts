import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normaliserTelephone } from "./telephone.js";

describe("Téléphone", () => {
  it("accepte le format local et le format +261", () => {
    for (const saisie of ["034 12 345 67", "0341234567", "+261 34 12 345 67", "261341234567", "034.12.345.67"]) {
      assert.equal(normaliserTelephone(saisie), "+261341234567", saisie);
    }
  });

  it("refuse les lettres", () => {
    assert.equal(normaliserTelephone("034 12 34A 67"), null);
    assert.equal(normaliserTelephone("abc"), null);
  });

  it("refuse un préfixe hors 032 à 038, ou une longueur incorrecte", () => {
    for (const saisie of ["0391234567", "0311234567", "034123456", "03412345678"]) {
      assert.equal(normaliserTelephone(saisie), null, saisie);
    }
  });
});
