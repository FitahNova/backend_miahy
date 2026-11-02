import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { echapperHtml, gabaritCode, gabaritLien } from "./gabaritCourriel.js";

describe("Gabarit des courriels", () => {
  const lien = {
    titre: "Bienvenue sur MIAHY",
    nom: "Test",
    introduction: "Pour l'activer, choisissez votre mot de passe :",
    libelleBouton: "Activer mon compte",
    url: "https://exemple.test/mot-de-passe?jeton=abc&suite=1",
    dureeHeures: 24,
    urlLogo: "https://exemple.test/logo-miahy.jpeg",
  };

  it("échappe les caractères HTML", () => {
    assert.equal(echapperHtml(`<a href="x">L'é&t</a>`), "&lt;a href=&quot;x&quot;&gt;L&#39;é&amp;t&lt;/a&gt;");
  });

  it("n'ajoute jamais de HTML venu du nom", () => {
    const html = gabaritLien({ ...lien, nom: "<script>alert(1)</script>" });
    assert.equal(html.includes("<script>"), false);
    assert.equal(gabaritCode("<b>Test</b>", "123456", 10, lien.urlLogo).includes("<b>Test"), false);
  });

  it("met le lien dans le bouton et en clair, échappé", () => {
    const html = gabaritLien(lien);
    assert.equal(html.split('href="https://exemple.test/mot-de-passe?jeton=abc&amp;suite=1"').length - 1, 2);
    assert.ok(html.includes("Activer mon compte"));
    assert.ok(html.includes("24 heures"));
  });

  it("affiche le code et sa durée", () => {
    const html = gabaritCode("Test", "123456", 10, lien.urlLogo);
    assert.ok(html.includes("123456"));
    assert.ok(html.includes("10 minutes"));
  });

  it("garde le nom écrit à côté du logo, si la messagerie bloque l'image", () => {
    const html = gabaritLien(lien);
    assert.ok(html.includes('src="https://exemple.test/logo-miahy.jpeg"'));
    assert.ok(html.includes(">MIAHY</div>"));
  });
});
