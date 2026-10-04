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
//   3. « Confirm » mène au pavé du code secret ;
//   4. le message de l'opérateur reste INTACT, et une zone de réponse est
//      toujours là, sous lui ; sous le pavé, « Répondre autre chose » ;
//   5. après le code, l'opérateur peut encore demander : l'écran ne se
//      déclare pas terminé de lui-même.
//
// LE TÉMOIN : sur l'application d'avant, l'étape 1 échoue — on y lit
// « Terminé ». Un harnais qui ne peut pas voir la panne d'hier ne garde rien.
//
// PUIS UNE CONFIRMATION DU NUMÉRO (« 1=Yes 2=No ») : « 1 » doit se taper et
// partir, même si l'écran a été lu « numéro ». Témoin : 9bd8990 y échoue.
//
// PLATEFORME, NUAGE et APERCU changent les adresses (3120, 4999, 3210).

import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const APERCU = process.env.APERCU || "http://127.0.0.1:3210";
const PLATEFORME = process.env.PLATEFORME || "http://127.0.0.1:3120";
const NUAGE = process.env.NUAGE || "http://127.0.0.1:4999";
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
  // LE FORMULAIRE S'ÉCRIT LISIBLE : « 670 00 01 23 », « 5 000 » — et en
  // grand. Neuf chiffres collés en 24 points, « c'est illisible ».
  console.log("\nLe formulaire :");
  const champ = () => page.locator("input:visible").last();
  const taille = async () => parseFloat(await champ().evaluate((e) => getComputedStyle(e).fontSize));
  await champ().fill("670000123");
  verdict(await champ().inputValue() === "670 00 01 23", "le numéro s'écrit « 670 00 01 23 »",
          await champ().inputValue());
  verdict(await taille() >= 30, "les chiffres du numéro sont grands", `${await taille()} px`);
  await page.getByText(/^Continuer$/).last().click();
  await attendre(900);
  await champ().fill("5000");
  verdict(await champ().inputValue() === "5 000", "le montant s'écrit « 5 000 »", await champ().inputValue());
  verdict(await taille() >= 30, "les chiffres du montant sont grands", `${await taille()} px`);
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
  // LE MESSAGE INTACT : « 00. Next » fait partie de ce que l'opérateur a
  // écrit. La première correction le retirait du message pour en faire un
  // bouton — le propriétaire : « son message doit être intact ».
  verdict(/237670000123\.\s*00\. Next/.test(ecran), "le message garde « 00. Next », tel qu'écrit");
  // UNE ZONE DE RÉPONSE, TOUJOURS — pas derrière un petit lien.
  verdict(await page.locator("input:visible").count() > 0 && /Votre réponse/.test(ecran),
          "la zone de réponse est là, sous le message");
  const suivant = visible("button", /Next/);
  if (!verdict(await suivant.count() > 0, "« Next » est un bouton")) throw new Error("arrêt");

  console.log("\nLa page suivante :");
  await suivant.click();
  const menu = await attendreUnDe([/Confirm\b/]);
  // CHAQUE LIGNE UNE SEULE FOIS : le titre dans la carte, « 1. Confirm » en
  // tuile à sa place. Une version affichait le message entier PUIS chaque
  // choix en tuile — neuf lignes en devenaient dix-huit, et la case de
  // réponse partait sous le pli. Le propriétaire : « tu as tué
  // l'expérience ».
  const confirmer = visible("button", /^1\s*[.):-]?\s*Confirm$|^Confirm$/);
  if (!verdict(Boolean(menu) && await confirmer.count() > 0, "« Confirm » est un bouton")) throw new Error("arrêt");
  const ecranMenu = await texte();
  const fois = (ecranMenu.match(/Cancel/g) ?? []).length;
  verdict(fois === 1, "chaque choix ne s'affiche qu'une fois", `« Cancel » ${fois} fois`);
  const boite = await page.locator("input:visible").last().boundingBox();
  const hauteur = page.viewportSize()?.height ?? 0;
  verdict(Boolean(boite) && boite.y + boite.height <= hauteur,
          "la case de réponse est à l'écran sans défiler",
          boite ? `bas à ${Math.round(boite.y + boite.height)} pour ${hauteur}` : "introuvable");
  await confirmer.click();
  if (!verdict(Boolean(await attendreUnDe([/Entrez votre code secret/])), "le pavé du code secret arrive")) {
    throw new Error("arrêt");
  }
  await attendre(600);
  // LE PAVÉ N'EST PAS UNE PRISON : on peut répondre autre chose.
  const autrement = visible("button", /^Répondre autre chose$/);
  verdict(await autrement.count() > 0, "« Répondre autre chose » est visible sous le pavé");

  console.log("\nAprès le code, l'opérateur demande encore :");
  for (const c of ["1", "2", "3", "4"]) {
    await page.getByRole("button", { name: new RegExp(`^${c}$`) }).locator("visible=true").first().click();
  }
  await page.getByText(/^Valider$/).last().click();
  const apres = await attendreUnDe([/Confirmez-vous/, /Terminé/]);
  const ecranApres = await texte();
  verdict(Boolean(apres) && /Confirmez-vous/.test(ecranApres) && !/^Terminé$/m.test(ecranApres),
          "la question qui suit le code s'affiche, sans « Terminé »");
  const oui = visible("button", /^1\s*[.):-]?\s*Oui$|^Oui$/);
  if (!verdict(await oui.count() > 0, "« Oui » est un bouton")) throw new Error("arrêt");
  await oui.click();
  verdict(Boolean(await attendreUnDe([/effectue avec succes/])), "l'opération va jusqu'au bout");

  // UNE RÉPONSE TAPÉE PART TOUJOURS. « Please confirm the recipient phone
  // 677998877 is correct (1=Yes 2=No) » se lit « numéro » : le champ
  // n'acceptait plus que huit chiffres, et « 1 » laissait Envoyer éteint.
  // LE TÉMOIN : l'application d'avant (9bd8990) échoue ici.
  console.log("\nLe réseau fait confirmer le numéro :");
  await fetch(`${NUAGE}/essai/page-longue?oui=0`, { method: "POST" });
  const conf = await fetch(`${NUAGE}/essai/confirmation-numero?oui=1`, { method: "POST" })
    .then((r) => r.json()).catch(() => null);
  if (!verdict(Boolean(conf?.confirmationNumero), "le faux nuage sait faire confirmer un numéro")) {
    throw new Error("arrêt");
  }
  // Un écran neuf : la fenêtre de l'opération précédente ne doit rien couvrir.
  await page.goto(APERCU, { waitUntil: "networkidle" });
  if (!await attendreUnDe([/FCFA/])) throw new Error("l'accueil n'est pas revenu");
  await attendre(1200);
  await page.getByRole("tab", { name: /^Opérations$/ }).first().click();
  await attendre(1200);
  await visible("button", /^Dépôt$/).click();
  await attendre(1500);
  await page.locator("input:visible").last().fill("677998877");
  await page.getByText(/^Continuer$/).last().click();
  await attendre(900);
  await page.locator("input:visible").last().fill("5000");
  await page.getByText(/^Continuer$/).last().click();
  await attendre(1200);
  await page.getByText(/^Confirmer$/).last().click();
  if (!verdict(Boolean(await attendreUnDe([/Please confirm the recipient phone/])),
               "l'écran de confirmation arrive, intact")) throw new Error("arrêt");
  await attendre(600);
  await page.locator("input:visible").last().fill("1");
  const envoyerBouton = visible("button", /^Envoyer$/);
  verdict(await envoyerBouton.getAttribute("aria-disabled") !== "true",
          "« 1 » se tape, et Envoyer s'allume");
  await envoyerBouton.click();
  verdict(Boolean(await attendreUnDe([/Entrez votre code secret/])),
          "« 1 » est parti : la suite vient (le montant, puis le code)");
} catch (e) {
  if (e.message !== "arrêt") verdict(false, "le parcours", e.message);
  const ecran = await texte().catch(() => "");
  console.log(`\n  Ce que l'écran montrait :\n${ecran.split("\n").slice(0, 20).map((l) => `    ${l}`).join("\n")}`);
} finally {
  await fetch(`${NUAGE}/essai/page-longue?oui=0`, { method: "POST" }).catch(() => {});
  await fetch(`${NUAGE}/essai/confirmation-numero?oui=0`, { method: "POST" }).catch(() => {});
  await nav.close();
}

if (echecs) {
  console.log(`\n✗ ${echecs} défaut(s) : un message long de l'opérateur se lit encore comme une fin.`);
  process.exit(1);
}
console.log("\n✓ Une page qui se tourne se tourne : jamais « Terminé » sur une session ouverte.");
