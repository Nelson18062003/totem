// Refait `ecrans-partages.json` : les MÊMES écrans, rejugés par le noyau
// d'aujourd'hui. À lancer après une modification VOULUE de la lecture, puis
// faire suivre totem/ecran.py (voir jumelle.ts).
//
//     cd web && node --import ./noyau/tests/resolveur.mjs noyau/tests/ecrans-partages.regenerer.ts
//
// Un chemin en argument (un tableau JSON de textes) REMPLACE la liste des
// écrans — c'est ainsi que le corpus a été semé.

import { readFileSync, writeFileSync } from "node:fs";
import { juger } from "./jumelle";

const fichier = new URL("./ecrans-partages.json", import.meta.url);
const semis = process.argv[2];
const textes: string[] = semis
  ? JSON.parse(readFileSync(semis, "utf8"))
  : (JSON.parse(readFileSync(fichier, "utf8")) as { t: string }[]).map((j) => j.t);

const jugements = textes.map(juger);
writeFileSync(fichier, "[\n" + jugements.map((j) => JSON.stringify(j)).join(",\n") + "\n]\n");
console.log(`${jugements.length} écrans jugés → ${fichier.pathname}`);
