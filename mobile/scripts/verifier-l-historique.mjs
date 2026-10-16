// L'ONGLET PAIEMENTS ATTEINT-IL TOUTE LA CAISSE — DÈS LE PREMIER JOUR ?
//
//     node scripts/verifier-l-historique.mjs /tmp/apercu
//
// Prérequis : la même chaîne que `verifier-l-affichage` (le faux nuage sur
// 4999, la plateforme d'essai sur 3120, un export web portant
// EXPO_PUBLIC_APERCU=1 et EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3120). Le
// harnais sème lui-même la caisse s'il la trouve trop maigre.
//
// POURQUOI. TOTEM tourne déjà : des boutiques ont des mois de caisse en
// base. L'onglet s'arrêtait aux deux cents derniers SMS, et « toutes les
// dates » mentait par omission — un paiement d'il y a cinq semaines
// n'existait ni à l'écran ni dans la recherche, et la fiche d'un vieux
// paiement proposait « Établir le reçu » pour un document qui existait.
// La plateforme (`web/scripts/verifier-l-historique.mjs`) prouve que la
// suite ne saute rien ; ici, c'est l'ÉCRAN qu'on interroge :
//
//   1. UNE RECHERCHE sur un client d'il y a cinq semaines ne dit pas
//      seulement « Aucun résultat » : elle dit jusqu'où elle a cherché, et
//      propose d'aller plus loin — et, plus loin, elle le trouve.
//   2. SA FICHE trouve le reçu établi à l'époque (la page plus ancienne ne
//      le porte pas) : « Partager le reçu », jamais « Établir le reçu ».
//   3. EN DESCENDANT, la liste se prolonge toute seule jusqu'au premier SMS,
//      chaque encaissement de la caisse UNE fois — compté contre la
//      plateforme, pas contre l'écran —, et la fin se dit : « Début de
//      l'historique ».
//
// TÉMOIN : avant de descendre, l'écran ne montre qu'une partie de la caisse.
// Sans ce constat, « tout est atteint » et « la caisse tient dans une page »
// se ressembleraient.

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
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ttf": "font/ttf", ".woff2": "font/woff2", ".ico": "image/x-icon",
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
const PLATEFORME = "http://127.0.0.1:3120";
const NUAGE = "http://127.0.0.1:4999";
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";
const ANCIEN = "MBARGA ANCIEN";

// --- La vérité, demandée à la plateforme -------------------------------------
const compte = { prenom: "Essai", nom: "Totem", adresse: "Rue 1, Douala", telephone: "670000099",
                 courriel: COURRIEL, motdepasse: MOTDEPASSE };
await fetch(`${PLATEFORME}/api/inscription`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(compte),
}).catch(() => null);
const session = await fetch(`${PLATEFORME}/api/session`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(compte),
}).then((r) => r.json()).catch(() => ({}));
if (!session.jeton) {
  console.error("\n✗ La plateforme d'essai ne répond pas sur 3120 (ou refuse le compte d'essai).");
  process.exit(1);
}
const lire = (q) => fetch(`${PLATEFORME}/api/donnees?langue=en&recus=0&${q}`,
  { headers: { authorization: `Bearer ${session.jeton}` } }).then((r) => r.json());

/** Toute la caisse, page après page — la vérité indépendante de l'écran. */
async function toute() {
  const lignes = new Map();
  let d = await lire("sms=1000");
  for (const p of d.paiements ?? []) lignes.set(p.id, p);
  for (let i = 0; typeof d.suite === "string" && i < 100; i++) {
    d = await lire(`sms=1000&avant=${encodeURIComponent(d.suite)}`);
    for (const p of d.paiements ?? []) lignes.set(p.id, p);
  }
  return { lignes: [...lignes.values()], fin: d.suite };
}

let verite = await toute();
// Une caisse qui tient dans une page ne met rien à l'épreuve.
if (verite.lignes.length < 600) {
  await fetch(`${NUAGE}/essai/semer?jours=40&parJour=20`, { method: "POST" });
}
// UN CLIENT D'IL Y A CINQ SEMAINES, avec le reçu établi à l'époque — une
// fois seulement, même si le harnais repasse.
if (!verite.lignes.some((p) => p.tiers === ANCIEN)) {
  const t = new Date(Date.now() - 35 * 86400000 + 3600000);
  const iso = `${t.toISOString().slice(0, 19)}+01:00`;
  await fetch(`${NUAGE}/rest/v1/paiements`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify([{
      terminal: "douala-faux", source_id: 98001, compte: "MTN ·8901",
      carte: "89237010000000008901", expediteur: "MTNMobileMoney", categorie: "encaissement",
      sens: "entree", montant: 73500, tiers: ANCIEN, numero: "699887766",
      reference: "ANCIEN-98001", solde_apres: null, nature: null,
      texte: `Vous avez recu 73 500 FCFA de ${ANCIEN} (699887766).`,
      emis_le: iso, recu_le: iso,
    }]),
  });
  await fetch(`${NUAGE}/rest/v1/recus`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ numero: "TM-2026-0908-98001", reference: "ANCIEN-98001",
                           terminal: "douala-faux", chemin: "2026/TM-2026-0908-98001.pdf",
                           etabli_le: iso }),
  });
}
verite = await toute();
const semeurs = verite.lignes.filter((p) => p.tiers === "SEMEUR").length;
const premiers = (await lire("sms=200")).paiements ?? [];
if (premiers.some((p) => p.tiers === ANCIEN)) {
  console.error(`\n✗ ${ANCIEN} tient dans les deux cents derniers : la caisse est trop maigre, `
    + "le harnais ne prouverait rien.");
  process.exit(1);
}

