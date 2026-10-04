// LE RELEVÉ DE COMPTE — ce qu'il porte, ce qu'il compte, ce qu'il laisse dehors.
//
// Un relevé SORT de TOTEM : il part chez un comptable, une banque. Les
// erreurs qui guettent ne se voient pas à l'écran — un code de connexion
// glissé dans le fichier, un sens inconnu rangé en entrée, un solde
// « calculé » présenté comme annoncé, une période passée lue sur les lignes
// d'aujourd'hui. Les données sont DURES à dessein : des noms de soixante-
// quinze caractères, des montants décimaux d'Orange, deux cartes du même
// opérateur.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bornesDuChoix, bornesPourLaBase, dernierSoldeAvant, estMouvement, jourEnLettres,
  lignesDuReleve, montantReleve, nomDuReleve, parJour, periodeDuReleve, periodeEnLettres,
  sectionDuReleve, soldesDuReleve, totauxDuReleve, type CarteDuReleve, type Releve,
} from "../releve";
import { totauxDe } from "../periodes";
import { jourLocal, type Paiement } from "../types";

const DOUALA = "Africa/Douala";
const NOM_LONG = "STE. NOUVELLE BRASSERIE DU LITTORAL ET DES HAUTS PLATEAUX DE L'OUEST SARL";
const MTN_A = "89237010000000008901";
const MTN_B = "89237010000000009999";

let suivant = 1;
/** Un SMS comme la plateforme le rend. `quand` : l'heure qui fait foi. */
function sms(p: Partial<Paiement> & { quand: string }): Paiement {
  const id = suivant++;
  return {
    id: String(id), sim: "MTN ·8901", carte: MTN_A, sens: "in", nom: "MTNMobileMoney",
    tiers: "", numero: "", montant: 1000, heure: "10:00", date: "",
    jour: jourLocal(new Date(p.quand), DOUALA), recuLe: p.quand,
    categorie: "encaissement", nature: null, reference: `REF-${id}`, soldeApres: null,
    smsBrut: "", recu: null, sourceId: id, terminal: "douala", nonLu: false, ...p,
  };
}

test("le relevé ne porte QUE l'argent — jamais un code, une publicité, un solde, un échec", () => {
  const b = { de: "2026-03-01", a: "2026-03-31" };
  const tous = [
    sms({ quand: "2026-03-02T09:00:00Z", montant: 5000 }),
    sms({ quand: "2026-03-02T09:05:00Z", categorie: "code", montant: null, sens: "?",
          smsBrut: "Votre code de confirmation est 483921." }),
    sms({ quand: "2026-03-02T09:06:00Z", categorie: "publicite", montant: null, sens: "?" }),
    sms({ quand: "2026-03-02T09:07:00Z", categorie: "solde", montant: null, sens: "?",
          soldeApres: 40000 }),
    sms({ quand: "2026-03-02T09:08:00Z", categorie: "echec", montant: 3000, sens: "out" }),
    // Une consultation classée « solde » à la main n'est pas un mouvement.
    sms({ quand: "2026-03-02T09:09:00Z", categorie: "encaissement", nature: "solde" }),
    sms({ quand: "2026-03-03T09:00:00Z", categorie: "retrait", sens: "out", montant: 2000 }),
  ];
  const lignes = lignesDuReleve(tous, b);
  assert.deepEqual(lignes.map((l) => l.categorie), ["encaissement", "retrait"]);
  assert.ok(!JSON.stringify(lignes).includes("483921"));
  // LE TÉMOIN : la règle de l'écran (`totauxDe`) compte TOUT ce qu'on lui
  // donne — le code et la publicité compris. C'est juste pour une liste de
  // SMS ; pour un relevé, c'est un code chez le comptable.
  assert.equal(totauxDe(tous).nombre, 7);
  assert.equal(totauxDuReleve(lignes).nombre, 2);
});

