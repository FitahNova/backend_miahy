import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compterProduitsDisponibles, contenuSelonForme, estQuantiteEcrite, memeLigneDeStock, uniteDeVente, unitesADelivrer } from "./produits.js";

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

describe("Délivrance par plaquette", () => {
  it("arrondit au nombre de plaquettes supérieur", () => {
    assert.equal(unitesADelivrer(15, 10), 2);
    assert.equal(unitesADelivrer(10, 10), 1);
    assert.equal(unitesADelivrer(8, 10), 1);
    assert.equal(unitesADelivrer(15, 2), 8);
  });

  it("garde la quantité telle quelle avec un contenu de 1", () => {
    assert.equal(unitesADelivrer(21, 1), 21);
  });

  it("retient le contenu des formes à contenu, 1 pour les autres", () => {
    assert.equal(contenuSelonForme("comprimé", 14), 14);
    assert.equal(contenuSelonForme("gélule", 10), 10);
    assert.equal(contenuSelonForme("suppositoire", 10), 10);
    assert.equal(contenuSelonForme("sirop", 100), 100);
    assert.equal(contenuSelonForme("pommade", 30), 1);
    assert.equal(contenuSelonForme("comprimé", null), 1);
    assert.equal(contenuSelonForme("comprimé", 0), 1);
  });

  it("compte les flacons de sirop en ml", () => {
    assert.equal(unitesADelivrer(75, 100), 1);
    assert.equal(unitesADelivrer(150, 100), 2);
    assert.equal(unitesADelivrer(70, 60), 2);
  });

  it("fait écrire la quantité pour pommade, injectable et collyre", () => {
    assert.equal(estQuantiteEcrite("pommade"), true);
    assert.equal(estQuantiteEcrite("injectable"), true);
    assert.equal(estQuantiteEcrite("collyre"), true);
    assert.equal(estQuantiteEcrite("sirop"), false);
  });
});

describe("uniteDeVente", () => {
  it("garde la même unité entre comprimé et gélule, pas entre comprimé et pommade", () => {
    assert.equal(uniteDeVente("comprimé", 10), uniteDeVente("gélule", 10));
    assert.notEqual(uniteDeVente("comprimé", 10), uniteDeVente("pommade"));
    assert.equal(uniteDeVente("sirop", 100), uniteDeVente("collyre"));
  });

  it("vend le sachet à l'unité, ou par boîte quand le contenu dépasse 1", () => {
    assert.equal(uniteDeVente("sachet", 1), "sachet");
    assert.equal(uniteDeVente("sachet", 20), "boîte");
  });
});
