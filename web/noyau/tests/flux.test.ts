// Le module Flux : une journée d'agent, inventée, dont les soldes se suivent
// au franc près — sauf un écart voulu de 100 000 F.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fluxDe, totauxFlux, etatDesCartes, parJour, correspondFlux, dansFamille, typeDe } from "../flux";
import type { Paiement } from "../types";

let n = 0;
function sms(o: Partial<Paiement> & { heure: string }): Paiement {
  n++;
  return {
    id: String(n), sim: "MTN ·0001", carte: "8923701", sens: "?", nom: "", tiers: "", numero: "",
    montant: null, date: "Aujourd’hui", jour: "2026-10-12",
    recuLe: `2026-10-12T${o.heure}:00+01:00`, categorie: "message", nature: null, reference: "",
    soldeApres: null, frais: null, commission: null, smsBrut: "", recu: null, sourceId: n,
    terminal: "t", nonLu: false, ...o,
  };
}
const ORANGE = { sim: "Orange ·0002", carte: "8923702" };

const JOURNEE: Paiement[] = [
  sms({ heure: "08:30", categorie: "solde", soldeApres: 911_230 }),
  sms({ heure: "08:58", categorie: "retrait", sens: "in", montant: 75_000, tiers: "ABENA Rose", soldeApres: 986_230, commission: 375 }),
  sms({ heure: "09:20", categorie: "depot", sens: "out", montant: 50_000, tiers: "ESSOMBA Paul", soldeApres: 936_230, commission: 250 }),
  sms({ heure: "09:41", categorie: "echec", montant: 1_000_000, soldeApres: null }),
  sms({ heure: "10:05", categorie: "encaissement", sens: "in", montant: 25_000, tiers: "MBARGA Jean", soldeApres: 861_230 }),
  sms({ heure: "11:20", categorie: "depot", sens: "out", montant: 120_000, tiers: "NGO NDJOCK Clarisse", soldeApres: 741_230, commission: 600 }),
  sms({ heure: "13:47", categorie: "envoi", sens: "out", montant: 200_000, tiers: "ETS. BIYONG & FILS SARL", soldeApres: 541_230 }),
  sms({ heure: "14:05", categorie: "retrait", sens: "in", montant: 300_000, tiers: "TCHOUA Marc", numero: "677000009", soldeApres: 841_230, commission: 1_300, reference: "10000000001" }),
  sms({ heure: "14:32", categorie: "depot", sens: "out", montant: 50_000, tiers: "OWONA Brigitte", soldeApres: 791_230, commission: 250 }),
  sms({ heure: "07:50", categorie: "solde", soldeApres: 2_600_137.6, ...ORANGE }),
  sms({ heure: "12:10", categorie: "transfert", sens: "?", montant: 184_000, tiers: "BOUTIQUE MBALLA → KOUAM Serge", soldeApres: 2_784_137.6, ...ORANGE }),
  sms({ heure: "12:40", categorie: "retrait", sens: "in", montant: 500_000, tiers: "KAMGA Albert", ...ORANGE }),
  sms({ heure: "09:00", categorie: "code", smsBrut: "Votre code est 483921" }),
  sms({ heure: "09:05", categorie: "publicite" }),
];

test("seules les transactions sont listées, de la plus récente à la plus ancienne", () => {
  const f = fluxDe(JOURNEE);
  assert.equal(f.length, 10);                       // 9 + l'échouée ; ni code, ni pub, ni consultation
  assert.deepEqual(f.map((x) => x.p.heure).slice(0, 3), ["14:32", "14:05", "13:47"]);
});

test("le type se dit du point de vue de la carte d'agent", () => {
  const f = fluxDe(JOURNEE);
  const de = (h: string) => f.find((x) => x.p.heure === h)!;
  assert.equal(de("09:20").type, "depot_client");
  assert.equal(de("09:20").effet, -50_000);
  assert.equal(de("08:58").type, "retrait_client");
  assert.equal(de("08:58").effet, 75_000);
  assert.equal(de("12:10").type, "transfert_inconnu");
  assert.equal(de("12:10").effet, null);
  assert.equal(de("12:10").etat, "a_verifier");
  assert.equal(de("09:41").etat, "echouee");
  assert.equal(typeDe({ categorie: "depot", nature: null, sens: "in" }), "depot_recu");
});

