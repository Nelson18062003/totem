import { test } from "node:test";
import assert from "node:assert/strict";
import { montantSaisi, numeroSaisi } from "../saisie";

test("un numéro tapé ou collé, tel qu'on le recopie", () => {
  assert.equal(numeroSaisi("677998877"), "677998877");
  assert.equal(numeroSaisi("677 99 88 77"), "677998877");
  assert.equal(numeroSaisi("+237 677 99 88 77"), "677998877");
  assert.equal(numeroSaisi("00237677998877"), "677998877");
  assert.equal(numeroSaisi("237-677-99-88-77"), "677998877");
  assert.equal(numeroSaisi("6.77.99.88.77"), "677998877");
  assert.equal(numeroSaisi("  677998877\n"), "677998877");
});

test("un numéro collé avec une phrase autour", () => {
  assert.equal(numeroSaisi("Tel : +237 6 77 99 88 77 (Jean)"), "677998877");
  assert.equal(numeroSaisi("Vous avez recu 5 000 FCFA de JEAN DUPONT (677998877) le 02/10"),
               "677998877");
  // Le même numéro deux fois n'est pas une question.
  assert.equal(numeroSaisi("677998877 / +237677998877"), "677998877");
});

test("pendant qu'on tape, les chiffres tels quels", () => {
  assert.equal(numeroSaisi("6"), "6");
  assert.equal(numeroSaisi("677 9"), "6779");
  assert.equal(numeroSaisi(""), "");
});

test("dans le doute, aucun numéro", () => {
  // Deux numéros différents : lequel ? On ne choisit pas à la place.
  assert.equal(numeroSaisi("677998877 ou 699112233"), "");
  // Deux lignes ne se recousent pas en un seul numéro.
  assert.equal(numeroSaisi("677998877\n699112233"), "");
  // Un chiffre d'une autre écriture n'est pas un chiffre qu'on envoie.
  assert.equal(numeroSaisi("6779٩8877"), "");
  assert.equal(numeroSaisi("６７７９９８８７７"), "");
  assert.equal(numeroSaisi("Bonjour"), "");
});

test("un montant tapé ou collé", () => {
  assert.equal(montantSaisi("5000"), 5000);
  assert.equal(montantSaisi("5 000"), 5000);
  assert.equal(montantSaisi("5 000 FCFA"), 5000);
  assert.equal(montantSaisi("5 000 F"), 5000);
  assert.equal(montantSaisi("5.000"), 5000);
  assert.equal(montantSaisi("5,000 XAF"), 5000);
  assert.equal(montantSaisi("1 000 000"), 1000000);
  assert.equal(montantSaisi("Montant : 25 000 FCFA"), 25000);
  assert.equal(montantSaisi("0050"), 50);
});

test("les centimes écrits tombent, ils ne multiplient pas", () => {
  assert.equal(montantSaisi("1 500,00"), 1500);
  assert.equal(montantSaisi("1.500,50 FCFA"), 1500);
  assert.equal(montantSaisi("12,5"), 12);
});

test("dans le doute, aucun montant", () => {
  assert.equal(montantSaisi(""), 0);
  assert.equal(montantSaisi("FCFA"), 0);
  assert.equal(montantSaisi("0"), 0);
  // Deux nombres : lequel est le montant ?
  assert.equal(montantSaisi("5000 vers 677998877"), 0);
  assert.equal(montantSaisi("5000\n2000"), 0);
  // Dix chiffres : un numéro collé au mauvais endroit, pas un montant.
  assert.equal(montantSaisi("6779988770"), 0);
  assert.equal(montantSaisi("5٠٠٠"), 0);
});
