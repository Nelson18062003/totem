// Inspection d'ensemble de la PORTE (l'hôte super-admin de TOTEM ADMIN).
// Ce que la mesure d'un écran isolé ne peut pas voir : ce que les sept
// planches se promettent l'une à l'autre.
//   node inspecter-porte.mjs
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const ici = dirname(fileURLToPath(import.meta.url));

// « pleins » : combien de boutons pleins la planche a le droit de montrer.
// Une planche d'écran n'en a qu'un. Une planche de catalogue (les quatre
// refus, les quatre lettres) montre plusieurs contextes côte à côte : le
// compte attendu est celui des contextes, et il est déclaré ici, à la main.
const PLANCHES = [
  { nom: "A1-entree",           pleins: 1, ecran: true },
  { nom: "A2-code",             pleins: 1, ecran: true },
  { nom: "A3-application",      pleins: 1, ecran: true },
  { nom: "A4-refus",            pleins: 2, catalogue: 4 },
  { nom: "A5-application-ajout",pleins: 2, catalogue: 2 },
  { nom: "A6-appareils",        pleins: 2, ecran: true },
  { nom: "A7-courriels",        pleins: 3, catalogue: 4 },
];

const fautes = [];
const dire = (n, m) => fautes.push(`[${n}] ${m}`);

// — 1. mesure dimensionnelle —
for (const p of PLANCHES) {
  const f = join(ici, `${p.nom}.html`);
  if (!existsSync(f)) { dire(p.nom, "fichier absent — planche non livrée"); continue; }
  try {
    execFileSync("node", [join(ici, "mesure.mjs"), f], { encoding: "utf8" });
    console.log(`✔ ${p.nom} — mesure : zéro violation`);
  } catch (err) {
    const lignes = (err.stdout || "").trim().split("\n");
    console.log(`✘ ${p.nom} — ${lignes.length - 1} violation(s)`);
    lignes.slice(1, 6).forEach((l) => console.log("   " + l.trim()));
    dire(p.nom, `${lignes.length - 1} violation(s) de mesure`);
  }
}

