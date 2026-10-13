// LA SUITE DE L'HISTORIQUE : recoller les pages plus anciennes, sans trou,
// sans doublon, et ne dire « début de l'historique » que quand c'est vrai.
//
// LA PANNE. TOTEM tourne déjà, avec des mois de caisse en base ; l'onglet
// Paiements s'arrêtait aux deux cents derniers SMS, sans un mot.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apresUnePage, jusquAu, recoller } from "../historique.ts";
import { surLaCarte } from "../flux.ts";
import type { Paiement } from "../types.ts";

const sms = (id: number, jour = "2026-10-01", p: Partial<Paiement> = {}): Paiement => ({
  id: String(id), sim: "MTN ·8901", carte: "89237", sens: "in", nom: "MTN", tiers: "",
  numero: "", montant: 1000, heure: "10:00", date: "", jour,
  recuLe: `${jour}T10:00:00Z`, categorie: "encaissement",
  nature: null, reference: "", soldeApres: null, smsBrut: "", recu: null,
  sourceId: id, terminal: "douala", nonLu: false, ...p,
});

test("une page recollée sous les récentes, sans doublon", () => {
  // La borne est INCLUSE : la dernière ligne de la page d'avant revient.
  const recentes = [sms(5), sms(4), sms(3)];
  const page = [sms(3), sms(2), sms(1)];
  assert.deepEqual(recoller(recentes, page).map((p) => p.id), ["5", "4", "3", "2", "1"]);
});

test("la version récente gagne : un reçu établi depuis ne se perd pas", () => {
  const recentes = [sms(3, "2026-10-01", { recu: "TM-2026-1001-0003" })];
  const page = [sms(3), sms(2)];
  const r = recoller(recentes, page);
  assert.equal(r.find((p) => p.id === "3")?.recu, "TM-2026-1001-0003");
});

test("une page qui apporte du neuf : la suite devient la sienne", () => {
  const h = apresUnePage({ lignes: [sms(3)], suite: "A" },
                         { paiements: [sms(3), sms(2)], suite: "B" }, "A");
  assert.deepEqual(h.lignes.map((p) => p.id), ["3", "2"]);
  assert.equal(h.suite, "B");
});

test("la base n'a plus rien : « début de l'historique », et c'est vrai", () => {
  const h = apresUnePage({ lignes: [sms(3)], suite: "A" },
                         { paiements: [sms(3), sms(2)], suite: null }, "A");
  assert.equal(h.suite, null);
});

test("une plateforme qui ignore `avant` : on s'arrête, sans rien prétendre", () => {
  // Elle rend les plus récents, qu'on a déjà, et la même suite : redemander
  // tournerait sans fin. Ni « il y a plus », ni « c'est le début ».
  const deja = { lignes: [sms(5), sms(4)], suite: "A" };
  const memeSuite = apresUnePage(deja, { paiements: [sms(5), sms(4)], suite: "A" }, "A");
  assert.equal(memeSuite.suite, undefined);
  // Une plateforme d'avant `suite` : rien ne dit où reprendre.
  const sansSuite = apresUnePage(deja, { paiements: [sms(5), sms(4)] }, "A");
  assert.equal(sansSuite.suite, undefined);
});

test("une page faite de doublons mais qui avance : on continue", () => {
  // Deux cents SMS relevés au même instant ne tiennent pas dans une page :
  // la suite avance, la page suivante apportera le reste.
  const h = apresUnePage({ lignes: [sms(5), sms(4)], suite: "A" },
                         { paiements: [sms(4)], suite: "B" }, "A");
  assert.equal(h.suite, "B");
});

test("jusqu'où l'écran remonte : le plus ancien jour tenu", () => {
  assert.equal(jusquAu([sms(3, "2026-10-01"), sms(2, "2026-03-14"), sms(1, "2026-06-01")]), "2026-03-14");
  assert.equal(jusquAu([]), null);
});

test("le filtre Carte garde la caisse ancienne, qui n'a que le libellé", () => {
  const carte = { iccid: "89237", libelle: "MTN ·8901" };
  assert.equal(surLaCarte(sms(1), carte), true);
  assert.equal(surLaCarte(sms(2, "2026-03-01", { carte: "" }), carte), true);
  assert.equal(surLaCarte(sms(3, "2026-03-01", { carte: "", sim: "Orange ·5512" }), carte), false);
  assert.equal(surLaCarte(sms(4, "2026-03-01", { carte: "99999" }), carte), false);
  assert.equal(surLaCarte(sms(5), null), true);
  // Le témoin : l'ancienne comparaison perdait la ligne sans carte.
  const ancienne = (p: Paiement, iccid: string) => (p.carte || p.sim) === iccid;
  assert.equal(ancienne(sms(2, "2026-03-01", { carte: "" }), "89237"), false);
});
