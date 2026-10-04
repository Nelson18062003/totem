// Les ronds de l'accueil, choisis par la personne : la lecture du choix rangé
// ne doit jamais casser l'accueil.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basculerRond, deplacerRond, rondsChoisis, RONDS_MAX, RONDS_PAR_DEFAUT,
} from "../ronds.ts";

test("un choix rangé se relit tel quel", () => {
  assert.deepEqual(rondsChoisis('["menu","depot","solde"]'), ["menu", "depot", "solde"]);
  assert.deepEqual(rondsChoisis(["ussd"]), ["ussd"]);
});

test("ce qui est abîmé ou d'une autre version ne casse pas l'accueil", () => {
  for (const brut of [null, undefined, "", "{", "[]", "42", '{"a":1}', '["inconnu"]', [1, 2]]) {
    assert.deepEqual(rondsChoisis(brut), [...RONDS_PAR_DEFAUT], String(brut));
  }
  // Un nom inconnu s'écarte, le reste demeure ; un doublon ne compte qu'une fois.
  assert.deepEqual(rondsChoisis('["depot","fusee","depot","menu"]'), ["depot", "menu"]);
});

test("cinq au plus — un sixième ferait passer la rangée sur deux lignes", () => {
  const six = ["depot", "retrait", "transfert", "menu", "solde", "ussd"];
  assert.equal(rondsChoisis(six).length, RONDS_MAX);
  assert.deepEqual(basculerRond(rondsChoisis(six), "beneficiaires"), rondsChoisis(six));
});

test("au moins un — un accueil sans geste ressemble à une panne", () => {
  assert.deepEqual(basculerRond(["menu"], "menu"), ["menu"]);
  assert.deepEqual(basculerRond(["menu", "depot"], "menu"), ["depot"]);
  assert.deepEqual(basculerRond(["menu"], "solde"), ["menu", "solde"]);
});

test("monter et descendre, sans sortir de la liste", () => {
  assert.deepEqual(deplacerRond(["a", "b", "c"] as never, "b" as never, -1), ["b", "a", "c"]);
  assert.deepEqual(deplacerRond(["depot", "menu"], "depot", -1), ["depot", "menu"]);
  assert.deepEqual(deplacerRond(["depot", "menu"], "menu", 1), ["depot", "menu"]);
  assert.deepEqual(deplacerRond(["depot", "menu"], "depot", 1), ["menu", "depot"]);
});

test("l'accueil d'origine porte le Menu de l'opérateur", () => {
  assert.ok(RONDS_PAR_DEFAUT.includes("menu"));
  assert.ok(RONDS_PAR_DEFAUT.length <= RONDS_MAX);
});