test("les totaux : échouées dehors, à vérifier à part, commissions à part", () => {
  const t = totauxFlux(fluxDe(JOURNEE));
  assert.equal(t.entrees, 900_000);
  assert.equal(t.sorties, 420_000);
  assert.equal(t.aVerifier, 1);
  assert.equal(t.nombre, 9);
  assert.equal(t.commissions, 2_775);
});

test("la suite des soldes : ✓ quand ça tombe juste, l'écart à sa place sinon", () => {
  const f = fluxDe(JOURNEE);
  const de = (h: string) => f.find((x) => x.p.heure === h)!;
  assert.equal(de("08:58").verdict, "suit");
  assert.equal(de("09:20").verdict, "suit");
  assert.equal(de("10:05").verdict, "rupture");
  assert.deepEqual(de("10:05").ecartAvant, { montant: -100_000, depuis: "09:20", depuisJour: "2026-10-12", jusqua: "10:05" });
  assert.equal(de("14:32").verdict, "suit");
  assert.equal(de("12:40").verdict, "sans_solde");
  // Le solde d'avant est CALCULÉ, à partir du solde annoncé après.
  assert.equal(de("14:05").soldeAvantCalcule, 541_230);
});

test("une seule ligne au sens inconnu : les soldes proposent, ils ne décident pas", () => {
  const f = fluxDe(JOURNEE);
  const t = f.find((x) => x.p.heure === "12:10")!;
  assert.equal(t.lesSoldesDisent, "in");
  assert.equal(t.effet, null);                     // rien n'est compté sans décision
});

test("l'état des cartes : le dernier solde ANNONCÉ, et les écarts", () => {
  const f = fluxDe(JOURNEE);
  const e = etatDesCartes(JOURNEE, f);
  assert.equal(e.get("8923701")!.solde, 791_230);
  assert.equal(e.get("8923701")!.heure, "14:32");
  assert.equal(e.get("8923701")!.ecarts, 1);
  assert.equal(e.get("8923701")!.suitDepuis, "11:20");
  assert.equal(e.get("8923702")!.solde, 2_784_137.6);
});

test("un écart révélé par une consultation de solde se montre quand même", () => {
  const l = [
    sms({ heure: "08:00", categorie: "solde", soldeApres: 100_000 }),
    sms({ heure: "09:00", categorie: "encaissement", sens: "in", montant: 10_000, soldeApres: 110_000 }),
    sms({ heure: "10:00", categorie: "solde", soldeApres: 60_000 }),
  ];
  const f = fluxDe(l);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].ecartApres, { montant: -50_000, depuis: "09:00", depuisJour: "2026-10-12", jusqua: "10:00" });
  assert.equal(totauxFlux(f).ecarts, 1);
});

test("les frais d'un envoi sortent avec lui", () => {
  const l = [
    sms({ heure: "08:00", categorie: "solde", soldeApres: 100_000 }),
    sms({ heure: "09:00", categorie: "envoi", sens: "out", montant: 10_000, frais: 100, soldeApres: 89_900 }),
  ];
  const f = fluxDe(l);
  assert.equal(f[0].effet, -10_100);
  assert.equal(f[0].verdict, "suit");
});

test("par jour, la recherche, le filtre Type", () => {
  const f = fluxDe(JOURNEE);
  const j = parJour(f);
  assert.equal(j.length, 1);
  assert.equal(j[0].totaux.entrees, 900_000);
  const tchoua = f.find((x) => x.p.heure === "14:05")!;
  assert.ok(correspondFlux(tchoua, "tchoua"));
  assert.ok(correspondFlux(tchoua, "677 00 00 09"));
  assert.ok(correspondFlux(tchoua, "300 000"));
  assert.ok(!correspondFlux(tchoua, "owona"));
  assert.equal(f.filter((x) => dansFamille(x, null)).length, 9);       // sans l'échouée
  assert.equal(f.filter((x) => dansFamille(x, "echouees")).length, 1);
  assert.equal(f.filter((x) => dansFamille(x, "depots")).length, 3);
});
