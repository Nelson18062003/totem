// UN MESSAGE LONG DE L'OPÉRATEUR SE TOURNE COMME UNE PAGE — joué en entier.
//
//     node scripts/verifier-la-page-longue.mjs
//
// Prérequis : la même chaîne que `verifier-l-attente` (voir son en-tête).
// Le harnais met lui-même le faux nuage en « page longue ».
//
// CE QUI S'EST PASSÉ. Un « Float Transfer » MTN vers une raison sociale
// longue : l'opérateur coupe son message et le termine par « 00. Next ».
// Le message ne pose aucune question ; l'écran le prenait pour une FIN —
// « Réponse de l'opérateur », un bouton « Terminé », et un petit lien
// « répondre quand même ». La suite (« 1. Confirm », puis le code secret)
// ne venait qu'en tapant « 00 » à l'aveugle. Sur de l'argent.
//
// CE QU'IL EXIGE, dans l'application qui tourne : un dépôt joué comme le
// propriétaire le joue — numéro, montant, « Confirmer » — puis
//   1. pas d'écran de fin sur la page : un bouton « Next » ;
//   2. « Next » mène au menu suivant, dont « Confirm » est un bouton ;
//   3. « Confirm » mène au pavé du code secret.
//
// LE TÉMOIN : sur l'application d'avant, l'étape 1 échoue — on y lit
// « Terminé ». Un harnais qui ne peut pas voir la panne d'hier ne garde rien.

import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const APERCU = "http://127.0.0.1:3210";
const PLATEFORME = "http://127.0.0.1:3120";
const NUAGE = "http://127.0.0.1:4999";
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";

let echecs = 0;
const verdict = (ok, quoi, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${quoi}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
  return ok;
};

for (const [quoi, adresse] of [["Le faux nuage", `${NUAGE}/`],
                               ["La plateforme", `${PLATEFORME}/api/plateforme`],
                               ["L'aperçu", APERCU]]) {
  try {
    await fetch(adresse, { signal: AbortSignal.timeout(4000) });
  } catch {
    console.error(`\n✗ ${quoi} ne répond pas (${adresse}).`);
    console.error("  Voir l'en-tête de ce fichier pour la chaîne à lancer.");
    process.exit(1);
  }
}

await fetch(`${PLATEFORME}/api/inscription`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ prenom: "Essai", nom: "Totem", adresse: "Rue 1, Douala",
    telephone: "670000099", courriel: COURRIEL, motdepasse: MOTDEPASSE }),
}).catch(() => {});
const bascule = await fetch(`${NUAGE}/essai/page-longue?oui=1`, { method: "POST" })
  .then((r) => r.json()).catch(() => null);
if (!bascule?.pageLongue) {
  console.error("\n✗ Le faux nuage ne sait pas servir une page longue : ce harnais ne mesurerait rien.");
  process.exit(1);
}

const nav = await chromium.launch({ args: ["--disable-web-security"] });
const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
const texte = () => page.evaluate(() => document.body.innerText);
/** Attend que l'écran montre l'un des motifs ; rend celui qu'il a vu. */
async function attendreUnDe(motifs, delai = 30000) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    const t = await texte();
    const vu = motifs.find((m) => m.test(t));
    if (vu) return vu;
    await attendre(300);
  }
  return null;
}
const visible = (role, nom) => page.getByRole(role, { name: nom }).locator("visible=true").first();

try {
  await page.goto(APERCU, { waitUntil: "networkidle" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("totem.langue", "fr"); });
  await page.goto(APERCU, { waitUntil: "networkidle" });
  for (let i = 0; i < 40; i++) {
    if (await page.locator('input[type="email"]').first().evaluate((e) => !e.readOnly).catch(() => false)) break;
    await attendre(500);
  }
  await page.locator('input[type="email"]').first().fill(COURRIEL);
  await page.locator('input[type="password"]').first().fill(MOTDEPASSE);
  await page.getByText(/^Se connecter$/).last().click();
  if (!await attendreUnDe([/FCFA/])) throw new Error("connexion : l'accueil n'est jamais venu");
  await attendre(1200);

  await page.getByRole("tab", { name: /^Opérations$/ }).first().click();
  await attendre(1200);
  await visible("button", /^Dépôt$/).click();
  await attendre(1500);
  await page.locator("input:visible").last().fill("670000123");
  await page.getByText(/^Continuer$/).last().click();
  await attendre(900);
  await page.locator("input:visible").last().fill("5000");
  await page.getByText(/^Continuer$/).last().click();
  await attendre(1200);
  await page.getByText(/^Confirmer$/).last().click();

  console.log("\nLa page « 00. Next » :");
  const vu = await attendreUnDe([/Réponse de l.opérateur|Terminé/, /\bNext\b/]);
  const ecran = await texte();
  if (!vu) throw new Error("la page de l'opérateur n'est jamais arrivée");
  verdict(!/Réponse de l.opérateur/.test(ecran) && !/^Terminé$/m.test(ecran),
          "pas d'écran de fin sur une page qui se tourne",
          /Terminé/.test(ecran) ? "on y lit « Terminé »" : "");
  verdict(/237670000123\./.test(ecran), "le message entier reste lisible");
  const suivant = visible("button", /Next/);
  if (!verdict(await suivant.count() > 0, "« Next » est un bouton")) throw new Error("arrêt");

  console.log("\nLa page suivante :");
  await suivant.click();
  const menu = await attendreUnDe([/Confirm\b/]);
  const confirmer = visible("button", /^1\s*Confirm$|^Confirm$/);
  if (!verdict(Boolean(menu) && await confirmer.count() > 0, "« Confirm » est un bouton")) throw new Error("arrêt");
  await confirmer.click();
  verdict(Boolean(await attendreUnDe([/Entrez votre code secret/])), "le pavé du code secret arrive");
} catch (e) {
  if (e.message !== "arrêt") verdict(false, "le parcours", e.message);
  const ecran = await texte().catch(() => "");
  console.log(`\n  Ce que l'écran montrait :\n${ecran.split("\n").slice(0, 20).map((l) => `    ${l}`).join("\n")}`);
} finally {
  await fetch(`${NUAGE}/essai/page-longue?oui=0`, { method: "POST" }).catch(() => {});
  await nav.close();
}

if (echecs) {
  console.log(`\n✗ ${echecs} défaut(s) : un message long de l'opérateur se lit encore comme une fin.`);
  process.exit(1);
}
console.log("\n✓ Une page qui se tourne se tourne : jamais « Terminé » sur une session ouverte.");
