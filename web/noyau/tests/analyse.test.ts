// L'analyse de la semaine — le chiffre que le propriétaire regarde en premier.
//
//     npm test
//
// Ce qui est gardé ici : qu'une caisse RÉGULIÈRE affiche 0 %. C'est le seul
// contrôle qui compte, parce que c'est celui qui a manqué. Les deux écrans
// (la page web et le téléphone) comparaient une semaine en cours arrêtée à
// l'heure qu'il est avec une semaine précédente toujours pleine : le matin,
// une caisse qui n'avait pas bougé d'un franc annonçait « −14 % ».

import { test } from "node:test";
import assert from "node:assert/strict";
import { resumeSemaine } from "../analyse.ts";
import type { Paiement } from "../types.ts";

const FUSEAU = "Africa/Douala";
const jourDouala = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU });

let compteur = 0;
function encaissement(recuLe: string, montant: number, tiers = "NKENGAFAC M."): Paiement {
  compteur += 1;
  return {
    id: `p${compteur}`, sim: "MTN ·8901", carte: "89237", sens: "in",
    nom: "MTNMobileMoney", tiers, numero: "699000000", montant,
    heure: "09:00", date: "aujourd'hui", recuLe,
    texte: "", categorie: "encaissement", lu: true, nature: null,
    reference: null, solde: null,
  } as unknown as Paiement;
}

/** Une caisse qui encaisse la même chose, tous les jours, aux mêmes heures. */
function caisseReguliere(maintenant: number, jours = 30): Paiement[] {
  const p: Paiement[] = [];
  for (let j = 0; j < jours; j++) {
    const cle = jourDouala.format(new Date(maintenant - j * 86_400_000));
    for (const h of [9, 12, 15, 18]) {
      const recuLe = `${cle}T${String(h).padStart(2, "0")}:00:00+01:00`;
      // Un encaissement qui n'a pas encore eu lieu n'existe pas.
      if (Date.parse(recuLe) > maintenant) continue;
      p.push(encaissement(recuLe, 10_000));
    }
  }
  return p;
}

test("une caisse régulière n'affiche pas de chute, à aucune heure du jour", () => {
  for (const h of ["00", "06", "08", "10", "12", "14", "18", "20", "23"]) {
    const maintenant = Date.parse(`2026-08-20T${h}:30:00+01:00`);
    const r = resumeSemaine(caisseReguliere(maintenant), "fr", FUSEAU, maintenant);
    assert.equal(r.evolution, 0,
      `à ${h} h 30, une caisse qui n'a pas bougé annonce ${r.evolution} %`);
    assert.equal(r.total, r.precedente,
      `à ${h} h 30 : ${r.total} cette semaine contre ${r.precedente} avant`);
  }
});

test("une vraie hausse se voit", () => {
  const maintenant = Date.parse("2026-08-20T18:30:00+01:00");
  const p = caisseReguliere(maintenant);
  // Un encaissement de plus, hier : +10 000 sur 280 000.
  const hier = jourDouala.format(new Date(maintenant - 86_400_000));
  p.push(encaissement(`${hier}T20:00:00+01:00`, 10_000));
  const r = resumeSemaine(p, "fr", FUSEAU, maintenant);
  assert.equal(r.total, 290_000);
  assert.equal(r.precedente, 280_000);
  assert.equal(r.evolution, 4);
});

test("les sept barres portent leur jour et leur montant", () => {
  const maintenant = Date.parse("2026-08-20T18:30:00+01:00"); // un jeudi
  const r = resumeSemaine(caisseReguliere(maintenant), "fr", FUSEAU, maintenant);
  assert.equal(r.jours.length, 7);
  assert.deepEqual(r.jours.map((j) => j.jour),
    ["Ven", "Sam", "Dim", "Lun", "Mar", "Mer", "Jeu"]);
  for (const j of r.jours) assert.equal(j.montant, 40_000);
  assert.equal(r.moyenne, 40_000);
  assert.equal(r.max, 40_000);
});

test("les jours suivent la langue de l'écran", () => {
  const maintenant = Date.parse("2026-08-20T18:30:00+01:00");
  const r = resumeSemaine(caisseReguliere(maintenant), "en", FUSEAU, maintenant);
  assert.deepEqual(r.jours.map((j) => j.jour),
    ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]);
});

