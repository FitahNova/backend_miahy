import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ErreurHttp } from "./errors.js";
import { ageEnAnnees, estMotifGrossesse, verifierMotifGrossesse } from "./motifs.js";

const VISITE = new Date("2026-10-16T09:00:00.000Z");

function patiente(dateNaissance: string) {
  return { sexe: "F" as const, dateNaissance: new Date(`${dateNaissance}T00:00:00.000Z`) };
}

function refusPour(raison: string) {
  return (erreur: unknown) =>
    erreur instanceof ErreurHttp &&
    erreur.statut === 422 &&
    erreur.code === "MOTIF_GROSSESSE_INCOMPATIBLE" &&
    erreur.details?.raison === raison;
}

describe("Motif grossesse", () => {
  it("reconnaît le mot sans tenir compte des majuscules ni des accents", () => {
    assert.equal(estMotifGrossesse("Suivi grossesse"), true);
    assert.equal(estMotifGrossesse("GROSSESSE"), true);
    assert.equal(estMotifGrossesse("Contrôle"), false);
  });

  it("refuse pour un patient de sexe masculin", () => {
    const homme = { sexe: "H" as const, dateNaissance: new Date("1990-01-01T00:00:00.000Z") };
    assert.throws(() => verifierMotifGrossesse("Suivi grossesse", homme, VISITE), refusPour("SEXE"));
  });

  it("refuse à 7 ans et moins, accepte à 8 ans", () => {
    assert.throws(() => verifierMotifGrossesse("Grossesse", patiente("2019-01-01"), VISITE), refusPour("AGE"));
    // 8 ans le lendemain de la visite : encore 7 ans le jour de la visite.
    assert.throws(() => verifierMotifGrossesse("Grossesse", patiente("2018-10-17"), VISITE), refusPour("AGE"));
    assert.doesNotThrow(() => verifierMotifGrossesse("Grossesse", patiente("2018-10-16"), VISITE));
  });

  it("refuse à 80 ans et plus, accepte à 79 ans", () => {
    assert.throws(() => verifierMotifGrossesse("Grossesse", patiente("1946-10-16"), VISITE), refusPour("AGE"));
    assert.doesNotThrow(() => verifierMotifGrossesse("Grossesse", patiente("1946-10-17"), VISITE));
  });

  it("ne contrôle pas les autres motifs", () => {
    const garcon = { sexe: "H" as const, dateNaissance: new Date("2022-05-01T00:00:00.000Z") };
    assert.doesNotThrow(() => verifierMotifGrossesse("Contrôle", garcon, VISITE));
    assert.doesNotThrow(() => verifierMotifGrossesse(undefined, garcon, VISITE));
  });

  it("calcule l'âge à l'heure de Madagascar", () => {
    // 21 h UTC le 15/10 = 0 h le 16/10 à Madagascar : l'anniversaire du 16/10 est atteint.
    assert.equal(ageEnAnnees(new Date("2000-10-16T00:00:00.000Z"), new Date("2026-10-15T21:00:00.000Z")), 26);
    assert.equal(ageEnAnnees(new Date("2000-10-16T00:00:00.000Z"), new Date("2026-10-15T20:59:00.000Z")), 25);
  });
});
