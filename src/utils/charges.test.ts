import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { montantMensuel, totalMensuel } from "./charges.js";

describe("Charges fixes : montant mensuel", () => {
  it("ramène une charge au mois selon sa périodicité", () => {
    assert.equal(montantMensuel({ montant: 600_000, periodicite: "MENSUELLE" }), 600_000);
    assert.equal(montantMensuel({ montant: 300_000, periodicite: "TRIMESTRIELLE" }), 100_000);
    assert.equal(montantMensuel({ montant: 1_200_000, periodicite: "ANNUELLE" }), 100_000);
  });

  it("arrondit à l'Ariary et compte 0 pour une charge à fixer", () => {
    assert.equal(montantMensuel({ montant: 100_000, periodicite: "TRIMESTRIELLE" }), 33_333);
    assert.equal(montantMensuel({ montant: null, periodicite: "MENSUELLE" }), 0);
  });

  it("additionne les seules charges actives et compte celles à fixer", () => {
    const resultat = totalMensuel([
      { montant: 600_000, periodicite: "MENSUELLE", actif: true },
      { montant: 1_200_000, periodicite: "ANNUELLE", actif: true },
      { montant: 50_000, periodicite: "MENSUELLE", actif: false },
      { montant: null, periodicite: "MENSUELLE", actif: true },
    ]);
    assert.deepEqual(resultat, { total: 700_000, aFixer: 1 });
  });
});
