// LE NOYAU JUGE ENCORE COMME LE FICHIER QUE LE BOÎTIER IMITE.
//
// Le boîtier enchaîne lui-même les écrans prévus d'une opération, avec une
// lecture traduite d'ici (totem/ecran.py). Si une règle change dans
// ussd.ts ou deroule.ts sans que `ecrans-partages.json` soit refait, le
// boîtier garderait l'ancienne règle et déciderait autrement que l'écran —
// sur de l'argent. Ce test l'empêche : il rejuge chaque écran du fichier.
// Une modification VOULUE se fait suivre (voir jumelle.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { juger, type Jugement } from "./jumelle";

const corpus = JSON.parse(
  readFileSync(new URL("./ecrans-partages.json", import.meta.url), "utf8")) as Jugement[];

test("le corpus porte des milliers d'écrans, et chaque décision qui compte", () => {
  assert.ok(corpus.length > 3000);
  const attentes = new Set(corpus.map((j) => j.lu[1][0]));
  for (const a of ["choix", "numero", "montant", "secret", "texte"]) assert.ok(attentes.has(a), a);
  assert.ok(corpus.some((j) => j.servir[0] === "numero"));
  assert.ok(corpus.some((j) => j.servir[0] === "montant"));
  assert.ok(corpus.some((j) => j.etapes.includes("5")));
});

test("le noyau d'aujourd'hui juge chaque écran comme le fichier", () => {
  const ecarts = corpus.filter((j) => JSON.stringify(juger(j.t)) !== JSON.stringify(j));
  assert.deepEqual(
    ecarts.slice(0, 5).map((j) => j.t), [],
    `${ecarts.length} écran(s) jugé(s) autrement : refaire le fichier et faire suivre totem/ecran.py`);
});