test("une caisse vide ne divise pas par zéro", () => {
  const maintenant = Date.parse("2026-08-20T18:30:00+01:00");
  const r = resumeSemaine([], "fr", FUSEAU, maintenant);
  assert.equal(r.total, 0);
  assert.equal(r.evolution, null, "sans semaine précédente, on n'invente pas d'écart");
  assert.equal(r.max, 1, "le dénominateur du graphe ne vaut jamais zéro");
  assert.equal(r.moyenne, 0);
  assert.deepEqual(r.clients, []);
});

test("le client, c'est celui qui a payé — pas l'opérateur", () => {
  const maintenant = Date.parse("2026-08-20T18:30:00+01:00");
  const veille = jourDouala.format(new Date(maintenant - 86_400_000));
  const p = [
    encaissement(`${veille}T09:00:00+01:00`, 5_000, "ABENA P."),
    encaissement(`${veille}T10:00:00+01:00`, 7_000, "ABENA P."),
    encaissement(`${veille}T11:00:00+01:00`, 3_000, "TCHOUTA J."),
  ];
  const r = resumeSemaine(p, "fr", FUSEAU, maintenant);
  assert.deepEqual(r.clients, [
    { nom: "ABENA P.", nb: 2, total: 12_000 },
    { nom: "TCHOUTA J.", nb: 1, total: 3_000 },
  ]);
});

test("ce qui n'est pas un encaissement ne compte pas", () => {
  const maintenant = Date.parse("2026-08-20T18:30:00+01:00");
  const veille = jourDouala.format(new Date(maintenant - 86_400_000));
  const sortant = { ...encaissement(`${veille}T09:00:00+01:00`, 9_000), sens: "out" as const };
  const sansMontant = { ...encaissement(`${veille}T10:00:00+01:00`, 0), montant: null };
  const doute = { ...encaissement(`${veille}T11:00:00+01:00`, 4_000), sens: "?" as const };
  const r = resumeSemaine([sortant, sansMontant, doute], "fr", FUSEAU, maintenant);
  assert.equal(r.total, 0);
  assert.deepEqual(r.clients, []);
});

test("une date illisible ne fausse pas le total", () => {
  const maintenant = Date.parse("2026-08-20T18:30:00+01:00");
  const veille = jourDouala.format(new Date(maintenant - 86_400_000));
  const r = resumeSemaine([
    encaissement(`${veille}T09:00:00+01:00`, 5_000),
    encaissement("pas une date", 999_999),
  ], "fr", FUSEAU, maintenant);
  assert.equal(r.total, 5_000);
});

test("le fuseau du terminal découpe les jours, pas celui du serveur", () => {
  // Un encaissement de 00 h 30 à Douala (UTC+1) le 20 août, c'est 23 h 30 UTC
  // le 19 — donc encore le 19 à Abidjan (UTC+0). Le même argent, rangé la
  // veille : c'est la caisse qui décide de ce qu'est « aujourd'hui ».
  const maintenant = Date.parse("2026-08-20T18:30:00+01:00");
  const petitMatin = encaissement("2026-08-20T00:30:00+01:00", 6_000);
  const douala = resumeSemaine([petitMatin], "fr", "Africa/Douala", maintenant);
  const abidjan = resumeSemaine([petitMatin], "fr", "Africa/Abidjan", maintenant);
  assert.equal(douala.jours[6].montant, 6_000, "à Douala, c'est aujourd'hui");
  assert.equal(abidjan.jours[6].montant, 0);
  assert.equal(abidjan.jours[5].montant, 6_000, "à Abidjan, c'est hier");
  // Dans les deux cas il est DANS la fenêtre : le total ne perd rien.
  assert.equal(douala.total, 6_000);
  assert.equal(abidjan.total, 6_000);
});

test("un encaissement daté du futur ne gonfle pas le total", () => {
  // Une horloge de terminal en avance a déjà daté des SMS de demain. La barre
  // du jour peut le montrer ; le total comparé, lui, s'arrête à maintenant —
  // sans quoi « cette semaine » battrait « la semaine dernière » d'un argent
  // qui n'est pas encore entré.
  const maintenant = Date.parse("2026-08-20T12:00:00+01:00");
  const demain = encaissement("2026-08-21T12:00:00+01:00", 50_000);
  const r = resumeSemaine([demain], "fr", FUSEAU, maintenant);
  assert.equal(r.total, 0);
  assert.equal(r.evolution, null);
});
