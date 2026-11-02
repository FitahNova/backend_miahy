import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compterAlertesStock, estPerime, observationInventaire } from "./peremption.js";

describe("Péremption des médicaments", () => {
  const jour = (texte: string) => new Date(`${texte}T00:00:00.000Z`);

  it("n'est jamais périmé sans date", () => {
    assert.equal(estPerime(null, "2026-10-23"), false);
  });

  it("est périmé le jour même et après", () => {
    assert.equal(estPerime(jour("2026-10-23"), "2026-10-23"), true);
    assert.equal(estPerime(jour("2026-10-01"), "2026-10-23"), true);
  });

  it("reste utilisable avant la date", () => {
    assert.equal(estPerime(jour("2026-10-24"), "2026-10-23"), false);
  });
});

describe("Alertes de stock de la cloche", () => {
  const jour = (texte: string) => new Date(`${texte}T00:00:00.000Z`);
  const AUJOURDHUI = "2026-10-23";
  const produit = (stock: number, seuilAlerte: number, datePeremption: Date | null = null, prixVente = 100) => ({ stock, seuilAlerte, datePeremption, prixVente });

  it("ne compte jamais un périmé, avec ou sans stock", () => {
    assert.deepEqual(compterAlertesStock([produit(3, 5, jour("2026-10-01"))], AUJOURDHUI), { proches: 0, ruptures: 0, sousSeuil: 0, sansPrix: 0 });
    assert.deepEqual(compterAlertesStock([produit(0, 5, jour("2026-10-01"))], AUJOURDHUI), { proches: 0, ruptures: 0, sousSeuil: 0, sansPrix: 0 });
  });

  it("sépare la rupture du sous le seuil, seuil compris", () => {
    assert.deepEqual(compterAlertesStock([produit(0, 5), produit(5, 5), produit(6, 5)], AUJOURDHUI), { proches: 0, ruptures: 1, sousSeuil: 1, sansPrix: 0 });
  });

  it("compte un produit proche de péremption et sous le seuil dans les deux alertes", () => {
    assert.deepEqual(compterAlertesStock([produit(2, 5, jour("2026-12-01"))], AUJOURDHUI), { proches: 1, ruptures: 0, sousSeuil: 1, sansPrix: 0 });
  });

  it("signale un produit en stock dont le prix de vente est à fixer, pas s'il est vide ou périmé", () => {
    assert.equal(compterAlertesStock([produit(10, 5, null, 0)], AUJOURDHUI).sansPrix, 1);
    assert.equal(compterAlertesStock([produit(0, 5, null, 0)], AUJOURDHUI).sansPrix, 0);
    assert.equal(compterAlertesStock([produit(10, 5, jour("2026-10-01"), 0)], AUJOURDHUI).sansPrix, 0);
  });

  it("ne compte pas comme proche un produit sans stock", () => {
    assert.deepEqual(compterAlertesStock([produit(0, 5, jour("2026-12-01"))], AUJOURDHUI), { proches: 0, ruptures: 1, sousSeuil: 0, sansPrix: 0 });
  });
});

describe("Fiche d'inventaire : observation", () => {
  const jour = (texte: string) => new Date(`${texte}T00:00:00.000Z`);
  const AUJOURDHUI = "2026-10-23";
  const produit = (stock: number, seuilAlerte: number, datePeremption: Date | null = null) => ({ stock, seuilAlerte, datePeremption });

  it("met « Périmé » avant tout le reste, même en rupture", () => {
    assert.equal(observationInventaire(produit(0, 5, jour("2026-10-01")), AUJOURDHUI), "Périmé");
  });

  it("met « Rupture » quand le stock est nul", () => {
    assert.equal(observationInventaire(produit(0, 5, jour("2026-12-01")), AUJOURDHUI), "Rupture");
  });

  it("met « Proche de péremption » dans les 90 jours, pas au-delà", () => {
    assert.equal(observationInventaire(produit(50, 5, jour("2027-01-21")), AUJOURDHUI), "Proche de péremption");
    assert.equal(observationInventaire(produit(50, 5, jour("2027-01-22")), AUJOURDHUI), "Stock conforme");
  });

  it("met « Stock insuffisant » au seuil d'alerte ou dessous, sinon « Stock conforme »", () => {
    assert.equal(observationInventaire(produit(5, 5), AUJOURDHUI), "Stock insuffisant");
    assert.equal(observationInventaire(produit(6, 5), AUJOURDHUI), "Stock conforme");
  });
});
