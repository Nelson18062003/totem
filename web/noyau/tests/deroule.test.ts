// LE DÉROULÉ D'UNE SESSION — ce que l'écran a le droit d'envoyer, et quand.
//
// Chaque règle a son TÉMOIN : le comportement d'avant, réécrit en quelques
// lignes, qui doit échouer là où la règle tient. Les écrans d'opérateur
// sont ceux de l'audit adverse (MTN, Orange, en français et en anglais).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ATTENTE_DU_BOITIER_MS, LONGUEUR_USSD_MAX, PROLONGATION_MS,
  champAServir, codeAComposer, estUneConfirmation, etapePeutPartir,
  reponseDuBoitier, reponseLibre, reponsePrete, restantsApresReponse, texteDeReponse,
} from "../deroule";
import { champPourQuestion, demandeUnCode, lireEcran } from "../ussd";
import { remplirVariables, verdictCode } from "../codes";
import { montantSaisi, numeroSaisi } from "../saisie";

const NUMERO = { cle: "numero", type: "numero" as const };
const MONTANT = { cle: "montant", type: "montant" as const };
const PROPRES = { numero: "677998877", montant: "5000" };

// ---------------------------------------------------------------------------
// 1. Une réponse tapée part toujours.
// ---------------------------------------------------------------------------

/** LE TÉMOIN : le champ d'avant — huit chiffres pour un numéro, un montant
 *  non nul pour un montant. */
const pretAvant = (type: "numero" | "montant" | "texte", brut: string) => {
  const v = type === "numero" ? numeroSaisi(brut)
    : type === "montant" ? (montantSaisi(brut) ? String(montantSaisi(brut)) : "") : brut.trim();
  return type === "numero" ? v.length >= 8 : v.length > 0;
};

test("« 1 », « 0 », « 00 », « # », « * » partent tels quels, quel que soit le type", () => {
  for (const type of ["numero", "montant", "texte"] as const) {
    for (const r of ["1", "2", "0", "00", "98", "#", "*", "*#"]) {
      assert.equal(reponsePrete(type, r), true, `${type} « ${r} »`);
      assert.equal(reponseLibre(type, r), r, `${type} « ${r} »`);
    }
  }
  // LE TÉMOIN : l'écran d'avant refusait ces réponses.
  assert.equal(pretAvant("numero", "1"), false);
  assert.equal(pretAvant("numero", "00"), false);
  assert.equal(pretAvant("montant", "0"), false);
  assert.equal(pretAvant("montant", "#"), false);
});

test("un écran lu « numéro » qui demande en fait 1 ou 2 : on peut répondre 1", () => {
  const ecran = "Please confirm the recipient phone 677998877 is correct (1=Yes 2=No):";
  const type = lireEcran(ecran, "attend").attend;
  assert.equal(type, "numero");        // la lecture se trompe de type…
  assert.equal(reponsePrete(type, "1"), true);   // …et ne bloque plus rien
  assert.equal(pretAvant(type, "1"), false);     // témoin
});

test("un numéro collé avec « +237 » part propre ; ce qu'on ne sait pas nettoyer part tel quel", () => {
  assert.equal(reponseLibre("numero", "+237 6 77 99 88 77"), "677998877");
  assert.equal(reponseLibre("montant", "5 000 FCFA"), "5000");
  assert.equal(reponseLibre("numero", "oui"), "oui");
  assert.equal(reponseLibre("montant", "annuler"), "annuler");
  assert.equal(reponseLibre("texte", "  MBALLA  "), "MBALLA");
  assert.equal(reponsePrete("numero", "   "), false);
});

// ---------------------------------------------------------------------------
// 2. Répondre tout seul : jamais à une confirmation.
// ---------------------------------------------------------------------------

/** LE TÉMOIN : `derouler` d'avant — `champPourQuestion` seul. */
const servirAvant = <T extends { type: "numero" | "montant" }>(texte: string, restants: T[]) =>
  demandeUnCode(texte) ? undefined : champPourQuestion(texte, restants);

