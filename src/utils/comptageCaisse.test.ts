import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErreurHttp } from "./errors.js";
import {
  attenduDuTiroir,
  COUPURES,
  ecartDeCaisse,
  totalDuComptage,
  verifierCoupures,
  type Coupure,
} from "./comptageCaisse.js";

const vide = COUPURES.map((valeur) => ({ valeur, quantite: 0 }));

describe("Comptage de caisse", () => {
  it("accepte les sept coupures et ignore l'ordre", () => {
    assert.doesNotThrow(() => verifierCoupures([...vide].reverse()));
  });

  it("refuse une coupure inconnue ou un doublon", () => {
    const inconnue: Coupure[] = vide.map((coupure) => ({ valeur: coupure.valeur, quantite: coupure.quantite }));
    inconnue[0] = { valeur: 50_000, quantite: 0 };
    const doublon: Coupure[] = vide.map((coupure, index) =>
      index === vide.length - 1 ? { valeur: 10_000, quantite: 1 } : { valeur: coupure.valeur, quantite: coupure.quantite },
    );
    assert.throws(() => verifierCoupures(inconnue), (erreur: unknown) => erreur instanceof ErreurHttp);
    assert.throws(() => verifierCoupures(doublon), (erreur: unknown) => erreur instanceof ErreurHttp);
  });

  it("calcule le tiroir : fond + espèces, puis l'écart avec le compté", () => {
    const compte = totalDuComptage([
      { valeur: 20_000, quantite: 0 },
      { valeur: 10_000, quantite: 3 },
      { valeur: 5_000, quantite: 1 },
      { valeur: 2_000, quantite: 0 },
      { valeur: 1_000, quantite: 0 },
      { valeur: 500, quantite: 0 },
      { valeur: 200, quantite: 0 },
      { valeur: 100, quantite: 0 },
    ]);
    assert.equal(compte, 35_000);
    assert.equal(attenduDuTiroir(5_000, 35_000), 40_000);
    assert.equal(ecartDeCaisse(compte, 40_000), -5_000);
  });
});