// --- L'écran -----------------------------------------------------------------
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server", "--disable-web-security"],
  proxy: { server: "direct://" },
});
const page = await nav.newPage({ viewport: { width: 393, height: 852 } });
const texte = () => page.evaluate(() => document.body.innerText);
const voir = (re, ms = 20000) => page.waitForFunction(
  (s) => new RegExp(s, "i").test(document.body.innerText), re.source, { timeout: ms });
const compter = (re) => texte().then((t) => (t.match(re) ?? []).length);

let echecs = 0;
const noter = (ok, quoi, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(52)} ${detail}`);
};

console.log(`\nLa plateforme porte ${verite.lignes.length} SMS, dont ${semeurs} encaissements `
  + `« SEMEUR » ; fin de l'historique : ${verite.fin === null ? "dite" : String(verite.fin)}.\n`);
const PLUS = /^(Show older payments|Voir les paiements plus anciens)$/;
const DEBUT = /Start of the history|Début de l'historique/;
try {
  await page.goto(APERCU, { waitUntil: "networkidle" });
  const champ = page.locator('input[type="email"]:not([readonly])');
  for (let i = 0; i < 6 && !(await champ.count()); i++) {
    const passer = page.getByText(/^(Skip|Passer|Next|Suivant|Start|Commencer|Get started)$/i);
    if (await passer.count()) await passer.last().click();
    await page.waitForTimeout(600);
  }
  await champ.fill(COURRIEL);
  await page.locator('input[type="password"]').fill(MOTDEPASSE);
  await page.getByText(/^(Sign in|Se connecter)$/).last().click();
  await voir(/FCFA/);
  await page.getByRole("tab", { name: /^(Payments|Paiements)$/ }).first().click();
  await voir(/SEMEUR/);
  await page.waitForTimeout(800);

  // --- 1. LA RECHERCHE VA PLUS LOIN --------------------------------------
  console.log("1. Une recherche sur un client d'il y a cinq semaines");
  const recherche = page.locator("input").first();
  await recherche.fill("MBARGA");
  await page.waitForTimeout(700);
  const d1 = await texte();
  noter(!d1.includes(ANCIEN), "il n'est pas dans ce que l'écran a reçu", "le témoin");
  noter(/Loaded back to|Chargés jusqu'au/.test(d1), "l'écran dit jusqu'où il a cherché");
  let clics = 0;
  while (clics < 12 && !(await texte()).includes(ANCIEN)) {
    const plus = page.getByRole("button", { name: PLUS });
    if (!(await plus.count())) break;
    await plus.first().click();
    clics++;
    await page.waitForFunction(
      (n) => !/Loading older payments|Chargement des plus anciens/.test(document.body.innerText)
        || document.body.innerText.includes(n), ANCIEN, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  noter((await texte()).includes(ANCIEN), "plus loin, il est trouvé", `${clics} appui(s)`);

  // --- 2. SA FICHE TROUVE LE REÇU D'ÉPOQUE ----------------------------------
  console.log("\n2. Sa fiche, et le reçu établi à l'époque");
  await page.getByRole("button", { name: new RegExp(ANCIEN) }).first().click();
  await voir(/Share the receipt|Partager le reçu|Issue the receipt|Établir le reçu/, 20000)
    .catch(() => {});
  await page.waitForTimeout(1500);
  const fiche = await texte();
  noter(/Share the receipt|Partager le reçu/.test(fiche), "« Partager le reçu » : il est retrouvé");
  noter(!/Issue the receipt|Établir le reçu/.test(fiche), "jamais « Établir le reçu » pour lui");
  await page.getByRole("button", { name: /^(Close|Fermer)$/ }).last().click().catch(() => {});
  await page.waitForTimeout(600);
  await recherche.fill("");
  await page.waitForTimeout(800);

  // --- 3. EN DESCENDANT, JUSQU'AU PREMIER SMS ------------------------------
  console.log("\n3. En descendant, jusqu'au premier SMS");
  const avant = await compter(/^SEMEUR$/gm);
  // La molette, jamais `scrollTop` : régler la propriété ne déclenche pas
  // le gestionnaire de react-native-web (la leçon de `verifier-les-listes`).
  await page.mouse.move(196, 500);
  let tours = 0;
  while (tours < 900 && !DEBUT.test(await texte())) {
    await page.mouse.wheel(0, 2400);
    tours++;
    if (tours % 10 === 0) await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
  const apres = await compter(/^SEMEUR$/gm);
  // LE TÉMOIN : sans la suite, l'écran s'arrêterait aux deux cents derniers.
  const dansLesDeuxCents = premiers.filter((p) => p.tiers === "SEMEUR").length;
  noter(dansLesDeuxCents < semeurs, "sans la suite, l'écran s'arrêterait avant",
    `${dansLesDeuxCents} sur ${semeurs} dans les deux cents derniers (le témoin)`);
  noter(avant < semeurs, "avant de descendre, une partie seulement", `${avant} sur ${semeurs}`);
  noter(apres === semeurs, "en bas, chaque encaissement une fois", `${apres} sur ${semeurs}, ${tours} crans`);
  noter(DEBUT.test(await texte()), "et la fin se dit : « Début de l'historique »");
} catch (e) {
  echecs++;
  console.error(`\n✗ ${e?.stack || e}`);
  console.log(`  à l'écran : ${(await texte().catch(() => "")).replace(/\s+/g, " ").slice(0, 400)}`);
} finally {
  await nav.close();
  fichiers.close();
}

console.log(echecs === 0
  ? "\n✓ L'onglet Paiements atteint toute la caisse, et la fin se dit.\n"
  : `\n✗ ${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
