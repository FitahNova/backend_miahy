import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
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
    const [iv, tag] = valeur.split(".");
    const modifiee = [iv, tag, Buffer.from("xxxxxx").toString("base64")].join(".");
    assert.notEqual(modifiee, valeur);
    assert.throws(() => dechiffrer(modifiee, CLE));
  });

  it("refuse une clé qui ne fait pas 32 octets", () => {
    assert.throws(() => chiffrer("secret", randomBytes(16).toString("base64")));
  });

  it("refuse un tag d'authentification tronqué", () => {
    const [iv, tag, donnees] = chiffrer("secret", CLE).split(".");
    const tronque = [iv, Buffer.from(tag, "base64").subarray(0, 4).toString("base64"), donnees].join(".");
    assert.throws(() => dechiffrer(tronque, CLE), /Valeur chiffrée invalide/);
  });

  it("refuse un format invalide", () => {
    assert.throws(() => dechiffrer("abc", CLE), /Valeur chiffrée invalide/);
    const [, tag, donnees] = chiffrer("secret", CLE).split(".");
    const ivCourt = [Buffer.alloc(8).toString("base64"), tag, donnees].join(".");
    assert.throws(() => dechiffrer(ivCourt, CLE), /Valeur chiffrée invalide/);
  });

  it("relit une valeur produite avant le correctif (tag de 16 octets par défaut)", () => {
    const cle = randomBytes(32);
    const iv = randomBytes(12);
    const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
    const donnees = Buffer.concat([chiffreur.update("ancienne valeur", "utf8"), chiffreur.final()]);
    const ancienne = [iv, chiffreur.getAuthTag(), donnees].map((partie) => partie.toString("base64")).join(".");
    assert.equal(dechiffrer(ancienne, cle.toString("base64")), "ancienne valeur");
  });
});