// — 2. les promesses du texte —
const CODES_DE_SECOURS = /\b(eight|nine|ten|eleven|twelve|huit|neuf|dix) backup codes?\b/gi;
const compte = {};   // « ten » → [planches]
for (const p of PLANCHES) {
  const fs_ = join(ici, `${p.nom}.src.html`);
  if (!existsSync(fs_)) continue;
  const src = readFileSync(fs_, "utf8");
  const compact = src.replace(/\s+/g, " ");
  const style = (src.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];

  // 2a. le carnet de codes : toujours le même nombre, partout
  for (const m of compact.matchAll(CODES_DE_SECOURS))
    (compte[m[1].toLowerCase()] ??= []).push(p.nom);

  // 2b. le code PIN : il n'est jamais un champ, jamais une consigne
  for (const m of src.matchAll(/<(input|label)[^>]*>/gi))
    if (/\bPIN\b/i.test(m[0])) dire(p.nom, `un champ ou une étiquette parle du PIN : ${m[0].slice(0, 90)}`);
  // Le nommer n'est pas interdit : « il reste derrière son propre PIN » est
  // exactement ce qu'on veut dire. Ce qui est interdit, c'est de le DEMANDER.
  // On ne cherche donc que les verbes de demande, et on exige la négation.
  for (const m of compact.matchAll(/[^.]{0,110}\b(enter|type|give|provide|ask(?:s|ed|ing)? (?:you )?for|saisir|tapez|donnez)\b[^.]{0,60}\bPIN\b/gi))
    if (!/\b(never|not|no|jamais|aucun|nobody|ne )\b/i.test(m[0]))
      dire(p.nom, `le PIN est demandé sans négation : « ${m[0].trim()} »`);

  // 2c. le champ du code : collable, non masqué, non tronqué (WCAG 2.2 §3.3.8)
  for (const m of src.matchAll(/<input[^>]*one-time-code[^>]*>/gi)) {
    const t = m[0];
    if (/type=["']password/i.test(t)) dire(p.nom, "le champ du code est masqué — la transcription devient obligatoire");
    if (/\breadonly\b|\bdisabled\b/i.test(t)) dire(p.nom, "le champ du code refuse la saisie — le collage aussi");
    if (!/inputmode=["']numeric/i.test(t)) dire(p.nom, "le champ du code n'appelle pas le clavier numérique");
    const max = /maxlength=["'](\d+)["']/i.exec(t);
    const val = /value=["']([^"']*)["']/i.exec(t);
    if (max && val && val[1].length > +max[1])
      dire(p.nom, `champ du code : maxlength=${max[1]} plus court que ce qu'il affiche (« ${val[1]} », ${val[1].length} signes) — un collage serait tronqué`);
    if (max && +max[1] < 7)
      dire(p.nom, `champ du code : maxlength=${max[1]} coupe un collage « 408 913 » (7 signes espace compris)`);
  }
  // 2c-bis. le bord d'un contrôle ne se dessine pas avec le trait qui sépare.
  //   --trait tient 1,26:1 sur blanc : posé autour d'un champ vide, il rend le
  //   champ invisible tant qu'on n'a pas cliqué dedans (WCAG 2.2 §1.4.11).
  for (const m of style.matchAll(/\.([\w-]+)\s*(?:[^{}]*)\{[^}]*?box-shadow:inset[^;}]*var\(--trait\)/g))
    if (/input|champ|code|case|bouton|btn|pastille|rond/i.test(m[0]))
      dire(p.nom, `« .${m[1]} » borde un contrôle avec --trait (1,26:1) — il faut --trait-controle`);

  // 2c-ter. une case à cocher est une case à cocher, pas un carré dessiné.
  for (const m of src.matchAll(/<span class="case"[^>]*>/g))
    dire(p.nom, `case décorative ${m[0]} — il faut <input type="checkbox"> et son <label for>`);
  for (const m of src.matchAll(/<input type="checkbox" id="([\w-]+)"/g))
    if (!new RegExp(`<label for="${m[1]}"`).test(src))
      dire(p.nom, `la case « ${m[1]} » n'a pas d'étiquette <label for> — rien ne la nomme`);

  // 2c-quater. une erreur se dit à la voix et se rattache à son champ.
  for (const m of src.matchAll(/<div class="avis avis--refus"(?![^>]*role="alert")[^>]*>/g))
    dire(p.nom, `message de refus sans role="alert" — la voix ne l'annonce pas (WCAG 2.2 §4.1.3)`);
  if (/class="[^"]*\bfaux\b/.test(src) && !/aria-invalid/.test(src))
    dire(p.nom, "un champ est marqué en erreur à l'œil seulement — aria-invalid manque");

  // 2c-quinquies. une fenêtre qui recouvre le travail est une boîte de dialogue.
  if (/class="voile"/.test(src)) {
    if (!/role="dialog"[^>]*aria-modal="true"|aria-modal="true"[^>]*role="dialog"/.test(src))
      dire(p.nom, "la fenêtre flottante n'est pas déclarée boîte de dialogue");
    if (!/<main inert/.test(src))
      dire(p.nom, "le travail sous le voile reste dans l'ordre de tabulation — il manque inert sur <main>");
  }

  // 2d. jamais six cases
  const cases1 = (src.match(/<input[^>]*maxlength=["']1["'][^>]*>/gi) || []).length;
  if (cases1 >= 4) dire(p.nom, `${cases1} cases d'un seul signe — le code se saisit dans un seul champ`);

  // 2e. la bascule de langue, en toutes lettres. On la cherche dans la planche
  //     ASSEMBLÉE : sur les écrans de console elle arrive par la barre injectée.
  const monte = existsSync(join(ici, `${p.nom}.html`)) ? readFileSync(join(ici, `${p.nom}.html`), "utf8") : src;
  if (!/English/.test(monte) || !/Français/.test(monte)) dire(p.nom, "la bascule « English | Français » manque");
  if (/>\s*EN\s*<|>\s*FR\s*</.test(monte)) dire(p.nom, "abréviation EN/FR détectée — interdit");

  // 2f. la marque vient du sprite officiel, jamais recopiée à la main
  if (/<svg[^>]*class=["'][^"']*logo/.test(src) && !/#marque-logo/.test(src))
    dire(p.nom, "un logo est dessiné sans passer par #marque-logo");

  // 2g. l'adresse est toujours coupée quand elle est celle d'une vraie personne
  for (const m of compact.matchAll(/\b[\w.]+@[\w.]+\.\w+/g))
    if (!/example\.com|totem\.app|•/.test(m[0]) && !/hello@/.test(m[0]))
      dire(p.nom, `adresse en clair : ${m[0]}`);

  // 2h. la durée de vie du code : une seule valeur pour toute la porte.
  //     Attention : « paused for fifteen minutes » est une mise en pause, pas
  //     une durée de vie. On ne retient que ce qui parle du code lui-même.
  for (const m of compact.matchAll(/(.{0,40}?)\b(?:lasts?|expires? in|valid for) ([a-z]+) minutes?/gi))
    if (!/\bpause\b/i.test(m[1])) (compte[`vie:${m[2].toLowerCase()}`] ??= []).push(p.nom);
}
for (const famille of ["vie", "carnet"]) {
  const freres = Object.keys(compte).filter((x) => (x.startsWith("vie:") ? "vie" : "carnet") === famille);
  if (freres.length > 1)
    dire("série", `${famille === "vie" ? "durée de vie du code" : "nombre de codes de secours"} : ${freres.map((x) => `« ${x.replace("vie:", "")} » (${[...new Set(compte[x])].join(", ")})`).join(" vs ")}`);
}

// — 3. collisions de noms avec la feuille commune —
//    Une classe partagée n'est pas dangereuse en soi : « .btn » est faite pour
//    être reprise. Ce qui blesse, et qui a déjà coûté trois fois, c'est le
//    mélange : un élément qui porte à la fois un nom LOCAL et un nom que la
//    feuille commune habille par une règle NUE, sans que la planche ait
//    redéclaré ce nom. L'habillage commun se glisse alors dans le composant
//    local, en silence — c'est ainsi qu'une carte s'est retrouvée à 3060px.
{
  const css = readFileSync(join(ici, "systeme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const nues = new Set();                                   // règles « .x { } » sans ancêtre
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

  for (const p of PLANCHES) {
    const f = join(ici, `${p.nom}.src.html`);
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
      const melange = noms.some((n) => locales.has(n) && !nues.has(n));
      if (!melange) continue;
      for (const n of noms)
        if (nues.has(n) && !locales.has(n) && !vues.has(n)) {
          vues.add(n);
          dire(p.nom, `« class="${attr}" » : « .${n} » est habillée par une règle nue de la feuille commune que la planche ne redéclare pas — l'habillage se glisse dedans`);
        }
    }
  }
}

// — 4. rendu —
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" } });
const empreintes = {};
for (const p of PLANCHES) {
  const f = join(ici, `${p.nom}.html`);
  if (!existsSync(f)) continue;
  const page = await b.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });
  await page.goto("file://" + f, { waitUntil: "load" });
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => ({
    h: document.documentElement.scrollHeight, l: document.documentElement.scrollWidth,
    pleins: document.querySelectorAll(".btn--primaire, .btn--accent").length,
    champsCode: document.querySelectorAll('[autocomplete="one-time-code"]').length,
    hauteurChamp: [...document.querySelectorAll('[autocomplete="one-time-code"]')]
      .map((e) => Math.round(e.getBoundingClientRect().height)),
    cibles: [...document.querySelectorAll("button, a[href], input, [role=switch], [role=tab]")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.height < 24 || r.width < 24); }).length,
  }));
  await page.close();
  empreintes[p.nom] = m;
  if (m.l > 1500) dire(p.nom, `débordement horizontal (${m.l}px)`);
  if (m.h < 900 || m.h > 1500) dire(p.nom, `hauteur de page ${m.h}px (viser 940–1400)`);
  if (m.pleins > p.pleins) dire(p.nom, `${m.pleins} boutons pleins pour ${p.pleins} annoncé(s)`);
  if (m.cibles) dire(p.nom, `${m.cibles} cible(s) sous 24px (WCAG 2.2 §2.5.8)`);
  for (const h of m.hauteurChamp)
    if (h < 40) dire(p.nom, `champ de code haut de ${h}px — la porte demande 48`);
}
await b.close();

console.log("\n— empreintes de la porte —");
for (const [n, m] of Object.entries(empreintes))
  console.log(`  ${n.padEnd(21)} page ${String(m.l).padStart(4)}×${String(m.h).padStart(4)}  ${m.pleins} bouton(s) plein(s)  ${m.champsCode} champ(s) de code ${m.hauteurChamp.join("/") || "—"}px`);

if (fautes.length === 0) console.log("\n✔ INSPECTION DE LA PORTE : les sept planches se tiennent.");
else { console.log(`\n✘ INSPECTION DE LA PORTE : ${fautes.length} point(s) à corriger`); fautes.forEach((f) => console.log("  " + f)); process.exit(1); }
