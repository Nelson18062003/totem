// Reçus PDF TOTEM — A3 paysage.
//
//   node recus/maquette.mjs
//
// Trois zones, de haut en bas, dans l'ordre où on lit :
//
//   1. QUI ÉMET LE REÇU    le logo, le type de document, son numéro
//   2. CE QUI S'EST PASSÉ  le montant, de qui, vers qui
//   3. LES PREUVES         ID de transaction, date, frais, commission
//
// Un seul montant en gros : celui qui a réellement changé de main. Les frais
// et la commission sont des lignes de détail, jamais un second gros chiffre.
//
// Le document est bilingue, anglais d'abord — comme `totem/recu.py`, qui
// transcrit cette maquette. Une seule commande produit les deux jeux
// d'aperçus dans `apercus/` :
//
//   recu-transfert.pdf/png, recu-solde.pdf/png        anglais (langue principale)
//   recu-transfert-fr.pdf/png, recu-solde-fr.pdf/png  français
//
// La langue change les libellés, les mois en toutes lettres, l'heure
// (« 13:19 » / « 13 h 19 ») et le séparateur décimal des montants (point en
// anglais, virgule en français). Elle ne touche jamais : les numéros de reçu,
// « FCFA », le signe « − », ni les données venues du SMS (noms, références).
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
//
// Le séparateur décimal imprimé suit la langue : point en anglais
// (« 2,784,137.6 » chez `formater_montant`), virgule en français
// (« 2 784 137,6 »). Les milliers, eux, n'ont jamais de séparateur écrit :
// l'écart entre tranches est une marge, dans les deux langues.
function montant(valeur, langue, { devise = true } = {}) {
  const negatif = valeur < 0;
  let brut = Math.abs(valeur).toFixed(2);
  // On ne garde les décimales que si elles disent quelque chose.
  if (brut.includes(".")) brut = brut.replace(/0+$/, "").replace(/\.$/, "");
  const [entier, decimales] = brut.split(".");

  const tranches = [];
  for (let i = entier.length; i > 0; i -= 3) {
    tranches.unshift(entier.slice(Math.max(0, i - 3), i));
  }
  const separateur = langue === "en" ? "." : ",";

  return (
    (negatif ? "−" : "") +
    tranches.map((t) => `<span class="g">${t}</span>`).join("") +
    (decimales ? `<span class="dec">${separateur}${decimales}</span>` : "") +
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
.k{font-size:13pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
  color:#8a8279;line-height:1}

/* ZONE 1 — qui émet le reçu */
.haut{display:flex;justify-content:space-between;align-items:flex-end;
  padding-bottom:9mm;border-bottom:1px solid #e8e5e1}
.logo{display:flex;align-items:center;gap:7mm}
.logo span{font-weight:700;text-transform:uppercase;letter-spacing:.18em;
  font-size:30pt;line-height:1}
.doc{text-align:right}
.doc .t{font-size:20pt;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.doc .n{font-size:13pt;color:#8a8279;font-variant-numeric:tabular-nums;margin-top:2.5mm}

/* La marque du réseau, en tête et à une taille où elle se RECONNAÎT. Elle
   était reléguée en bas de page, haute de onze points : sur un reçu qu'on
   tend à un client, le réseau est la première chose qu'on cherche. */
.reseau{display:flex;align-items:center;justify-content:flex-end;gap:11pt;
  margin-bottom:4mm}
.reseau .nom{font-size:12.5pt;font-weight:700}
.reseau .marque{display:inline-flex;align-items:center;justify-content:center;
  height:24pt;font-weight:700;letter-spacing:-.011em}
.reseau .orange{width:24pt;background:#ff7900;color:#fff;border-radius:2pt;
  font-size:8.2pt}
.reseau .mtn{width:45.6pt;background:#ffcb00;color:#16171a;border-radius:12pt;
  font-size:14.9pt}

/* ZONE 2 — ce qui s'est passé */
.centre{flex:1;display:flex;align-items:center;gap:24mm;padding:14mm 0}
.somme-bloc{flex:0 0 42%}
.somme{margin-top:6mm;font-size:88pt;font-weight:700;letter-spacing:-.04em;
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
.tiers .num{margin-top:3mm;font-size:21pt;color:#62605c;
  font-variant-numeric:tabular-nums}

/* ZONE 3 — les preuves */
/* Le bandeau garde sa pleine largeur — c'est un aplat, pas un tableau — mais
   ses colonnes se serrent à gauche : deux preuves écartées d'un demi-mètre ne
   se lisent plus ensemble. */
.preuves{background:#f7f4f1;border-radius:4mm;padding:11mm 13mm;
  display:flex;gap:12mm;align-items:stretch}
.preuves .fin{flex:0 0 auto}
.preuves > div{min-width:0;display:flex;flex-direction:column}
/* L'étiquette réserve deux lignes : les valeurs s'alignent, qu'elle tienne
   sur une ligne ou sur deux. */
.preuves .k{line-height:1.32;min-height:2.64em}
.preuves .v{margin-top:2mm;font-size:26pt;font-weight:700;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;line-height:1.28}

.pied{margin-top:9mm;display:flex;justify-content:space-between;
  font-size:13pt;color:#8a8279}
`;

// La marque du réseau se DESSINE — jamais une image téléchargée : le carré
// d'Orange, l'ovale de MTN, aux couleurs publiées.
const MARQUES = {
  "Orange Money": '<span class="marque orange">orange</span>',
  "MTN MoMo": '<span class="marque mtn">MTN</span>',
};

const haut = (type, recu, reseau = "Orange Money") => `
  <div class="haut">
    <div class="logo">${symbole(78, "#9a4b2e")}<span>Totem</span></div>
    <div class="doc">
      <div class="reseau">${MARQUES[reseau] ?? ""}<span class="nom">${reseau}</span></div>
      <div class="t">${type}</div><div class="n">N° ${recu}</div>
    </div>
  </div>`;

// `poids` : la part de largeur que prend la colonne. Un ID de transaction
// occupe deux fois la place d'un montant de frais.
const preuve = (k, v, poids = 1) =>
  `<div style="flex:${poids}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

// La cale qui empêche les colonnes de s'étirer sur toute la largeur quand
// elles sont peu nombreuses. Elle ne porte rien : elle occupe ce qui reste.
const cale = (poids) => `<div style="flex:${poids}"></div>`;

// --- Les deux langues --------------------------------------------------------
//
// Les mêmes libellés que `totem/recu.py`, mot pour mot : la maquette fait foi
// visuellement, le Python fait foi en service — ils ne doivent jamais diverger.
// Les données du SMS (noms, numéros, références) restent telles quelles.
const LIBELLES = {
  en: {
    transfert: "Transfer receipt",
    solde: "Balance receipt",
    montantRecu: "Amount received",
    montantEnvoye: "Amount sent",
    de: "From",
    a: "To",
    idTransaction: "Transaction ID",
    date: "Date",
    montantTransaction: "Transaction amount",
    frais: "Fees",
    commission: "Commission",
    soldeCompte: "Account balance",
    compte: "Account",
    operateur: "Operator",
    dateReleve: "Statement date",
    heureReleve: "Statement time",
    lieu: "Douala, Cameroon",
    dateEnLettres: "31 July 2026",
    heureTransfert: "13:19",
    heureSolde: "15:45",
  },
  fr: {
    transfert: "Reçu de transfert",
    solde: "Reçu de solde",
    montantRecu: "Montant reçu",
    montantEnvoye: "Montant envoyé",
    de: "De",
    a: "À",
    idTransaction: "ID transaction",
    date: "Date",
    montantTransaction: "Montant transaction",
    frais: "Frais",
    commission: "Commission",
    soldeCompte: "Solde du compte",
    compte: "Compte",
    operateur: "Opérateur",
    dateReleve: "Date du relevé",
    heureReleve: "Heure du relevé",
    lieu: "Douala, Cameroun",
    dateEnLettres: "31 juillet 2026",
    heureTransfert: "13 h 19",
    heureSolde: "15 h 45",
  },
};

// Le réseau signe en tête, en grand. Le répéter ici ferait deux fois la même
// chose, moins bien : le pied ne garde que le lieu.
const pied = (l) => `
  <div class="pied"><span>${l.lieu}</span><span>Maquette</span></div>`;

// --- 1. Reçu de transfert ----------------------------------------------------
// Deux jeux, parce que deux réseaux ne disent pas les mêmes choses.
//
// Orange détaille : montant brut, frais, commission. MTN ne donne que des
// frais, jamais de commission — mais il écrit son propre horodatage et le
// solde qu'il laisse. Le reçu montre ce que l'opérateur a dit, et rien de
// plus : une colonne vide vaudrait moins que pas de colonne.
const t = {
  reseau: "Orange Money",
  recu: "TM-2026-0731-0042",
  sens: "recu",
  brut: 184137,           // « Montant Transaction », ce qu'Orange a prélevé
  net: 184137,            // « Montant Net », ce qui a réellement changé de main
  frais: 0,
  commission: 0,
  id: "PP260731.1319.B45805",
  deNom: "PRIX MONO SARL",
  deNum: "656 483 918",
  aNom: "WONDER PHONE",
  aNum: "696 103 864",
};

// Un VRAI message MTN, relevé sur le terrain : un envoi. Le réseau ne nomme
// qu'un tiers — le destinataire — et laisse notre côté implicite (« from your
// mobile money account »). C'est le sens de l'opération qui décide de quel
// côté chacun se range.
const tm = {
  reseau: "MTN MoMo",
  recu: "TM-2026-0825-0235",
  sens: "envoye",
  net: 200000,
  frais: 0,
  id: "18496208804",
  deNom: "NGANGOM JONAS",
  deNum: "+237 652 236 856",
  aNom: "PAYSELA TECHNOLOGIES SARL",
  aNum: "+237 681 026 861",
  dateEnLettres: { en: "25 August 2026", fr: "25 août 2026" },
  heure: { en: "13:55", fr: "13 h 55" },
};

const transfert = (langue, d = t) => {
  const l = LIBELLES[langue];
  const jour = d.dateEnLettres ? d.dateEnLettres[langue] : l.dateEnLettres;
  const heure = d.heure ? d.heure[langue] : l.heureTransfert;
  // Les colonnes du bandeau : seules celles que l'opérateur a renseignées.
  const colonnes = [
    preuve(l.idTransaction, d.id, 2.2),
    preuve(l.date, `${jour}<br>${heure}`, 1.3),
  ];
  if (d.brut != null) colonnes.push(preuve(l.montantTransaction, montant(d.brut, langue), 1.5));
  if (d.frais != null) colonnes.push(preuve(l.frais, montant(d.frais, langue), 1));
  if (d.commission != null) colonnes.push(preuve(l.commission, montant(d.commission, langue), 1));
  // Peu de colonnes : elles se serrent à gauche, une cale occupe le reste.
  const reste = Math.max(0, 5 - colonnes.length);
  if (reste) colonnes.push(cale(reste * 1.2));

  return `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>
<div class="page">
  ${haut(l.transfert, d.recu, d.reseau)}

  <div class="centre">
    <div class="somme-bloc">
      <div class="k">${l[d.sens === "envoye" ? "montantEnvoye" : "montantRecu"]}</div>
      <div class="somme">${montant(d.net, langue)}</div>
    </div>
    <div class="tiers">
      <div>
        <div class="k">${l.de}</div>
        <div class="nom">${d.deNom}</div>
        <div class="num">${d.deNum}</div>
      </div>
      <div>
        <div class="k">${l.a}</div>
        <div class="nom">${d.aNom}</div>
        <div class="num">${d.aNum}</div>
      </div>
    </div>
  </div>

  <div class="preuves">
    ${colonnes.join("\n    ")}
  </div>

  ${pied(l)}
</div>`;
};

// --- 2. Reçu de solde --------------------------------------------------------
const s = {
  recu: "TM-2026-0731-0043",
  solde: 2784137.6,
  compte: "WONDER PHONE",
  numero: "696 103 864",
};

const solde = (langue) => {
  const l = LIBELLES[langue];
  return `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>
<div class="page">
  ${haut(l.solde, s.recu, "Orange Money")}

  <div class="centre">
    <div class="somme-bloc">
      <div class="k">${l.soldeCompte}</div>
      <div class="somme">${montant(s.solde, langue)}</div>
    </div>
    <div class="tiers">
      <div>
        <div class="k">${l.compte}</div>
        <div class="nom">${s.compte}</div>
        <div class="num">${s.numero}</div>
      </div>
      <div></div>
    </div>
  </div>

  <div class="preuves">
    ${preuve(l.operateur, "Orange Money", 1.4)}
    ${preuve(l.dateReleve, l.dateEnLettres, 1.4)}
    ${preuve(l.heureReleve, l.heureSolde, 1)}
  </div>

  ${pied(l)}
</div>`;
};

// --- Rendu -------------------------------------------------------------------
// L'anglais, langue principale, garde les noms de fichiers historiques ; le
// français prend le suffixe « -fr ».
const documents = [
  ["recu-transfert", transfert("en")],
  ["recu-transfert-mtn", transfert("en", tm)],
  ["recu-solde", solde("en")],
  ["recu-transfert-fr", transfert("fr")],
  ["recu-transfert-mtn-fr", transfert("fr", tm)],
  ["recu-solde-fr", solde("fr")],
];

const navigateur = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"],
  proxy: { server: "direct://" },
});

for (const [nom, html] of documents) {
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
