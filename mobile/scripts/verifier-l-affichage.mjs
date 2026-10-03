// L'AUDIT D'AFFICHAGE — chaque écran de l'application, à chaque taille.
//
//     node scripts/verifier-l-affichage.mjs /tmp/apercu
//
// Prérequis : les mêmes que verifier-les-formats (voir son en-tête) — le
// faux nuage sur 4999, la plateforme d'essai sur 3120, et un export web
// portant EXPO_PUBLIC_APERCU=1 et EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3120.
//
// POURQUOI UN AUDIT, ET PAS UN ÉCRAN DE PLUS DANS LE HARNAIS DES FORMATS.
// Celui-là mesurait la boîte de réception, et rien d'autre. Pendant ce temps,
// sur un petit iPhone, l'écran du code secret ne montrait plus que « Entrez
// votre code secret » — le montant et le nom qu'on allait signer étaient
// passés sous le pavé — et, dans la fiche d'un SMS, l'icône du bouton du
// reçu sortait du bouton, poussée par un libellé trop long. Aucun des deux
// n'était dans la boîte de réception.
//
// Il ouvre donc TOUT : l'écran de connexion, les quatre onglets, les écrans
// des réglages, la fiche d'un SMS, et une opération jusqu'au pavé du code —
// avec un message d'opérateur aussi long qu'un vrai écran USSD (182
// caractères au plus ; le faux nuage en sert 177).
//
// CE QU'IL CHERCHE, sur chaque écran et à chaque taille :
//
//   débord      la page glisse-t-elle de côté ?
//   hors-cadre  un élément sort-il de la fenêtre sans être rogné ?
//   coupé       du texte amputé sans que ce soit voulu (« Withdra… »)
//   bouton      un libellé ou une icône qui SORT de son bouton
//   caché       un bouton recouvert par autre chose à l'endroit où l'on
//               appuierait — le doigt toucherait l'autre chose
//   signé       sur l'écran du code : le message de l'opérateur est-il
//               ENTIER au-dessus du pavé, sans avoir à le faire défiler ?
//
// Il porte son TÉMOIN : une page fabriquée avec les trois fautes (un bouton
// dont l'icône sort, un bouton recouvert, un message sous le pavé). S'il ne
// les voit pas toutes, il s'arrête — une sonde qui ne voit rien ne prouve
// rien.

import { createRequire } from "module";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
const require = createRequire(import.meta.url);

const RACINE = process.argv[2] || "dist";
if (!existsSync(join(RACINE, "index.html"))) {
  console.error(`\n✗ Aucun aperçu web dans « ${RACINE} ». Voir l'en-tête.`);
  process.exit(1);
}
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".map": "application/json",
};
const fichiers = createServer((req, res) => {
  const demande = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let chemin = join(RACINE, normalize(demande).replace(/^(\.\.[/\\])+/, ""));
  if (!existsSync(chemin) || statSync(chemin).isDirectory()) chemin = join(RACINE, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(chemin)] || "application/octet-stream" });
  createReadStream(chemin).pipe(res);
});
await new Promise((r) => fichiers.listen(0, "127.0.0.1", r));
const APERCU = `http://127.0.0.1:${fichiers.address().port}`;

const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  // Voir verifier-les-formats : le téléphone ne connaît pas le CORS.
  args: ["--no-sandbox", "--no-proxy-server", "--disable-web-security",
         "--disable-features=IsolateOrigins,site-per-process"],
  proxy: { server: "direct://" },
});

// Les tailles, en POINTS. Celles de verifier-les-formats, plus les deux qui
// manquaient à l'écran du code : un Android court (360 × 640, beaucoup de
// téléphones d'entrée de gamme encore en service) et l'iPhone mini.
const FORMATS = [
  ["android-court",     360, 640],
  ["tres-petit",        320, 640],
  ["petit",             360, 800],
  ["courant",           412, 915],
  ["pliable-ferme",     344, 882],
  ["paysage",           915, 412],
  ["pliable-ouvert",    673, 841],
  ["tablette",          800, 1280],
  ["tablette-pays",    1280, 800],
  ["iphone-se",         375, 667],
  ["iphone-mini",       375, 812],
  ["iphone-16",         393, 852],
  ["iphone-16-pro-max", 440, 956],
  ["pro-max-agrandi",   402, 874],
];
// Le paysage d'un téléphone (412 de haut) n'est pas un format où l'on
// tape un code secret : l'écran du code se mesure à partir de 560 points.
const HAUTEUR_MIN_CODE = 560;