test("les vraies questions se servent toutes seules", () => {
  assert.equal(champAServir({ texte: "Entrez le numero du beneficiaire:", reseau: "attend" },
                            [NUMERO, MONTANT], PROPRES), NUMERO);
  assert.equal(champAServir({ texte: "Entrez le montant:", reseau: "attend" },
                            [MONTANT], PROPRES), MONTANT);
  assert.equal(champAServir({ texte: "Enter amount" }, [MONTANT], PROPRES), MONTANT);
  assert.equal(champAServir({ texte: "Enter recipient number:" }, [NUMERO], PROPRES), NUMERO);
});

test("une confirmation qui NOMME le montant ou le numéro ne les reçoit pas", () => {
  const cas: [string, typeof NUMERO | typeof MONTANT][] = [
    ["Transfert de 5000 FCFA a JEAN DUPONT. Montant total: 5050 FCFA. Repondez 1 pour confirmer, 2 pour annuler", MONTANT],
    ["Confirm transfer of FCFA 5000 to JEAN DUPONT, mobile number 677998877? Reply 1 to confirm", NUMERO],
    ["Confirm transfer of FCFA 5000 to JEAN DUPONT mobile number 677998877?", NUMERO],
    ["Please confirm the recipient phone 677998877 is correct (1=Yes 2=No):", NUMERO],
  ];
  for (const [texte, champ] of cas) {
    assert.equal(champAServir({ texte, reseau: "attend" }, [champ], PROPRES), undefined, texte);
    // LE TÉMOIN : l'ancien déroulé y répondait tout seul.
    assert.equal(servirAvant(texte, [champ]), champ, `témoin : ${texte}`);
  }
});

test("une question qui nomme le montant ne reçoit pas le numéro, même s'il reste seul", () => {
  const texte = "Entrez le montant a envoyer au beneficiaire:";
  assert.equal(champAServir({ texte }, [NUMERO], PROPRES), undefined);
  assert.equal(servirAvant(texte, [NUMERO]), NUMERO);   // témoin
});

test("le réseau a fermé, ou c'est le code : rien ne part tout seul", () => {
  assert.equal(champAServir({ texte: "Entrez le numero:", reseau: "fini" }, [NUMERO], PROPRES), undefined);
  assert.equal(champAServir({ texte: "Entrez votre code secret:" }, [NUMERO], PROPRES), undefined);
  assert.equal(champAServir({ texte: "Entrez le numero:" }, [NUMERO], {}), undefined);
});

test("un écran qui porte déjà la valeur la récapitule", () => {
  assert.equal(champAServir({ texte: "Montant 5 000 FCFA vers 677998877. Entrez le montant:" },
                            [MONTANT], PROPRES), undefined);
  assert.equal(estUneConfirmation("Entrez le montant:"), false);
  assert.equal(estUneConfirmation("1. Confirmer\n2. Annuler"), true);
});

// ---------------------------------------------------------------------------
// 3. Une réponse tapée à la main consomme la question.
// ---------------------------------------------------------------------------

test("question ambiguë, réponse à la main, puis confirmation : rien ne part tout seul", () => {
  const question = { texte: "Entrez le montant a envoyer au beneficiaire:", reseau: "attend" as const };
  assert.equal(champAServir(question, [NUMERO, MONTANT], PROPRES), undefined);  // à vous
  const restants = restantsApresReponse(question, [NUMERO, MONTANT], PROPRES, "5000");
  assert.equal(restants.some((c) => c.cle === "montant"), false);
  const confirmation = "Transfert de 5000 FCFA a JEAN DUPONT. Montant total: 5050 FCFA. "
    + "Repondez 1 pour confirmer, 2 pour annuler";
  assert.equal(champAServir({ texte: confirmation, reseau: "attend" }, restants, PROPRES), undefined);
  // LE TÉMOIN : avant, le montant restait à servir et partait sur la confirmation.
  assert.equal(servirAvant(confirmation, [NUMERO, MONTANT]), MONTANT);
});

test("un choix de menu ne consomme rien : la vraie question vient après", () => {
  const menu = { texte: "Transfert d'argent\n1. Vers un numero MTN\n2. Vers un autre reseau" };
  assert.deepEqual(restantsApresReponse(menu, [NUMERO, MONTANT], PROPRES, "1"), [NUMERO, MONTANT]);
  assert.equal(champAServir({ texte: "Entrez le numero du beneficiaire:" },
    restantsApresReponse(menu, [NUMERO, MONTANT], PROPRES, "1"), PROPRES), NUMERO);
});

