// LE PASSAGE D'UN ONGLET À L'AUTRE SE VOIT — mesuré image par image.
//
//     node scripts/verifier-les-transitions.mjs /tmp/apercu
//
// Prérequis : les mêmes que verifier-les-formats (voir son en-tête) — le
// faux nuage sur 4999, la plateforme d'essai sur 3120, et un export web
// portant EXPO_PUBLIC_APERCU=1 et EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3120.
// L'export est servi par le harnais lui-même, sur un port libre choisi par
// le système : il ne peut pas tomber sur le serveur d'un essai précédent.
//
// POURQUOI CE CONTRÔLE EXISTE. Le propriétaire : « quand je passe de
// l'Accueil à Comptes, à SMS ou à Opérations, il n'y a pas de transition,
// rien ». Une transition se LIT très bien dans le code — une option
// `animation`, une durée — et ne prouve rien : le navigateur des onglets
// peut l'ignorer, une autre option peut l'éteindre, et l'écran claque comme
// avant. On regarde donc l'écran, toutes les images, pendant le passage.
//
// CE QU'IL EXIGE, sur les trajets que le propriétaire a nommés — Accueil →
// Comptes → SMS → Opérations, puis le retour, et Accueil ↔ Opérations d'un
// saut :
//
//   mouvement     au moins une image INTERMÉDIAIRE — ni l'écran d'avant, ni
//                 celui d'après : une opacité entre les deux, ou un écran
//                 en train de glisser ;
//   sens          l'écran arrive du côté de son onglet : par la droite quand
//                 on va vers la droite de la barre, par la gauche au retour ;
//   superposition jamais deux écrans l'un sur l'autre, même à demi : aucune
//                 image où les DEUX dépassent 0,2 d'opacité. (Une première
//                 version demandait « les deux au-dessus de 0,5 » : un fondu
//                 enchaîné, dont les opacités font 1 à elles deux, ne
//                 pouvait jamais échouer — mesuré à 0,65 et 0,35 sur la même
//                 image, deux écrans mêlés, et ✓.) ;
//   durée         fini en 300 ms au plus : fluide, jamais lent ;
//   retiré        l'écran quitté ne reste pas affiché, invisible, sous
//                 l'autre (sur l'aperçu web : voir `SceneDOnglet`) ;
//   barre         à CHAQUE image, le nom de l'onglet qu'on quitte et celui
//                 qu'on rejoint se lisent sur ce qui est dessous : contraste
//                 d'au moins 3 contre la pastille sombre ou contre la barre
//                 claire. Le nom visé passait au blanc dès l'appui, la
//                 pastille arrivait 240 ms plus tard : « Opérations » blanc
//                 sur blanc, invisible, à chaque changement d'onglet.
//
// LA PREMIÈRE OUVERTURE D'OPÉRATIONS se mesure à part, sur une connexion
// neuve, AVANT tout le reste : c'est la seule où l'écran se compose, et une
// cascade d'entrée y ajoutait 120 ms de délai et 260 ms de montée au
// glissement — 410 ms, mesuré. Ouvrir chaque onglet d'avance, comme le
// reste du harnais le fait, l'aurait cachée.
//
// Puis, avec « Réduire les animations » (le navigateur le dit à la page, et
// react-native-web le lit) : RIEN NE GLISSE, rien ne se superpose, et tout
// est fini en 160 ms.
//
// IL PORTE SON TÉMOIN. Avant l'application, la sonde mesure des pages
// fabriquées : un écran remplacé d'un coup (« aucun mouvement »), un écran
// qui glisse depuis la droite (« mouvement, depuis la droite »), un fondu
// ENCHAÎNÉ (« superposés »), une barre dont le nom passe au blanc avant la
// pastille (« illisible ») et une barre dont le nom suit la pastille
// (« lisible »). Si elle se trompe sur une seule, elle s'arrête : une sonde
// qui voit du mouvement partout ne prouve rien. Lancé sur un export SANS
// l'option de transition, le harnais échoue.
//
// IL RECONNAÎT L'ÉCRAN À SON CONTENU — le titre « Opérations », « Derniers
// mouvements » —, jamais à une marque posée pour lui : une marque
// n'existerait que dans le code neuf, et le harnais ne pourrait pas dire ce
// que l'ancien faisait.

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const require = createRequire(import.meta.url);

