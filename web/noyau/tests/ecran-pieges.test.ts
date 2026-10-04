// Les pièges de la lecture d'un écran d'opérateur — trouvés en l'attaquant.
//
//     node --import ./noyau/tests/resolveur.mjs --test noyau/tests/ecran-pieges.test.ts
//
// Une relecture adverse a cherché ce que la lecture PERD ou INVENTE sur des
// écrans qu'on n'avait pas imaginés : la navigation au pied d'une demande de
// code, des mots du code qu'on ne connaissait pas, une réussite suivie d'un
// conseil, un menu de forfaits. Chaque cas ci-dessous a été vu échouer.
//
// LE TÉMOIN. Ce fichier lit le module à éprouver dans LECTURE_A_EPROUVER
// (par défaut, la lecture du jour). Lancé sur la lecture d'avant —
//
//     git show 9bd8990:web/noyau/ussd.ts > /tmp/ussd-avant.ts
//     LECTURE_A_EPROUVER=/tmp/ussd-avant.ts node --import … --test …
//
// — il doit échouer, et c'est la preuve qu'il exige quelque chose.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const chemin = process.env.LECTURE_A_EPROUVER;
const lecture: typeof import("../ussd.ts") = await import(
  chemin ? pathToFileURL(chemin).href : "../ussd.ts");
const { champPourQuestion, demandeUnCode, lireEcran } = lecture;

const champs = [{ type: "numero" as const }, { type: "montant" as const }];

// --- Le code secret ---------------------------------------------------------

test("une demande de code suivie de sa navigation reste une demande de code", () => {
  // MTN et Orange ajoutent « 0. Retour / 00. Accueil » au pied de presque
  // tous leurs écrans. Deux lignes numérotées faisaient un « menu » : pas de
  // pavé, et le code se tapait en clair, sans le drapeau « secret ».
  for (const ecran of [
    "Entrez votre PIN pour confirmer\n0. Retour\n00. Accueil",
    "Enter PIN to confirm transfer of 5000 FCFA to 677123456\n0. Back\n00. Main menu",
    "Entrez votre code PIN pour confirmer\n0: Retour\n00: Accueil",
    "Enter MoMo PIN:\n1. Forgot PIN\n2. Cancel",
    "Enter your PIN:\n99. Back\n00. Home",
    "Transfert de 5000 FCFA a JEAN.\nEntrez votre code secret pour valider\n#. Retour\n0. Annuler\n00. Menu",
    "Confirm: Float Transfer 5000 to X\nEnter PIN:\n0. Back\n00. Next",
    "Entrez votre code secret\n1. Valider\n0. Retour",
    "Enter PIN to confirm transfer of 5000 FCFA to JEAN\n1. Confirm\n0. Back",
  ]) {
    assert.equal(demandeUnCode(ecran), true, ecran);
    assert.equal(lireEcran(ecran, "attend").attend, "secret", ecran);
    assert.equal(lireEcran(ecran).attend, "secret", ecran);
  }
  // Les choix de navigation restent connus de l'écran.
  assert.deepEqual(
    lireEcran("Entrez votre PIN pour confirmer\n0. Retour\n00. Accueil").choix.map((c) => c.numero),
    ["0", "00"]);
});

test("les mots du code qu'on ne connaissait pas ouvrent le pavé", () => {
  for (const ecran of [
    "Enter your mPIN", "Enter your MPIN:", "Entrez votre mPIN",
    "Entrez votre clé secrète", "Saisissez votre mot-de-passe", "Saisir votre mot-de-passe",
    "Enter your PINCODE", "Enter PIN code", "Enter P.I.N.", "Enter PIN2", "Entrez votre PIN_MoMo",
  ]) {
    assert.equal(demandeUnCode(ecran), true, ecran);
    assert.equal(lireEcran(ecran, "attend").attend, "secret", ecran);
  }
  // Sans faux positif sur des mots qui CONTIENNENT « pin ».
  for (const ecran of ["Votre opinion compte", "Camping 2026", "Entrez le numero du beneficiaire"]) {
    assert.equal(demandeUnCode(ecran), false, ecran);
  }
});

test("une demande de code qui nomme un numéro ne reçoit JAMAIS le numéro", () => {
  // Le numéro du bénéficiaire partait tout seul en guise de code : un essai
  // brûlé — trois, et le compte Mobile Money est bloqué.
  for (const ecran of [
    "Enter your mPIN to confirm transfer to number 677123456",
    "Entrez votre clé secrète pour confirmer le transfert au numero 677123456",
    "Saisissez votre mot-de-passe pour valider l'envoi au beneficiaire 677123456",
  ]) {
    assert.equal(champPourQuestion(ecran, champs), undefined, ecran);
    assert.equal(lireEcran(ecran).attend, "secret", ecran);
  }
});

