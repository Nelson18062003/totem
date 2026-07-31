// Reçus PDF TOTEM — A3 paysage.
//
//   node recus.mjs
//
// Trois zones, de haut en bas, dans l'ordre où on lit :
//
//   1. QUI ÉMET LE REÇU    le logo, le type de document, son numéro
//   2. CE QUI S'EST PASSÉ  le montant, de qui, vers qui
//   3. LES PREUVES         ID de transaction, date, frais, commission
//
// Un seul montant en gros : celui qui a réellement changé de main. Les frais
// et la commission sont des lignes de détail, jamais un second gros chiffre.
import { createRequire } from "module";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const ICI = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(ICI, "apercus"), { recursive: true });

// La police est incrustée dans le PDF en base64 : le fichier produit ne dépend
// d'aucune police installée sur la machine qui l'ouvre.
const POLICES = {
  400: "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAmZthTg.ttf",
  700: "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf",
};

async function police(graisse) {
  const cache = join(ICI, `.dmsans-${graisse}.ttf`);
  if (!existsSync(cache)) {
    console.log(`telechargement de DM Sans ${graisse}…`);
    const rep = await fetch(POLICES[graisse]);
    writeFileSync(cache, Buffer.from(await rep.arrayBuffer()));
  }
  return readFileSync(cache).toString("base64");
}

const b400 = await police(400);
const b700 = await police(700);

// --- Le symbole TOTEM --------------------------------------------------------
const BRIN_A =
  "M16 4.4C17.54 5.302 22.6 6.462 22.6 8.267C22.6 10.071 19.08 10.329 16 12.133" +
  "C12.92 13.938 9.4 14.196 9.4 16C9.4 17.804 12.92 18.062 16 19.867" +
  "C19.08 21.671 22.6 21.929 22.6 23.733C22.6 25.538 17.54 26.698 16 27.6";
const BRIN_B =
  "M16 4.4C14.46 5.302 9.4 6.462 9.4 8.267C9.4 10.071 12.92 10.329 16 12.133" +
  "C19.08 13.938 22.6 14.196 22.6 16C22.6 17.804 19.08 18.062 16 19.867" +
  "C12.92 21.671 9.4 21.929 9.4 23.733C9.4 25.538 14.46 26.698 16 27.6";

let n = 0;
function symbole(taille, couleur) {
  const id = "m" + n++;
  const coupe = (y) =>
    `<rect x="-7.68" y="-3.55" width="15.36" height="7.1" fill="#000" ` +
    `transform="translate(16,${y}) rotate(149.64)"/>`;
  const trait =
    `fill="none" stroke="${couleur}" stroke-width="4.8" ` +
    `stroke-linecap="round" stroke-linejoin="round"`;
  const masque = (k, y) =>
    `<mask id="${id}${k}" maskUnits="userSpaceOnUse" x="-.2" y="-.4" ` +
    `width="32.4" height="32.8"><rect x="-.2" y="-.4" width="32.4" height="32.8" ` +
    `fill="#fff"/>${coupe(y)}</mask>`;
  return (
    `<svg viewBox="0 0 32 32" width="${taille}" height="${taille}">` +
    `<defs>${masque("a", 19.867)}${masque("b", 12.133)}</defs>` +
    `<path d="${BRIN_A}" ${trait} mask="url(#${id}a)"/>` +
    `<path d="${BRIN_B}" ${trait} mask="url(#${id}b)"/></svg>`
  );
}

