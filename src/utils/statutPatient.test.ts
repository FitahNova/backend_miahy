import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { activiteSuivante, statutPatient } from "./statutPatient.js";

const MAINTENANT = new Date("2026-11-12T10:00:00.000Z");
const REPERE = new Date("2026-11-12T08:00:00.000Z"); // connexion de la Direction ce matin

describe("Statut des patients (Direction)", () => {
  it("Nouveau : dossier créé après le repère, quel que soit le nombre de venues", () => {
    assert.equal(statutPatient({ creeLe: new Date("2026-11-12T09:30:00Z"), venues: 1, derniereVenue: MAINTENANT }, REPERE, MAINTENANT), "NOUVEAU");
  });
  it("Fidèle : plus de 10 venues (10 ne suffit pas)", () => {
    const ancien = new Date("2025-01-01T00:00:00Z");
    assert.equal(statutPatient({ creeLe: ancien, venues: 11, derniereVenue: MAINTENANT }, REPERE, MAINTENANT), "FIDELE");
    assert.equal(statutPatient({ creeLe: ancien, venues: 10, derniereVenue: MAINTENANT }, REPERE, MAINTENANT), null);
  });
  it("À relancer : une seule venue il y a plus de 6 mois ; récente ou plusieurs venues : non", () => {
    const ancien = new Date("2025-01-01T00:00:00Z");
    assert.equal(statutPatient({ creeLe: ancien, venues: 1, derniereVenue: new Date("2026-04-01T00:00:00Z") }, REPERE, MAINTENANT), "A_RELANCER");
    assert.equal(statutPatient({ creeLe: ancien, venues: 1, derniereVenue: new Date("2026-10-01T00:00:00Z") }, REPERE, MAINTENANT), null);
    assert.equal(statutPatient({ creeLe: ancien, venues: 2, derniereVenue: new Date("2026-01-01T00:00:00Z") }, REPERE, MAINTENANT), null);
    assert.equal(statutPatient({ creeLe: ancien, venues: 0, derniereVenue: null }, REPERE, MAINTENANT), "A_RELANCER");
  });
});

describe("Activité de la Direction et repère des nouveaux", () => {
  it("n'écrit pas si la dernière activité date de moins de 2 minutes", () => {
    assert.equal(activiteSuivante(new Date("2026-11-12T09:59:00Z"), MAINTENANT), null);
  });
  it("met à jour l'activité sans toucher au repère pendant la session", () => {
    assert.deepEqual(activiteSuivante(new Date("2026-11-12T09:30:00Z"), MAINTENANT), { derniereActiviteLe: MAINTENANT });
  });
  it("après 1 h sans activité, une nouvelle session commence : les nouveaux repartent de la dernière activité", () => {
    const hier = new Date("2026-11-11T17:00:00Z");
    assert.deepEqual(activiteSuivante(hier, MAINTENANT), { derniereActiviteLe: MAINTENANT, nouveauxDepuis: hier });
  });
});
