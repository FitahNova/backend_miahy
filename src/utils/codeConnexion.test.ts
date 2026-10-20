import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { codeCorrespond, genererCode, hacherCode, normaliserCode } from "./codeConnexion.js";

const SECRET = "secret-de-test-assez-long";
const DEFI = "a".repeat(64);

describe("Code de connexion", () => {
  it("génère toujours 6 chiffres", () => {
    for (let i = 0; i < 200; i++) assert.match(genererCode(), /^\d{6}$/);
  });

  it("accepte « 123 456 » ou « 123-456 », refuse le reste", () => {
    assert.equal(normaliserCode(" 123 456 "), "123456");
    assert.equal(normaliserCode("123-456"), "123456");
    for (const saisie of ["12345", "1234567", "abcdef", "12a456", ""]) {
      assert.equal(normaliserCode(saisie), null, saisie);
    }
  });

  it("ne stocke jamais le code en clair, et l'empreinte dépend du défi", () => {
    const empreinte = hacherCode("042517", DEFI, SECRET);
    assert.equal(empreinte.includes("042517"), false);
    assert.notEqual(empreinte, hacherCode("042517", "b".repeat(64), SECRET));
  });

  it("reconnaît le bon code et refuse un autre", () => {
    const empreinte = hacherCode("042517", DEFI, SECRET);
    assert.equal(codeCorrespond("042517", DEFI, SECRET, empreinte), true);
    assert.equal(codeCorrespond("042518", DEFI, SECRET, empreinte), false);
    assert.equal(codeCorrespond("042517", "b".repeat(64), SECRET, empreinte), false);
    assert.equal(codeCorrespond("042517", DEFI, "autre-secret-assez-long", empreinte), false);
  });
});
