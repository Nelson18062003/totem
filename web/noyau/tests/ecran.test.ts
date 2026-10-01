// La surcouche : un écran d'opérateur lu comme une application le ferait.

import { test } from "node:test";
import assert from "node:assert/strict";
import { lireEcran } from "../ussd";

test("un menu devient des choix, avec le libellé de l'opérateur mot pour mot", () => {
  const e = lireEcran("MTN MoMo\n1. Transfert d'argent\n2. Retrait\n3) Paiement\n10 - Mon compte");
  assert.equal(e.attend, "choix");
  assert.equal(e.texte, "MTN MoMo");
  assert.deepEqual(e.choix, [
    { numero: "1", libelle: "Transfert d'argent" },
    { numero: "2", libelle: "Retrait" },
    { numero: "3", libelle: "Paiement" },
    { numero: "10", libelle: "Mon compte" },
  ]);
});

test("une heure n'est pas un choix, et une seule ligne numérotée n'est pas un menu", () => {
  const e = lireEcran("10:44\nEntrez votre code secret");
  assert.equal(e.attend, "secret");
  assert.deepEqual(e.choix, []);
  assert.equal(lireEcran("1. Entrez votre code PIN pour confirmer").attend, "secret");
});

test("la demande d'un numéro, d'un montant, d'autre chose", () => {
  assert.equal(lireEcran("Entrez le numero du beneficiaire:").attend, "numero");
  assert.equal(lireEcran("Entrez le montant:").attend, "montant");
  assert.equal(lireEcran("Enter the amount").attend, "montant");
  assert.equal(lireEcran("Entrez la reference de la facture").attend, "texte");
});

test("une fin réussie, une fin refusée — et un refus suivi d'une question n'est pas une fin", () => {
  const ok = lireEcran("Operation reussie. Nouveau solde: 407 500 FCFA.");
  assert.deepEqual([ok.attend, ok.issue], ["rien", "reussie"]);
  const ko = lireEcran("Echec de la transaction : solde insuffisant.");
  assert.deepEqual([ko.attend, ko.issue], ["rien", "refusee"]);
  const encore = lireEcran("Code incorrect. Entrez votre code secret");
  assert.deepEqual([encore.attend, encore.issue], ["secret", null]);
  const info = lireEcran("Votre numero est 677123456");
  assert.deepEqual([info.attend, info.issue], ["rien", null]);
});

test("rien ne fait lever la lecture", () => {
  for (const brut of [null, undefined, "", "\n\n", "1.", "99. ", "🙂".repeat(500)]) {
    const e = lireEcran(brut as string);
    assert.ok(["secret", "choix", "numero", "montant", "texte", "rien"].includes(e.attend));
  }
});