// ---------------------------------------------------------------------------
// 4. Un trajet appris ne se rejoue pas à l'aveugle.
// ---------------------------------------------------------------------------

/** LE TÉMOIN : la boucle d'avant n'arrêtait que sur un échec du boîtier. */
const etapeAvant = (_g: string, ecran: { texte: string } | null) => ecran != null;

test("le choix part quand le menu le propose", () => {
  const menu = { texte: "MTN MoMo\n1. Transfert d'argent\n2. Retrait\n3. Paiement", reseau: "attend" as const };
  assert.equal(etapePeutPartir("1", menu), true);
  assert.equal(etapePeutPartir("3", menu), true);
  const page = { texte: "Confirm: Float Transfer for FCFA 5000 To -ETS KAMDEM having mobile number 237670000123.\n00. Next", reseau: "attend" as const };
  assert.equal(etapePeutPartir("00", page), true);
});

test("session fermée, menu changé, code demandé : on s'arrête", () => {
  const ferme = { texte: "Service temporairement indisponible", reseau: "fini" as const };
  const autreMenu = { texte: "MTN MoMo\n1. Mon compte\n2. Retrait", reseau: "attend" as const };
  const code = { texte: "Entrez votre code secret:", reseau: "attend" as const };
  assert.equal(etapePeutPartir("1", ferme), false);
  assert.equal(etapePeutPartir("4", autreMenu), false);
  assert.equal(etapePeutPartir("{numero}", code), false);
  assert.equal(etapePeutPartir("1", code), false);
  // Un vieux boîtier, sans `reseau` : le texte d'une fin suffit à s'arrêter.
  assert.equal(etapePeutPartir("1", { texte: "Service temporairement indisponible" }), false);
  // LE TÉMOIN : l'ancienne boucle envoyait dans les quatre cas.
  for (const e of [ferme, autreMenu, code]) assert.equal(etapeAvant("1", e), true);
});

test("un trou part sur une question de son type, jamais sur une confirmation", () => {
  assert.equal(etapePeutPartir("{numero}", { texte: "Entrez le numero du beneficiaire:" }), true);
  assert.equal(etapePeutPartir("{montant}", { texte: "Entrez le montant:" }), true);
  assert.equal(etapePeutPartir("{montant}", { texte: "Entrez le numero du beneficiaire:" }), false);
  assert.equal(etapePeutPartir("{numero}", {
    texte: "Confirm transfer of FCFA 5000 to JEAN DUPONT mobile number 677998877?" }), false);
});

// ---------------------------------------------------------------------------
// 5. Ce que le boîtier rend n'est pas toujours l'opérateur.
// ---------------------------------------------------------------------------

test("un refus du boîtier est un message de TOTEM, pas un écran de l'opérateur", () => {
  const refus = reponseDuBoitier({ etat: "echouee",
    resultat: "Le terminal n'a pas pu faire : Pas de réponse USSD du réseau (délai dépassé)." });
  assert.equal(refus?.genre, "refus");
  // LE TÉMOIN : lu comme un écran, il passait pour une réponse de l'opérateur.
  assert.equal(lireEcran(refus!.texte).attend, "rien");
  assert.equal(lireEcran(refus!.texte).issue, null);
});

test("une réponse vide reste vide — on ne prête pas « (réponse vide) » à l'opérateur", () => {
  assert.deepEqual(reponseDuBoitier({ etat: "faite", resultat: "", reseau: "attend" }),
                   { genre: "ecran", texte: "", reseau: "attend" });
  assert.deepEqual(reponseDuBoitier({ etat: "faite", resultat: null }),
                   { genre: "ecran", texte: "", reseau: undefined });
  assert.equal(reponseDuBoitier({ etat: "en_cours" }), null);
  // Un écran vide sur une session ouverte se répond, il ne se « termine » pas.
  assert.equal(lireEcran("", "attend").attend, "texte");
});

// ---------------------------------------------------------------------------
// 6. L'écran attend plus longtemps que le boîtier — relu dans le robot.
// ---------------------------------------------------------------------------