const RACINE = process.argv[2] || "dist";
if (!existsSync(join(RACINE, "index.html"))) {
  console.error(`\n✗ Aucun aperçu web dans « ${RACINE} ». Voir l'en-tête.`);
  process.exit(1);
}

const DUREE_MAX = 300;
const DUREE_MAX_REDUITE = 160;
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";

// Les écrans, par ce qu'ils montrent.
const ACCUEIL = /^(Latest transactions|Derniers mouvements)$/.source;
const COMPTES = /^(Accounts|Comptes)$/.source;
const SMS = /^(Messages received|SMS reçus)$/.source;
const OPERATIONS = /^(Operations|Opérations)$/.source;
// Le dernier groupe d'Opérations : celui qu'une cascade d'entrée montrait
// en dernier.
const OUTILS = /^(Tools|Outils)$/.source;
const ONGLET = {
  accueil: /^(Home|Accueil)$/, comptes: /^(Accounts|Comptes)$/,
  sms: /^SMS$/, operations: /^(Operations|Opérations)$/,
};
const CONTRASTE_MIN = 3;

for (const [quoi, adresse] of [["La plateforme d'essai", "http://127.0.0.1:3120/api/plateforme"]]) {
  try {
    const r = await fetch(adresse, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error("muet");
  } catch {
    console.error(`\n✗ ${quoi} ne répond pas (${adresse}). Voir l'en-tête.`);
    process.exit(1);
  }
}
await fetch("http://127.0.0.1:3120/api/inscription", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ prenom: "Essai", nom: "Totem", adresse: "Rue 1, Douala",
                         telephone: "670000099", courriel: COURRIEL, motdepasse: MOTDEPASSE }),
}).catch(() => {});

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
  args: ["--no-sandbox", "--no-proxy-server", "--disable-web-security",
         "--disable-features=IsolateOrigins,site-per-process"],
  proxy: { server: "direct://" },
});

let echecs = 0;
const dire = (ok, texte) => { console.log(`  ${ok ? "✓" : "✗"} ${texte}`); if (!ok) echecs++; };