// --- Les mesures -------------------------------------------------------------
// Tout se calcule DANS la page. Une seule fonction, réutilisée par le témoin.
const MESURER = async () => {
  const W = innerWidth, H = innerHeight;
  // La couche du dessus : une fenêtre modale ouverte cache ce qui est
  // dessous, à dessein — on ne mesure que ce qu'on peut toucher.
  const modales = [...document.querySelectorAll('[aria-modal="true"]')];
  const racine = modales.length ? modales[modales.length - 1] : document.body;
  const tous = [...racine.querySelectorAll("*")];
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const s = getComputedStyle(e);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return null;
    return r;
  };
  // Le rectangle réellement visible d'un élément : le sien, rogné par chaque
  // parent qui rogne (défilement, overflow hidden) et par la fenêtre.
  const rectVisible = (e) => {
    let r = e.getBoundingClientRect();
    let g = Math.max(r.left, 0), d = Math.min(r.right, W);
    let h = Math.max(r.top, 0), b = Math.min(r.bottom, H);
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflow !== "visible" || s.overflowY !== "visible" || s.overflowX !== "visible") {
        const pr = p.getBoundingClientRect();
        g = Math.max(g, pr.left); d = Math.min(d, pr.right);
        h = Math.max(h, pr.top); b = Math.min(b, pr.bottom);
      }
    }
    return { left: g, right: d, top: h, bottom: b };
  };
  const nom = (e) => ((e.getAttribute("aria-label") || e.innerText || e.tagName) + "")
    .replace(/\s+/g, " ").trim().slice(0, 30);

  const debord = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  const horsCadre = tous.filter((e) => {
    const r = visible(e);
    if (!r || !(r.right > W + 1 || r.left < -1)) return false;
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflow === "hidden" || s.overflowX !== "visible") {
        const pr = p.getBoundingClientRect();
        if (pr.right <= W + 1 && pr.left >= -1) return false;
      }
    }
    return true;
  }).map(nom);

  const coupe = tous
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
    .filter((e) => e.scrollWidth > e.clientWidth + 1)
    .filter((e) => {
      if (getComputedStyle(e).textOverflow === "ellipsis") return false;
      for (let p = e.parentElement; p; p = p.parentElement) {
        if (p.getBoundingClientRect().width < 2) return false;
      }
      return true;
    })
    .map((e) => (e.textContent || "").trim().slice(0, 24));

  // Le texte ABRÉGÉ exprès (« … », ou coupé à N lignes). Juste dans une
  // liste ; un contresens dans une fiche, qu'on ouvre pour tout voir.
  const abrege = tous
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
    .filter((e) => {
      const s = getComputedStyle(e);
      const voulu = s.textOverflow === "ellipsis" || (s.webkitLineClamp && s.webkitLineClamp !== "none");
      return voulu && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
    })
    .map((e) => (e.textContent || "").trim().slice(0, 24));

  // Les boutons : ce que le clavier peut atteindre (voir verifier-la-reponse,
  // `cursor: pointer` descend en héritage et compte les mots des boutons).
  const boutons = tous.filter((e) =>
    (e.getAttribute("role") === "button" || e.tagName === "BUTTON" || e.tabIndex >= 0)
    && e.tagName !== "INPUT" && visible(e));

  // Un enfant de bouton qui DÉPASSE le bouton, de plus de deux points.
  const sortDuBouton = boutons.filter((b) => {
    const br = b.getBoundingClientRect();
    return [...b.querySelectorAll("*")].some((c) => {
      const cr = visible(c);
      if (!cr) return false;
      return cr.left < br.left - 2 || cr.right > br.right + 2
        || cr.top < br.top - 2 || cr.bottom > br.bottom + 2;
    });
  }).map(nom);

  // Un bouton RECOUVERT : au milieu de sa partie visible, ce que le doigt
  // toucherait n'est ni lui, ni un de ses enfants, ni un de ses parents.
  const recouvert = (b) => {
    const v = rectVisible(b);
    if (v.right - v.left < 4 || v.bottom - v.top < 4) return false;   // hors de vue : défilé, pas caché
    const x = (v.left + v.right) / 2, y = (v.top + v.bottom) / 2;
    const ici = document.elementFromPoint(x, y);
    const oui = Boolean(ici) && !(b === ici || b.contains(ici) || ici.contains(b));
    if (oui) b.__dessus = ici;
    return oui;
  };
  // Une ligne qui passe sous la barre d'onglets flottante n'est cachée qu'un
  // instant : on la fait défiler au milieu de l'écran, comme le ferait le
  // doigt. N'est un défaut que ce qui RESTE caché — la dernière ligne d'une
  // liste sans assez de marge sous elle, un bouton sous un pied de fiche.
  // Le défilement prend son temps (quelques images) : on le laisse finir.
  const posee = () => new Promise((r) => setTimeout(r, 250));
  const cache = [];
  for (const b of boutons.filter(recouvert)) {
    b.scrollIntoView({ block: "center", inline: "nearest" });
    await posee();
    if (recouvert(b)) cache.push(`${nom(b)} ← sous « ${b.__dessus ? nom(b.__dessus) : "?"} »`);
  }
  // Et l'écran revient en haut, pour la mesure suivante.
  for (const e of racine.querySelectorAll("*")) if (e.scrollTop) e.scrollTop = 0;

  // L'écran du code : le message ENTIER au-dessus du pavé.
  //
  // Le pavé et le message se trouvent par ce qu'on VOIT — les touches 1 à 9,
  // le texte de l'opérateur — et non par une marque posée dans le code : le
  // témoin, c'est l'application d'avant, qui ne portait pas de marque. Une
  // sonde qui ne sait regarder que la version corrigée ne prouve rien.
  let signe = null;
  const touches = [...racine.querySelectorAll('[role="button"],button')]
    .filter((b) => /^[1-9]$/.test((b.innerText || "").trim()) && visible(b));
  const fin = (window.__MESSAGE_FIN__ || "code secret");
  const debut = (window.__MESSAGE_DEBUT__ || "Depot de 5");
  // L'élément le plus PROFOND qui porte le message entier, du début à la fin
  // — pas le cadre qui le fait défiler, qui porte le même texte et tient,
  // lui, toujours dans l'écran.
  const porte = (e) => { const t = e.innerText || ""; return t.includes(debut) && t.includes(fin); };
  const message = tous.filter(porte).find((e) => ![...e.children].some(porte));
  if (touches.length >= 9 && message) {
    const pr = { top: Math.min(...touches.map((b) => b.getBoundingClientRect().top)) };
    const mr = message.getBoundingClientRect();
    const v = rectVisible(message);
    const entier = mr.top >= v.top - 1 && mr.bottom <= v.bottom + 1;
    signe = { entier, auDessus: mr.bottom <= pr.top + 1,
              cache: Math.max(0, Math.round(mr.bottom - Math.min(v.bottom, pr.top))) };
  }
  return { debord, horsCadre, coupe, abrege, sortDuBouton, cache, signe,
           texte: (racine.innerText || "").slice(0, 400) };
};

