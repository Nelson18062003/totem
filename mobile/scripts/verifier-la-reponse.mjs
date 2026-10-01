// UN BOUTON RÉPOND SOUS LE DOIGT — mesuré dans l'application qui tourne.
//
//     node scripts/verifier-la-reponse.mjs
//
// Prérequis : la même chaîne que `verifier-l-attente` (voir son en-tête),
// avec une caisse SEMÉE :
//   curl -X POST "http://127.0.0.1:4999/essai/semer?jours=30&parJour=20"
//
// POURQUOI CE CONTRÔLE EXISTE. `verifier-les-gestes` garde la conséquence :
// deux appuis ne doivent pas transférer deux fois. Celui-ci garde la CAUSE :
// on appuie deux fois parce que le premier appui n'a rien répondu. À Douala,
// un écran met une seconde à changer ; si le bouton reste immobile pendant
// ce temps, la personne appuie encore — et c'est normal.
//
// CE QUE CE HARNAIS MESURE, ET QUE LIRE LE CODE NE DIT PAS. Il MAINTIENT le
// doigt sur le bouton, prend l'image avant et pendant, et compte les pixels
// qui ont bougé. Chercher « pressed » dans le code répond à une autre
// question : le premier témoin écrit ici visait le bouton « Se connecter »,
// dont le code suit `pressed` depuis toujours, et sortait ✗ — parce que les
// champs étaient vides et le bouton donc `disabled`. Le code disait oui,
// l'écran disait non, et c'est l'écran qui a raison.
//
// IL PORTE SON PROPRE TÉMOIN. Une sonde qui répond ✗ à tout est indiscernable
// d'une application immobile : elle commence donc par viser deux boutons dont
// on SAIT qu'ils répondent. S'ils sortent ✗, c'est la sonde qui est fausse et
// le harnais s'arrête là plutôt que d'accuser l'application.
//
// UN BOUTON DÉCLARÉ INTROUVABLE EST UN ÉCHEC, jamais un silence : le harnais
// des formats a mesuré huit tailles d'un écran de connexion en vert sans
// jamais voir l'application.

import { setTimeout as attendre } from "node:timers/promises";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const APERCU = "http://127.0.0.1:3210";
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";

// Combien de pixels doivent bouger, en part de la surface du bouton. Un
// changement de fond en couvre presque tout ; un enfoncement de 3 % n'en
// remue que le bord — d'où un plancher bas, et le chiffre affiché à côté
// pour qu'un changement trop petit pour l'œil se VOIE dans la sortie.
const PART_MINIMALE = 0.005;

let echecs = 0;

// ── PREMIÈRE MOITIÉ : TOUT LE CODE ───────────────────────────────────────
//
// La seconde moitié mesure l'application qui tourne, et c'est elle qui a
// raison — mais elle ne voit que les écrans où elle sait aller. Le pavé
// secret, l'écran USSD, la création d'un invité ne sont pas sur son chemin.
// Cette passe-ci les couvre TOUS, sans serveur : elle lit chaque balise
// `<Pressable>` et exige les deux marques.
//
// Un `Pressable` répond de quatre façons légitimes, et n'en compter que
// certaines donne un chiffre faux — je m'y suis trompé deux fois : un style
// qui suit `pressed`, l'échelle de `useAppui` répandue en bloc, les aides
// `appuiTexte` / `avecAppui`, ou un `onPressIn` posé à la main.

const RACINE = join(fileURLToPath(import.meta.url), "..", "..", "src");

// LE VOILE D'UNE FEUILLE ne répond pas, et c'est voulu : il occupe tout le
// haut de l'écran ; le voir pâlir se lirait comme un écran qui s'efface.
// Écrit ici plutôt que deviné.
const DISPENSES_DU_DOIGT = ["feuille.tsx"];

function* fichiersTsx(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiersTsx(chemin);
    else if (/\.tsx$/.test(nom)) yield chemin;
  }
}

let boutons = 0;
const muetsAuDoigt = [];
const muetsALaVoix = [];

