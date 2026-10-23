import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estPerime, observationInventaire } from "./peremption.js";

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