// --- Le témoin ---------------------------------------------------------------
{
  const page = await nav.newPage({ viewport: { width: 375, height: 667 } });
  await page.setContent(`<!doctype html><body style="margin:0">
    <div role="button" tabindex="0" style="display:flex;width:120px;height:40px;margin:20px">
      <span style="flex-shrink:0;width:30px">▣</span>
      <span style="white-space:nowrap">Un libellé bien trop long pour ce bouton</span>
    </div>
    <div role="button" tabindex="0" style="width:120px;height:40px;margin:20px">Caché</div>
    <div style="position:absolute;top:80px;left:0;width:200px;height:80px;background:#ccc"></div>
    <div style="height:200px;overflow:auto;margin-top:40px">
      <div style="height:400px">Depot de 5 000 FCFA … Entrez votre code secret:</div>
    </div>
    <div>${[1,2,3,4,5,6,7,8,9].map((n) => `<div role="button" tabindex="0" style="display:inline-block;width:30px">${n}</div>`).join("")}</div>
  </body>`);
  const t = await page.evaluate(MESURER);
  await page.close();
  const vu = [t.sortDuBouton.length > 0, t.cache.length > 0, Boolean(t.signe && !t.signe.entier)];
  if (!vu.every(Boolean)) {
    console.error("\n✗ LE TÉMOIN N'EST PAS VU : la sonde ne voit pas une faute fabriquée");
    console.error(`  (bouton qui déborde ${vu[0]}, bouton caché ${vu[1]}, message coupé ${vu[2]}) ${JSON.stringify({ s: t.signe, c: t.cache, b: t.sortDuBouton })}`);
    console.error("  Elle ne prouverait rien sur l'application. On s'arrête.");
    process.exit(1);
  }
  console.log("  témoin : les trois fautes fabriquées sont vues ✓");
}

