// Ce que le réseau demande — la lecture mise à l'épreuve.
//
//     node --test noyau/tests/
//
// Ces tests gardent la décision la plus coûteuse de l'application : ouvrir
// le pavé du code secret, ou pas. Se tromper dans un sens ouvre le pavé sur
// une question ordinaire ; se tromper dans l'autre fait taper le code dans
// une zone de texte, où il s'affiche et reste. Les messages ci-dessous sont
// de VRAIS textes d'opérateurs camerounais, dans les deux langues.

import { test } from "node:test";
import assert from "node:assert/strict";
import { champPourQuestion, demandeUnCode } from "../ussd.ts";

test("le code secret est reconnu, en français comme en anglais", () => {
  for (const message of [
    "Entrez votre code secret",
    "Veuillez saisir votre code PIN",
    "Enter your PIN",
    "Please enter your secret code",
    "Entrez votre mot de passe MoMo",
    "Saisissez votre code confidentiel",
    "Enter passcode to confirm",
  ]) {
    assert.equal(demandeUnCode(message), true, message);
  }
});

test("un MENU n'est jamais une demande de code, même s'il contient le mot", () => {
  // Le piège : le menu MTN parle de « code » dans une de ses options. Sans
  // la garde sur les listes numérotées, le pavé s'ouvrirait ici — et le
  // propriétaire taperait son code secret en guise de choix de menu.
  for (const menu of [
    "1. Envoyer argent\n2. Retirer\n3. Mon code\n4. Solde",
    "1) Transfer\n2) Withdraw\n3) Change PIN\n4) Balance",
    "Choisissez:\n1. Depot\n2. Code secret\n3. Retour",
  ]) {
    assert.equal(demandeUnCode(menu), false, menu.split("\n")[0]);
  }
});

test("une question ordinaire n'ouvre pas le pavé", () => {
  for (const message of [
    "Entrez le numero du beneficiaire",
    "Enter amount",
    "Transaction reussie. Nouveau solde: 412500 FCFA",
    "",
  ]) {
    assert.equal(demandeUnCode(message), false, message || "(vide)");
  }
});

const champs = [
  { cle: "numero", type: "numero" as const },
  { cle: "montant", type: "montant" as const },
];

test("la question du réseau trouve le champ qui y répond", () => {
  const cas: [string, string | undefined][] = [
    ["Entrez le numero du beneficiaire", "numero"],
    ["Enter recipient phone number", "numero"],
    ["Numero de l'agent :", "numero"],
    ["Entrez le montant", "montant"],
    ["Enter amount to send", "montant"],
    ["How much do you want to send?", "montant"],
    // Une question qu'on ne comprend pas ne se devine PAS : on rend la main.
    ["Confirmez-vous cette operation ?", undefined],
    ["Veuillez patienter", undefined],
    // AMBIGUË : elle nomme le montant ET le bénéficiaire. On ne devine pas —
    // répondre le numéro là où le réseau attend un montant serait grave.
    ["Montant a envoyer au beneficiaire", undefined],
    ["Amount to send to recipient", undefined],
  ];
  for (const [question, attendu] of cas) {
    assert.equal(champPourQuestion(question, champs)?.cle, attendu, question);
  }
});

test("un champ déjà consommé ne resert pas", () => {
  // Le réseau redemande un numéro alors qu'on l'a déjà donné : sans cette
  // règle, on renverrait la même valeur en boucle au lieu de rendre la main.
  const restants = champs.filter((c) => c.cle !== "numero");
  assert.equal(champPourQuestion("Entrez le numero", restants), undefined);
  assert.equal(champPourQuestion("Entrez le montant", restants)?.cle, "montant");
});

test("un trou dont la valeur n'a aucun chiffre reste MANQUANT", async () => {
  const { remplirVariables } = await import("../codes.ts");
  // « abc » dans le champ montant : il se réduit à rien une fois les chiffres
  // gardés. Le composer donnerait « *126*1**# » — un code amputé, en
  // silence. Il doit être signalé manquant, pas consommé.
  const r = remplirVariables(["*126*1*{montant}#"], { montant: "abc" });
  assert.deepEqual(r.manquantes, ["montant"]);
  assert.deepEqual(r.consommees, []);
  assert.equal(r.etapes[0], "*126*1*{montant}#");   // le trou reste béant

  // Une vraie valeur, elle, se remplit et se consomme.
  const ok = remplirVariables(["*126*1*{montant}#"], { montant: "20 000" });
  assert.deepEqual(ok.manquantes, []);
  assert.deepEqual(ok.consommees, ["montant"]);
  assert.equal(ok.etapes[0], "*126*1*20000#");
});

// --- Ce qui EST un menu, et ce qui n'en est pas -----------------------------
//
// La garde des menus protège le code secret : un menu qui contient le mot
// « code » reste un menu. Mais elle se contentait d'UNE ligne qui ressemble à
// une option — et l'heure en tête d'un message d'opérateur (« 10:44 ») en a
// la forme exacte. Le pavé ne s'ouvrait donc pas, le code se tapait dans une
// zone de texte ordinaire, s'affichait dans le fil, et partait SANS le
// drapeau « secret » : il restait en clair dans le nuage, pour toujours.

test("un horodatage en tête ne fait pas un menu — le pavé s'ouvre", () => {
  for (const message of [
    "10:44\nEntrez votre code secret",
    "12-05-2026 10:44\nSaisissez votre code PIN",
    "1. Entrez votre code PIN pour confirmer",   // une demande numérotée
  ]) {
    assert.equal(demandeUnCode(message), true, message);
  }
});

test("un vrai menu reste un menu, même s'il parle de code", () => {
  for (const menu of [
    "1. Envoyer argent\n2. Retirer\n3. Mon code",
    "1) Transfert\n2) Solde",
    "1 - Depot\n2 - Retrait\n3 - Changer mon code secret",
  ]) {
    assert.equal(demandeUnCode(menu), false, menu);
  }
});

test("un menu n'est jamais une question à laquelle on répond seul", () => {
  // « 1. Vers un numero MTN » contient « numero » sans rien demander de tel :
  // on y postait le numéro du bénéficiaire COMME CHOIX DE MENU, sur la vraie
  // SIM — et le champ, consommé, ne servait plus la vraie question d'après.
  const champs = [
    { cle: "numero", type: "numero" as const },
    { cle: "montant", type: "montant" as const },
  ];
  for (const menu of [
    "Transfert d'argent\n1. Vers un numero MTN\n2. Vers un autre reseau\n3. Retour",
    "Choisir le montant\n1. 500\n2. 1000\n3. Autre",
  ]) {
    assert.equal(champPourQuestion(menu, champs), undefined, menu);
  }
  // Une vraie question, elle, se remplit toujours.
  assert.deepEqual(
    champPourQuestion("Entrez le numero du beneficiaire", champs), champs[0]);
});
