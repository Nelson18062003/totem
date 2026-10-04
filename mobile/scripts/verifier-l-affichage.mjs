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
// Il ouvre donc TOUT : l'écran de connexion et celui de l'inscription,
// « Ajouter ma carte » d'un compte qui vient de naître, les quatre onglets, les écrans
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
//   copie       une fois : la fiche des coordonnées copie-t-elle ce
//               qu'elle AFFICHE — le nom et le numéro, pas le réseau ?
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

// LE TEXTE D'EXEMPLE D'UN CHAMP tient-il dans le champ ? `MESURER` ne le voit
// pas : un « placeholder » n'est pas un élément, il ne déborde de rien, et
// le navigateur le coupe sans un mot. Le cadran disait « Tapez un code, ex.
// *126# » dans un champ de 134 points à 320 de large : on lisait « Type a
// code, e.g. * » — c'était justement le code d'exemple qui disparaissait.
// On compare la largeur du texte, à la police du champ, à la place utile.
const MESURER_EXEMPLES = () => [...document.querySelectorAll("input[placeholder]")]
  .filter((e) => e.placeholder && e.getBoundingClientRect().width > 0)
  .map((e) => {
    const s = getComputedStyle(e);
    const toile = document.createElement("canvas").getContext("2d");
    toile.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const besoin = toile.measureText(e.placeholder).width;
    const place = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    return { texte: e.placeholder, besoin: Math.ceil(besoin), place: Math.floor(place) };
  })
  .filter((x) => x.besoin > x.place + 1);

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
  // Le témoin du texte d'exemple : le même champ étroit, avec la phrase
  // d'avant (coupée) puis le code seul (qui tient).
  await page.setContent(`<!doctype html><body style="margin:0">
    <input style="width:134px;padding:0;border:0;font:15px sans-serif" placeholder="Type a code, e.g. *126#">
    <input style="width:134px;padding:0;border:0;font:15px sans-serif" placeholder="e.g. *126#">
  </body>`);
  const exemples = await page.evaluate(MESURER_EXEMPLES);
  await page.close();
  if (exemples.length !== 1 || !/Type a code/.test(exemples[0].texte)) {
    console.error("\n✗ LE TÉMOIN DU TEXTE D'EXEMPLE N'EST PAS VU : la sonde ne distingue pas"
      + ` un exemple coupé d'un exemple entier (${JSON.stringify(exemples)}). On s'arrête.`);
    process.exit(1);
  }
  const vu = [t.sortDuBouton.length > 0, t.cache.length > 0, Boolean(t.signe && !t.signe.entier)];
  if (!vu.every(Boolean)) {
    console.error("\n✗ LE TÉMOIN N'EST PAS VU : la sonde ne voit pas une faute fabriquée");
    console.error(`  (bouton qui déborde ${vu[0]}, bouton caché ${vu[1]}, message coupé ${vu[2]}) ${JSON.stringify({ s: t.signe, c: t.cache, b: t.sortDuBouton })}`);
    console.error("  Elle ne prouverait rien sur l'application. On s'arrête.");
    process.exit(1);
  }
  console.log("  témoin : les trois fautes fabriquées sont vues ✓ ; l'exemple coupé aussi ✓");
}