test("un sens inconnu se montre, ne compte nulle part, et se dénombre", () => {
  const lignes = [
    sms({ quand: "2026-03-02T09:00:00Z", sens: "in", montant: 2784137.6 }),
    sms({ quand: "2026-03-02T10:00:00Z", sens: "in", montant: 0.1 }),
    sms({ quand: "2026-03-02T11:00:00Z", sens: "in", montant: 0.2 }),
    sms({ quand: "2026-03-02T12:00:00Z", sens: "out", montant: 5000, frais: 100,
          categorie: "envoi" }),
    sms({ quand: "2026-03-02T13:00:00Z", sens: "?", montant: 9999, frais: 50,
          categorie: "transfert" }),
  ];
  const t = totauxDuReleve(lignes);
  // Au centime près : 2 784 137,6 + 0,1 + 0,2 = 2 784 137,9 — pas 2784137.9000000004.
  assert.equal(t.entrees, 2784137.9);
  assert.equal(t.sorties, 5000);
  assert.equal(t.frais, 100, "les frais d'une ligne de sens inconnu ne comptent pas non plus");
  assert.equal(t.inconnus, 1);
  assert.equal(t.nombre, 5);
});

test("les soldes se LISENT : ouverture d'avant, clôture de la période, « non connu » sinon", () => {
  const b = { de: "2026-03-01", a: "2026-03-31" };
  const avant = [
    sms({ quand: "2026-02-20T09:00:00Z", soldeApres: 10000 }),
    sms({ quand: "2026-02-27T09:00:00Z", soldeApres: 12000 }),
    // Relevé en mars, émis le 28 février : il compte pour AVANT.
    sms({ quand: "2026-02-28T22:30:00Z", soldeApres: 12500 }),
  ];
  const pendant = [
    sms({ quand: "2026-03-02T09:00:00Z", montant: 1000, soldeApres: 13500 }),
    sms({ quand: "2026-03-05T09:00:00Z", categorie: "solde", montant: null, sens: "?",
          soldeApres: 13500 }),
  ];
  assert.equal(dernierSoldeAvant([...avant, ...pendant], b.de), 12500);
  const t = totauxDuReleve(lignesDuReleve(pendant, b));
  const s = soldesDuReleve(pendant, 12500, t);
  assert.deepEqual(s, { ouverture: 12500, cloture: 13500, ecart: 0 });
  // Une carte qui n'a jamais annoncé de solde : non connu, JAMAIS zéro.
  const muette = soldesDuReleve([sms({ quand: "2026-03-02T09:00:00Z" })], null, t);
  assert.deepEqual(muette, { ouverture: null, cloture: null, ecart: null });
  // Un rapprochement qui ne tombe pas juste se MONTRE.
  assert.equal(soldesDuReleve(pendant, 12000, t).ecart, 500);
});

test("deux cartes du même opérateur restent deux relevés", () => {
  const b = { de: "2026-03-01", a: "2026-03-31" };
  const carte = (iccid: string, numero: string): CarteDuReleve => ({
    iccid, numero, operateur: "MTN", service: "MTN Mobile Money", nom: "", libelle: "MTN",
  });
  const tous = [
    sms({ quand: "2026-03-02T09:00:00Z", carte: MTN_A, montant: 1000 }),
    sms({ quand: "2026-03-02T09:00:00Z", carte: MTN_B, montant: 7000 }),
    sms({ quand: "2026-03-03T09:00:00Z", carte: MTN_B, montant: 3000 }),
  ];
  const a = sectionDuReleve(carte(MTN_A, "677123456"), tous, b, null, false);
  const bb = sectionDuReleve(carte(MTN_B, "677000999"), tous, b, null, false);
  assert.equal(a.totaux.entrees, 1000);
  assert.equal(bb.totaux.entrees, 10000);
  assert.deepEqual(parJour(bb.lignes).map((j) => [j.jour, j.entrees]),
                   [["2026-03-02", 7000], ["2026-03-03", 3000]]);
});

