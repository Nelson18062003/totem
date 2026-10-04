// « Reçu en préparation… » ou « Établir le reçu » : la règle, partagée par
// le téléphone et le site.
//
// LA PANNE. Le téléphone apprenait l'arrivée d'un SMS d'argent (la
// notification), jamais celle de son reçu, déposé quelques secondes plus
// tard. La fiche proposait donc « Établir le reçu » pour un document déjà en
// route — et le propriétaire refaisait, à la main, ce qui arrivait tout seul.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FENETRE_DU_RECU_MS, recuAttendu } from "../sms.ts";
import type { Paiement } from "../types.ts";

const MAINTENANT = Date.parse("2026-10-04T10:00:00Z");
const sms = (p: Partial<Paiement>): Paiement => ({
  id: "1", sim: "MTN ·8901", carte: "89237", sens: "in", nom: "MTN", tiers: "",
  numero: "", montant: 27500, heure: "10:00", date: "Today", jour: "2026-10-04",
  recuLe: new Date(MAINTENANT - 5_000).toISOString(), categorie: "encaissement",
  nature: null, reference: "", soldeApres: null, smsBrut: "", recu: null,
  sourceId: 42, terminal: "douala", nonLu: false, ...p,
});

test("un encaissement de cinq secondes sans reçu : on l'attend", () => {
  assert.equal(recuAttendu(sms({}), MAINTENANT), true);
});

test("le reçu est là : on ne l'attend plus", () => {
  assert.equal(recuAttendu(sms({ recu: "TM-2026-1004-0042" }), MAINTENANT), false);
});

test("passé la fenêtre : on propose de l'établir", () => {
  const vieux = new Date(MAINTENANT - FENETRE_DU_RECU_MS - 1).toISOString();
  assert.equal(recuAttendu(sms({ recuLe: vieux }), MAINTENANT), false);
});

test("pas d'argent, pas de reçu à attendre", () => {
  assert.equal(recuAttendu(sms({ montant: null, categorie: "publicite" }), MAINTENANT), false);
  assert.equal(recuAttendu(sms({ montant: null, categorie: "code" }), MAINTENANT), false);
});

test("sans ligne de journal, aucun boîtier ne le fabriquera", () => {
  assert.equal(recuAttendu(sms({ sourceId: null }), MAINTENANT), false);
});

test("une heure illisible ou trop en avance : on n'attend rien", () => {
  assert.equal(recuAttendu(sms({ recuLe: "" }), MAINTENANT), false);
  const futur = new Date(MAINTENANT + 5 * 60_000).toISOString();
  assert.equal(recuAttendu(sms({ recuLe: futur }), MAINTENANT), false);
});

// ----------------------------------------------------------------------------
// « Déjà à jour » : le BOÎTIER le dit, l'écran ne le devine pas.
// Les phrases sont celles de `Pilotage._etablir_recu` (totem/pilotage.py).
import { etatDeLaReponseRecu } from "../sms.ts";

test("les trois phrases du boîtier, dans les deux langues", () => {
  const n = "TM-2026-1004-0042";
  assert.equal(etatDeLaReponseRecu(`Reçu ${n} déjà à jour : rien n'a changé, il se partage dès maintenant.`), "inchange");
  assert.equal(etatDeLaReponseRecu(`Receipt ${n} already up to date: nothing has changed, it can be shared now.`), "inchange");
  assert.equal(etatDeLaReponseRecu(`Reçu ${n} prêt : il se partage dès maintenant.`), "pret");
  assert.equal(etatDeLaReponseRecu(`Receipt ${n} is ready: it can be shared now.`), "pret");
  assert.equal(etatDeLaReponseRecu(`Reçu ${n} en fabrication : il sera archivé et téléchargeable dans un instant.`), "en_route");
  assert.equal(etatDeLaReponseRecu(`Receipt ${n} is being made: it will be archived and ready to download in a moment.`), "en_route");
  assert.equal(etatDeLaReponseRecu(null), "en_route");
});

test("témoin : l'égalité des numéros dit « à jour » sur un document refait", () => {
  // Le document est refait (l'identité des Réglages a changé) : même numéro,
  // et le boîtier dit « prêt ». L'ancienne règle des écrans — « même numéro
  // qu'avant, donc déjà à jour » — s'y trompe ; la nouvelle non.
  const avant = "TM-2026-1004-0042";
  const reponse = `Reçu ${avant} prêt : il se partage dès maintenant.`;
  const n = /\bT[A-Z]-\d{4}-\d{4}-\d+\b/.exec(reponse)?.[0];
  assert.equal(n === avant, true, "le témoin ne se trompe plus : ce test ne prouverait rien");
  assert.notEqual(etatDeLaReponseRecu(reponse), "inchange");
});
