// Le trajet d'un raccourci, tel que le cadran l'écrit sous son nom.
//
//     node --test noyau/tests/
//
// Le cadran listait « Solde *126# », « Dépôt *126# », « Retrait *126# » :
// le PREMIER code seul, le même partout — on ne savait pas ce que faisait
// chaque bouton. Il écrit maintenant le trajet ENTIER, et les trous avec des
// mots : « {numero} » n'apprend rien à qui n'a pas écrit le code.

import { test } from "node:test";
import assert from "node:assert/strict";
import { textesUssd } from "../textes/ussd.ts";

test("le trajet entier, étape par étape, dans les deux langues", () => {
  const etapes = ["*126#", "1", "{numero}", "{montant}"];
  assert.equal(textesUssd.fr.trajet(etapes), "*126# › 1 › [numéro] › [montant]");
  assert.equal(textesUssd.en.trajet(etapes), "*126# › 1 › [number] › [amount]");
});

test("un trou DANS le code se nomme aussi, et l'agent reste l'agent", () => {
  const etapes = ["*126*2*{point}*{montant}#"];
  assert.equal(textesUssd.fr.trajet(etapes), "*126*2*[agent]*[montant]#");
  assert.equal(textesUssd.en.trajet(etapes), "*126*2*[agent]*[amount]#");
});

test("aucune accolade ne reste, même pour un trou inconnu", () => {
  for (const langue of ["fr", "en"] as const) {
    const vu = textesUssd[langue].trajet(["#150*{numero}*{code_promo}#", "{montant}"]);
    assert.doesNotMatch(vu, /[{}]/, vu);
    assert.match(vu, /\[code_promo\]/);
  }
});

test("un code sans trou passe tel quel — jamais traduit", () => {
  assert.equal(textesUssd.fr.trajet(["#148*5#"]), "#148*5#");
  assert.equal(textesUssd.en.trajet(["#148*5#"]), "#148*5#");
});

test("ce qu'un raccourci à trous va demander se dit juste", () => {
  const { fr, en } = textesUssd;
  assert.equal(fr.demandeUneValeur(["numero"]), "demande un numéro");
  assert.equal(fr.demandeUneValeur(["point"]), "demande un numéro");
  assert.equal(fr.demandeUneValeur(["montant"]), "demande un montant");
  assert.equal(fr.demandeUneValeur(["numero", "montant"]), "demande un numéro et un montant");
  assert.equal(en.demandeUneValeur(["montant"]), "asks for an amount");
  assert.equal(en.demandeUneValeur(["point", "montant"]), "asks for a number and an amount");
});