test("la période : remise dans l'ordre, arrêtée à aujourd'hui, une année au plus", () => {
  assert.deepEqual(periodeDuReleve("2026-03-31", "2026-01-01", "2026-10-04"),
                   { de: "2026-01-01", a: "2026-03-31" });
  assert.deepEqual(periodeDuReleve("2026-10-01", "2026-12-31", "2026-10-04"),
                   { de: "2026-10-01", a: "2026-10-04" });
  assert.equal(periodeDuReleve("2026-10-05", "2026-10-06", "2026-10-04"), null);
  assert.equal(periodeDuReleve("2026-02-30", "2026-03-01", "2026-10-04"), null);
  assert.equal(periodeDuReleve("2026-1-1", "2026-03-01", "2026-10-04"), null);
  assert.ok(periodeDuReleve("2025-10-04", "2026-10-04", "2026-10-04"), "366 jours passent");
  assert.equal(periodeDuReleve("2025-10-03", "2026-10-04", "2026-10-04"), null);
});

test("les périodes toutes faites, même en janvier", () => {
  assert.deepEqual(bornesDuChoix("mois", "2026-01-15"), { de: "2026-01-01", a: "2026-01-15" });
  assert.deepEqual(bornesDuChoix("moisDernier", "2026-01-15"),
                   { de: "2025-12-01", a: "2025-12-31" });
  assert.deepEqual(bornesDuChoix("moisDernier", "2026-03-01"),
                   { de: "2026-02-01", a: "2026-02-28" });
  assert.deepEqual(bornesDuChoix("troisMois", "2026-02-10"),
                   { de: "2025-12-01", a: "2026-02-10" });
});

test("les mots : le mois en toutes lettres, le « 1er », les montants entiers", () => {
  assert.equal(jourEnLettres("2026-01-01", "fr"), "1er janvier 2026");
  assert.equal(jourEnLettres("2026-03-31", "en"), "31 March 2026");
  assert.equal(periodeEnLettres({ de: "2026-01-01", a: "2026-03-31" }, "fr"),
               "du 1er janvier 2026 au 31 mars 2026");
  assert.equal(periodeEnLettres({ de: "2026-08-03", a: "2026-08-03" }, "fr"), "le 3 août 2026");
  assert.equal(montantReleve(2784137.6, "fr"), "2 784 137,60");
  assert.equal(montantReleve(4231500, "en"), "4,231,500");
  assert.equal(montantReleve(-500, "fr"), "-500");
  assert.equal(nomDuReleve("677123456", { de: "2026-01-01", a: "2026-03-31" }, "pdf"),
               "Releve-677123456-2026-01-01_2026-03-31.pdf");
  assert.equal(nomDuReleve("Orange ·7777", { de: "2026-01-01", a: "2026-01-31" }, "csv"),
               "Releve-Orange-7777-2026-01-01_2026-01-31.csv");
});

// LA BORNE DE FIN. La base rend ses lignes de la plus récente à la plus
// ancienne, et s'arrête au plafond. Sans borne de fin, une période PASSÉE lue
// sur une caisse chargée gardait les lignes d'AUJOURD'HUI — celles qui sont
// hors de la période. Ici, une base jouée en mémoire : six mois à quarante
// encaissements par jour, un plafond de 3 000 lignes.
test("une période passée se lit avec sa borne de fin — et sans elle, se perd (témoin)", () => {
  const maintenant = Date.parse("2026-10-04T12:00:00Z");
  const base: Paiement[] = [];
  for (let j = 0; j < 180; j++) {
    for (let k = 0; k < 40; k++) {
      base.push(sms({ quand: new Date(maintenant - j * 86_400_000 - k * 1_200_000).toISOString() }));
    }
  }
  const PLAFOND = 3000;
  const lire = (depuis: string, jusqua?: string) => base
    .filter((p) => p.recuLe >= depuis && (!jusqua || p.recuLe < jusqua))
    .sort((a, b) => (a.recuLe < b.recuLe ? 1 : -1))
    .slice(0, PLAFOND);
  const b = { de: "2026-06-06", a: "2026-07-06" };
  const verite = base.filter((p) => p.jour >= b.de && p.jour <= b.a).length;
  assert.equal(verite, 31 * 40);
  const { depuis, jusqua } = bornesPourLaBase(b);
  assert.equal(lignesDuReleve(lire(depuis, jusqua), b).length, verite);
  // LE TÉMOIN : la même lecture sans la borne de fin. Elle doit perdre la
  // période — sinon ce test ne prouverait rien de la borne.
  assert.ok(lignesDuReleve(lire(depuis), b).length < verite / 2);
});

