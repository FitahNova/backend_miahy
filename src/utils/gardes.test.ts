import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compterGardes } from "./gardes.js";

const fitia = { id: 1, civilite: "MME", nom: "Rasoa", prenom: "Fitia" };
const zakaria = { id: 2, civilite: "DR", nom: "Andry", prenom: "Zakaria" };
const tsiaro = { id: 3, civilite: "DR", nom: "Tsiaro", prenom: null };

describe("Gardes : compteurs du mois par personne", () => {
  it("sépare les gardes de jour et de nuit et fait le total", () => {
    const [premier] = compterGardes([
      { periode: "JOUR", utilisateur: fitia },
      { periode: "NUIT", utilisateur: fitia },
      { periode: "NUIT", utilisateur: fitia },
    ]);
    assert.deepEqual(premier, { ...fitia, jour: 1, nuit: 2, total: 3 });
  });

  it("garde les personnes sans garde, à zéro", () => {
    const compteurs = compterGardes([{ periode: "JOUR", utilisateur: fitia }], [fitia, zakaria]);
    assert.deepEqual(compteurs.find((c) => c.id === zakaria.id), { ...zakaria, jour: 0, nuit: 0, total: 0 });
  });

  it("monte quand on ajoute une garde, descend quand on la retire", () => {
    const gardes = [{ periode: "NUIT" as const, utilisateur: zakaria }];
    assert.equal(compterGardes(gardes, [zakaria])[0].nuit, 1);
    assert.equal(compterGardes([...gardes, { periode: "NUIT", utilisateur: zakaria }], [zakaria])[0].nuit, 2);
    assert.equal(compterGardes([], [zakaria])[0].nuit, 0);
  });

  it("compte une personne désactivée qui a encore des gardes", () => {
    const compteurs = compterGardes([{ periode: "JOUR", utilisateur: tsiaro }], [fitia]);
    assert.equal(compteurs.length, 2);
    assert.equal(compteurs[0].id, tsiaro.id);
  });

  it("trie par nombre de gardes puis par nom", () => {
    const compteurs = compterGardes(
      [
        { periode: "JOUR", utilisateur: zakaria },
        { periode: "NUIT", utilisateur: zakaria },
        { periode: "JOUR", utilisateur: fitia },
      ],
      [fitia, zakaria, tsiaro],
    );
    assert.deepEqual(compteurs.map((c) => c.id), [zakaria.id, fitia.id, tsiaro.id]);
  });
});
