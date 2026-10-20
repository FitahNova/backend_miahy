import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chiffrer, dechiffrer } from "./chiffrement.js";

const CLE = randomBytes(32).toString("base64");

describe("Chiffrement des clés TOTP", () => {
  it("retrouve le texte d'origine, sans le laisser en clair", () => {
    const valeur = chiffrer("JBSWY3DPEHPK3PXP", CLE);
    assert.equal(valeur.includes("JBSWY3DPEHPK3PXP"), false);
    assert.equal(dechiffrer(valeur, CLE), "JBSWY3DPEHPK3PXP");
  });

  it("donne un résultat différent à chaque fois", () => {
    assert.notEqual(chiffrer("même texte", CLE), chiffrer("même texte", CLE));
  });

  it("refuse une autre clé ou une valeur modifiée", () => {
    const valeur = chiffrer("secret", CLE);
    assert.throws(() => dechiffrer(valeur, randomBytes(32).toString("base64")));
    const [iv, tag, donnees] = valeur.split(".");
    const modifiee = [iv, tag, Buffer.from("xxxxxx").toString("base64")].join(".");
    assert.notEqual(modifiee, valeur);
    assert.throws(() => dechiffrer(modifiee, CLE));
  });

  it("refuse une clé qui ne fait pas 32 octets", () => {
    assert.throws(() => chiffrer("secret", randomBytes(16).toString("base64")));
  });
});
