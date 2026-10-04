// La surcouche : un écran d'opérateur lu comme une application le ferait.

import { test } from "node:test";
import assert from "node:assert/strict";
import { champPourQuestion, lireEcran } from "../ussd";

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

// ---------------------------------------------------------------------------
// DE VRAIS ÉCRANS, ET LEURS VARIANTES. Les menus ne sont pas les nôtres : ils
// changent d'un opérateur à l'autre, d'une langue à l'autre, et sans
// prévenir. Ce qui suit n'est pas une liste à reconnaître par cœur — la
// lecture ne connaît aucun de ces textes — mais une batterie de FORMES
// qu'elle doit savoir lire.
// ---------------------------------------------------------------------------

const MENUS: [string, string, string[]][] = [
  ["MTN, français, « 1. »",
   "Bienvenue sur MTN MoMo\n1. Transfert d'argent\n2. Retrait d'argent\n3. Paiement de facture\n4. Achat de credit\n5. Mon compte\n0. Suivant",
   ["1", "2", "3", "4", "5", "0"]],
  ["MTN, anglais, « 1) » et « 98) »",
   "Welcome to MTN MoMo\n1) Transfer Money\n2) Cash Out\n3) Pay Bill\n4) Airtime\n5) My Account\n98) Next",
   ["1", "2", "3", "4", "5", "98"]],
  ["Orange, français, « 1- » et « #- »",
   "Orange Money\n1-Transfert d'argent\n2-Retrait\n3-Achat de credit\n4-Paiement facture\n5-Mon compte\n#-Retour",
   ["1", "2", "3", "4", "5", "#"]],
  ["Orange, anglais, « 1: » et « 00: »",
   "Orange Money\n1:Money Transfer\n2:Withdrawal\n3:Buy Airtime\n00:Main menu",
   ["1", "2", "3", "00"]],
  ["numéro et espace seule",
   "Menu principal\n1 Transfert\n2 Retrait\n3 Solde\n0 Retour",
   ["1", "2", "3", "0"]],
  ["un sous-menu qui parle de numéro",
   "Transfert d'argent\n1. Vers un numero MTN\n2. Vers un autre reseau\n0. Retour",
   ["1", "2", "0"]],
  ["fins de ligne Windows, espaces en trop",
   "Orange Money\r\n Bienvenue :\r\n 1) Transfert \r\n 2) Retrait\r\n *: Menu\r\n",
   ["1", "2", "*"]],
];

for (const [nom, brut, numeros] of MENUS) {
  test(`un menu se lit : ${nom}`, () => {
    const e = lireEcran(brut);
    assert.equal(e.attend, "choix");
    assert.deepEqual(e.choix.map((c) => c.numero), numeros);
    // Chaque libellé est celui de l'opérateur, et rien ne se perd.
    for (const c of e.choix) assert.ok(c.libelle.length > 0 && brut.includes(c.libelle));
  });
}

const QUESTIONS: [string, string][] = [
  ["Saisissez le numero du destinataire", "numero"],
  ["Entrez le numero de telephone du beneficiaire:", "numero"],
  ["Enter recipient MSISDN", "numero"],
  ["Please enter the receiver's number", "numero"],
  ["Entrez le montant:", "montant"],
  ["Montant a transferer :", "montant"],
  ["Veuillez entrer le montant (FCFA)", "montant"],
  ["Enter amount", "montant"],
  ["How much do you want to send?", "montant"],
  ["Entrez la reference de la facture", "texte"],
  // Une question qui nomme les DEUX : on ne devine pas, on rend la main.
  ["Montant a envoyer au beneficiaire ?", "texte"],
];

for (const [brut, attendu] of QUESTIONS) {
  test(`une question se lit : « ${brut} »`, () => {
    assert.equal(lireEcran(brut).attend, attendu);
  });
}

const CODES = [
  "Vous allez transferer 5000 FCFA a JEAN DUPONT (677998877). Frais: 0 FCFA. Entrez votre code PIN pour confirmer",
  "Confirmez le transfert de 5000F vers 677998877 JEAN DUPONT\nSaisir votre code secret",
  "Transfer 5,000 XAF to JOHN DOE 677998877. Enter PIN to confirm",
  "Saisir votre NIP:",
  // Des puces ne font pas un menu : le pavé s'ouvre quand même.
  "Transfert vers JEAN\n* Montant: 5000\n* Frais: 0\nEntrez votre code secret",
  // Une forme souple QUI PARLE DE CODE n'est pas un menu : dans le doute,
  // le pavé — jamais un champ en clair.
  "Code secret\n1 Changer mon code\n2 Retour",
  "Code incorrect. Entrez votre code secret",
];

for (const brut of CODES) {
  test(`le code secret se demande : « ${brut.slice(0, 40)}… »`, () => {
    assert.equal(lireEcran(brut).attend, "secret");
  });
}

