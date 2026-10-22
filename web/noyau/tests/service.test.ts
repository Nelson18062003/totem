// LE SERVICE D'UNE CARTE — ce que le boîtier publie, ce que l'écran en dit.
//
//     npm test
//
// Le boîtier (Python) et la plateforme (TypeScript) parlent du même objet
// dans deux langages : `service-publie.json` est lu des DEUX côtés
// (`tests/test_service_des_cartes.py` le lit aussi). Une clé renommée d'un
// côté fait échouer l'autre, au lieu de laisser l'écran dessiner des barres
// sur une carte sans réseau.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SANS_SERVICE, carteInstable, carteSansService, instantMoins, serviceDeLaCarte, serviceLu,
} from "../service";
import { textesService } from "../textes/service";

const CONTRAT = JSON.parse(readFileSync(join(fileURLToPath(import.meta.url), "..", "service-publie.json"), "utf8"));

test("la plateforme lit ce que le boîtier publie", () => {
  const lu = serviceLu(CONTRAT.publie);
  assert.deepEqual(lu, { etat: "aucun", depuis_s: 720, coupures_24h: 3, sans_service_24h_s: 1500 });
  assert.deepEqual([...SANS_SERVICE].sort(), [...CONTRAT.sans_service].sort());
});

test("chaque état a ses mots, dans les deux langues", () => {
  for (const langue of ["en", "fr"] as const) {
    for (const etat of CONTRAT.sans_service) {
      assert.ok(textesService[langue].etiquette[etat as "aucun"], `${langue} ${etat}`);
      assert.ok(textesService[langue].explication[etat as "aucun"], `${langue} ${etat}`);
    }
  }
});

test("une publication abîmée laisse les barres", () => {
  for (const brut of [null, "aucun", 42, {}, { etat: "panne" }, { etat: 3 }, [CONTRAT.publie]]) {
    assert.equal(serviceLu(brut), null, JSON.stringify(brut));
  }
  // Des durées absurdes ne passent pas pour des durées.
  assert.equal(serviceLu({ etat: "aucun", depuis_s: -5 })?.depuis_s, null);
  assert.equal(serviceLu({ etat: "aucun", depuis_s: "12" })?.depuis_s, null);
});

test("daté sur l'horloge de la base", () => {
  assert.equal(instantMoins("2026-10-22T10:00:00.000Z", 720), "2026-10-22T09:48:00.000Z");
  assert.equal(instantMoins(null, 720), null);
  assert.equal(instantMoins("2026-10-22T10:00:00.000Z", null), null);
});

test("rien à dire d'une carte inscrite qui ne s'est pas coupée", () => {
  assert.equal(serviceDeLaCarte({ etat: "inscrite", coupures_24h: 0 }, null, false), undefined);
  assert.ok(serviceDeLaCarte({ etat: "inscrite", coupures_24h: 4 }, null, false));
  assert.ok(serviceDeLaCarte({ etat: "sms_seulement" }, null, false));
});

test("le boîtier avant la carte : un état figé ne se crie pas sur la carte", () => {
  const vive = serviceDeLaCarte(CONTRAT.publie, "2026-10-22T10:00:00Z", false);
  const figee = serviceDeLaCarte(CONTRAT.publie, "2026-10-22T10:00:00Z", true);
  assert.equal(carteSansService({ service: vive }), true);
  assert.equal(carteSansService({ service: figee }), false);
  assert.equal(carteSansService({}), false);
});

test("SMS seulement n'est pas sans service : les encaissements arrivent", () => {
  assert.equal(carteSansService({ service: serviceDeLaCarte({ etat: "sms_seulement" }, null, false) }), false);
});

test("une carte qui se coupe souvent se voit, même revenue", () => {
  assert.equal(carteInstable({ service: serviceDeLaCarte({ etat: "inscrite", coupures_24h: 3 }, null, false) }), true);
  assert.equal(carteInstable({ service: serviceDeLaCarte({ etat: "inscrite", coupures_24h: 2 }, null, false) }), false);
});

test("TÉMOIN : la règle d'avant ne lisait que le signal", () => {
  // Une carte sans réseau qui capte à 22/31 : l'écran d'avant dessinait
  // trois barres, parce qu'il n'avait QUE le signal pour juger.
  const anciennesBarres = (signal: number) => Math.min(4, Math.ceil((signal / 31) * 4));
  assert.equal(anciennesBarres(22), 3);
  assert.equal(carteSansService({ service: serviceDeLaCarte(CONTRAT.publie, null, false) }), true);
});