// --- La sonde ----------------------------------------------------------------
// Dans la page : à chaque image, l'opacité EFFECTIVE de chaque écran (le
// produit de celles de ses ancêtres — c'est un parent que le navigateur
// des onglets fait pâlir) et sa position. Un écran retiré (`display: none`
// quelque part au-dessus) est « absent ».
const DEMARRER = ([a, b, ms, ongletA, ongletB]) => {
  const trouver = (source) => {
    const re = new RegExp(source);
    return [...document.querySelectorAll("div, span, h1, h2")].find((e) =>
      !e.children.length && re.test((e.textContent || "").trim())
      && !e.closest('[role="tab"]'));
  };
  const etat = (e) => {
    if (!e || !e.isConnected) return { rendu: false, op: 0, x: null, y: null };
    let op = 1;
    for (let p = e; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === "none") return { rendu: false, op: 0, x: null, y: null };
      op *= Number(s.opacity);
    }
    const r = e.getBoundingClientRect();
    return { rendu: true, op, x: r.left, y: r.top };
  };
  // LA BARRE. Pour un onglet : la couleur que l'œil reçoit à l'endroit de
  // son nom (chaque couche de texte posée sur le fond, selon son opacité),
  // et ce qu'il y a dessous — la pastille sombre si elle couvre au moins
  // 70 % du nom, la barre claire si elle en couvre au plus 30 %. Entre les
  // deux, le bord de la pastille passe SUR le nom : l'image n'est pas jugée.
  const rgb = (c) => (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contraste = (c1, c2) => {
    const [l1, l2] = [lum(c1), lum(c2)].sort((p, q) => q - p);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  const barre = (source) => {
    if (!source) return null;
    const re = new RegExp(source);
    const onglet = [...document.querySelectorAll('[role="tab"]')]
      .find((e) => re.test(e.getAttribute("aria-label") || ""));
    if (!onglet) return { introuvable: true };
    const coque = onglet.parentElement;
    const pastille = [...coque.children].find((e) => !e.children.length
      && getComputedStyle(e).position === "absolute"
      && lum(rgb(getComputedStyle(e).backgroundColor)) < 0.2
      && getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)");
    let fondBarre = null;
    for (let p = coque; p && !fondBarre; p = p.parentElement) {
      const c = getComputedStyle(p).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") fondBarre = rgb(c);
    }
    fondBarre ??= [255, 255, 255];
    const noms = [...onglet.querySelectorAll("div, span")].filter((e) => !e.children.length
      && (e.textContent || "").trim());
    if (!noms.length || !pastille) return { introuvable: true };
    let g = Infinity, d = -Infinity;
    for (const n of noms) { const r = n.getBoundingClientRect(); g = Math.min(g, r.left); d = Math.max(d, r.right); }
    const pr = pastille.getBoundingClientRect();
    const couvre = Math.max(0, Math.min(d, pr.right) - Math.max(g, pr.left)) / Math.max(1, d - g);
    if (couvre > 0.3 && couvre < 0.7) return { bord: true };
    const fond = couvre >= 0.7 ? rgb(getComputedStyle(pastille).backgroundColor) : fondBarre;
    let vu = fond.slice();
    for (const n of noms) {
      let op = 1;
      for (let p = n; p && p !== onglet; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
      const c = rgb(getComputedStyle(n).color);
      vu = vu.map((v, i) => v * (1 - op) + c[i] * op);
    }
    return { contraste: Math.round(contraste(vu, fond) * 100) / 100,
             sur: couvre >= 0.7 ? "pastille" : "barre" };
  };
  window.__images = [];
  const t0 = performance.now();
  const tour = () => {
    // On RECHERCHE les écrans à chaque image : un écran jamais ouvert
    // n'existe pas encore au départ.
    const ea = trouver(a), eb = trouver(b);
    window.__images.push({ t: performance.now() - t0, a: etat(ea), b: etat(eb),
                           ba: barre(ongletA), bb: barre(ongletB) });
    if (performance.now() - t0 < ms) requestAnimationFrame(tour);
  };
  requestAnimationFrame(tour);
};

/** Le verdict, sur une suite d'images : `a` l'écran qui part, `b` celui
 *  qui arrive. `depuis` : +1 s'il doit arriver par la droite, −1 par la
 *  gauche. */
function juger(images, depuis) {
  const fin = images[images.length - 1];
  const finB = fin.b;
  // CE QUI SE VOIT, ET RIEN D'AUTRE : l'opacité effective (un écran absent
  // vaut zéro) et la place d'un écran visible. Un écran déjà transparent
  // qu'on retire ensuite ne change rien à l'écran — ce n'est pas du temps
  // de passage.
  const vu = (e, ref) => e.op > 0.03 && ref.op > 0.03 && e.x != null && ref.x != null
    && (Math.abs(e.x - ref.x) > 0.5 || Math.abs(e.y - ref.y) > 0.5);
  const ecart = (img, ref) =>
    Math.abs(img.a.op - ref.a.op) > 0.01 || Math.abs(img.b.op - ref.b.op) > 0.01
    || vu(img.a, ref.a) || vu(img.b, ref.b);
  const differe = (img) => ecart(img, fin);
  const debut = images[0];
  const change = (img) => ecart(img, debut);
  const premier = images.findIndex(change);
  let dernier = -1;
  images.forEach((img, i) => { if (differe(img)) dernier = i; });
  const duree = premier < 0 || dernier < 0 ? 0
    : images[Math.min(dernier + 1, images.length - 1)].t - images[premier].t;

  // Une image INTERMÉDIAIRE : l'écran qui arrive est à demi visible, ou il
  // glisse encore. Un écran remplacé d'un coup n'en a aucune.
  const intermediaires = images.filter((img) =>
    (img.b.rendu && img.b.op > 0.03 && img.b.op < 0.97)
    || (img.a.rendu && img.a.op > 0.03 && img.a.op < 0.97)
    || (img.b.rendu && img.b.op > 0.03 && finB.x != null && img.b.x != null
        && Math.abs(img.b.x - finB.x) > 0.5));
  const decalages = images.filter((img) => img.b.rendu && img.b.op > 0.03
    && img.b.x != null && finB.x != null).map((img) => img.b.x - finB.x);
  const sensJuste = depuis > 0 ? decalages.some((d) => d > 1) : decalages.some((d) => d < -1);
  const glisse = decalages.some((d) => Math.abs(d) > 0.5)
    || images.some((img) => img.a.rendu && img.a.x != null && fin.a.x != null
                            && Math.abs(img.a.x - (images[0].a.x ?? img.a.x)) > 0.5
                            && img.a.op > 0.03);
  const superposees = images.filter((img) => Math.min(img.a.op, img.b.op) > 0.2).length;
  // La barre : le pire contraste vu, image par image, pour chacun des deux
  // onglets — et combien d'images l'ont vu sous le seuil.
  const barre = (cle) => {
    const vus = images.map((img) => img[cle]).filter((v) => v && v.contraste != null);
    const introuvable = images.some((img) => img[cle]?.introuvable);
    const illisibles = vus.filter((v) => v.contraste < CONTRASTE_MIN);
    return { jugees: vus.length, introuvable, illisibles: illisibles.length,
             pire: vus.length ? Math.min(...vus.map((v) => v.contraste)) : null,
             pireSur: illisibles[0]?.sur };
  };
  return { mouvement: intermediaires.length > 0, intermediaires: intermediaires.length,
           sensJuste, glisse, superposees, duree, fin, images: images.length,
           barreA: barre("ba"), barreB: barre("bb") };
}

async function suivre(page, a, b, agir, ms = 700, ongletA = null, ongletB = null) {
  await page.evaluate(DEMARRER, [a, b, ms, ongletA, ongletB]);
  await agir();
  await page.waitForTimeout(ms + 150);
  return page.evaluate(() => window.__images);
}

// --- Le témoin ------------------------------------------------------------------
console.log("\nLe témoin — deux pages fabriquées, dont on sait ce qu'elles font :");
{
  const page = await nav.newPage({ viewport: { width: 393, height: 852 } });
  await page.setContent(`
    <div id="a" style="position:absolute;inset:0;background:#f5f5f5">
      <div><span>Derniers mouvements</span></div></div>
    <div id="b" style="position:absolute;inset:0;background:#f5f5f5;display:none">
      <div><span>Opérations</span></div></div>`);
  // Remplacé d'un coup, comme un écran sans transition.
  const sec = juger(await suivre(page, ACCUEIL, OPERATIONS, () => page.evaluate(() => {
    setTimeout(() => {
      document.getElementById("a").style.display = "none";
      document.getElementById("b").style.display = "block";
    }, 60);
  })), +1);
  // Glissé depuis la droite, comme la transition voulue.
  await page.evaluate(() => {
    const a = document.getElementById("a"), b = document.getElementById("b");
    a.style.display = "block"; b.style.display = "none";
  });
  const glisse = juger(await suivre(page, ACCUEIL, OPERATIONS, () => page.evaluate(() => {
    setTimeout(() => {
      const a = document.getElementById("a"), b = document.getElementById("b");
      b.style.opacity = "0"; b.style.transform = "translateX(20px)"; b.style.display = "block";
      b.getBoundingClientRect();
      // Comme la transition voulue : l'écran qui part s'éteint sur la
      // première moitié, celui qui arrive s'allume sur la seconde.
      a.style.transition = "opacity 120ms"; a.style.opacity = "0";
      b.style.transition = "opacity 120ms 120ms, transform 240ms";
      b.style.opacity = "1"; b.style.transform = "translateX(0)";
      setTimeout(() => { a.style.display = "none"; }, 260);
    }, 60);
  })), +1);
  // Un fondu ENCHAÎNÉ : les deux opacités font 1 à elles deux, à chaque
  // image. Deux écrans mêlés — la règle « au-dessus de 0,5 » ne le voyait pas.
  await page.evaluate(() => {
    const a = document.getElementById("a"), b = document.getElementById("b");
    for (const e of [a, b]) { e.style.transition = "none"; e.style.transform = "none"; }
    a.style.opacity = "1"; a.style.display = "block"; b.style.display = "none"; b.style.opacity = "1";
  });
  const enchaine = juger(await suivre(page, ACCUEIL, OPERATIONS, () => page.evaluate(() => {
    setTimeout(() => {
      const a = document.getElementById("a"), b = document.getElementById("b");
      b.style.opacity = "0"; b.style.display = "block"; b.getBoundingClientRect();
      a.style.transition = b.style.transition = "opacity 120ms linear";
      a.style.opacity = "0"; b.style.opacity = "1";
      setTimeout(() => { a.style.display = "none"; }, 140);
    }, 60);
  })), +1);

  // LA BARRE : deux onglets, une pastille sombre qui glisse de l'un à
  // l'autre en 240 ms. D'abord le nom visé passe au blanc DÈS L'APPUI (le
  // défaut) ; puis il change quand la pastille passe son milieu.
  const barreFabriquee = (suit) => `
    <div style="position:absolute;bottom:20px;left:20px;display:flex;gap:4px;padding:6px;background:#fff">
      <div id="pastille" style="position:absolute;left:6px;top:6px;width:80px;height:54px;background:#2c2c2c;border-radius:22px"></div>
      <div role="tab" aria-label="Home" style="position:relative;width:80px;height:54px;display:flex;align-items:center;justify-content:center">
        <div id="n1" style="color:#fff;font:600 11px sans-serif">Home</div></div>
      <div role="tab" aria-label="Operations" style="position:relative;width:80px;height:54px;display:flex;align-items:center;justify-content:center">
        <div id="n2" style="color:#444;font:500 11px sans-serif">Operations</div></div>
    </div>
    <script>window.__suit = ${suit};</script>`;
  const jouerBarre = async (suit) => {
    await page.setContent(barreFabriquee(suit));
    return juger(await suivre(page, ACCUEIL, OPERATIONS, () => page.evaluate(() => {
      setTimeout(() => {
        const p = document.getElementById("pastille");
        const n1 = document.getElementById("n1"), n2 = document.getElementById("n2");
        p.style.transition = "transform 240ms linear"; p.style.transform = "translateX(84px)";
        const bascule = () => { n1.style.color = "#444"; n2.style.color = "#fff"; };
        if (window.__suit) setTimeout(bascule, 120); else bascule();
      }, 60);
    }), 500, ONGLET.accueil.source, ONGLET.operations.source), +1);
  };
  const clignote = await jouerBarre(false);
  const suit = await jouerBarre(true);
  await page.close();
  const okSec = !sec.mouvement && !sec.glisse;
  const okGlisse = glisse.mouvement && glisse.sensJuste && glisse.superposees === 0;
  const okEnchaine = enchaine.superposees > 0;
  const okClignote = clignote.barreB.illisibles > 0;
  const okSuit = suit.barreA.illisibles === 0 && suit.barreB.illisibles === 0
    && suit.barreA.jugees > 3 && suit.barreB.jugees > 3;
  dire(okSec, `un écran remplacé d'un coup se lit « ${sec.mouvement ? "mouvement" : "aucun mouvement"} »`);
  dire(okGlisse, `un écran qui glisse depuis la droite se lit « ${glisse.mouvement ? "mouvement" : "aucun mouvement"}`
    + `${glisse.sensJuste ? ", depuis la droite" : ", SENS NON VU"}`
    + `${glisse.superposees ? ", SUPERPOSÉ" : ", sans superposition"} »`);
  dire(okEnchaine, `un fondu enchaîné se lit « ${okEnchaine ? `superposés (${enchaine.superposees} images)` : "PAS SUPERPOSÉS"} »`);
  dire(okClignote, `une barre dont le nom passe au blanc avant la pastille se lit « ${okClignote
    ? `illisible (${clignote.barreB.illisibles} images, contraste ${clignote.barreB.pire})` : "LISIBLE"} »`);
  dire(okSuit, `une barre dont le nom suit la pastille se lit « ${okSuit ? "lisible"
    : `ILLISIBLE (${suit.barreA.illisibles}+${suit.barreB.illisibles} images, jugées ${suit.barreA.jugees}/${suit.barreB.jugees})`} »`);
  if (!okSec || !okGlisse || !okEnchaine || !okClignote || !okSuit) {
    console.error("\n✗ La sonde se trompe sur ses témoins : elle ne mesure rien. On s'arrête ici.");
    await nav.close(); fichiers.close();
    process.exit(1);
  }
}

// --- L'application ----------------------------------------------------------
async function connecter(contexte) {
  const page = await contexte.newPage();
  await page.goto(APERCU, { waitUntil: "networkidle" });
  for (let i = 0; i < 40; i++) {
    const pret = await page.locator('input[type="email"]').first()
      .evaluate((e) => !e.readOnly).catch(() => false);
    if (pret) break;
    await page.waitForTimeout(500);
  }
  await page.locator('input[type="email"]').first().fill(COURRIEL);
  await page.locator('input[type="password"]').first().fill(MOTDEPASSE);
  await page.getByText(/^(Sign in|Se connecter)$/).last().click();
  await page.waitForFunction(() => /FCFA/.test(document.body.innerText), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return page;
}

const onglet = (page, re) => page.getByRole("tab", { name: re }).first();

// LES TRAJETS : ceux que le propriétaire a nommés, dans le sens de la barre
// puis au retour, et un saut d'un bout à l'autre. `depuis` : +1 si l'écran
// doit arriver par la droite.
const TRAJETS = [
  ["Accueil → Comptes", ACCUEIL, COMPTES, "accueil", "comptes", +1],
  ["Comptes → SMS", COMPTES, SMS, "comptes", "sms", +1],
  ["SMS → Opérations", SMS, OPERATIONS, "sms", "operations", +1],
  ["Opérations → SMS", OPERATIONS, SMS, "operations", "sms", -1],
  ["SMS → Comptes", SMS, COMPTES, "sms", "comptes", -1],
  ["Comptes → Accueil", COMPTES, ACCUEIL, "comptes", "accueil", -1],
  ["Accueil → Opérations", ACCUEIL, OPERATIONS, "accueil", "operations", +1],
  ["Opérations → Accueil", OPERATIONS, ACCUEIL, "operations", "accueil", -1],
];

async function parcourir(page, titre, exigences) {
  // Chaque onglet est d'abord OUVERT une fois : un écran jamais ouvert
  // n'existe pas, et son premier montage n'est pas un passage (la première
  // ouverture d'Opérations est mesurée à part, avant).
  for (const o of ["comptes", "sms", "operations", "accueil"]) {
    await onglet(page, ONGLET[o]).click();
    await page.waitForTimeout(1200);
  }

  console.log(`\n${titre}`);
  for (const [nom, de, vers, ongletDe, ongletVers, depuis] of TRAJETS) {
    const images = await suivre(page, de, vers, () => onglet(page, ONGLET[ongletVers]).click(),
                                700, ONGLET[ongletDe].source, ONGLET[ongletVers].source);
    const v = juger(images, depuis);
    exigences(nom, v, depuis);
    // LA BARRE, à chaque image du passage.
    for (const [cle, quel] of [["barreA", "quitté"], ["barreB", "visé"]]) {
      const b = v[cle];
      if (b.introuvable || b.jugees === 0) {
        dire(false, `${nom.padEnd(22)} barre : l'onglet ${quel} est INTROUVABLE — rien n'a été vérifié`);
      } else {
        dire(b.illisibles === 0, `${nom.padEnd(22)} barre : le nom de l'onglet ${quel} ${b.illisibles === 0
          ? `se lit à chaque image (contraste ≥ ${b.pire})`
          : `est ILLISIBLE sur ${b.illisibles} images (contraste ${b.pire} sur la ${b.pireSur})`}`);
      }
    }
    // L'écran quitté s'est-il retiré, une fois le passage joué ?
    await page.waitForTimeout(250);
    // MÊME RECHERCHE QUE LA SONDE. Une première version cherchait parmi
    // « div, span » seulement — or « Derniers mouvements » est un intitulé,
    // rendu en <h1> : introuvable, il passait pour « retiré », et le témoin
    // sans retrait sortait VERT. Un écran introuvable est maintenant un
    // échec, jamais un écran retiré.
    const reste = await page.evaluate((source) => {
      const re = new RegExp(source);
      const e = [...document.querySelectorAll("div, span, h1, h2")].find((x) =>
        !x.children.length && re.test((x.textContent || "").trim()) && !x.closest('[role="tab"]'));
      if (!e) return "introuvable";
      for (let p = e; p && p !== document.documentElement; p = p.parentElement) {
        if (getComputedStyle(p).display === "none") return "retire";
      }
      return "affiche";
    }, de);
    if (reste === "introuvable") {
      dire(false, `${nom.padEnd(22)} l'écran quitté est INTROUVABLE : rien n'a été vérifié`);
      continue;
    }
    dire(reste === "retire", `${nom.padEnd(22)} l'écran quitté ${reste === "affiche"
      ? "RESTE AFFICHÉ, invisible, sous l'autre" : "s'est retiré"}`);
  }
}

/** LA PREMIÈRE OUVERTURE D'OPÉRATIONS, sur une connexion neuve : l'écran
 *  n'a jamais été monté. On suit son DERNIER groupe (« Outils ») : l'écran
 *  n'est là que quand lui aussi est posé. */
async function premiereOuverture(page, borne) {
  const images = await suivre(page, ACCUEIL, OUTILS,
                              () => onglet(page, ONGLET.operations).click(), 900);
  const v = juger(images, +1);
  const arrive = images.findIndex((img) => img.b.rendu && img.b.op > 0.03);
  dire(arrive >= 0 && v.duree > 0 && v.duree <= borne, `${"première ouverture".padEnd(22)} `
    + (arrive < 0 ? "« Outils » n'apparaît JAMAIS : rien n'a été mesuré"
      : `Opérations est posé en ${Math.round(v.duree)} ms (au plus ${borne})`));
  // Retour à l'accueil, pour la suite.
  await onglet(page, ONGLET.accueil).click();
  await page.waitForTimeout(1200);
}

try {
  const normal = await nav.newContext({ viewport: { width: 393, height: 852 } });
  const page = await connecter(normal);
  console.log("\nLa première ouverture d'Opérations :");
  await premiereOuverture(page, DUREE_MAX);
  await parcourir(page, "Le passage d'un onglet à l'autre :", (nom, v, depuis) => {
    const cote = depuis > 0 ? "la droite" : "la gauche";
    dire(v.mouvement, `${nom.padEnd(22)} ${v.mouvement
      ? `${v.intermediaires} images intermédiaires sur ${v.images}`
      : "AUCUN MOUVEMENT : l'écran est remplacé d'un coup"}`);
    dire(v.sensJuste, `${nom.padEnd(22)} ${v.sensJuste ? `arrive par ${cote}` : `n'arrive PAS par ${cote}`}`);
    dire(v.superposees === 0, `${nom.padEnd(22)} ${v.superposees === 0
      ? "jamais deux écrans l'un sur l'autre"
      : `${v.superposees} images avec les deux écrans mêlés (chacun au-dessus de 0,2)`}`);
    dire(v.duree > 0 && v.duree <= DUREE_MAX, `${nom.padEnd(22)} fini en ${Math.round(v.duree)} ms`
      + ` (au plus ${DUREE_MAX})`);
  });
  await normal.close();

  const reduite = await nav.newContext({ viewport: { width: 393, height: 852 },
                                         reducedMotion: "reduce" });
  const pageR = await connecter(reduite);
  console.log("\nLa première ouverture d'Opérations, animations réduites :");
  await premiereOuverture(pageR, DUREE_MAX_REDUITE);
  await parcourir(pageR, "Avec « Réduire les animations » :", (nom, v) => {
    dire(!v.glisse, `${nom.padEnd(22)} ${v.glisse ? "l'écran GLISSE malgré le réglage" : "rien ne glisse"}`);
    dire(v.duree <= DUREE_MAX_REDUITE, `${nom.padEnd(22)} fini en ${Math.round(v.duree)} ms`
      + ` (au plus ${DUREE_MAX_REDUITE})`);
    dire(v.superposees === 0, `${nom.padEnd(22)} ${v.superposees === 0
      ? "jamais deux écrans l'un sur l'autre"
      : `${v.superposees} images avec les deux écrans mêlés (chacun au-dessus de 0,2)`}`);
  });
  await reduite.close();
} catch (e) {
  console.error(`\n✗ Le harnais s'est arrêté : ${e.message}`);
  echecs++;
}

await nav.close();
fichiers.close();
console.log("");
if (echecs) {
  console.log(`✗ ${echecs} exigence${echecs > 1 ? "s" : ""} non tenue${echecs > 1 ? "s" : ""} :`
              + " le passage d'un onglet à l'autre ne se voit pas comme il doit.");
  process.exit(1);
}
console.log("✓ Le passage d'un onglet à l'autre se voit, dans le bon sens, vite, sans deux écrans"
            + " mêlés ni nom illisible dans la barre — et « Réduire les animations » le réduit à un fondu.");