for (const chemin of fichiersTsx(RACINE)) {
  const source = readFileSync(chemin, "utf8");
  const court = chemin.slice(RACINE.length + 1);
  for (const m of source.matchAll(/<Pressable\b/g)) {
    boutons++;
    // La balise ouvrante : on s'arrête au premier « > » hors accolades,
    // sans quoi un « => » dans un style couperait la balise en deux.
    let prof = 0, fin = m.index;
    for (; fin < source.length; fin++) {
      const c = source[fin];
      if (c === "{") prof++;
      else if (c === "}") prof--;
      else if (c === ">" && prof === 0) break;
    }
    const balise = source.slice(m.index, fin);
    const ligne = source.slice(0, m.index).split("\n").length;

    const repond = /\(\{\s*pressed\s*\}\)/.test(balise)
                || /\{\.\.\.\w*[Aa]ppui\w*\}/.test(balise)
                || /style=\{appuiTexte\}/.test(balise)
                || /avecAppui\(/.test(balise)
                || /onPressIn=/.test(balise);
    if (!repond && !DISPENSES_DU_DOIGT.some((d) => court.endsWith(d))) {
      muetsAuDoigt.push(`${court}:${ligne}`);
    }
    if (!/accessibilityRole/.test(balise)) muetsALaVoix.push(`${court}:${ligne}`);
  }
}

console.log(`\nLe code — ${boutons} boutons dans src/ :`);
if (muetsAuDoigt.length) {
  console.log(`  ✗ ${muetsAuDoigt.length} ne répondent pas à l'appui :`);
  for (const b of muetsAuDoigt) console.log(`      ${b}`);
  echecs += muetsAuDoigt.length;
} else {
  console.log("  ✓ tous répondent à l'appui.");
}
if (muetsALaVoix.length) {
  console.log(`  ✗ ${muetsALaVoix.length} ne portent pas d'accessibilityRole :`);
  for (const b of muetsALaVoix) console.log(`      ${b}`);
  echecs += muetsALaVoix.length;
} else {
  console.log("  ✓ tous se disent boutons.");
}
// Un compte à zéro serait indiscernable d'un dossier mal lu.
if (boutons < 40) {
  console.error(`\n✗ Seulement ${boutons} boutons trouvés dans ${RACINE}.`);
  console.error("  Ce n'est pas l'application : le harnais lit le mauvais dossier.");
  process.exit(1);
}

// ── SECONDE MOITIÉ : L'APPLICATION QUI TOURNE ────────────────────────────

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

const nav = await chromium.launch({ args: ["--disable-web-security"] });
const page = await nav.newPage({ viewport: { width: 390, height: 844 } });

/** Deux images superposées : quelle PART de la surface a changé, et de
 *  combien au plus fort ? On les décode dans la page — le navigateur sait
 *  déjà lire un PNG, inutile d'ajouter une dépendance pour cela. */
async function ecart(avant, pendant) {
  return page.evaluate(async ([a, b]) => {
    const lire = (base64) => new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        ok(ctx.getImageData(0, 0, img.width, img.height));
      };
      img.src = "data:image/png;base64," + base64;
    });
    const [x, y] = await Promise.all([lire(a), lire(b)]);
    if (x.width !== y.width || x.height !== y.height) return { part: 1, pic: 255 };
    let bouges = 0, pic = 0;
    for (let i = 0; i < x.data.length; i += 4) {
      const d = Math.max(Math.abs(x.data[i] - y.data[i]),
                         Math.abs(x.data[i + 1] - y.data[i + 1]),
                         Math.abs(x.data[i + 2] - y.data[i + 2]));
      if (d > 6) bouges++;
      if (d > pic) pic = d;
    }
    return { part: bouges / (x.data.length / 4), pic };
  }, [avant.toString("base64"), pendant.toString("base64")]);
}

/** Le doigt se POSE et RESTE. On le retire ensuite EN DEHORS du bouton :
 *  relâcher dessus déclencherait l'action, et le harnais naviguerait
 *  au lieu de mesurer. */
