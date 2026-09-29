#!/usr/bin/env node
// Vérifie l'annonce avant de la tourner.
//
//   node annonce/verifier-l-annonce.mjs
//
// Une annonce se regarde une fois et se partage cent : une phrase fausse y
// voyage plus loin que partout ailleurs. Ce harnais relit ce que l'annonce
// ÉCRIT à l'écran et refuse :
//
//   1. les promesses que le dépôt ne tient pas (docs/LIMITES-ET-RISQUES.md,
//      docs/PLAY-STORE.md) — « IA », « chiffré de bout en bout », « dans les
//      magasins », « partenaire de MTN »… ;
//   2. les vraies personnes : les noms et numéros de clients réels que les
//      tests du dépôt contiennent, relevés sur de vrais SMS ;
//   3. un conducteur qui ne tombe pas juste : chaque impact doit tomber sur
//      un changement de plan ou dans un plan qui l'attend, la musique et
//      l'image doivent avoir la même durée.
//
// Il porte son TÉMOIN : une phrase interdite glissée exprès, qu'il doit
// attraper. S'il ne l'attrape pas, c'est lui qui est cassé, et il le dit.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PLATEAU = path.join(ICI, "plateau");

// Ce que l'annonce n'a pas le droit d'affirmer. Chaque entrée dit pourquoi.
const INTERDITS = [
  [/\bIA\b|intelligence artificielle/i, "rien dans le dépôt ne décrit d'IA : la lecture repose sur des règles"],
  [/app ?store|google play|play store|t[ée]l[ée]chargez/i, "l'application n'est pas encore publiée (docs/PLAY-STORE.md, docs/MOBILE.md §7)"],
  [/bout en bout/i, "Telegram n'est pas chiffré de bout en bout (docs/LIMITES-ET-RISQUES.md)"],
  [/inviolable|impossible à pirater|100 ?% s[ûu]r/i, "la confirmation ralentit un voleur pressé, elle n'arrête pas un déterminé"],
  [/personne n.entre|aucune (porte|faille)|imprenable/i, "docs/LIMITES-ET-RISQUES.md §3 : un téléphone volé et déverrouillé, ou la carte SD, donnent le robot"],
  [/partenaire|API (de |d')?(MTN|Orange)|officiel/i, "TOTEM lit des SMS et compose de l'USSD ; aucune API, aucun partenariat"],
  [/à la seconde|instantan/i, "c'est un objectif, pas une mesure (docs/MOBILE.md, « Résultat visé »)"],
  [/suivre l.argent|(une|votre|la|nouvelle) banque|(un|votre|le) portefeuille/i, "TOTEM n'est ni une banque ni un portefeuille ; aucun argent n'y transite"],
  [/comptabilit[ée] exacte/i, "le journal est un reflet, jamais la source de vérité comptable"],
  [/Moov|Airtel|Wave/i, "le lecteur ne connaît que les SMS de MTN et d'Orange"],
  [/d[ée]j[àa] en service|des milliers de|flotte/i, "le dépôt n'établit ni un déploiement, ni une flotte"],
];

// Des personnes réelles, relevées sur de vrais SMS dans les tests et les
// aperçus de reçus. Aucune ne doit apparaître.
const REELS = [
  /NKENGAFAC/i, /WONDER PHONE/i, /PRIX MONO/i, /GARANTIE EXCHANGE/i, /NGANGOM/i, /PAYSELA/i,
  /656 ?483 ?918/, /696 ?103 ?864/, /690 ?933 ?686/, /697 ?457 ?589/, /652 ?236 ?856/, /681 ?026 ?861/,
];

// Les chaînes écrites à l'écran : tout littéral de plans.js et scenes.js
// (les commentaires ne s'affichent pas, ils ne comptent pas).
function litteraux(source) {
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const res = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(sansCommentaires))) res.push(m[1] ?? m[2] ?? m[3]);
  return res;
}

function examiner(chaines) {
  const fautes = [];
  for (const s of chaines) {
    for (const [re, pourquoi] of INTERDITS) if (re.test(s)) fautes.push(`« ${s} » — ${pourquoi}`);
    for (const re of REELS) if (re.test(s)) fautes.push(`« ${s} » — une personne réelle, relevée sur un vrai SMS`);
  }
  return fautes;
}

let echecs = 0;
const ok = (m) => console.log(`✓ ${m}`);
const ko = (m) => { console.log(`✗ ${m}`); echecs++; };

// Le témoin : le harnais doit savoir échouer.
// La quatrième faute est une vraie : elle a passé ce harnais, et le film, une fois.
const temoin = examiner(["Grâce à l'IA, disponible sur l'App Store", "de NKENGAFAC M.", "Personne n’entre sans vous."]);
if (temoin.length < 4) { console.log("✗ le témoin n'est pas attrapé : ce harnais ne vérifie plus rien"); process.exit(2); }
ok(`le témoin est attrapé (${temoin.length} fautes sur 4 glissées)`);

const fichiers = ["plans.js", "scenes.js", "interface.js"].map((f) => path.join(PLATEAU, f)).filter((f) => fs.existsSync(f));
const chaines = fichiers.flatMap((f) => litteraux(fs.readFileSync(f, "utf8")));
const fautes = examiner(chaines);
if (fautes.length) fautes.forEach(ko); else ok(`${chaines.length} textes relus, aucune promesse fausse, aucune personne réelle`);

// Le conducteur.
const cond = JSON.parse(fs.readFileSync(path.join(ICI, "conducteur.json"), "utf8"));
const sections = cond.sections.slice().sort((a, b) => a.de - b.de);
let fin = 0, trous = 0;
for (const s of sections) { if (Math.abs(s.de - fin) > 1e-6) { ko(`le conducteur a un trou avant la section « ${s.nature} » (temps ${fin} → ${s.de})`); trous++; } fin = s.a; }
if (Math.abs(fin - cond.duree_temps) > 1e-6) ko(`les sections finissent au temps ${fin}, le conducteur annonce ${cond.duree_temps}`);
else if (!trous) ok(`les sections couvrent les ${cond.duree_temps} temps, sans trou (${(cond.duree_temps * 60 / cond.tempo).toFixed(1)} s à ${cond.tempo} battements par minute)`);
const hors = (cond.evenements || []).filter((e) => e.temps < 0 || e.temps > cond.duree_temps);
if (hors.length) hors.forEach((e) => ko(`l'événement ${e.type} au temps ${e.temps} tombe hors de la vidéo`));
else ok(`${(cond.evenements || []).length} événements, tous dans la vidéo`);

console.log(echecs ? `\n${echecs} faute(s) : l'annonce ne se tourne pas en l'état.` : "\nL'annonce peut se tourner.");
process.exit(echecs ? 1 : 0);