const FINS: [string, "reussie" | "refusee" | null][] = [
  ["Transfert de 5000 FCFA vers 677998877 effectue avec succes. Nouveau solde: 407500 FCFA.", "reussie"],
  ["Transaction successful. Your new balance is 407,500 XAF", "reussie"],
  ["Votre transfert a ete envoye. Ref: 123456789", "reussie"],
  ["Solde insuffisant. Transaction annulee.", "refusee"],
  ["Wrong PIN. Transaction failed.", "refusee"],
  ["Code secret incorrect. Operation echouee.", "refusee"],
  ["Votre solde est de 412 500 FCFA", null],
];

for (const [brut, issue] of FINS) {
  test(`une fin se lit : « ${brut.slice(0, 40)}… »`, () => {
    const e = lireEcran(brut);
    assert.deepEqual([e.attend, e.issue], ["rien", issue]);
  });
}

// UN MESSAGE LONG SE TOURNE COMME UNE PAGE. Le vrai écran d'un « Float
// Transfer » MTN vers une raison sociale longue (nom inventé, même longueur) :
// aucune question, une seule ligne numérotée — l'écran le prenait pour une
// fin et affichait « Terminé ». La suite ne venait qu'en tapant « 00 » à
// l'aveugle.
const PAGE_LONGUE =
  "Confirm: Float Transfer for FCFA 5000 To -ETS NOUVELLE QUINCAILLERIE DU LITTORAL "
  + "ET DES HAUTS PLATEAUX SARL MBALLA JEAN having mobile number 237670000123.";

test("un message long qui finit par « 00. Next » n'est pas une fin : c'est un bouton", () => {
  for (const brut of [`${PAGE_LONGUE}\n00. Next`, `${PAGE_LONGUE} 00. Next`,
                      `${PAGE_LONGUE}\n98 Suivant`, `${PAGE_LONGUE}\n#. Retour`]) {
    const e = lireEcran(brut);
    assert.equal(e.attend, "choix", brut.slice(-12));
    assert.equal(e.choix.length, 1, brut.slice(-12));
    assert.equal(e.issue, null);
    // Le message reste entier à l'écran, sans la ligne devenue bouton.
    assert.ok(e.texte.endsWith("237670000123."), e.texte.slice(-20));
  }
  assert.deepEqual(lireEcran(`${PAGE_LONGUE} 00. Next`).choix, [{ numero: "00", libelle: "Next" }]);
});

test("une vraie fin reste une fin — une phrase qui finit par un nombre n'est pas un choix", () => {
  for (const fin of [
    "Operation reussie. Nouveau solde: 407 500 FCFA.",
    "Votre forfait est valable 30 jours. 12 mois offerts",
    "Transfert de 5 000 FCFA vers 677998877 reussi. Ref 2026.10",
    "Echec de la transaction : solde insuffisant.",
  ]) {
    assert.equal(lireEcran(fin).attend, "rien", fin);
  }
});

test("le RÉSEAU décide : ouverte, jamais « Terminé » ; fermée, jamais de champ", () => {
  // Le boîtier rapporte ce que le réseau a dit (+CUSD: 1 ou 0). Le texte
  // ne fait que le laisser deviner.
  const sansIndice = "Votre demande est en cours de traitement.";
  assert.equal(lireEcran(sansIndice).attend, "rien");
  assert.equal(lireEcran(sansIndice, "attend").attend, "texte");
  assert.equal(lireEcran(sansIndice, "attend").issue, null);
  // Fermée : la page « 00. Next » n'a plus de suite — pas de bouton mort.
  const fermee = lireEcran(`${PAGE_LONGUE}\n00. Next`, "fini");
  assert.equal(fermee.attend, "rien");
  assert.deepEqual(fermee.choix, []);
  assert.match(fermee.texte, /00\. Next$/);
  // Le pavé du code ne s'ouvre pas sur une session que le réseau a fermée.
  assert.equal(lireEcran("Entrez votre code secret", "fini").attend, "rien");
  // Et le code secret reste le code secret quand il attend.
  assert.equal(lireEcran("Entrez votre code secret", "attend").attend, "secret");
});

test("une page qui se tourne ne se remplit pas toute seule avec le numéro", () => {
  // Elle nomme un numéro (« having mobile number ») sans en demander : le
  // champ « numéro » encore à servir partait là où l'opérateur attend « 00 ».
  const champs = [{ type: "numero" as const }, { type: "montant" as const }];
  assert.equal(champPourQuestion(`${PAGE_LONGUE}\n00. Next`, champs), undefined);
  assert.equal(champPourQuestion(`${PAGE_LONGUE} 00. Next`, champs), undefined);
  // La vraie question, elle, se remplit toujours.
  assert.equal(champPourQuestion("Entrez le numero du beneficiaire:", champs)?.type, "numero");
});
