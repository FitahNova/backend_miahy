import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { regrouperDemandes, type LignePrescrite, type MedicamentDuCentre } from "./demandes.js";

const medicament = (id: number, nom: string, stock: number, perime = false): MedicamentDuCentre => ({
  id,
  nom,
  forme: "comprimé",
  categorieId: 1,
  stock,
  perime,
});
const duStock = (medicamentId: number, patientId: number): LignePrescrite => ({ medicamentId, libelle: null, forme: null, patientId });
const horsStock = (libelle: string, patientId: number, forme: string | null = null): LignePrescrite => ({ medicamentId: null, libelle, forme, patientId });

describe("Médicaments demandés : produit du centre en rupture", () => {
  it("signale un produit sans stock prescrit à 3 patients différents", () => {
    const demandes = regrouperDemandes([duStock(1, 10), duStock(1, 11), duStock(1, 12)], [medicament(1, "Paracétamol 500", 0)]);
    assert.equal(demandes.length, 1);
    assert.deepEqual({ type: demandes[0].type, medicamentId: demandes[0].medicamentId, patients: demandes[0].patients }, { type: "RUPTURE", medicamentId: 1, patients: 3 });
  });

  it("compte un patient une seule fois, même avec plusieurs ordonnances", () => {
    const demandes = regrouperDemandes([duStock(1, 10), duStock(1, 10), duStock(1, 11)], [medicament(1, "Paracétamol 500", 0)]);
    assert.equal(demandes.length, 0);
  });

  it("ne signale rien tant qu'une ligne de prix du produit a du stock", () => {
    const lignes = [duStock(1, 10), duStock(1, 11), duStock(2, 12)];
    assert.equal(regrouperDemandes(lignes, [medicament(1, "Paracétamol 500", 0), medicament(2, "paracétamol  500", 4)]).length, 0);
  });

  it("réunit les lignes de prix d'un produit et propose une ligne non périmée", () => {
    const lignes = [duStock(1, 10), duStock(2, 11), duStock(2, 12)];
    const demandes = regrouperDemandes(lignes, [medicament(1, "Paracétamol 500", 0), medicament(2, "Paracétamol 500", 0), medicament(3, "Paracétamol 500", 9, true)]);
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].patients, 3);
    assert.equal(demandes[0].medicamentId, 2);
  });
});

describe("Médicaments demandés : absent du centre", () => {
  it("regroupe le nom saisi sans tenir compte des majuscules ni des accents", () => {
    const lignes = [horsStock("Amoxicilline", 10, "gélule"), horsStock("amoxicilline ", 11, "gélule"), horsStock("AMOXICILLINE", 12)];
    const demandes = regrouperDemandes(lignes, []);
    assert.equal(demandes.length, 1);
    assert.deepEqual({ type: demandes[0].type, forme: demandes[0].forme, patients: demandes[0].patients }, { type: "HORS_CENTRE", forme: "gélule", patients: 3 });
  });

  it("compte pour le produit du centre en rupture quand il est prescrit hors stock sous son nom", () => {
    const lignes = [horsStock("paracetamol 500", 10), horsStock("Paracétamol 500", 11), duStock(1, 12)];
    const demandes = regrouperDemandes(lignes, [medicament(1, "Paracétamol 500", 0)]);
    assert.equal(demandes.length, 1);
    assert.deepEqual({ type: demandes[0].type, patients: demandes[0].patients }, { type: "RUPTURE", patients: 3 });
  });

  it("ne le signale plus une fois ajouté à la liste du centre et en stock", () => {
    const lignes = [horsStock("Amoxicilline", 10), horsStock("Amoxicilline", 11), horsStock("Amoxicilline", 12)];
    assert.equal(regrouperDemandes(lignes, [medicament(5, "Amoxicilline", 20)]).length, 0);
  });

  it("attend 3 patients différents", () => {
    assert.equal(regrouperDemandes([horsStock("Amoxicilline", 10), horsStock("Amoxicilline", 11)], []).length, 0);
  });
});
