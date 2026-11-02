import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compterProduitsDisponibles, memeLigneDeStock } from "./produits.js";

const ligne = (nom: string, stock: number, forme = "comprimé", categorieId = 1) => ({ nom, forme, categorieId, stock });

describe("Ligne de stock d'un arrivage", () => {
  const ligne = { datePeremption: new Date("2027-03-01T00:00:00.000Z"), prixAchat: 500 };

  it("rejoint la ligne de même date et de même prix d'achat", () => {
    assert.equal(memeLigneDeStock(ligne, "2027-03-01", 500), true);
    assert.equal(memeLigneDeStock({ datePeremption: null, prixAchat: 500 }, null, 500), true);
  });

  it("sépare une autre date ou un autre prix d'achat", () => {
    assert.equal(memeLigneDeStock(ligne, "2027-04-01", 500), false);
    assert.equal(memeLigneDeStock(ligne, "2027-03-01", 600), false);
    assert.equal(memeLigneDeStock(ligne, null, 500), false);
  });
});

describe("Médicaments : produits disponibles", () => {
  it("compte une seule fois un produit vendu à deux prix (deux lignes)", () => {
    assert.equal(compterProduitsDisponibles([ligne("Vitamine C", 10), ligne("vitamine  c", 5)]), 1);
  });

  it("ne compte pas les lignes sans stock", () => {
    assert.equal(compterProduitsDisponibles([ligne("Vitamine C", 0), ligne("Paracétamol", 3)]), 1);
  });

  it("sépare les formes et les catégories différentes", () => {
    assert.equal(compterProduitsDisponibles([ligne("Vitamine C", 2), ligne("Vitamine C", 2, "sirop"), ligne("Vitamine C", 2, "comprimé", 2)]), 3);
  });
});