const ICI = dirname(fileURLToPath(import.meta.url));
const lirePython = (fichier: string) => readFileSync(join(ICI, "../../../totem", fichier), "utf8");
const constante = (source: string, nom: string) => {
  const m = new RegExp(`^${nom}\\s*=\\s*([\\d.]+)`, "m").exec(source);
  assert.ok(m, `${nom} introuvable dans le robot`);
  return Number(m![1]);
};

test("l'écran n'abandonne pas avant que le boîtier ait pu entendre le réseau", () => {
  const pilotage = lirePython("pilotage.py");
  const modem = lirePython("modem.py");
  const delaiModem = Number(/def _attendre_cusd\(self, delai=(\d+)\)/.exec(modem)?.[1]);
  assert.ok(delaiModem > 0, "délai du modem introuvable");
  const releve = Math.max(constante(pilotage, "PAS_REPOS"), constante(pilotage, "PAS_SESSION"));
  const effacement = 3 * 0.5;              // trois essais d'effacement du code
  const besoin = (delaiModem + releve + effacement + 5) * 1000;   // + aller-retours
  assert.ok(ATTENTE_DU_BOITIER_MS >= besoin,
            `l'écran attend ${ATTENTE_DU_BOITIER_MS} ms, le boîtier peut en prendre ${besoin}`);
  // LE TÉMOIN : les 30 s d'avant ne couvraient pas le boîtier.
  assert.ok(30_000 < besoin);
  // Et après une annulation refusée, il relit jusqu'à ce que la demande ne
  // puisse plus aboutir (trop vieille pour être composée, puis le modem).
  const perimee = constante(pilotage, "DEMANDE_PERIMEE_S");
  assert.ok(ATTENTE_DU_BOITIER_MS + PROLONGATION_MS >= (perimee + delaiModem) * 1000);
});

// ---------------------------------------------------------------------------
// 7. Ce qui part au boîtier se refuse, il ne se coupe pas.
// ---------------------------------------------------------------------------

/** LE TÉMOIN : le nettoyage d'avant, dans la route. */
const nettoyageAvant = (code: string) => code.replace(/[^0-9#*]/g, "").slice(0, 32);

test("un raccourci valide à trois trous part ENTIER, ou pas du tout", () => {
  const gabarit = "#150*4*{point}*{numero}*{montant}#";
  assert.equal(verdictCode([gabarit]).ok, true);
  const { etapes } = remplirVariables([gabarit],
    { point: "699112233", numero: "677998877", montant: "250000" });
  assert.equal(etapes[0], "#150*4*699112233*677998877*250000#");
  assert.deepEqual(codeAComposer(etapes[0]), { code: "#150*4*699112233*677998877*250000#" });
  // LE TÉMOIN : 250 000 devenait 25 000, sans « # ».
  assert.equal(nettoyageAvant(etapes[0]), "#150*4*699112233*677998877*25000");
});

test("trop long, mal formé, vide : refusé avec sa raison, jamais coupé", () => {
  assert.deepEqual(codeAComposer("*126#".padEnd(LONGUEUR_USSD_MAX + 1, "1")), { refus: "codeTropLong" });
  assert.deepEqual(codeAComposer("*126*1*{numero}#"), { refus: "codeMalForme" });
  assert.deepEqual(codeAComposer("126"), { refus: "codeMalForme" });
  assert.deepEqual(codeAComposer("   "), { refus: "codeVide" });
  assert.deepEqual(codeAComposer(" *126# "), { code: "*126#" });
  assert.deepEqual(codeAComposer("#150#"), { code: "#150#" });
  // Les réponses : nettoyées des caractères qui injecteraient au modem,
  // refusées au-delà d'un écran — jamais coupées.
  assert.deepEqual(texteDeReponse('1"\r\nAT+CMGD=1,4'), { texte: "1AT+CMGD=1,4" });
  assert.deepEqual(texteDeReponse("x".repeat(LONGUEUR_USSD_MAX + 1)), { refus: "reponseTropLongue" });
  assert.deepEqual(texteDeReponse("x".repeat(150)), { texte: "x".repeat(150) });
});