// --- Les documents, lus ---------------------------------------------------------

/** Les chaînes d'un PDF non compressé, dans l'ordre où elles sont écrites. */
function chaines(pdf: Uint8Array): string[] {
  // WinAnsi range l'apostrophe typographique en 0x92 ; le décodeur « latin1 »
  // de Node la laisse en caractère de contrôle.
  const brut = new TextDecoder("latin1").decode(pdf).replace(/\x92/g, "’");
  return [...brut.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((m) => m[1].replace(/\\(.)/g, "$1"));
}

function releveDEssai(): Releve {
  const b = { de: "2026-03-01", a: "2026-03-31" };
  const tous: Paiement[] = [
    sms({ quand: "2026-02-27T09:00:00Z", soldeApres: 50000 }),
  ];
  for (let i = 0; i < 160; i++) {
    tous.push(sms({
      quand: new Date(Date.parse("2026-03-01T06:00:00Z") + i * 4 * 3_600_000).toISOString(),
      montant: 1000 + i, soldeApres: 50000 + i, reference: `PP2603.${1000 + i}.A31245X7`,
      tiers: i === 7 ? NOM_LONG : "MAMA CLARISSE", numero: "677998877",
    }));
  }
  tous.push(sms({ quand: "2026-03-10T09:00:00Z", categorie: "code", montant: null, sens: "?",
                  smsBrut: "Votre code de confirmation est 483921." }));
  tous.push(sms({ quand: "2026-03-11T09:00:00Z", tiers: '=HYPERLINK("http://vol.example")',
                  reference: "PIEGE-1" }));
  const carte: CarteDuReleve = { iccid: MTN_A, numero: "677123456", operateur: "MTN",
    service: "MTN Mobile Money", nom: "ETS NKENGAFAC", libelle: "MTN ·8901" };
  return { bornes: b, editeLe: "2026-04-01T10:00:00Z", fuseau: DOUALA, langue: "fr",
           tout: false, sections: [sectionDuReleve(carte, tous, b, null, false)] };
}

test("le PDF : plusieurs pages, numérotées, chaque référence UNE fois, le nom ENTIER", async () => {
  const { pdfReleve } = await import("../../lib/pdf-releve");
  const r = releveDEssai();
  const pdf = pdfReleve(r);
  const brut = new TextDecoder("latin1").decode(pdf);
  assert.ok(brut.startsWith("%PDF-"));
  const pages = Number(/\/Count (\d+)/.exec(brut)?.[1]);
  assert.ok(pages > 2, `${pages} pages`);
  const s = chaines(pdf);
  assert.ok(s.includes(`page ${pages}/${pages}`));
  assert.ok(s.includes("677 12 34 56"), "le numéro de la carte, en tranches");
  assert.ok(s.includes("du 1er mars 2026 au 31 mars 2026"));
  for (const l of r.sections[0].lignes) {
    const n = s.filter((x) => x === l.reference).length;
    assert.equal(n, 1, `${l.reference} écrite ${n} fois`);
  }
  // LE NOM ENTIER : il passe à la ligne, ses morceaux se suivent.
  const nomEntier = (lignes: string[]) => lignes.join(" ").includes(NOM_LONG);
  assert.ok(nomEntier(s), "le nom de 75 caractères est là, entier");
  // LE TÉMOIN : le même contrôle sur un document qui coupe à 40 caractères
  // doit échouer — sinon il ne garde rien.
  assert.ok(!nomEntier(["MAMA CLARISSE", `${NOM_LONG.slice(0, 40)}…`, "677 99 88 77"]));
  assert.ok(!s.join(" ").includes("483921"), "aucun code dans le PDF");
  assert.ok(s.includes("50 000 FCFA"), "l'ouverture LUE avant la période");
  // L'apostrophe du dictionnaire passe : « Solde d?ouverture » s'imprimait
  // tant que le PDF ne connaissait que le latin-1.
  assert.ok(s.includes("Solde d’ouverture"), "l'apostrophe typographique s'imprime");
  assert.ok(s.some((x) => x.startsWith("Établi d’après les SMS")), "le pied");
  // Les totaux imprimés sont ceux du noyau.
  const t = r.sections[0].totaux;
  assert.ok(s.includes(`${montantReleve(t.entrees, "fr")} FCFA`));
});

test("le PDF d'une carte sans numéro ni solde : il le DIT, et n'écrit pas 0", async () => {
  const { pdfReleve } = await import("../../lib/pdf-releve");
  const b = { de: "2026-03-01", a: "2026-03-31" };
  const carte: CarteDuReleve = { iccid: "89237020000000007777", numero: "",
    operateur: "Orange", service: "Orange Money", nom: "", libelle: "Orange ·7777" };
  const section = sectionDuReleve(carte,
    [sms({ quand: "2026-03-02T09:00:00Z", carte: carte.iccid, sens: "?", montant: 5000,
           categorie: "transfert" })], b, null, false);
  const s = chaines(pdfReleve({ bornes: b, editeLe: "2026-04-01T10:00:00Z", fuseau: DOUALA,
    langue: "fr", tout: true, sections: [section] }));
  assert.ok(s.includes("numéro non renseigné".normalize()));
  assert.ok(s.includes("89237020000000007777"), "l'ICCID désigne la carte");
  assert.equal(s.filter((x) => x === "non connu").length >= 2, true);
  // Le sens inconnu : montré, compté à part, dans aucun total.
  assert.deepEqual([section.totaux.entrees, section.totaux.sorties, section.totaux.inconnus],
                   [0, 0, 1]);
  assert.ok(s.includes("Récapitulatif par numéro"));
});

test("le CSV : les mêmes lignes, une formule désamorcée, aucun code", async () => {
  const { csvReleve } = await import("../../lib/releve-csv");
  const r = releveDEssai();
  const csv = csvReleve(r);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(!csv.includes("483921"));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://vol.example"")"`), "la formule est désamorcée");
  const lignes = csv.split("\r\n").filter((l) => /^\d{4}-\d{2}-\d{2};/.test(l));
  assert.equal(lignes.length, r.sections[0].lignes.length);
  assert.ok(csv.includes(`entrees;${r.sections[0].totaux.entrees}`));
  assert.ok(csv.includes("numero;677 12 34 56"));
  assert.ok(csv.includes(`solde_ouverture;50000`));
  assert.ok(!csv.includes("RELEVÉ INCOMPLET"), "pas de coupe, pas d'annonce de coupe");
  const coupe = csvReleve({ ...r, sections: [{ ...r.sections[0], tronque: true }] });
  assert.ok(coupe.slice(1).replace(/^"/, "").startsWith("RELEVÉ INCOMPLET"), "la coupe se dit en tête");
});

test("un mouvement se reconnaît à son montant ET à sa nature", () => {
  assert.equal(estMouvement({ categorie: "encaissement", nature: null, montant: null }), false);
  assert.equal(estMouvement({ categorie: "message", nature: "depot", montant: 5000 }), true);
});
