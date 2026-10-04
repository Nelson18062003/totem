// FILTRER PAR DATE — les jours se comptent comme la caisse les compte.
//
// L'erreur qui guette ici ne se voit pas : un « hier » qui commence à
// 23 h, un « ce mois » qui oublie le 1er, une semaine de six jours. Chaque
// test se place à une heure précise, dans le fuseau de Douala.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bornesDe, dansBornes, decalerJour, depuisPourLaBase, nomDesJours,
  semainesDuMois, totauxDe,
} from "../periodes";

const DOUALA = "Africa/Douala";
// Le 3 octobre 2026 à 00 h 30 à Douala — 23 h 30 la veille en UTC. C'est
// l'heure où un calcul en UTC se trompe de jour.
const JUSTE_APRES_MINUIT = Date.UTC(2026, 9, 2, 23, 30);

test("aujourd'hui, c'est le jour de la CAISSE, pas celui d'UTC", () => {
  assert.deepEqual(bornesDe({ genre: "aujourdhui" }, JUSTE_APRES_MINUIT, DOUALA),
                   { de: "2026-10-03", a: "2026-10-03" });
  assert.deepEqual(bornesDe({ genre: "hier" }, JUSTE_APRES_MINUIT, DOUALA),
                   { de: "2026-10-02", a: "2026-10-02" });
});

test("7 jours : sept jours, aujourd'hui compris", () => {
  const b = bornesDe({ genre: "semaine" }, JUSTE_APRES_MINUIT, DOUALA)!;
  assert.deepEqual(b, { de: "2026-09-27", a: "2026-10-03" });
});

test("ce mois : depuis le 1er, même le 1er à minuit passé", () => {
  assert.deepEqual(bornesDe({ genre: "mois" }, Date.UTC(2026, 9, 1, 0, 5), DOUALA),
                   { de: "2026-10-01", a: "2026-10-01" });
  assert.deepEqual(bornesDe({ genre: "mois" }, JUSTE_APRES_MINUIT, DOUALA),
                   { de: "2026-10-01", a: "2026-10-03" });
});

test("des jours choisis à l'envers font la même période", () => {
  assert.deepEqual(bornesDe({ genre: "jours", de: "2026-09-09", a: "2026-09-03" }, 0, DOUALA),
                   { de: "2026-09-03", a: "2026-09-09" });
  assert.equal(bornesDe({ genre: "tout" }, 0, DOUALA), null);
});

test("les bornes sont comprises, et rien au-delà", () => {
  const b = { de: "2026-09-03", a: "2026-09-09" };
  assert.ok(dansBornes({ jour: "2026-09-03" }, b));
  assert.ok(dansBornes({ jour: "2026-09-09" }, b));
  assert.ok(!dansBornes({ jour: "2026-09-02" }, b));
  assert.ok(!dansBornes({ jour: "2026-09-10" }, b));
  assert.ok(dansBornes({ jour: "1999-01-01" }, null));
});

test("décaler un jour traverse les mois et les années", () => {
  assert.equal(decalerJour("2026-03-01", -1), "2026-02-28");
  assert.equal(decalerJour("2028-03-01", -1), "2028-02-29");
  assert.equal(decalerJour("2026-12-31", 1), "2027-01-01");
});

test("la base est interrogée un jour plus tôt : rien du matin ne se perd", () => {
  const depuis = depuisPourLaBase({ de: "2026-10-03", a: "2026-10-03" });
  // Minuit à Douala, le 3, c'est 23 h UTC le 2 : il faut demander avant.
  assert.ok(Date.parse(depuis) <= Date.UTC(2026, 9, 2, 23, 0));
});

test("les totaux : ce qui entre, ce qui sort — jamais deviné", () => {
  const t = totauxDe([
    { sens: "in", montant: 20000 }, { sens: "in", montant: 5000 },
    { sens: "out", montant: 8000 },
    { sens: "?", montant: 999999 },     // sens non compris : d'aucun côté
    { sens: "in", montant: null },      // une publicité, un échec
  ]);
  assert.deepEqual(t, { nombre: 5, recu: 25000, envoye: 8000 });
});

test("le nom d'une plage choisie", () => {
  assert.equal(nomDesJours({ de: "2026-10-03", a: "2026-10-03" }, "fr"), "3 oct.");
  assert.equal(nomDesJours({ de: "2026-10-03", a: "2026-10-09" }, "en"), "3 Oct – 9 Oct");
});

test("le calendrier commence le lundi, et tient le mois entier", () => {
  // Octobre 2026 commence un jeudi.
  const s = semainesDuMois(2026, 10);
  assert.deepEqual(s[0], [null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.equal(s.flat().filter(Boolean).length, 31);
  assert.ok(s.every((r) => r.length === 7));
});

test("le jour d'un relevé de solde : aujourd'hui, hier, ou une date — vus de Douala", async () => {
  const { jourDuReleve } = await import("../periodes");
  const maintenant = Date.UTC(2026, 9, 3, 7, 0);          // 8 h à Douala, le 3
  // 23 h 50 à Douala, la veille : hier.
  assert.deepEqual(jourDuReleve("2026-10-02T22:50:00Z", maintenant, DOUALA), { genre: "hier" });
  // 00 h 10 à Douala le 3 = 23 h 10 UTC le 2 : c'est AUJOURD'HUI à la caisse.
  assert.deepEqual(jourDuReleve("2026-10-02T23:10:00Z", maintenant, DOUALA), { genre: "aujourdhui" });
  assert.deepEqual(jourDuReleve("2026-09-28T20:54:00Z", maintenant, DOUALA),
                   { genre: "avant", cle: "2026-09-28" });
  assert.equal(jourDuReleve(null, maintenant, DOUALA), null);
  assert.equal(jourDuReleve("pas une date", maintenant, DOUALA), null);
});

test("le jour d'un SMS se dit au moment où on le lit, pas au moment où il est arrivé", async () => {
  const { libelleJour } = await import("../periodes");
  // Écrit « Aujourd'hui » le 3 au soir, relu le 4 au matin : c'est « Hier ».
  assert.equal(libelleJour("2026-10-03", "2026-10-03", "fr"), "Aujourd’hui");
  assert.equal(libelleJour("2026-10-03", "2026-10-04", "fr"), "Hier");
  assert.equal(libelleJour("2026-10-03", "2026-10-04", "en"), "Yesterday");
  assert.equal(libelleJour("2026-09-28", "2026-10-04", "fr"), "28 septembre");
  assert.equal(libelleJour("2026-09-28", "2026-10-04", "en"), "28 September");
  // Le 1er mars, la veille est le 28 ou le 29 février.
  assert.equal(libelleJour("2028-02-29", "2028-03-01", "fr"), "Hier");
});
