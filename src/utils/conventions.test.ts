import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conventionApplicable, montantCouvert, partPartenaire, type Convention, type LigneCouvrable } from "./conventions.js";

const CONSULTATION = 1;
const ANKIZY = 1;
const TANORA = 2;

const ecole: Convention = {
  tauxPriseEnCharge: 100,
  serviceCouvertId: CONSULTATION,
  couvreMedicaments: false,
  actif: true,
  debut: new Date("2026-01-01T00:00:00.000Z"),
  fin: new Date("2026-12-31T00:00:00.000Z"),
  programmeIds: [ANKIZY],
};

const lignes: LigneCouvrable[] = [
  { type: "ACTE", serviceId: CONSULTATION, quantite: 1, prixUnitaire: 15_000 },
  { type: "MEDICAMENT", serviceId: null, quantite: 12, prixUnitaire: 100 },
];

const facture = { jour: "2026-10-20", programmeId: ANKIZY };

describe("Conventions : objet couvert", () => {
  it("couvre seulement le service de la convention", () => {
    assert.equal(montantCouvert(ecole, lignes), 15_000);
  });

  it("couvre tous les médicaments quand la convention porte sur les médicaments", () => {
    assert.equal(montantCouvert({ ...ecole, serviceCouvertId: null, couvreMedicaments: true }, lignes), 1_200);
  });
});

describe("Conventions : conditions d'application (R084)", () => {
  it("s'applique quand tout est réuni", () => {
    assert.equal(conventionApplicable(ecole, facture, lignes), true);
  });

  it("ne s'applique pas à un partenaire suspendu ou à un taux nul", () => {
    assert.equal(conventionApplicable({ ...ecole, actif: false }, facture, lignes), false);
    assert.equal(conventionApplicable({ ...ecole, tauxPriseEnCharge: 0 }, facture, lignes), false);
  });

  it("respecte la période de validité, bornes comprises", () => {
    assert.equal(conventionApplicable(ecole, { ...facture, jour: "2026-12-31" }, lignes), true);
    assert.equal(conventionApplicable(ecole, { ...facture, jour: "2027-01-01" }, lignes), false);
    assert.equal(conventionApplicable({ ...ecole, fin: null }, { ...facture, jour: "2030-05-01" }, lignes), true);
  });

  it("exige un patient d'un programme couvert", () => {
    assert.equal(conventionApplicable(ecole, { ...facture, programmeId: TANORA }, lignes), false);
    assert.equal(conventionApplicable(ecole, { ...facture, programmeId: null }, lignes), false);
  });

  it("ne s'applique pas sans ligne couverte", () => {
    assert.equal(conventionApplicable(ecole, facture, [lignes[1]]), false);
  });
});

describe("Conventions : part partenaire (R085, sans arrondi)", () => {
  it("garde les centimes dans la part exacte", () => {
    assert.deepEqual(partPartenaire(1_234, 33), { exacte: "407.22", entiere: 407 });
    assert.deepEqual(partPartenaire(15_000, 33), { exacte: "4950.00", entiere: 4_950 });
    assert.deepEqual(partPartenaire(1_201, 50), { exacte: "600.50", entiere: 600 });
  });

  it("prend tout à 100 % et rien à 0 %", () => {
    assert.deepEqual(partPartenaire(15_000, 100), { exacte: "15000.00", entiere: 15_000 });
    assert.deepEqual(partPartenaire(15_000, 0), { exacte: "0.00", entiere: 0 });
  });
});