// --- Les montants ------------------------------------------------------------
//
// Un séparateur de milliers écrit avec une espace — même une espace insécable —
// garde toujours la même chasse, quelle que soit la taille du texte. À 74 pt les
// tranches se collent, et « 2 784 137 » se lit « 2784137 ».
//
// On ne se sert donc d'aucune espace : chaque tranche de trois chiffres est un
// élément à part, et l'écart est une marge en `em`. Il devient proportionnel au
// corps — visible à 74 pt comme à 12 pt, et identique partout.
//
// Second piège, celui d'Orange : « 2784137.6FCFA ». Le point est une décimale,
// pas un séparateur de milliers.
function montant(valeur, { devise = true } = {}) {
  const negatif = valeur < 0;
  let brut = Math.abs(valeur).toFixed(2);
  // On ne garde les décimales que si elles disent quelque chose.
  if (brut.includes(".")) brut = brut.replace(/0+$/, "").replace(/\.$/, "");
  const [entier, decimales] = brut.split(".");

  const tranches = [];
  for (let i = entier.length; i > 0; i -= 3) {
    tranches.unshift(entier.slice(Math.max(0, i - 3), i));
  }

  return (
    (negatif ? "−" : "") +
    tranches.map((t) => `<span class="g">${t}</span>`).join("") +
    (decimales ? `<span class="dec">,${decimales}</span>` : "") +
    (devise ? `<span class="dev">FCFA</span>` : "")
  );
}

// --- Le gabarit --------------------------------------------------------------
const STYLE = `
@font-face{font-family:"DM Sans";src:url(data:font/ttf;base64,${b400}) format("truetype");font-weight:400}
@font-face{font-family:"DM Sans";src:url(data:font/ttf;base64,${b700}) format("truetype");font-weight:700}
@page{size:A3 landscape;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:"DM Sans",system-ui,sans-serif;background:#fff;color:#16171a;
  letter-spacing:-0.011em;-webkit-font-smoothing:antialiased;
}
.page{width:420mm;height:297mm;padding:26mm 28mm;display:flex;flex-direction:column}

/* Toutes les étiquettes du document parlent la même langue. */
.k{font-size:12pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
  color:#8a8279;line-height:1}

/* ZONE 1 — qui émet le reçu */
.haut{display:flex;justify-content:space-between;align-items:flex-end;
  padding-bottom:9mm;border-bottom:1px solid #e8e5e1}
.logo{display:flex;align-items:center;gap:7mm}
.logo span{font-weight:700;text-transform:uppercase;letter-spacing:.18em;
  font-size:30pt;line-height:1}
.doc{text-align:right}
.doc .t{font-size:17pt;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.doc .n{font-size:12pt;color:#8a8279;font-variant-numeric:tabular-nums;margin-top:2.5mm}

/* ZONE 2 — ce qui s'est passé */
.centre{flex:1;display:flex;align-items:center;gap:24mm;padding:14mm 0}
.somme-bloc{flex:0 0 42%}
.somme{margin-top:6mm;font-size:74pt;font-weight:700;letter-spacing:-.04em;
  line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}

/* L'écart entre tranches de trois chiffres est une marge, pas une espace :
   il suit le corps du texte. */
.g + .g{margin-left:.22em}
.dec{margin-left:.02em}
.dev{font-size:.42em;letter-spacing:-.01em;margin-left:.34em;color:#62605c}
.preuves .dev{font-size:.66em;margin-left:.3em}

.tiers{flex:1;display:flex;gap:20mm}
.tiers > div{flex:1;min-width:0}
.tiers .nom{margin-top:6mm;font-size:27pt;font-weight:700;letter-spacing:-.025em;
  line-height:1.18}
.tiers .num{margin-top:3mm;font-size:17pt;color:#62605c;
  font-variant-numeric:tabular-nums}

/* ZONE 3 — les preuves */
.preuves{background:#f7f4f1;border-radius:4mm;padding:11mm 13mm;
  display:flex;gap:12mm;align-items:stretch}
.preuves > div{min-width:0;display:flex;flex-direction:column}
/* L'étiquette réserve deux lignes : les valeurs s'alignent, qu'elle tienne
   sur une ligne ou sur deux. */
.preuves .k{line-height:1.32;min-height:2.64em}
.preuves .v{margin-top:2mm;font-size:17pt;font-weight:700;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;line-height:1.28}

.pied{margin-top:9mm;display:flex;justify-content:space-between;
  font-size:11pt;color:#8a8279}
`;

