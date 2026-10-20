import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { Role } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { exigerRole } from "../middleware/auth.js";
import { ROLES_JOURNAL } from "../utils/audit.js";
import { enregistrerAudit } from "./audit.service.js";

describe("Journal d'audit : enregistrement d'un événement", () => {
  it("écrit l'entrée dans la transaction fournie, avec tous ses champs", async () => {
    const ecrites: unknown[] = [];
    const transaction = { journalAudit: { create: async (args: unknown) => void ecrites.push(args) } };

    await enregistrerAudit(transaction as unknown as Prisma.TransactionClient, {
      utilisateurId: 1,
      action: "CHARGE_MODIFIEE",
      entite: "charge_fixe",
      entiteId: 4,
      detail: { avant: { montant: 100 }, apres: { montant: 200 } },
    });

    assert.deepEqual(ecrites, [
      {
        data: {
          utilisateurId: 1,
          action: "CHARGE_MODIFIEE",
          entite: "charge_fixe",
          entiteId: 4,
          detail: { avant: { montant: 100 }, apres: { montant: 200 } },
          ip: null,
        },
      },
    ]);
  });
});

describe("Journal d'audit : refus d'accès", () => {
  function appeler(role: Role) {
    const resultat = { statut: 200, corps: null as unknown, suivant: false };
    const reponse = {
      status(code: number) {
        resultat.statut = code;
        return this;
      },
      json(corps: unknown) {
        resultat.corps = corps;
      },
    } as unknown as Response;
    exigerRole(...ROLES_JOURNAL)({ utilisateur: { id: 1, role } } as Request, reponse, (() => {
      resultat.suivant = true;
    }) as NextFunction);
    return resultat;
  }

  for (const role of [Role.MEDECIN, Role.SAGE_FEMME, Role.SECRETAIRE]) {
    it(`refuse le profil ${role} (403)`, () => {
      const resultat = appeler(role);
      assert.equal(resultat.statut, 403);
      assert.deepEqual(resultat.corps, { code: "ACCES_REFUSE" });
      assert.equal(resultat.suivant, false);
    });
  }

  for (const role of [Role.DIRECTION, Role.MEDECIN_CHEF]) {
    it(`laisse passer le profil ${role}`, () => {
      assert.equal(appeler(role).suivant, true);
    });
  }
});