test("un code refusé avec un essai restant : encore le pavé, jamais un champ en clair", () => {
  for (const ecran of [
    "Code PIN incorrect. Il vous reste 2 essais.",
    "Code secret incorrect. Il vous reste 2 tentatives",
    "Invalid PIN. Try again",
  ]) {
    assert.equal(lireEcran(ecran, "attend").attend, "secret", ecran);
  }
  assert.equal(lireEcran("Code PIN incorrect. Il vous reste 2 essais.").attend, "secret");
  // Un refus sans suite reste une fin refusée.
  const fin = lireEcran("Wrong PIN. Transaction failed.");
  assert.deepEqual([fin.attend, fin.issue], ["rien", "refusee"]);
  // Une réussite qui parle du code est une fin, pas le pavé…
  const change = lireEcran("Votre code PIN a ete modifie avec succes.");
  assert.deepEqual([change.attend, change.issue], ["rien", "reussie"]);
  // …sauf si le réseau dit qu'il attend encore : alors le pavé.
  assert.equal(lireEcran("Votre code PIN a ete modifie avec succes.", "attend").attend, "secret");
});

test("un code NOMMÉ sans être demandé n'ouvre pas le pavé à la place du bouton", () => {
  // Une mise en garde, un code qu'on vous donne : le bouton « 00. Next » ou
  // « 1. Confirmer » disparaissait derrière le pavé.
  const retrait = lireEcran("Retrait de 10000 FCFA. Code de retrait: 4821. Valable 24h. 00. Next", "attend");
  assert.equal(retrait.attend, "choix");
  assert.deepEqual(retrait.choix, [{ numero: "00", libelle: "Next" }]);
  const garde = lireEcran(
    "Vous allez envoyer 5000 FCFA a JOHN 677123456. Ne partagez jamais votre code PIN.\n1. Confirmer", "attend");
  assert.equal(garde.attend, "choix");
  assert.deepEqual(garde.choix, [{ numero: "1", libelle: "Confirmer" }]);
  const reussite = lireEcran(
    "Transfert effectue. Nouveau solde: 12 000 FCFA. Ne communiquez jamais votre code secret.");
  assert.deepEqual([reussite.attend, reussite.issue], ["rien", "reussie"]);
  // Mais une mise en garde qui accompagne une DEMANDE reste une demande.
  for (const ecran of ["Ne partagez jamais votre code PIN. Entrez-le :",
                       "Entrez votre code secret. Ne le communiquez jamais."]) {
    assert.equal(lireEcran(ecran).attend, "secret", ecran);
  }
});

test("un menu qui ne cite le code que dans ses choix reste un menu", () => {
  const e = lireEcran("MTN MoMo\n1 Transfert\n2 Retrait\n3 Changer code PIN", "attend");
  assert.equal(e.attend, "choix");
  assert.deepEqual(e.choix.map((c) => c.numero), ["1", "2", "3"]);
  // …mais l'écran SAIT qu'il parle de code : une réponse libre part masquée.
  assert.equal(e.parleDuCode, true);
  assert.equal(lireEcran("Entrez le montant").parleDuCode, false);
});

test("le robot et le noyau jugent le pavé de la même façon (écrans partagés)", async () => {
  // Le même fichier est lu par tests/test_garde_du_code.py : si l'un des
  // deux côtés change sa règle, l'autre test échoue.
  const { readFileSync } = await import("node:fs");
  const partages = JSON.parse(readFileSync(new URL("./garde-du-code.json", import.meta.url), "utf8"));
  for (const ecran of partages.pave) assert.equal(demandeUnCode(ecran), true, ecran);
  for (const ecran of partages.pas_de_pave) assert.equal(demandeUnCode(ecran), false, ecran);
});

// --- Les fins ---------------------------------------------------------------

test("une réussite suivie d'un conseil reste une réussite", () => {
  // « Opération refusée » et la vibration d'échec, sur un argent parti : le
  // propriétaire refaisait le transfert, le bénéficiaire était payé deux fois.
  for (const ecran of [
    "Votre transfert de 5000 FCFA a JOHN DOE (677123456) a ete effectue avec succes. Pour annuler, composez *126*9#",
    "Transfer of 5000 FCFA to JOHN DOE (677123456) successful. To reverse an erroneous transfer call 8787.",
    "Retrait de 10000 FCFA effectue avec succes. En cas d'erreur, contactez le 8787.",
    "Transfert de 5000 FCFA vers 677123456 effectue avec succes. Nouveau solde: 12000 FCFA. En cas d'erreur, appelez le 8000.",
    "You have sent 5000 FCFA to JEAN 677123456. Transaction successful. To cancel, dial *126*9#.",
    "Depot de 5000 FCFA effectue. Annulation possible sous 24h.",
  ]) {
    assert.equal(lireEcran(ecran, "fini").issue, "reussie", ecran);
    const sans = lireEcran(ecran);
    assert.deepEqual([sans.attend, sans.issue], ["rien", "reussie"], ecran);
  }
  // Un code de retrait qui EXPIRE n'est pas un refus.
  assert.notEqual(lireEcran("Retrait initie. Votre code de retrait 482913 expire dans 15 min.", "fini").issue, "refusee");
  // Les vrais refus restent des refus, réussite niée comprise.
  for (const ecran of ["Transfert non effectue. Solde insuffisant.", "Transaction unsuccessful.",
                       "Solde insuffisant. Transaction annulee."]) {
    assert.equal(lireEcran(ecran, "fini").issue, "refusee", ecran);
  }
});