const haut = (type, recu) => `
  <div class="haut">
    <div class="logo">${symbole(78, "#9a4b2e")}<span>Totem</span></div>
    <div class="doc"><div class="t">${type}</div><div class="n">N° ${recu}</div></div>
  </div>`;

// `poids` : la part de largeur que prend la colonne. Un ID de transaction
// occupe deux fois la place d'un montant de frais.
const preuve = (k, v, poids = 1) =>
  `<div style="flex:${poids}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

const pied = () => `
  <div class="pied"><span>Orange Money · Douala, Cameroun</span><span>Maquette</span></div>`;

// --- 1. Reçu de transfert ----------------------------------------------------
const t = {
  recu: "TM-2026-0731-0042",
  brut: 184137,           // « Montant Transaction », ce qu'Orange a prélevé
  net: 184137,            // « Montant Net », ce qui a réellement changé de main
  frais: 0,
  commission: 0,
  id: "PP260731.1319.B45805",
  date: "31 juillet 2026",
  heure: "13 h 19",
  deNom: "PRIX MONO SARL",
  deNum: "656 483 918",
  aNom: "WONDER PHONE",
  aNum: "696 103 864",
};

const transfert = `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>
<div class="page">
  ${haut("Reçu de transfert", t.recu)}

  <div class="centre">
    <div class="somme-bloc">
      <div class="k">Montant reçu</div>
      <div class="somme">${montant(t.net)}</div>
    </div>
    <div class="tiers">
      <div>
        <div class="k">De</div>
        <div class="nom">${t.deNom}</div>
        <div class="num">${t.deNum}</div>
      </div>
      <div>
        <div class="k">À</div>
        <div class="nom">${t.aNom}</div>
        <div class="num">${t.aNum}</div>
      </div>
    </div>
  </div>

  <div class="preuves">
    ${preuve("ID transaction", t.id, 2.2)}
    ${preuve("Date", `${t.date}<br>${t.heure}`, 1.3)}
    ${preuve("Montant transaction", montant(t.brut), 1.5)}
    ${preuve("Frais", montant(t.frais), 1)}
    ${preuve("Commission", montant(t.commission), 1)}
  </div>

  ${pied()}
</div>`;

// --- 2. Reçu de solde --------------------------------------------------------
const s = {
  recu: "TM-2026-0731-0043",
  solde: 2784137.6,
  date: "31 juillet 2026",
  heure: "15 h 45",
  compte: "WONDER PHONE",
  numero: "696 103 864",
};

const solde = `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>
<div class="page">
  ${haut("Reçu de solde", s.recu)}

  <div class="centre">
    <div class="somme-bloc">
      <div class="k">Solde du compte</div>
      <div class="somme">${montant(s.solde)}</div>
    </div>
    <div class="tiers">
      <div>
        <div class="k">Compte</div>
        <div class="nom">${s.compte}</div>
        <div class="num">${s.numero}</div>
      </div>
      <div></div>
    </div>
  </div>

  <div class="preuves">
    ${preuve("Opérateur", "Orange Money", 1.4)}
    ${preuve("Date du relevé", s.date, 1.4)}
    ${preuve("Heure du relevé", s.heure, 1)}
  </div>

  ${pied()}
</div>`;

// --- Rendu -------------------------------------------------------------------
const navigateur = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"],
  proxy: { server: "direct://" },
});

for (const [nom, html] of [["recu-transfert", transfert], ["recu-solde", solde]]) {
  const base = join(ICI, "apercus", nom);
  const page = await navigateur.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: `${base}.pdf`, format: "A3", landscape: true, printBackground: true });
  const vue = await navigateur.newPage({
    viewport: { width: 1587, height: 1123 },
    deviceScaleFactor: 2,
  });
  await vue.setContent(html, { waitUntil: "load" });
  await vue.evaluate(() => document.fonts.ready);
  await vue.screenshot({ path: `${base}.png`, clip: { x: 0, y: 0, width: 1587, height: 1123 } });
  console.log("  ", `apercus/${nom}.pdf`);
  await page.close();
  await vue.close();
}
await navigateur.close();
