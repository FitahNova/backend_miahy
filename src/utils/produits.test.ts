import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compterProduitsDisponibles } from "./produits.js";

const ligne = (nom: string, stock: number, forme = "comprimé", categorieId = 1) => ({ nom, forme, categorieId, stock });

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