// --- Le compte ---------------------------------------------------------------
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";
{
  const r = await fetch("http://127.0.0.1:3120/api/inscription", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
  });
  if (!r.ok && r.status !== 409 && r.status !== 403) {
    console.error(`\n✗ le compte d'essai n'a pas pu être créé (${r.status}). La plateforme`);
    console.error("  d'essai tourne-t-elle sur 3120, reliée au faux nuage sur 4999 ?");
    process.exit(1);
  }
}

const attendreTexte = (page, re, ms = 20000) =>
  page.waitForFunction((src) => new RegExp(src, "i").test(document.body.innerText),
                       re.source, { timeout: ms });

let defauts = 0;
const resume = [];
function noter(format, ecran, m) {
  const fautes = [];
  if (m.debord > 0) fautes.push(`débord ${m.debord}`);
  if (m.horsCadre.length) fautes.push(`hors-cadre ${m.horsCadre.slice(0, 2).join(" | ")}`);
  if (m.coupe.length) fautes.push(`coupé ${m.coupe.slice(0, 2).join(" | ")}`);
  if (ecran.startsWith("fiche") && m.abrege.length) {
    fautes.push(`abrégé dans une fiche ${m.abrege.slice(0, 2).join(" | ")}`);
  }
  if (m.sortDuBouton.length) fautes.push(`sort du bouton ${m.sortDuBouton.slice(0, 2).join(" | ")}`);
  if (m.cache.length) fautes.push(`caché ${m.cache.slice(0, 2).join(" | ")}`);
  if (m.signe && !(m.signe.entier && m.signe.auDessus)) {
    fautes.push(`message de l'opérateur caché de ${m.signe.cache} pt`);
  }
  if (fautes.length) defauts += fautes.length;
  resume.push(`  ${fautes.length ? "✗" : "✓"} ${format.padEnd(18)} ${ecran.padEnd(16)} ${fautes.join(" ; ")}`);
}

