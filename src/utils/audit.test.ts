import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Role } from "../generated/prisma/client.js";
import {
  ACTIONS_CONNEXION,
  ACTIONS_MEDICALES,
  champsModifies,
  construireFiltre,
  decomposerDetail,
  perimetreDuRole,
  ROLES_JOURNAL,
} from "./audit.js";

describe("Journal d'audit : droits de consultation", () => {
  it("n'ouvre le journal qu'à la Direction et au Médecin chef", () => {
    assert.deepEqual([...ROLES_JOURNAL].sort(), [Role.DIRECTION, Role.MEDECIN_CHEF].sort());
    for (const role of [Role.MEDECIN, Role.SAGE_FEMME, Role.SECRETAIRE]) {
      assert.ok(!(ROLES_JOURNAL as readonly Role[]).includes(role), `${role} ne doit pas consulter le journal`);
    }
  });

  it("donne tout le journal à la Direction", () => {
    assert.deepEqual(perimetreDuRole(Role.DIRECTION), {});
  });

  it("limite le Médecin chef aux actions médicales et aux connexions des soignants", () => {
    assert.deepEqual(perimetreDuRole(Role.MEDECIN_CHEF), {
      OR: [
        { action: { in: [...ACTIONS_MEDICALES] } },
        { action: { in: [...ACTIONS_CONNEXION] }, role: { in: [Role.MEDECIN_CHEF, Role.MEDECIN, Role.SAGE_FEMME] } },
      ],
    });
  });

  it("ne laisse voir aux actions médicales ni caisse, ni prix, ni comptes, ni charges", () => {
    for (const action of ["PAIEMENT", "CLOTURE_CAISSE", "MODIFICATION_PRIX", "CREATION_UTILISATEUR", "CHARGE_MODIFIEE"]) {
      assert.ok(!(ACTIONS_MEDICALES as readonly string[]).includes(action), action);
    }
  });

  it("ne renvoie rien aux autres profils, même si la route était mal protégée", () => {
    for (const role of [Role.MEDECIN, Role.SAGE_FEMME, Role.SECRETAIRE]) {
      assert.deepEqual(perimetreDuRole(role), { id: -1n });
    }
  });
});

describe("Journal d'audit : filtres", () => {
  it("convertit les jours en bornes à l'heure de Madagascar, « au » inclus", () => {
    const filtre = construireFiltre({ du: "2026-10-20", au: "2026-10-20" }, Role.DIRECTION);
    assert.deepEqual(filtre, {
      AND: [
        {},
        { date: { gte: new Date("2026-10-19T21:00:00.000Z"), lt: new Date("2026-10-20T21:00:00.000Z") } },
      ],
    });
  });

  it("combine utilisateur, action et entité avec le périmètre du rôle", () => {
    const filtre = construireFiltre({ utilisateurId: 3, action: "CHARGE_MODIFIEE", entite: "charge_fixe" }, Role.MEDECIN_CHEF);
    assert.deepEqual(filtre.AND, [
      perimetreDuRole(Role.MEDECIN_CHEF),
      { utilisateurId: 3, action: "CHARGE_MODIFIEE", entite: "charge_fixe" },
    ]);
  });
});

describe("Journal d'audit : contenu d'une entrée", () => {
  it("sépare avant / après du reste du détail", () => {
    assert.deepEqual(decomposerDetail({ avant: { montant: 1 }, apres: { montant: 2 }, motif: "x" }), {
      avant: { montant: 1 },
      apres: { montant: 2 },
      detail: { motif: "x" },
    });
    assert.deepEqual(decomposerDetail(null), { avant: null, apres: null, detail: null });
  });

  it("ne garde que les noms des champs d'un patient modifié, jamais les valeurs", () => {
    const champs = champsModifies({ allergies: "Pénicilline", telephone: undefined, nom: "RAKOTO" });
    assert.deepEqual(champs, ["allergies", "nom"]);
    assert.ok(!JSON.stringify(champs).includes("Pénicilline"));
  });
});
