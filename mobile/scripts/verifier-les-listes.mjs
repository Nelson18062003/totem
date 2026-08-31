// UNE LISTE NE MONTE PAS CE QUE PERSONNE NE REGARDE — et rien ne se perd.
//
//     node scripts/verifier-les-listes.mjs
//
// Prérequis : la même chaîne que `verifier-l-attente` (voir son en-tête),
// avec une caisse SEMÉE, sans quoi il n'y a rien à mesurer :
//   curl -X POST "http://127.0.0.1:4999/essai/semer?jours=30&parJour=20"
//
// SEMER DENSE VAUT MIEUX QUE SEMER LARGE. Ce harnais a passé au vert sur une
// caisse à vingt encaissements par jour, puis échoué le lendemain sur la
// même liste avec une caisse à quarante — sans qu'une ligne de code ait
// bougé. C'est ce qu'il devait dire : la liste rendait quatre JOURS, donc ce
// qu'elle montait suivait ce que la boutique encaissait. Une journée à cent
// quarante en montait cent quarante.
//   curl -X POST "http://127.0.0.1:4999/essai/semer?jours=3&parJour=120"
//
// POURQUOI. Un `ScrollView` monte TOUS ses enfants — sur Android comme sur
// le web. Mesuré sur une caisse de trente jours : 201 lignes montées pour 10
// visibles à l'écran, 2 386 nœuds pour dix lignes. Chaque ligne construit
// ses icônes, ses textes, sa mise en page, et occupe la mémoire d'un
// téléphone qui n'en a pas beaucoup.
//
// LES DEUX MOITIÉS DU CONTRAT, et la seconde compte autant que la première :
//
//   1. au premier affichage, la liste ne monte qu'une PART de ce qu'elle a ;
//   2. en descendant, on atteint TOUT. Une liste qui s'arrête au quatrième
//      jour n'est pas rapide, elle est cassée — des encaissements qu'on ne
//      peut plus atteindre, sur l'écran où l'on vient lire son argent.
//
// CE QUE CETTE MESURE VAUT. Elle tourne sur l'export web. Le NOMBRE de
// lignes montées transfère (le mécanisme est le même) ; les millisecondes,
// non — un navigateur de bureau n'est pas un Android à quarante mille
// francs. La vraie virtualisation (`SectionList`, qui démonte aussi ce qui
// est passé) reste le geste juste à terme, et demande un vrai téléphone.

import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const APERCU = "http://127.0.0.1:3210";
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";

// Ce qu'on tolère au premier affichage. Au-delà, la liste monte trop.
//
// Le budget de l'écran est de 40 rangées ; mesuré à 41 sur une caisse à
// quarante par jour, 44 sur une caisse à cent quarante EN UN JOUR. C'est le
// point : ce chiffre ne doit pas suivre la densité de la caisse. La barre
// est donc serrée — à 120, un retour au découpage par jours passait au vert
// sur une boutique tranquille et n'échouait que chez la plus occupée, celle
// qui a justement le moins de marge.
const MONTEES_MAX = 80;
// En dessous, il n'y a rien à mesurer : le harnais le dit plutôt que de
// passer au vert sur une caisse vide.
const MINIMUM_POUR_MESURER = 150;

let echecs = 0;

for (const [quoi, adresse] of [["La plateforme d'essai", "http://127.0.0.1:3120/api/plateforme"],
                               ["L'aperçu de l'application", APERCU]]) {
  try {
    const r = await fetch(adresse, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error("muet");
  } catch {
    console.error(`\n✗ ${quoi} ne répond pas (${adresse}).`);
    console.error("  Voir l'en-tête de ce fichier pour la chaîne à lancer.");
    process.exit(1);
  }
}
await fetch("http://127.0.0.1:3120/api/inscription", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
}).catch(() => {});

// COMBIEN LA CAISSE PORTE-T-ELLE VRAIMENT ? On le demande à la plateforme,
// pas à l'écran. Sans cette vérité indépendante, une liste qui S'ARRÊTE à
// quatre-vingt-neuf lignes et une caisse qui n'en a que quatre-vingt-neuf se
// ressemblent — et le harnais accusait la caisse d'être vide alors que
// l'écran perdait des encaissements. Un mauvais diagnostic envoie chercher
// la panne à l'autre bout.
const porte = await fetch("http://127.0.0.1:3120/api/connexion", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
});
if (!porte.ok) {
  console.error("\n✗ Impossible d'entrer avec le compte d'essai :");
  console.error("  un autre harnais a déjà utilisé ce faux nuage.");
  console.error("  Redémarrez le faux nuage, puis relancez.");
  process.exit(1);
}
const biscuit = (porte.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(";")[0]).join("; ");
const enBase = await fetch("http://127.0.0.1:3120/api/donnees?sms=200&recus=0",
                           { headers: { cookie: biscuit } })
  .then((r) => r.json()).then((d) => d.paiements.length).catch(() => 0);

