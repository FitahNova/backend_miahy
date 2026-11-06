import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculerTarif, estHorsPlage, heureDuCentre, PARAMETRES_TARIF_DEFAUT } from "./tarification.js";

// Instant à une heure du centre donnée (Madagascar = UTC+3, sans heure d'été).
const aLHeure = (heure: string) => new Date(`2026-11-06T${heure}:00+03:00`);
const P = PARAMETRES_TARIF_DEFAUT; // soir +30 % dès 18:00, ouverture 07:30, étranger +25 %

describe("Tarification : les quatre cas (service à 10 000 Ar)", () => {
  it("Malagasy, journée : 10 000 Ar", () => {
    assert.equal(calculerTarif(10_000, { nationalite: "MALAGASY", date: aLHeure("10:00") }, P).prix, 10_000);
  });
  it("Malagasy, soir : 13 000 Ar", () => {
    assert.equal(calculerTarif(10_000, { nationalite: "MALAGASY", date: aLHeure("19:00") }, P).prix, 13_000);
  });
  it("Étranger, journée : 12 500 Ar", () => {
    assert.equal(calculerTarif(10_000, { nationalite: "ETRANGER", date: aLHeure("10:00") }, P).prix, 12_500);
  });
  it("Étranger, soir : 16 250 Ar (les majorations se multiplient)", () => {
    const detail = calculerTarif(10_000, { nationalite: "ETRANGER", date: aLHeure("19:00") }, P);
    assert.deepEqual(detail, { prixBase: 10_000, nationalite: "ETRANGER", tauxEtranger: 25, tauxSoir: 30, prix: 16_250 });
  });
  it("soir passé à 45 % : 14 500 Ar et 18 125 Ar, sans toucher au tarif du service", () => {
    const p45 = { ...P, majorationSoirPourcent: 45 };
    const prix = (nationalite: "MALAGASY" | "ETRANGER", heure: string) =>
      calculerTarif(10_000, { nationalite, date: aLHeure(heure) }, p45).prix;
    assert.equal(prix("MALAGASY", "19:00"), 14_500);
    assert.equal(prix("ETRANGER", "19:00"), 18_125);
    assert.equal(prix("MALAGASY", "10:00"), 10_000);
    assert.equal(prix("ETRANGER", "10:00"), 12_500);
  });
  it("patient enregistré avant (nationalité vide) : tarif Malagasy", () => {
    assert.equal(calculerTarif(10_000, { nationalite: null, date: aLHeure("10:00") }, P).prix, 10_000);
  });
  it("arrondit à l'Ariary entier", () => {
    // 3 333 × 1,25 × 1,30 = 5 416,125 → 5 416
    assert.equal(calculerTarif(3_333, { nationalite: "ETRANGER", date: aLHeure("19:00") }, P).prix, 5_416);
  });
});

describe("Tarification : limites de la plage normale", () => {
  it("07:29 est hors plage, 07:30 est en journée", () => {
    assert.equal(estHorsPlage("07:29", P), true);
    assert.equal(estHorsPlage("07:30", P), false);
  });
  it("17:59 est en journée, 18:00 est le soir", () => {
    assert.equal(estHorsPlage("17:59", P), false);
    assert.equal(estHorsPlage("18:00", P), true);
  });
  it("heure du soir réglée à 17:30 : 17:29 en journée, 17:30 le soir", () => {
    const parametres = { ...P, heureDebutSoir: "17:30" };
    assert.equal(estHorsPlage("17:29", parametres), false);
    assert.equal(estHorsPlage("17:30", parametres), true);
  });
  it("minuit et la nuit sont hors plage", () => {
    assert.equal(estHorsPlage("00:00", P), true);
    assert.equal(estHorsPlage("23:59", P), true);
  });
  it("lit l'heure au fuseau de Madagascar", () => {
    assert.equal(heureDuCentre(new Date("2026-11-06T15:00:00Z")), "18:00");
    assert.equal(heureDuCentre(aLHeure("07:29")), "07:29");
    // De bout en bout : un acte facturé à 07:29 est majoré, à 07:30 il ne l'est pas.
    assert.equal(calculerTarif(10_000, { nationalite: "MALAGASY", date: aLHeure("07:29") }, P).prix, 13_000);
    assert.equal(calculerTarif(10_000, { nationalite: "MALAGASY", date: aLHeure("07:30") }, P).prix, 10_000);
  });
});