async function sonder(nom, loc) {
  const b = await loc.boundingBox({ timeout: 4000 }).catch(() => null);
  if (!b || b.width < 2 || b.height < 2) {
    console.log(`  ✗ ${nom} — introuvable à l'écran`);
    echecs++;
    return null;
  }
  const clip = { x: Math.max(0, b.x - 6), y: Math.max(0, b.y - 6),
                 width: Math.min(b.width + 12, 390 - Math.max(0, b.x - 6)),
                 height: b.height + 12 };
  const avant = await page.screenshot({ clip });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await attendre(150);
  const pendant = await page.screenshot({ clip });
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await attendre(120);

  const { part, pic } = await ecart(avant, pendant);
  const ok = part >= PART_MINIMALE;
  const chiffres = `${(part * 100).toFixed(1)} % de sa surface, écart max ${pic}`;
  console.log(`  ${ok ? "✓" : "✗"} ${nom} — ${ok ? chiffres : "rien ne bouge sous le doigt"}`);
  if (!ok) echecs++;
  return { part, pic };
}

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
  await attendre(600);

  // ── LE TÉMOIN ────────────────────────────────────────────────────────
  console.log("\nLe témoin — deux boutons dont on sait qu'ils répondent :");
  const t1 = await sonder("le bouton « Se connecter »",
                          page.getByText(/^Sign in$|^Se connecter$/).last());
  const t2 = await sonder("la pastille de langue",
                          page.getByText(/Français|English/).last());
  if (!t1?.part || !t2?.part) {
    console.error("\n✗ La sonde ne sait pas dire oui : elle ne mesure rien.");
    console.error("  Rien de ce qui suit n'aurait de sens. On s'arrête ici.");
    await nav.close();
    process.exit(1);
  }
  echecs -= 0;  // le témoin lui-même ne compte pas : il vient de passer

  console.log("\nL'écran de connexion :");
  await sonder("l'œil qui montre le mot de passe",
               page.getByLabel(/Afficher|Masquer|Show|Hide/).first());

  // ── DANS L'APPLICATION ───────────────────────────────────────────────
  await page.getByText(/^Sign in$|^Se connecter$/).last().click();
  await page.waitForFunction(
    () => !![...document.querySelectorAll("div")].find((e) => /FCFA/.test(e.textContent || "")),
    null, { timeout: 30000 });
  await attendre(2000);

  console.log("\nL'accueil :");
  await sonder("« tout voir » (mène à la boîte de réception)",
               page.getByText(/tout voir|See all|View all/i).first());

  await sonder("un geste (« dépôt »)",
               page.getByText(/^Deposit$|^Dépôt$/).first());
  await sonder("la commande ronde qui masque le solde",
               page.getByLabel(/Hide the balance|Masquer le solde/).first());
  await sonder("une ligne de message",
               page.getByRole("button").filter({ hasText: /FCFA/ }).first());

  console.log("\nLa barre d'onglets :");
  for (const nom of ["Home", "Accueil", "SMS"]) {
    const l = page.getByRole("tab", { name: new RegExp(`^${nom}$`) }).first();
    if (await l.count()) await sonder(`l'onglet « ${nom} »`, l);
  }

  console.log("\nLa boîte de réception :");
  await page.getByRole("tab", { name: /^SMS$/ }).first().click();
  await attendre(2500);
  await sonder("un filtre (« toutes les puces »)",
               page.getByRole("button", { name: /^(All SIMs|Toutes les puces)$/ }).first());
  await sonder("un filtre de nature (« entrées »)",
               page.getByRole("button", { name: /^(Money in|Entrées)$/ }).first());

  // ── CE QU'UNE AIDE TECHNIQUE ENTEND ─────────────────────────────────
  //
  // L'autre moitié de la même promesse : un bouton doit se faire
  // reconnaître par le DOIGT et par la VOIX. Mesuré avant correction, sur
  // l'accueil : DEUX boutons annoncés pour SEIZE choses qui se pressent.
  // « Dépôt », « Retrait », « Transfert » — les gestes qui déplacent de
  // l'argent — passaient pour du texte ordinaire.
  console.log("\nCe qu'une aide technique entend, sur l'accueil :");
  await page.getByRole("tab", { name: /^(Home|Accueil)$/ }).first().click();
  await attendre(2500);
  const { annonces, pressables, muets } = await page.evaluate(() => {
    // CE QUI SE PRESSE, ce n'est PAS `cursor: pointer` : ce curseur descend
    // en héritage, et sur cet écran 2 129 éléments sur 2 500 le portent —
    // un premier comptage écrit ici trouvait ainsi 850 « boutons » là où il
    // y en a seize, en comptant les mots à l'intérieur des boutons.
    //
    // Ce qui distingue vraiment un bouton, c'est que le clavier peut s'y
    // poser : react-native-web met `tabindex="0"` sur chaque `Pressable`, et
    // sur rien d'autre.
    const pressables = [...document.querySelectorAll('[tabindex="0"]')];
    const annonce = (e) => ["button", "tab", "link", "checkbox", "radio"]
      .includes(e.getAttribute("role") || "");
    return {
      pressables: pressables.length,
      annonces: pressables.filter(annonce).length,
      muets: pressables.filter((e) => !annonce(e))
        .map((e) => (e.getAttribute("aria-label") || e.textContent || "?").slice(0, 40)),
    };
  });
  if (annonces < pressables) {
    console.log(`  ✗ ${pressables} choses se pressent, ${annonces} s'annoncent`
                + " comme des boutons. Muettes :");
    for (const m of muets) console.log(`      « ${m} »`);
    echecs += pressables - annonces;
  } else {
    console.log(`  ✓ les ${pressables} choses qui se pressent s'annoncent toutes`
                + " comme des boutons.");
  }

} catch (e) {
  console.error(`\n✗ Le harnais s'est arrêté : ${e.message}`);
  echecs++;
}

await nav.close();
console.log("");
if (echecs) {
  console.log(`✗ ${echecs} bouton${echecs > 1 ? "s ne se font" : " ne se fait"}`
              + " pas reconnaître : ni sous le doigt, ni à la voix.");
  process.exit(1);
}
console.log("✓ Tous les boutons visés répondent sous le doigt, et tout ce qui"
            + " se presse s'annonce comme un bouton.");
