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

// ---------------------------------------------------------------------------
// Ce que le champ MONTRE pendant qu'on tape : « illisible », disait le
// propriétaire de « 677998877 » et de « 250000 ».
// ---------------------------------------------------------------------------
import { apresEffacement, enFormeDansLeChamp } from "../saisie";

test("un numéro s'écrit comme on le dit, à mesure qu'on tape", () => {
  const f = (s: string) => enFormeDansLeChamp("numero", s, "fr");
  assert.equal(f("6"), "6");
  assert.equal(f("677"), "677");
  assert.equal(f("6771"), "677 1");
  assert.equal(f("67712"), "677 12");
  assert.equal(f("6771234"), "677 12 34");
  assert.equal(f("677123456"), "677 12 34 56");
  assert.equal(f("677 12 34 56"), "677 12 34 56");
  assert.equal(f(""), "");
});

test("un numéro collé avec l'indicatif se ramène au numéro, et l'indicatif en cours se garde", () => {
  const f = (s: string) => enFormeDansLeChamp("numero", s, "fr");
  assert.equal(f("+237 6 77 99 88 77"), "677 99 88 77");
  assert.equal(f("00237677998877"), "677 99 88 77");
  assert.equal(f("+"), "+");
  assert.equal(f("+237"), "+237");
  assert.equal(f("+2376"), "+237 6");
  assert.equal(f("+23767799"), "+237 677 99");
  // Et ce qui partira au réseau reste juste, lu dans la forme montrée.
  assert.equal(numeroSaisi(f("+2376779988")), numeroSaisi("+2376779988"));
  assert.equal(numeroSaisi(f("677998877")), "677998877");
});

test("ce qu'on ne sait pas lire reste tel quel — on ne fabrique pas un numéro", () => {
  const f = (s: string) => enFormeDansLeChamp("numero", s, "fr");
  assert.equal(f("Tel : 677 99 88 77"), "Tel : 677 99 88 77");
  assert.equal(f("677٩٩8877"), "677٩٩8877");
});

test("un montant s'écrit par milliers, dans la langue de l'écran", () => {
  const fr = (s: string) => enFormeDansLeChamp("montant", s, "fr");
  const en = (s: string) => enFormeDansLeChamp("montant", s, "en");
  assert.equal(fr("5"), "5");
  assert.equal(fr("5000"), "5 000");
  assert.equal(fr("250000"), "250 000");
  assert.equal(fr("1500000"), "1 500 000");
  assert.equal(en("250000"), "250,000");
  assert.equal(fr("5 000 FCFA"), "5 000");
  assert.equal(fr(""), "");
  // La forme montrée se relit à l'identique.
  for (const m of ["5", "5000", "250000", "1500000", "999999999"]) {
    assert.equal(montantSaisi(fr(m)), Number(m), m);
    assert.equal(montantSaisi(en(m)), Number(m), m);
  }
});

test("effacer un espace efface le chiffre d'avant — la touche n'est jamais sans effet", () => {
  assert.equal(apresEffacement("677 1", "677"), "677");          // un chiffre effacé : rien à faire
  assert.equal(apresEffacement("677 12", "67712"), "6771");      // l'espace effacé : le 2 part
  assert.equal(apresEffacement("5 000", "5000"), "500");
  // LE TÉMOIN : sans ce rattrapage, la forme remettait l'espace et l'effacement était perdu.
  assert.equal(enFormeDansLeChamp("numero", "67712", "fr"), "677 12");
});

test("en anglais, effacer un zéro de « 5,000 » laisse 500 — pas cinq francs et des centimes", () => {
  const en = (s: string) => enFormeDansLeChamp("montant", s, "en");
  assert.equal(en(apresEffacement("5,000", "5,00")), "500");
  assert.equal(en(apresEffacement("1,250,000", "1,250,00")), "125,000");
  assert.equal(en("1,500.00"), "1,500");          // des centimes collés tombent, comme partout
  assert.equal(enFormeDansLeChamp("montant", "1 500,00", "fr"), "1 500");
  // LE TÉMOIN : lu sans retirer la virgule des milliers, « 5,00 » valait 5.
  assert.equal(montantSaisi("5,00"), 5);
});
