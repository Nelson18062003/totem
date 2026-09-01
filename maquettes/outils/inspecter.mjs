// Inspection d'ensemble de la série TOTEM ADMIN.
// Re-mesure les huit écrans, puis vérifie ce qu'aucune mesure d'écran isolé
// ne peut voir : la cohérence entre eux.
//   node inspecter.mjs
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const ici = dirname(fileURLToPath(import.meta.url));
const ECRANS = [
  { nom: "1-fleet", ecran: "fleet" }, { nom: "2-terminal", ecran: "terminals" },
  { nom: "3-sims", ecran: "sims" }, { nom: "4-clients", ecran: "clients" },
  { nom: "5-releases", ecran: "releases" }, { nom: "6-audit", ecran: "audit" },
  { nom: "7-alerts", ecran: "alerts" }, { nom: "8-mobile", mobile: true },
];
const fautes = [];
const dire = (n, m) => fautes.push(`[${n}] ${m}`);

// — 1. mesure dimensionnelle de chaque écran —
for (const e of ECRANS) {
  const f = join(ici, `${e.nom}.html`);
  if (!existsSync(f)) { dire(e.nom, "fichier absent — écran non livré"); continue; }
  try {
    execFileSync("node", [join(ici, "mesure.mjs"), f, ...(e.mobile ? ["--mobile"] : [])], { encoding: "utf8" });
    console.log(`✔ ${e.nom} — mesure : zéro violation`);
  } catch (err) {
    const lignes = (err.stdout || "").trim().split("\n");
    console.log(`✘ ${e.nom} — ${lignes.length - 1} violation(s)`);
    lignes.slice(1, 6).forEach((l) => console.log("   " + l.trim()));
    dire(e.nom, `${lignes.length - 1} violation(s) de mesure`);
  }
}

// — 2. cohérence du texte : langue, abréviations, données de l'histoire —
const RAIL = readFileSync(join(ici, "chrome.html"), "utf8").replace(/\s+/g, " ").trim();
const HISTOIRE = {
  "6,335,788.6": ["2-terminal", "3-sims", "4-clients"],
  "stable-2.4.2": ["1-fleet", "2-terminal", "5-releases", "6-audit", "8-mobile"],
  "912,400": ["2-terminal", "3-sims", "4-clients"],
  "1,412": ["1-fleet", "7-alerts"],
  "e4f21c9": ["5-releases"],
  "TM-2026-0805-0075": ["1-fleet", "2-terminal", "4-clients", "6-audit"],
  "douala-akwa-01": ["1-fleet", "2-terminal", "3-sims", "5-releases", "6-audit", "8-mobile"],
  "bafoussam-marche-01": ["1-fleet", "3-sims", "5-releases", "6-audit", "8-mobile"],
  "yaounde-centre-01": ["1-fleet", "3-sims", "5-releases", "7-alerts", "8-mobile"],
};
const contenus = {};
for (const e of ECRANS) {
  const f = join(ici, `${e.nom}.html`);
  if (!existsSync(f)) continue;
  const h = readFileSync(f, "utf8");
  contenus[e.nom] = h;
  const compact = h.replace(/\s+/g, " ");

  // la bascule de langue, toujours en toutes lettres
  if (!/English/.test(h) || !/Français/.test(h)) dire(e.nom, "la bascule « English | Français » manque");
  if (/>\s*EN\s*<|>\s*FR\s*</.test(h)) dire(e.nom, "abréviation EN/FR détectée — interdit");

  // le chrome commun doit être celui du fichier partagé, non réécrit
  if (!e.mobile) {
    if (!compact.includes(RAIL.slice(0, 120))) dire(e.nom, "le rail n'est pas le chrome commun injecté");
    if (!new RegExp(`data-ecran=["']?${e.ecran}`).test(h)) dire(e.nom, `data-ecran="${e.ecran}" absent`);
  }
}
for (const [valeur, ecrans] of Object.entries(HISTOIRE))
  for (const n of ecrans)
    if (contenus[n] && !contenus[n].includes(valeur))
      dire(n, `donnée canonique absente : « ${valeur} »`);

