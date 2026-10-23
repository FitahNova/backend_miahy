import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { choisirRendezVousDuJour, estCeJourAuCentre } from "./jourCentre.js";

const MAINTENANT = new Date("2026-10-23T08:00:00+03:00");

const a = (heure: string, statut = "PREVU", id = heure) => ({
  id,
  statut,
  dateHeure: new Date(heure),
});

describe("Rendez-vous du jour au centre", () => {
  it("reconnaît un créneau du jour, pas celui de la veille ni du lendemain", () => {
    assert.equal(estCeJourAuCentre(new Date("2026-10-23T09:00:00+03:00"), MAINTENANT), true);
    assert.equal(estCeJourAuCentre(new Date("2026-10-23T23:30:00+03:00"), MAINTENANT), true);
    assert.equal(estCeJourAuCentre(new Date("2026-10-24T00:30:00+03:00"), MAINTENANT), false);
    assert.equal(estCeJourAuCentre(new Date("2026-10-22T18:00:00+03:00"), MAINTENANT), false);
  });

  it("retient le rendez-vous prévu le plus tôt du jour", () => {
    const choisi = choisirRendezVousDuJour(
      [
        a("2026-10-24T09:00:00+03:00", "PREVU", "demain"),
        a("2026-10-23T16:00:00+03:00", "PREVU", "apres"),
        a("2026-10-23T08:30:00+03:00", "PREVU", "matin"),
        a("2026-10-23T07:00:00+03:00", "ABSENT", "deja"),
      ],
      MAINTENANT,
    );
    assert.equal(choisi?.id, "matin");
  });

  it("ne retient rien si le seul créneau prévu est un autre jour", () => {
    const choisi = choisirRendezVousDuJour([a("2026-10-24T09:00:00+03:00", "PREVU", "demain")], MAINTENANT);
    assert.equal(choisi, undefined);
  });
});