const nav = await chromium.launch({
  args: ["--disable-web-security", "--disable-features=IsolateOrigins,site-per-process"],
});
const page = await nav.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

/** Les lignes RÉELLEMENT montées : on ne garde que le porteur le plus
 *  intérieur d'un montant. Compter « les blocs qui contiennent FCFA » compte
 *  chaque ligne autant de fois qu'elle a d'enveloppes — 200 en donnaient 598. */
const compter = () => {
  const montant = /[\d\s,.]+\s*FCFA/;
  return [...document.querySelectorAll("div")].filter((e) =>
    montant.test(e.textContent || "")
    && ![...e.querySelectorAll("div")].some((f) => montant.test(f.textContent || ""))).length;
};

console.log("");
try {
  await page.goto(APERCU, { waitUntil: "networkidle" });
  for (let i = 0; i < 40; i++) {
    const pret = await page.locator('input[type="email"]').first()
      .evaluate((e) => !e.readOnly).catch(() => false);
    if (pret) break;
    await attendre(500);
  }
  await page.locator('input[type="email"]').first().fill(COURRIEL);
  await page.locator('input[type="password"]').first().fill(MOTDEPASSE);
  await page.getByText(/^Sign in$|^Se connecter$/).last().click();
  await page.waitForFunction(
    () => !![...document.querySelectorAll("div")].find((e) => /FCFA/.test(e.textContent || "")),
    null, { timeout: 30000 });

  await page.getByLabel(/^(SMS|Messages)$/).first().click();
  await attendre(3000);

  const auDepart = await page.evaluate(compter);
  const noeuds = await page.evaluate(() => document.querySelectorAll("div").length);
  const visibles = await page.evaluate(() => {
    const montant = /[\d\s,.]+\s*FCFA/;
    return [...document.querySelectorAll("div")].filter((e) => {
      if (!montant.test(e.textContent || "")) return false;
      if ([...e.querySelectorAll("div")].some((f) => montant.test(f.textContent || ""))) return false;
      const r = e.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    }).length;
  });

  // ON DESCEND À LA MOLETTE, jamais en réglant `scrollTop` : régler la
  // propriété ne déclenche pas le gestionnaire de react-native-web, et le
  // harnais concluait « la liste s'arrête » sur une liste qui marchait.
  let atteintes = auDepart, stable = 0;
  for (let i = 0; i < 10 && stable < 2; i++) {
    await page.mouse.move(195, 500);
    for (let r = 0; r < 12; r++) { await page.mouse.wheel(0, 900); await attendre(60); }
    await attendre(700);
    const maintenant = await page.evaluate(compter);
    stable = maintenant === atteintes ? stable + 1 : 0;
    atteintes = maintenant;
  }

  console.log(`  au premier affichage : ${auDepart} lignes montées, `
    + `${visibles} visibles, ${noeuds} nœuds`);
  console.log(`  après avoir descendu : ${atteintes} lignes atteintes`);

  console.log(`  la plateforme en porte : ${enBase}`);

  if (enBase < MINIMUM_POUR_MESURER) {
    console.log(`  ✗ la caisse d'essai ne porte que ${enBase} lignes : `
      + "rien à mesurer. Semez-la (voir l'en-tête).");
    echecs++;
  } else if (atteintes < enBase) {
    // LE DÉFAUT GRAVE : des encaissements que l'écran ne rend plus
    // atteignables, sur la page où l'on vient lire son argent.
    console.log(`  ✗ la liste S'ARRÊTE : ${atteintes} lignes atteintes sur `
      + `${enBase} — ${enBase - atteintes} encaissements hors de portée`);
    echecs++;
  } else {
    const sobre = auDepart <= MONTEES_MAX;
    if (!sobre) echecs++;
    console.log(`  ${sobre ? "✓" : "✗"} la liste ne monte pas tout d'un coup `
      + `(${auDepart} ≤ ${MONTEES_MAX})`);

    console.log(`  ✓ et tout reste atteignable en descendant `
      + `(${auDepart} → ${atteintes}, sur ${enBase} en base)`);
  }
} finally { await nav.close(); }

console.log(echecs === 0
  ? "\n✓ La liste ne monte que ce qu'on regarde, et ne perd rien.\n"
  : `\n✗ ${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
