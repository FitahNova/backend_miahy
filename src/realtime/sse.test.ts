import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { diffuser, fermerFluxDuCompte, ouvrirFluxEvenements } from "./sse.js";
import { EVENEMENTS } from "./events.js";

// Faux flux : garde ce qui est écrit, et se ferme comme une vraie réponse.
function fauxFlux(utilisateurId: number) {
  const requete = Object.assign(new EventEmitter(), { utilisateur: { id: utilisateurId, role: "SECRETAIRE" } });
  const recus: string[] = [];
  const reponse = Object.assign(new EventEmitter(), {
    writableEnded: false,
    destroyed: false,
    set() {},
    flushHeaders() {},
    write(message: string) {
      recus.push(message);
      return true;
    },
    end() {
      reponse.writableEnded = true;
      reponse.emit("close");
    },
  });
  ouvrirFluxEvenements(requete as unknown as Request, reponse as unknown as Response);
  return { recus, reponse, fermer: () => requete.emit("close") };
}

describe("Flux temps réel : compte coupé", () => {
  it("ferme les flux du compte coupé, et seulement les siens", () => {
    const coupe = fauxFlux(1);
    const autre = fauxFlux(2);

    fermerFluxDuCompte(1);
    diffuser(EVENEMENTS.CAISSE_MODIFIEE, { factureId: 27 });

    assert.equal(coupe.reponse.writableEnded, true);
    assert.ok(!coupe.recus.some((message) => message.includes("caisse-modifiee")), "le compte coupé ne reçoit plus rien");
    assert.ok(autre.recus.some((message) => message.includes("caisse-modifiee")), "les autres comptes reçoivent toujours");

    autre.fermer();
  });
});