// --- Le compte ---------------------------------------------------------------
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";
{
  const r = await fetch("http://127.0.0.1:3120/api/inscription", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ prenom: "Essai", nom: "Totem", adresse: "Rue 1, Douala", telephone: "670000099", courriel: COURRIEL, motdepasse: MOTDEPASSE }),
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
let copieEprouvee = false;
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
  const page = await nav.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
                                  permissions: ["clipboard-read", "clipboard-write"] });
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

  // 1 bis. CRÉER UN COMPTE — la porte de quiconque télécharge TOTEM. Six
  // champs les uns sous les autres, l'œil du mot de passe, et le bouton :
  // le plus long formulaire de l'application, sur l'écran le plus étroit.
  // Rien ne part : on mesure, puis on revient à la connexion. L'application
  // d'avant n'avait pas cette porte — elle échoue ici, et c'est son témoin.
  {
    const creer = page.getByText(/^(Create an account|Créer un compte)$/);
    if (!(await creer.count())) {
      defauts++;
      resume.push(`  ✗ ${format.padEnd(18)} ${"inscription".padEnd(16)} aucune porte « Créer un compte »`);
    } else {
      await creer.last().click();
      try {
        await attendreTexte(page, /(Create my account|Créer mon compte)/);
        // Les six champs : prénom, nom, adresse, e-mail, téléphone, mot de passe.
        const champs = await page.locator("input:not([readonly])").count();
        if (champs < 6) {
          defauts++;
          resume.push(`  ✗ ${format.padEnd(18)} ${"inscription".padEnd(16)} ${champs} champs au lieu de six`);
        }
        await mesurer("inscription");
      } catch {
        defauts++;
        resume.push(`  ✗ ${format.padEnd(18)} ${"inscription".padEnd(16)} le formulaire ne s'ouvre pas`);
      }
      await page.getByText(/^(I already have an account|J’ai déjà un compte)$/).last().click();
      await courriel.waitFor({ state: "visible", timeout: 20000 });
    }
  }

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

  // 2 a. LES TROIS GESTES D'ARGENT d'Opérations : côte à côte d'ordinaire,
  // L'UN SOUS L'AUTRE sous 340 points — trois noms entiers ne tiendraient
  // plus côte à côte, et un nom coupé (« Transf… ») ou rétréci est
  // justement ce qu'on refuse. Chaque nom doit tenir dans sa tuile.
  {
    await page.goto(`${APERCU}/actions`, { waitUntil: "networkidle" });
    try { await attendreTexte(page, /(Withdraw|Retrait)/); } catch { /* vérifié tel quel */ }
    const tuiles = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')]
      .filter((e) => /^(Deposit|Dépôt|Withdraw|Retrait|Transfer|Transfert)$/
        .test(e.getAttribute("aria-label") || ""))
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => {
        const r = e.getBoundingClientRect();
        const textes = [...e.querySelectorAll("div, span")].filter((x) => !x.children.length
          && (x.textContent || "").trim());
        const coupe = textes.some((x) => x.scrollWidth > x.clientWidth + 1
          || x.getBoundingClientRect().right > r.right + 1 || x.getBoundingClientRect().left < r.left - 1);
        return { nom: e.getAttribute("aria-label"), haut: Math.round(r.top), coupe };
      }));
    const colonne = w < 340;
    const hauts = new Set(tuiles.map((t) => t.haut));
    const fautes = [];
    if (tuiles.length !== 3) fautes.push(`${tuiles.length} gestes d'argent trouvés au lieu de 3`);
    else if (colonne && hauts.size !== 3) fautes.push("sous 340 points, les gestes restent côte à côte");
    else if (!colonne && hauts.size !== 1) fautes.push("les gestes ne sont pas côte à côte");
    for (const t of tuiles) if (t.coupe) fautes.push(`« ${t.nom} » ne tient pas dans sa tuile`);
    if (fautes.length) defauts += fautes.length;
    resume.push(`  ${fautes.length ? "✗" : "✓"} ${format.padEnd(18)} ${"gestes d'argent".padEnd(16)} `
      + (fautes.length ? fautes.join(" ; ") : colonne ? "l'un sous l'autre, noms entiers" : "côte à côte, noms entiers"));
  }

  // 2 b. LE TEXTE D'EXEMPLE DU CADRAN, DANS LES DEUX LANGUES. Le français
  // est plus long : « ex. » tenait là où « Tapez un code, ex. » ne tenait
  // pas, et l'anglais est la langue par défaut — mesurer l'une seule
  // laissait l'autre couper le code à 360 points.
  {
    const fautes = [];
    for (const langue of ["en", "fr"]) {
      await page.evaluate((l) => localStorage.setItem("totem.langue", l), langue);
      await page.goto(`${APERCU}/ussd`, { waitUntil: "networkidle" });
      try {
        await page.waitForFunction(() => document.querySelector("input[placeholder]"), null,
                                   { timeout: 15000 });
      } catch {
        fautes.push(`${langue} : aucun champ à texte d'exemple sur le cadran`);
        continue;
      }
      await page.waitForTimeout(400);
      for (const x of await page.evaluate(MESURER_EXEMPLES)) {
        fautes.push(`${langue} : « ${x.texte} » demande ${x.besoin} pt, le champ en a ${x.place}`);
      }
    }
    await page.evaluate(() => localStorage.removeItem("totem.langue"));
    if (fautes.length) defauts += fautes.length;
    resume.push(`  ${fautes.length ? "✗" : "✓"} ${format.padEnd(18)} ${"exemple cadran".padEnd(16)} `
      + (fautes.length ? fautes.join(" ; ") : "entier, en anglais et en français"));
  }

  // 2 bis. L'ACCUEIL TEL QUE LE PROPRIÉTAIRE L'A : QUATRE CARTES, et un
  // terminal qui se tait. Le faux nuage n'a que deux cartes et un terminal
  // toujours en ligne — une donnée d'essai trop sage, encore : les puces
  // passaient sur deux lignes avec quatre cartes, et personne ne l'avait
  // vu ici. On enrichit la réponse de la plateforme au passage, sans
  // toucher au faux nuage (les autres harnais comptent sur lui tel quel).
  // On part de l'ACCUEIL à deux cartes, comme le propriétaire qui rouvre
  // l'application : la rangée est déjà là, mesurée, quand les cinq cartes
  // arrivent. Venu d'un autre écran, l'harnais trouvait la puce à l'écran ;
  // venu de l'accueil, elle restait dehors — la même application, deux
  // ordres d'arrivée des mesures.
  await page.goto(APERCU, { waitUntil: "networkidle" });
  await attendreTexte(page, /FCFA/);
  await page.route("**/api/donnees**", async (route) => {
    // La requête part de Node, pas de `route.fetch` : celui-ci suit le
    // mandataire réseau de la machine, qui ne connaît pas 127.0.0.1.
    const demande = route.request();
    // LA RÉPONSE ARRIVE APRÈS LE CAHIER. Au rechargement, l'accueil montre
    // d'abord ce que le téléphone a gardé (deux cartes) ; la carte retenue
    // n'existe qu'à l'arrivée des cinq. Servie tout de suite, la réponse
    // battait le cahier, et le harnais sortait vert sur une puce que la
    // capture montrait hors de l'écran.
    await new Promise((r) => setTimeout(r, 1500));
    const reponse = await fetch(demande.url(), { headers: demande.headers() });
    const j = await reponse.json();
    const modele = j.sims?.[0];
    if (modele) {
      j.sims = [...j.sims, ...[["MTN ·3501", "MTN"], ["MTN ·6414", "MTN"], ["Orange ·4177", "Orange"]]
        // Des ICCID qui se rangent APRÈS les vraies cartes : l'accueil trie par
        // ICCID, et « Orange ·4177 » doit rester la dernière de la rangée.
        .map(([libelle, operateur], i) => ({ ...modele, iccid: `89237090000000000${i}99`, libelle, operateur }))];
    }
    // LE BOÎTIER SE TAIT, COMME LA PLATEFORME LE DIT AUJOURD'HUI : carte par
    // carte. Le harnais ne touchait que le boîtier d'en tête ; depuis que la
    // plateforme dit, pour chaque carte, si SON boîtier se tait — et que
    // l'écran la croit —, il montait une réponse que la plateforme ne
    // ferait jamais (en tête muet, toutes les cartes « il parle »), et
    // criait « le terminal muet n'est pas signalé » quatorze fois.
    if (j.terminal) {
      const vuLe = new Date(Date.now() - 15 * 60_000).toISOString();
      j.terminal = { ...j.terminal, enLigne: false, vuLe };
      j.sims = (j.sims ?? []).map((s) => ({ ...s, boitierMuet: true, boitierVuLe: vuLe }));
    }
    await route.fulfill({ status: reponse.status, json: j });
  });
  // La carte choisie est la DERNIÈRE (Orange ·4177), retenue d'une
  // ouverture à l'autre : l'accueil doit la ramener à l'écran tout seul. La
  // première puce, elle, est toujours visible — la vérifier ne prouvait rien.
  await page.evaluate(() => localStorage.setItem("totem.carte.choisie", "89237090000000000299"));
  await page.goto(APERCU, { waitUntil: "networkidle" });
  await attendreTexte(page, /FCFA/);
  await attendreTexte(page, /Terminal (silent|muet|offline|hors ligne)/).catch(() => {});
  await page.waitForTimeout(800);      // le défilement de la rangée est animé
  /** La rangée des puces, sur l'écran ouvert : une ligne, la carte retenue
   *  allumée, DERNIÈRE de la rangée, et visible dans ce qui la rogne. */
  const verifierPuces = async (ecranMesure) => {
    // AVANT la mesure : `mesurer` fait défiler jusqu'à l'écran ce qu'il
    // trouve recouvert — une puce coupée au bord en fait partie. Vérifiée
    // après, elle était ramenée par le harnais lui-même, et l'étape sortait
    // verte sur une puce que la capture montrait hors de l'écran.
    // VISIBLE, C'EST DANS CE QUI LA ROGNE — pas dans la fenêtre. Sur une
    // colonne, la rangée occupe toute la largeur et les deux se confondent ;
    // en deux colonnes (600 points et plus), la rangée vit dans la colonne de
    // GAUCHE, et c'est elle qui coupe : une puce rangée à x = 400 est dans la
    // fenêtre, et hors de sa rangée. Comparée à la fenêtre, elle passait pour
    // visible sur un pliable ouvert ou une tablette.
    const puces = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')]
      .filter((e) => /^(Select the|Choisir la carte) /.test(e.getAttribute("aria-label") || ""))
      .map((e) => {
        const r = e.getBoundingClientRect();
        let bordG = 0, bordD = innerWidth;
        for (let p = e.parentElement; p; p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== "visible") {
            const pr = p.getBoundingClientRect();
            bordG = Math.max(bordG, pr.left); bordD = Math.min(bordD, pr.right);
          }
        }
        return { haut: Math.round(r.top), choisie: e.getAttribute("aria-selected") === "true",
                 nom: e.getAttribute("aria-label"), gauche: r.left, droite: r.right, bordG, bordD };
      }));
    const uneLigne = puces.length >= 5 && puces.every((p) => Math.abs(p.haut - puces[0].haut) <= 1);
    const choisie = puces.find((p) => p.choisie);
    // LA DERNIÈRE, OU L'ÉTAPE NE PROUVE RIEN. Depuis que les cartes se
    // rangent par ICCID, la carte retenue ici était devenue la TROISIÈME —
    // visible sans défilement à toutes les tailles —, et le témoin sans
    // défilement passait au vert partout, sans un mot.
    const derniere = choisie && puces.every((p) => p.gauche <= choisie.gauche);
    const visible = choisie && /4177/.test(choisie.nom)
      && choisie.gauche >= choisie.bordG - 1 && choisie.droite <= choisie.bordD + 1;
    const muet = await page.evaluate(() => /Terminal (silent|muet|offline|hors ligne)/.test(document.body.innerText));
    const fautes = [];
    if (!uneLigne) fautes.push(`puces sur ${new Set(puces.map((p) => p.haut)).size} lignes (${puces.length} puces)`);
    if (!choisie) fautes.push("aucune puce ne se dit choisie");
    else if (!/4177/.test(choisie.nom)) fautes.push(`la carte retenue est oubliée (choisie : ${choisie.nom})`);
    else if (!derniere) fautes.push("la carte retenue n'est plus la dernière de la rangée : l'étape ne prouve plus rien");
    else if (!visible) fautes.push("la puce choisie est hors de l'écran");
    if (!muet) fautes.push("le terminal muet n'est pas signalé");
    if (fautes.length) defauts += fautes.length;
    resume.push(`  ${fautes.length ? "✗" : "✓"} ${format.padEnd(18)} ${ecranMesure.padEnd(16)} ${fautes.join(" ; ")}`);
  };
  await verifierPuces("4 cartes, muet");
  await mesurer("accueil-4-cartes");
  // LA MÊME RANGÉE SUR OPÉRATIONS ET LE CADRAN. Les deux écrans ont repris
  // les puces de l'accueil (`puces-cartes.tsx`) : la carte retenue — la
  // dernière — doit y être allumée ET à l'écran, comme sur l'accueil.
  for (const [ecran, chemin, preuve] of [
    ["ops-5-cartes", "/actions", /(From card|Depuis la carte)/],
    ["cadran-5-cartes", "/ussd", /(From card|Depuis la carte)/],
  ]) {
    await page.goto(`${APERCU}${chemin}`, { waitUntil: "networkidle" });
    try { await attendreTexte(page, preuve); } catch { /* vérifié tel quel */ }
    await page.waitForTimeout(800);
    await verifierPuces(`${ecran.split("-")[0]} : puces`);
    await mesurer(ecran);
  }
  await page.unroute("**/api/donnees**");
  await page.evaluate(() => localStorage.removeItem("totem.carte.choisie"));

  // 2 ter. UN COMPTE QUI VIENT DE NAÎTRE : aucune carte, aucun boîtier. La
  // plateforme répond ce qu'elle répond à un nouvel inscrit — `proprietaire`
  // faux, rien dans les listes. L'accueil doit montrer « Ajouter ma carte »
  // (les deux façons, l'aide, le contact), pas « hors ligne » ni « aucune
  // carte dans le terminal » ; les autres onglets, le chemin vers lui.
  await page.route("**/api/donnees**", async (route) => {
    await route.fulfill({ status: 200, json: {
      courriel: "awa@exemple.cm", proprietaire: false, relie: true, terminal: null,
      sims: [], paiements: [], raccourcis: {}, beneficiaires: [],
      fuseau: "Africa/Douala", serveurA: new Date().toISOString(),
    } });
  });
  for (const [ecran, chemin] of [
    ["sans-carte", "/"], ["sans-carte-ops", "/actions"], ["sans-carte-cpt", "/cartes"],
  ]) {
    await page.goto(`${APERCU}${chemin}`, { waitUntil: "networkidle" });
    try {
      await attendreTexte(page, /(Add my card|Ajouter ma carte)/);
      const faux = await page.evaluate(() =>
        /(Terminal (silent|muet|offline|hors ligne)|No card in the terminal|Aucune carte dans le terminal)/
          .test(document.body.innerText));
      if (faux) {
        defauts++;
        resume.push(`  ✗ ${format.padEnd(18)} ${ecran.padEnd(16)} un compte neuf se voit dire « hors ligne » ou « terminal »`);
      }
      await mesurer(ecran);
    } catch {
      defauts++;
      resume.push(`  ✗ ${format.padEnd(18)} ${ecran.padEnd(16)} « Ajouter ma carte » n'apparaît pas`);
    }
  }
  await page.unroute("**/api/donnees**");

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

  // 3 bis. La fiche des coordonnées d'une carte — le bouton rond « carte
  // d'identité » sous la carte. PAS « My number » : ce raccourci-là lance
  // une demande USSD à l'opérateur (« Mon numéro »), et la première version
  // de ce harnais mesurait donc le menu MTN MoMo en l'appelant « fiche des
  // coordonnées », en vert, à quatorze tailles. Vu sur une capture, pas
  // par le harnais. On exige maintenant de VOIR la fiche — son titre et
  // ses rangées — avant de la mesurer.
  await page.goto(APERCU, { waitUntil: "networkidle" });
  await attendreTexte(page, /FCFA/);
  // Le rond « Recevoir » sous la carte ouvre la fiche des coordonnées.
  await page.getByRole("button", { name: /^(Receive|Recevoir)$/ }).first().click();
  try {
    await attendreTexte(page, /Account details[\s\S]*Network|Mes coordonnées[\s\S]*Réseau/);
  } catch {
    console.error(`\n✗ ${format} : la fiche des coordonnées ne s'ouvre pas. Ce que l'écran dit :\n`);
    console.error(await page.evaluate(() => document.body.innerText));
    process.exit(1);
  }
  await mesurer("fiche-coordonnees");

  // 3 ter. CE QUE LA FICHE COPIE — une fois, à la première taille. Le
  // propriétaire a demandé « le nom et le numéro, d'un appui », et la règle
  // vit dans le noyau (`texteACopier`), testée là-bas. Mais rien n'y
  // vérifiait que l'ÉCRAN l'appelle : on appuie donc vraiment, puis on LIT le
  // presse-papiers, et on le compare à ce que la fiche AFFICHE. Le
  // presse-papiers est d'abord rempli d'un témoin : un bouton qui ne copie
  // rien laisserait le témoin, et ne passerait pas pour une copie juste.
  if (!copieEprouvee) {
    copieEprouvee = true;
    const lire = () => page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    const temoin = () => page.evaluate(() => navigator.clipboard.writeText("(témoin)")).catch(() => {});
    const ecran = await page.evaluate(() => document.body.innerText);
    const vu = /(?:^|\n)(?:Name|Nom)\n([^\n]+)\n[\s\S]*?(?:Number|Numéro)\n([^\n]+)/i.exec(ecran);
    const essais = [
      [/^(Copy the name and number|Copier le nom et le numéro)$/, vu && `${vu[1]}\n${vu[2]}`, "Copier"],
      // Le rond du numéro copie les CHIFFRES (pour un champ), pas les tranches.
      [/^(Copy the number|Copier le numéro)$/,
       vu && vu[2].replace(/\D/g, "").replace(/^237(?=\d{9}$)/, ""), "le rond du numéro"],
      [/^(Copy the name|Copier le nom)$/, vu && vu[1], "le rond du nom"],
    ];
    for (const [nomDuBouton, attendu, qui] of essais) {
      const bouton = page.getByRole("button", { name: nomDuBouton });
      let faute = null;
      if (!vu) faute = "la fiche n'affiche ni nom ni numéro à comparer";
      else if (!(await bouton.count())) faute = "bouton absent";
      else {
        await temoin();
        await bouton.first().click();
        await page.waitForTimeout(150);
        const lu = await lire();
        if (lu !== attendu) faute = `copie ${JSON.stringify(lu)}, la fiche affiche ${JSON.stringify(attendu)}`;
        else if (/Mobile Money|Orange Money/.test(lu)) faute = "la copie emporte le réseau";
      }
      if (faute) defauts++;
      resume.push(`  ${faute ? "✗" : "✓"} ${format.padEnd(18)} ${("copie : " + qui).padEnd(16)} ${faute ?? JSON.stringify(attendu)}`);
      await page.waitForTimeout(1900);      // le « Copié » s'efface
    }
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