// — 2b. collisions de noms : une classe de la feuille commune redéfinie dans
//        le style local d'un écran hérite silencieusement de l'autre.
//        Trois bogues de cette famille ont déjà coûté cher.
//        Partager un nom n'est pas une faute : « .btn » est faite pour être
//        reprise. Ce qui blesse, c'est le MÉLANGE — un élément qui porte à la
//        fois un nom local et un nom que la feuille commune habille par une
//        règle NUE, sans que l'écran ait redéclaré ce nom. L'habillage commun
//        se glisse dedans en silence : c'est ainsi qu'une carte a fait 3060px.
{
  const css = readFileSync(join(ici, "systeme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const nues = new Set();
  for (const [, bloc] of css.matchAll(/([^{}]+)\{/g))
    for (const sel of bloc.split(","))
      if (/^\s*\.[a-zA-Zà-ÿ][\w-]*(\.[\w-]+)*(:[\w-]+(\([^)]*\))?)*\s*$/.test(sel)) {
        // Toutes les règles nues ne blessent pas. Une couleur qui déborde se
        // voit et se corrige ; ce qui a coûté cher, trois fois, ce sont les
        // propriétés qui DÉPLACENT : une marge, une position, une grille.
        // Elles dérangent un composant sans rien dire, à l'autre bout de la
        // page. On ne signale que celles-là.
        const corps = css.slice(css.indexOf("{", css.indexOf(bloc)) + 1);
        const decl = corps.slice(0, corps.indexOf("}"));
        // « inset » sans deux-points est le mot-clé de box-shadow, pas la
        // propriété de placement : on ne retient que ce qui déplace vraiment.
        if (/\b(margin[:-]|position:(?!static)|grid-template)/.test(decl))
          nues.add(/\.([\w-]+)/.exec(sel)[1]);
      }

  for (const e of ECRANS) {
    const f = join(ici, `${e.nom}.src.html`);
    if (!existsSync(f)) continue;
    const src = readFileSync(f, "utf8");
    const style = (src.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
    const locales = new Set([...style.matchAll(/\.([a-zA-Zà-ÿ][\w-]*)/g)].map((m) => m[1]));
    const vues = new Set();
    for (const [, attr] of src.matchAll(/class=["']([^"']+)["']/g)) {
      const noms = attr.trim().split(/\s+/);
      // Le premier nom dit ce que l'élément EST. « class="bloc jamais" » est un
      // bloc, volontairement, que « jamais » nuance : c'est de la reprise, pas
      // un accident. L'accident, c'est le nom commun qui arrive EN SUFFIXE
      // d'un composant local — là, personne n'a voulu l'habillage qui vient.
      if (nues.has(noms[0])) continue;
      if (!noms.some((n) => locales.has(n) && !nues.has(n))) continue;
      for (const n of noms)
        if (nues.has(n) && !locales.has(n) && !vues.has(n)) {
          vues.add(n);
          dire(e.nom, `« class="${attr}" » : « .${n} » est habillée par une règle nue de la feuille commune que l'écran ne redéclare pas`);
        }
    }
  }
}

// — 3. rendu : hauteur de page, débordement, chrome identique au pixel —
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" } });
const empreintes = {};
for (const e of ECRANS) {
  const f = join(ici, `${e.nom}.html`);
  if (!existsSync(f)) continue;
  const p = await b.newPage({ viewport: e.mobile ? { width: 390, height: 844 } : { width: 1500, height: 940 },
    deviceScaleFactor: e.mobile ? 3 : 2 });
  await p.goto("file://" + f, { waitUntil: "load" });
  await p.waitForTimeout(200);
  const m = await p.evaluate(() => {
    const d = document.documentElement;
    const r = document.querySelector(".rail")?.getBoundingClientRect();
    const barre = document.querySelector(".barre")?.getBoundingClientRect();
    const pleins = [...document.querySelectorAll(".btn--primaire, .btn--accent")].length;
    return { h: d.scrollHeight, l: d.scrollWidth,
      rail: r ? Math.round(r.width) : null,
      // la hauteur du rail suit celle de la page : c'est sa LARGEUR et son
      // contenu qui doivent être rigoureusement identiques d'un écran à l'autre.
      navItems: document.querySelectorAll(".rail .nav a").length,
      navActif: document.querySelector(".rail .nav a .pastille-nav:not([hidden])") ? 1 : 0,
      barre: barre ? Math.round(barre.height) : null, pleins };
  });
  await p.close();
  empreintes[e.nom] = m;
  if (m.l > (e.mobile ? 390 : 1500)) dire(e.nom, `débordement horizontal (${m.l}px)`);
  if (!e.mobile && (m.h < 900 || m.h > 1500)) dire(e.nom, `hauteur de page ${m.h}px (viser 940–1400)`);
  if (!e.mobile && m.barre !== 60) dire(e.nom, `barre haute de ${m.barre}px au lieu de 60`);
  if (m.pleins > 1) dire(e.nom, `${m.pleins} boutons pleins — un seul est autorisé par écran`);
}
await b.close();

const bureau = Object.entries(empreintes).filter(([n]) => n !== "8-mobile");
const largeurs = new Set(bureau.map(([, m]) => m.rail));
if (largeurs.size > 1) dire("série", `le rail n'a pas la même largeur partout : ${[...largeurs].join(", ")}`);
const items = new Set(bureau.map(([, m]) => m.navItems));
if (items.size > 1) dire("série", `le rail n'a pas le même nombre d'entrées partout : ${[...items].join(", ")}`);
for (const [n, m] of bureau) if (m.navItems !== 8) dire(n, `${m.navItems} entrées de navigation au lieu de 8`);

console.log("\n— empreintes —");
for (const [n, m] of Object.entries(empreintes))
  console.log(`  ${n.padEnd(12)} page ${String(m.l).padStart(4)}×${String(m.h).padStart(4)}  rail ${String(m.rail ?? "—").padStart(3)}px · ${m.navItems} entrées  barre ${m.barre ?? "—"}  1 seul bouton plein : ${m.pleins <= 1 ? "oui" : "NON"}`);

if (fautes.length === 0) { console.log("\n✔ INSPECTION : la série est cohérente et conforme."); }
else { console.log(`\n✘ INSPECTION : ${fautes.length} point(s) à corriger`); fautes.forEach((f) => console.log("  " + f)); process.exit(1); }
