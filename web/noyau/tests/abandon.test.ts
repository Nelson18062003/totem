// QUAND L'ÉCRAN RENONCE — ce que la réponse de l'annulation lui permet de
// dire. Le témoin : la lecture du premier jet, qui rangeait toute
// annulation refusée sous « elle peut encore aboutir », y compris une
// demande déjà finie.

import { test } from "node:test";
import assert from "node:assert/strict";

import { issueDeLAnnulation, phraseDAbandon } from "../abandon";
import { textesGuichet } from "../textes/guichet";
import { textesUssd } from "../textes/ussd";

/** LE PREMIER JET, réécrit en une ligne. */
const premierJet = (ok: boolean, corps: { annulee?: unknown } | null) =>
  !ok ? "incertain" : corps?.annulee === true ? "rien_parti"
    : corps?.annulee === false ? "en_cours" : "incertain";

test("annulée à temps : rien n'est parti", () => {
  assert.equal(issueDeLAnnulation(true, { annulee: true, etat: "echouee" }), "rien_parti");
});

test("prise et pas finie : elle peut encore aboutir", () => {
  assert.equal(issueDeLAnnulation(true, { annulee: false, etat: "en_cours" }), "en_cours");
});

test("finie entre-temps, réussie ou échouée : sa réponse existe, il faut la montrer", () => {
  for (const etat of ["faite", "echouee"]) {
    assert.equal(issueDeLAnnulation(true, { annulee: false, etat }), "finie", etat);
    // LE TÉMOIN : le premier jet disait « elle peut encore aboutir ».
    assert.equal(premierJet(true, { annulee: false }), "en_cours");
  }
});

test("dans le doute, jamais « rien n'est parti »", () => {
  assert.equal(issueDeLAnnulation(false, { annulee: true }), "incertain");
  assert.equal(issueDeLAnnulation(true, null), "incertain");
  assert.equal(issueDeLAnnulation(true, "oui"), "incertain");
  assert.equal(issueDeLAnnulation(true, { annulee: "true" }), "incertain");
  assert.equal(issueDeLAnnulation(true, { annulee: false, etat: "bizarre" }), "incertain");
});

test("chaque issue a sa phrase, dans les deux dictionnaires et les deux langues", () => {
  for (const t of [textesGuichet.fr, textesGuichet.en, textesUssd.fr, textesUssd.en]) {
    const phrases = (["rien_parti", "en_cours", "finie", "incertain"] as const)
      .map((i) => phraseDAbandon(i, t));
    assert.equal(new Set(phrases).size, 4, "quatre issues, quatre phrases");
    assert.ok(phrases.every((p) => p.length > 20));
  }
});
