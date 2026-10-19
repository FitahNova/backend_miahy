import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ageLisible,
  champNom,
  champPrenom,
  naissanceDepuisAge,
  naissanceDepuisSaisie,
  schemaDateNaissance,
  schemaSaisieNaissance,
} from "./identite.js";

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

describe("Âge saisi à la place de la date de naissance", () => {
  const creation = schemaSaisieNaissance(true);
  const modification = schemaSaisieNaissance(false);
  // 19/10/2026 à 9 h, heure de Madagascar.
  const AUJOURDHUI = new Date("2026-10-19T06:00:00.000Z");
  const date = (texte: string) => new Date(`${texte}T00:00:00.000Z`);

  it("accepte 1 à 130 ans", () => {
    assert.equal(creation.safeParse({ age: 1 }).success, true);
    assert.equal(creation.safeParse({ age: 130, uniteAge: "ans" }).success, true);
  });

  it("refuse 0, un âge négatif, plus de 130 ans et un âge décimal", () => {
    for (const age of [0, -3, 131, 2.5]) {
      assert.equal(creation.safeParse({ age }).success, false, String(age));
    }
  });

  it("accepte 1 à 23 mois pour un bébé", () => {
    assert.equal(creation.safeParse({ age: 1, uniteAge: "mois" }).success, true);
    assert.equal(creation.safeParse({ age: 23, uniteAge: "mois" }).success, true);
  });

  it("refuse 0 mois (nouveau-né : date de naissance) et 24 mois ou plus (saisir en ans)", () => {
    assert.equal(creation.safeParse({ age: 0, uniteAge: "mois" }).success, false);
    assert.equal(creation.safeParse({ age: 24, uniteAge: "mois" }).success, false);
  });

  it("exige la date ou l'âge à la création, jamais les deux", () => {
    assert.equal(creation.safeParse({}).success, false);
    assert.equal(creation.safeParse({ dateNaissance: "2026-10-01" }).success, true);
    assert.equal(creation.safeParse({ dateNaissance: "2000-01-01", age: 26 }).success, false);
    assert.equal(creation.safeParse({ uniteAge: "mois" }).success, false);
  });

  it("n'exige rien en modification", () => {
    assert.equal(modification.safeParse({}).success, true);
  });

  it("calcule la date : même jour, N ans ou N mois plus tôt", () => {
    assert.deepEqual(naissanceDepuisAge(42, "ans", AUJOURDHUI), date("1984-10-19"));
    assert.deepEqual(naissanceDepuisAge(6, "mois", AUJOURDHUI), date("2026-04-19"));
    assert.deepEqual(naissanceDepuisAge(10, "mois", AUJOURDHUI), date("2025-12-19"));
    // 31 mars - 1 mois : dernier jour de février.
    assert.deepEqual(naissanceDepuisAge(1, "mois", new Date("2026-03-31T06:00:00.000Z")), date("2026-02-28"));
  });

  it("garde la date saisie quand il n'y a pas d'âge", () => {
    assert.deepEqual(naissanceDepuisSaisie({ dateNaissance: date("2026-03-15") }, AUJOURDHUI), date("2026-03-15"));
    assert.equal(naissanceDepuisSaisie({}, AUJOURDHUI), undefined);
  });

  it("affiche l'âge en mois avant 2 ans, en ans ensuite", () => {
    assert.equal(ageLisible(date("2026-10-05"), AUJOURDHUI), "moins d'un mois");
    assert.equal(ageLisible(date("2026-03-15"), AUJOURDHUI), "7 mois");
    assert.equal(ageLisible(naissanceDepuisAge(1, "ans", AUJOURDHUI), AUJOURDHUI), "12 mois");
    assert.equal(ageLisible(date("2024-11-01"), AUJOURDHUI), "23 mois");
    assert.equal(ageLisible(date("2024-10-19"), AUJOURDHUI), "2 ans");
    assert.equal(ageLisible(naissanceDepuisAge(42, "ans", AUJOURDHUI), AUJOURDHUI), "42 ans");
  });
});
