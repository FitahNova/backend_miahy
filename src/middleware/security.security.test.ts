import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "../generated/prisma/client.js";
import { exigerRole } from "./auth.js";

process.env.JWT_SECRET ??= "000000000000000000000000000000000000000000000000";

function verifierRole(role: Role | undefined) {
  let statut = 200;
  let corps: unknown;
  let autorise = false;

  const reponse = {
    status(code: number) {
      statut = code;
      return this;
    },
    json(contenu: unknown) {
      corps = contenu;
      return this;
    },
  } as unknown as Response;

  exigerRole(Role.DIRECTION)(
    { utilisateur: role ? { id: 1, role } : undefined } as Request,
    reponse,
    (() => { autorise = true; }) as NextFunction,
  );

  return { statut, corps, autorise };
}

describe("Sécurité SecOps : contrôle RBAC", () => {
  it("refuse une requête sans identité", () => {
    const resultat = verifierRole(undefined);
    assert.equal(resultat.statut, 401);
    assert.deepEqual(resultat.corps, { code: "CONNEXION_REQUISE" });
  });

  for (const role of [Role.MEDECIN, Role.SAGE_FEMME, Role.SECRETAIRE, Role.MEDECIN_CHEF]) {
    it(`refuse le rôle ${role} sur une route Direction`, () => {
      const resultat = verifierRole(role);
      assert.equal(resultat.statut, 403);
      assert.deepEqual(resultat.corps, { code: "ACCES_REFUSE" });
      assert.equal(resultat.autorise, false);
    });
  }

  it("autorise uniquement le rôle Direction", () => {
    assert.equal(verifierRole(Role.DIRECTION).autorise, true);
  });
});

describe("Sécurité SecOps : jetons JWT", () => {
  it("refuse un jeton signé avec un algorithme inattendu", () => {
    assert.throws(() => jwt.verify(
      jwt.sign({ id: 1, role: Role.DIRECTION }, "secret-different", { algorithm: "HS384" }),
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] },
    ));
  });

  it("refuse un jeton signé avec une mauvaise clé", () => {
    const jeton = jwt.sign({ id: 1, role: Role.DIRECTION }, "mauvaise-cle", { algorithm: "HS256" });
    assert.throws(() => jwt.verify(jeton, process.env.JWT_SECRET as string, { algorithms: ["HS256"] }));
  });

  it("accepte un jeton HS256 valide avec les données attendues", () => {
    const jeton = jwt.sign({ id: 1, role: Role.DIRECTION, version: 1 }, process.env.JWT_SECRET as string, {
      expiresIn: "15m",
      algorithm: "HS256",
    });
    const contenu = jwt.verify(jeton, process.env.JWT_SECRET as string, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    assert.equal(contenu.id, 1);
    assert.equal(contenu.role, Role.DIRECTION);
  });
});
