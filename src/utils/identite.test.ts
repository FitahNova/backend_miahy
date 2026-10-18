import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { champNom, champPrenom, schemaDateNaissance } from "./identite.js";

const nom = champNom().min(1);
const prenom = champPrenom().min(1);

function regleRefusee(resultat: { success: boolean; error?: { issues: { code: string }[] } }) {
  assert.equal(resultat.success, false);
  return resultat.error!.issues.map((probleme) => probleme.code);
}

describe("Nom", () => {
  it("accepte les lettres, accents, tirets et apostrophes", () => {
    for (const valeur of ["Rakoto", "Rasoa-Nirina", "N'Diaye", "Ramanantsoa’be", "Hélène"]) {
      assert.equal(nom.parse(valeur), valeur);
    }
  });

  it("retire les espaces superflus", () => {
    assert.equal(nom.parse("  Rakoto   Be "), "Rakoto Be");
  });

  it("refuse les chiffres et les symboles avec la règle invalid_format", () => {
    for (const valeur of ["Rakoto3", "R@koto", "Rakoto_", "-Rakoto", "Rakoto-"]) {
      assert.deepEqual(regleRefusee(nom.safeParse(valeur)), ["invalid_format"], valeur);
    }
  });

  it("refuse un nom vide", () => {
    assert.deepEqual(regleRefusee(nom.safeParse("   ")), ["too_small"]);
  });
});

describe("Prénom", () => {
  it("met une majuscule au début de chaque mot", () => {
    assert.equal(prenom.parse("jean-pierre"), "Jean-Pierre");
    assert.equal(prenom.parse("marie  claire"), "Marie Claire");
    assert.equal(prenom.parse("éric"), "Éric");
  });

  it("garde le reste du mot tel quel", () => {
    assert.equal(prenom.parse("mcKenzie"), "McKenzie");
  });

  it("refuse les chiffres", () => {
    assert.deepEqual(regleRefusee(prenom.safeParse("Jean2")), ["invalid_format"]);
  });

  it("accepte un prénom vide quand il n'est pas obligatoire (comptes du personnel)", () => {
    assert.equal(champPrenom().parse(""), "");
  });
});

describe("Date de naissance", () => {
  it("accepte une date réelle et passée", () => {
    assert.deepEqual(schemaDateNaissance.parse("2024-02-29"), new Date("2024-02-29T00:00:00.000Z"));
    assert.deepEqual(schemaDateNaissance.parse("1800-01-01"), new Date("1800-01-01T00:00:00.000Z"));
  });

  it("refuse une date impossible ou mal écrite", () => {
    for (const valeur of ["2023-02-30", "2023-02-29", "2023-13-01", "01/02/2020", "abc"]) {
      assert.equal(schemaDateNaissance.safeParse(valeur).success, false, valeur);
    }
  });

  it("refuse une date future", () => {
    const demain = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    assert.equal(schemaDateNaissance.safeParse(demain).success, false);
  });

  it("refuse une date avant 1800", () => {
    assert.equal(schemaDateNaissance.safeParse("1799-12-31").success, false);
  });
});