const SEUL = process.env.FORMAT;      // pour rejouer une seule taille
for (const [format, w, h] of FORMATS.filter(([n]) => !SEUL || n === SEUL)) {
  const page = await nav.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(String(e).slice(0, 120)));
  const mesurer = async (ecran) => {
    await page.waitForTimeout(700);           // la fin d'une entrée animée
    noter(format, ecran, await page.evaluate(MESURER));
  };

  // 1. La connexion — avant d'entrer.
  await page.goto(APERCU, { waitUntil: "networkidle" });
  const courriel = page.locator('input[type="email"]:not([readonly])');
  try {
    // L'accueil des trois écrans peut passer avant : on le traverse.
    for (let i = 0; i < 6 && !(await courriel.count()); i++) {
      const passer = page.getByText(/^(Skip|Passer|Next|Suivant|Start|Commencer|Get started)$/i);
      if (await passer.count()) await passer.last().click();
      await page.waitForTimeout(600);
    }
    await courriel.waitFor({ state: "visible", timeout: 20000 });
  } catch {
    console.error(`\n✗ ${format} : l'écran de connexion ne s'ouvre pas. Ce qu'il affiche :\n`);
    console.error(await page.evaluate(() => document.body.innerText));
    process.exit(1);
  }
  await mesurer("connexion");
  await courriel.fill(COURRIEL);
  await page.locator('input[type="password"]').fill(MOTDEPASSE);
  await page.getByText(/^(Sign in|Se connecter)$/).last().click();
  try {
    await attendreTexte(page, /FCFA/);
  } catch {
    console.error(`\n✗ ${format} : la connexion n'aboutit pas. Ce que l'écran dit :\n`);
    console.error(await page.evaluate(() => document.body.innerText));
    process.exit(1);
  }

  // 2. Les écrans, un par un — par leur adresse.
  for (const [ecran, chemin, preuve] of [
    ["accueil", "/", /FCFA/],
    ["sms", "/encaissements", /NKENGAFAC/],
    ["operations", "/actions", /MTN|Orange/],
    ["cartes", "/cartes", /MTN|Orange/],
    ["reglages", "/reglages", /.+/],
    ["bilan", "/analyse", /.+/],
    ["beneficiaires", "/beneficiaires", /.+/],
    ["cadran", "/ussd", /.+/],
  ]) {
    await page.goto(`${APERCU}${chemin}`, { waitUntil: "networkidle" });
    try { await attendreTexte(page, preuve); } catch { /* mesuré tel quel */ }
    await mesurer(ecran);
  }

  // 3. La fiche d'un SMS — avec son pied (le reçu).
  await page.goto(`${APERCU}/encaissements`, { waitUntil: "networkidle" });
  await attendreTexte(page, /NKENGAFAC/);
  await page.getByText(/NKENGAFAC MBOUNGOU/).first().click();
  await page.waitForTimeout(900);
  await mesurer("fiche-sms");
  // Le reçu établi, puis refait : ce sont les libellés LONGS qui poussaient
  // l'icône hors du bouton (« Receipt created — reopen this message to open
  // the PDF », « Document rebuilt — open the PDF: it is the new one. »).
  const etablir = page.getByText(/^(Issue the receipt|Établir le reçu)$/);
  if (await etablir.count()) {
    await etablir.first().click();
    try { await attendreTexte(page, /Share the receipt|Partager le reçu|reopen|rouvrez|ready|prêt/, 30000); }
    catch { /* mesuré tel quel */ }
    await mesurer("fiche-recu-etabli");
  }
  const refaire = page.getByText(/^(Rebuild the receipt|Refaire le reçu)$/);
  if (await refaire.count()) {
    await refaire.first().click();
    try { await attendreTexte(page, /rebuilt|refait/, 30000); } catch { /* mesuré tel quel */ }
    await mesurer("fiche-recu-refait");
  }

  // 3 bis. La fiche des coordonnées d'une carte (« Mon numéro »).
  await page.goto(APERCU, { waitUntil: "networkidle" });
  await attendreTexte(page, /FCFA/);
  const numero = page.getByText(/^(My number|Mon numéro)$/);
  if (await numero.count()) {
    await numero.first().click();
    await page.waitForTimeout(900);
    await mesurer("fiche-coordonnees");
  }

  // 4. Une opération jusqu'au pavé du code — là où l'on signe.
  if (h >= HAUTEUR_MIN_CODE) {
    await page.goto(APERCU, { waitUntil: "networkidle" });
    await attendreTexte(page, /FCFA/);
    await page.getByText(/^(Deposit|Dépôt)$/).first().click();
    await page.locator("input").first().waitFor({ timeout: 10000 });
    await page.locator("input").first().fill("677998877");
    await page.getByText(/^(Continue|Continuer)$/).last().click();
    await page.waitForTimeout(500);
    await page.locator("input").first().fill("5000");
    await page.getByText(/^(Continue|Continuer)$/).last().click();
    await page.waitForTimeout(500);
    await mesurer("verification");
    await page.getByText(/^(Confirm|Confirmer)$/).last().click();
    try {
      await page.getByRole("button", { name: /^5$/ }).first().waitFor({ timeout: 30000 });
      await mesurer("code-secret");
      for (const c of "1234") await page.getByRole("button", { name: new RegExp(`^${c}$`) }).first().click();
      await page.getByText(/^(Confirm|Valider)$/).last().click();
      try { await attendreTexte(page, /reussie|réussie|successful|completed/, 30000); } catch { /* tel quel */ }
      await mesurer("fin");
    } catch {
      noter(format, "code-secret", { debord: 0, horsCadre: [], coupe: [], abrege: [], sortDuBouton: [],
        cache: [], signe: { entier: false, auDessus: false, cache: -1 } });
      resume.push(`      (le pavé n'est jamais venu : ${(await page.evaluate(() =>
        document.body.innerText)).replace(/\s+/g, " ").slice(0, 120)})`);
    }
  }
  if (erreurs.length) resume.push(`      erreur de page : ${erreurs[0]}`);
  await page.close();
}
await nav.close();
fichiers.close();

console.log("");
for (const l of resume) console.log(l);
console.log(defauts
  ? `\n✗ ${defauts} défaut(s) d'affichage.`
  : "\n✓ Chaque écran tient, à chaque taille : rien ne déborde, rien n'est caché.");
process.exit(defauts ? 1 : 0);