// --- Les pages qui se tournent ----------------------------------------------

const BASE = "Confirm: Float Transfer for FCFA 5000 To -ETABLISSEMENTS KAMDEM ET FILS "
  + "DISTRIBUTION GENERALE having mobile number 237672502815";

test("une page à tourner, sous toutes ses formes, n'est ni une fin ni une question de numéro", () => {
  for (const fin of [". 00. Next", ". Reply 00 for more", ". Tapez 00 pour la suite", " 00.Next",
                     ".00.Next", ". 00>Next", ". 00 Next>", ". 00. Page suivante", ". 00. Nxt",
                     ". 1. Yes 2. No"]) {
    const brut = BASE + fin;
    assert.equal(champPourQuestion(brut, champs), undefined, fin);
    for (const reseau of [null, "attend"] as const) {
      const e = lireEcran(brut, reseau);
      assert.equal(e.attend, "choix", `${fin} (${reseau})`);
      assert.ok(e.choix.length >= 1, fin);
    }
  }
  assert.deepEqual(lireEcran(`${BASE}. 1. Yes 2. No`).choix,
    [{ numero: "1", libelle: "Yes" }, { numero: "2", libelle: "No" }]);
  assert.equal(lireEcran(`${BASE}. Reply 00 for more`).choix[0].numero, "00");
});

test("deux choix sur une même ligne font deux boutons", () => {
  assert.deepEqual(lireEcran(`${BASE}.\n00.Next 0.Back`).choix,
    [{ numero: "00", libelle: "Next" }, { numero: "0", libelle: "Back" }]);
});

// --- Les champs qu'on remplit tout seul -------------------------------------

test("« numéro » ne remplit pas une question qui ne demande pas un téléphone", () => {
  for (const ecran of ["Enter the number of months", "Enter reference number",
                       "Entrez le numero de facture:", "Entrez le numero de compte bancaire",
                       "Enter Agent ID:"]) {
    assert.equal(champPourQuestion(ecran, champs), undefined, ecran);
    assert.notEqual(lireEcran(ecran).attend, "numero", ecran);
  }
  // Les vraies questions se remplissent toujours.
  assert.equal(champPourQuestion("Numero de l'agent :", champs)?.type, "numero");
  assert.equal(champPourQuestion("Entrez le numero du beneficiaire:", champs)?.type, "numero");
  // Et une question suivie de sa navigation aussi.
  const q = lireEcran("Entrez le montant:\n0. Retour");
  assert.equal(q.attend, "montant");
  assert.equal(champPourQuestion("Entrez le montant:\n0. Retour", champs)?.type, "montant");
});

// --- Les menus --------------------------------------------------------------

test("un libellé qui commence par un nombre reste un choix (forfaits, montants)", () => {
  const cas: [string, string[]][] = [
    ["Forfaits Internet\n1. 50 Mo 24h - 100F\n2. 1 Go 7j - 500F\n3. 10 Go 30j - 5000F\n0. Retour",
     ["1", "2", "3", "0"]],
    ["Choisissez le montant\n1. 1 000 F\n2. 25 000 F\n3. 50 000 F", ["1", "2", "3"]],
    ["Forfaits:\n1. 50 Mo\n2. 25 SMS\n3. 100 Mo\n0. Retour", ["1", "2", "3", "0"]],
    ["Choisissez:\n1. 50 000 FCFA\n2. 10 000 FCFA\n3. 5 000 FCFA", ["1", "2", "3"]],
    ["1) 50 Mo\n2) 25 SMS", ["1", "2"]],
  ];
  for (const [brut, numeros] of cas) {
    const e = lireEcran(brut, "attend");
    assert.equal(e.attend, "choix", brut);
    assert.deepEqual(e.choix.map((c) => c.numero), numeros, brut);
    // Un menu de montants ne reçoit pas le montant tout seul.
    assert.equal(champPourQuestion(brut, champs), undefined, brut);
  }
  assert.equal(demandeUnCode("Code promo\n1. 10 Go 30j\n2. 20 Go 30j"), false);
  // L'heure et la date, elles, ne sont toujours pas des choix.
  assert.equal(lireEcran("10:44\nEntrez votre code secret").attend, "secret");
  assert.equal(lireEcran("12-05-2026 10:44\nSaisissez votre code PIN").attend, "secret");
});

test("une puce et un relevé ne deviennent pas des boutons", () => {
  const puce = lireEcran("Forfaits:\n1. Jour 100F\n2. Semaine 500F\n* Prix TTC");
  assert.deepEqual(puce.choix.map((c) => c.numero), ["1", "2"]);
  const solde = lireEcran("Votre solde est de 12 500 FCFA.\n2 SMS restants\n1 Appel manque");
  assert.deepEqual([solde.attend, solde.choix.length], ["rien", 0]);
});
