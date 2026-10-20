import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleLisible, codeTotpA, genererCleTotp, lienTotp, verifierCodeTotp } from "./totp.js";

const CLE = genererCleTotp();
const MAINTENANT = Date.UTC(2026, 9, 19, 6, 0, 15);
const PAS = Math.floor(MAINTENANT / 1000 / 30);

describe("TOTP", () => {
  it("génère une clé base32 de 32 caractères, affichée par groupes de 4", () => {
    assert.match(CLE, /^[A-Z2-7]{32}$/);
    assert.equal(cleLisible("JBSWY3DPEHPK3PXP"), "JBSW Y3DP EHPK 3PXP");
  });

  it("accepte le code du moment et renvoie son pas", () => {
    assert.equal(verifierCodeTotp(codeTotpA(CLE, MAINTENANT), CLE, null, MAINTENANT), PAS);
  });

  it("tolère un décalage de 30 s, pas de 90 s", () => {
    assert.equal(verifierCodeTotp(codeTotpA(CLE, MAINTENANT - 30_000), CLE, null, MAINTENANT), PAS - 1);
    assert.equal(verifierCodeTotp(codeTotpA(CLE, MAINTENANT + 30_000), CLE, null, MAINTENANT), PAS + 1);
    assert.equal(verifierCodeTotp(codeTotpA(CLE, MAINTENANT - 90_000), CLE, null, MAINTENANT), null);
  });

  it("refuse un code faux ou celui d'une autre clé", () => {
    const faux = codeTotpA(CLE, MAINTENANT) === "000000" ? "111111" : "000000";
    assert.equal(verifierCodeTotp(faux, CLE, null, MAINTENANT), null);
    assert.equal(verifierCodeTotp(codeTotpA(genererCleTotp(), MAINTENANT), CLE, null, MAINTENANT), null);
  });

  it("refuse un code déjà utilisé (anti-rejeu)", () => {
    const code = codeTotpA(CLE, MAINTENANT);
    assert.equal(verifierCodeTotp(code, CLE, PAS, MAINTENANT), null);
    assert.equal(verifierCodeTotp(code, CLE, PAS - 1, MAINTENANT), PAS);
  });

  it("produit un lien otpauth standard pour l'application", () => {
    const lien = new URL(lienTotp("direction@miahy.mg", CLE));
    assert.equal(lien.protocol, "otpauth:");
    assert.equal(lien.host, "totp");
    assert.equal(decodeURIComponent(lien.pathname), "/MIAHY:direction@miahy.mg");
    assert.equal(lien.searchParams.get("secret"), CLE);
    assert.equal(lien.searchParams.get("issuer"), "MIAHY");
    assert.equal(lien.searchParams.get("digits"), "6");
  });
});
