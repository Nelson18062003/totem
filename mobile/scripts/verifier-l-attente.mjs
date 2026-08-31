// L'ATTENTE NE FAIT PAS SAUTER L'ÉCRAN.
//
//     node scripts/verifier-l-attente.mjs
//
// Prérequis, comme `verifier-les-formats` :
//   node web/scripts/faux-nuage.mjs
//   cd web && SUPABASE_URL=http://127.0.0.1:4999 SUPABASE_CLE=x \
//     SESSION_SECRET=essai TOTEM_MOT_DE_PASSE=essai npx next start -p 3120
//   cd mobile && EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3120 EXPO_PUBLIC_APERCU=1 \
//     npx expo export --platform web --output-dir /tmp/apercu
//   cd /tmp/apercu && python3 -m http.server 3210 --bind 127.0.0.1
//
// POURQUOI. Pendant le premier chargement, les écrans principaux ne
// montraient RIEN : un écran blanc, sans un mot. Le propriétaire ne peut pas
// distinguer « ça arrive » de « c'est cassé ». Des formes grises à la bonne
// place répondent aux deux questions d'un coup.
//
// MAIS UNE FORME À LA MAUVAISE HAUTEUR EST PIRE QUE PAS DE FORME. Si elle ne
// fait pas exactement la taille de ce qu'elle remplace, l'écran SAUTE au
// moment de la substitution — et il saute juste au moment où le doigt
// s'approche d'un bouton. Premier essai ici : 72 points de saut, parce que la
// forme oubliait les trois commandes rondes sous la carte. Mesuré, pas
// supposé — à l'œil, on ne l'aurait pas vu.
//
// Le harnais RALENTIT le réseau pour attraper l'état d'attente : sans cela il
// ne verrait jamais que l'écran d'après.

import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const APERCU = "http://127.0.0.1:3210";
// Le MÊME compte que `verifier-les-formats` : les deux harnais peuvent
// alors se suivre sur le même faux nuage sans se fermer la porte.
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";
// Un décalage qu'on ne voit pas. Au-delà, l'écran bouge sous le doigt.
const SAUT_TOLERE = 20;

const FORMATS = [["téléphone", 390, 844], ["petit", 360, 640], ["large", 430, 932]];

let echecs = 0;

try {
  const r = await fetch("http://127.0.0.1:3120/api/plateforme");
  if (!r.ok) throw new Error("plateforme muette");
} catch {
  console.error("\n✗ La plateforme d'essai ne répond pas sur 3120.");
  console.error("  Voir l'en-tête de ce fichier pour la chaîne à lancer.");
  process.exit(1);
}
// 403 dit « inscriptions fermées » — pas « VOTRE compte existe ». On le
// prouve maintenant, pas au moment de la connexion avec le mauvais
// diagnostic : sans cela le harnais annonce « l'écran ne montre rien »
// alors qu'on est simplement resté devant la porte.
{
  const inscription = await fetch("http://127.0.0.1:3120/api/inscription", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
  });
  if (inscription.status === 403) {
    const porte = await fetch("http://127.0.0.1:3120/api/connexion", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
    });
    if (!porte.ok) {
      console.error("\n✗ Les inscriptions sont fermées par un AUTRE compte :");
      console.error("  un autre harnais a déjà utilisé ce faux nuage.");
      console.error("  Redémarrez le faux nuage, puis relancez.");
      process.exit(1);
    }
  }
}

const nav = await chromium.launch({
  args: ["--disable-web-security", "--disable-features=IsolateOrigins,site-per-process"],
});

/** Le haut du titre « Derniers SMS » — un repère placé SOUS tout ce que la
 *  forme d'attente remplace. S'il ne bouge pas, rien n'a sauté. */
const repere = () => {
  const el = [...document.querySelectorAll("div")]
    .find((e) => /^(Latest SMS|Derniers SMS)$/.test(e.textContent?.trim() || ""));
  return el ? Math.round(el.getBoundingClientRect().top) : null;
};

console.log("");
for (const [nom, w, h] of FORMATS) {
  const page = await nav.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  try {
    await page.goto(APERCU, { waitUntil: "networkidle" });
    for (let i = 0; i < 40; i++) {
      const pret = await page.locator('input[type="email"]').first()
        .evaluate((e) => !e.readOnly).catch(() => false);
      if (pret) break;
      await attendre(500);
    }
    // À partir d'ici, les données mettent quatre secondes — comme à Douala.
    await page.route("**/api/donnees**", async (route) => {
      await attendre(4000);
      await route.continue();
    });
    await page.locator('input[type="email"]').first().fill(COURRIEL);
    await page.locator('input[type="password"]').first().fill(MOTDEPASSE);
    await page.getByText(/^Sign in$|^Se connecter$/).last().click();

    // ON ATTEND L'ÉTAT, PAS UNE DURÉE. Un délai fixe après le clic paraît
    // marcher — puis la connexion prend une seconde de plus (le frein compte
    // les essais, le calcul de l'empreinte est lent à dessein) et le harnais
    // mesure l'écran de connexion en annonçant « rien à l'écran ». Un
    // contrôle qui dépend d'un chronomètre finit par mesurer autre chose.
    let enAttente = null;
    for (let i = 0; i < 40; i++) {
      enAttente = await page.evaluate(repere);
      if (enAttente !== null) break;
      await attendre(400);
    }
    const formes = await page.evaluate(() =>
      [...document.querySelectorAll("div")]
        .filter((e) => getComputedStyle(e).backgroundColor === "rgb(230, 230, 230)").length);
    // Puis on attend que les chiffres remplacent les formes : le repère
    // existe déjà, on guette qu'il se stabilise après la substitution.
    await page.waitForFunction(
      () => !![...document.querySelectorAll("div")]
        .find((e) => /FCFA/.test(e.textContent || "")),
      null, { timeout: 20000 }).catch(() => {});
    await attendre(600);
    const arrive = await page.evaluate(repere);

    if (enAttente === null) {
      console.log(`  ✗ ${nom.padEnd(10)} l'écran ne montre RIEN pendant l'attente`);
      echecs++;
    } else {
      const saut = Math.abs(enAttente - arrive);
      const ok = saut <= SAUT_TOLERE;
      if (!ok) echecs++;
      console.log(`  ${ok ? "✓" : "✗"} ${nom.padEnd(10)} ${formes} formes en attente · `
        + `le repère passe de ${enAttente} à ${arrive} px — saut de ${saut} px`);
    }
  } finally { await page.close(); }
}
await nav.close();

console.log(echecs === 0
  ? "\n✓ L'attente se montre, et l'écran ne saute pas quand les chiffres arrivent.\n"
  : `\n✗ ${echecs} format(s) où l'attente ment ou fait sauter l'écran.\n`);
process.exit(echecs === 0 ? 0 : 1);
