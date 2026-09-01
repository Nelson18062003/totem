// UN SEUL CAHIER SUR LE COMPTOIR — combien de fois le téléphone descend-il ?
//
//     node scripts/verifier-le-cahier.mjs
//
// Prérequis : la même chaîne que `verifier-l-attente` (voir son en-tête),
// avec une caisse SEMÉE.
//
// POURQUOI CE CONTRÔLE EXISTE. Chaque écran gardait SON état : sept écrans,
// sept employés qui ne se parlent pas. On ouvre l'Accueil, il court chercher
// le solde ; on touche « Comptes », il RECOURT chercher le même chiffre,
// vieux de dix secondes. Cela se paie deux fois :
//
//   — sur le FORFAIT, au mégaoctet, à Douala ;
//   — et sur l'ÉCRAN : sans réseau, le deuxième employé revient les mains
//     vides et l'écran ne montre RIEN, alors que le premier avait le chiffre
//     en poche trente secondes plus tôt.
//
// CE QUE LE HARNAIS MESURE, et que lire le code ne dit pas : il ÉCOUTE le
// réseau. Il compte les appels à `/api/donnees` en visitant les quatre
// onglets, et il regarde ce que chaque appel demande.
//
// LE PIÈGE QU'IL GARDE. Les Comptes demandent mille SMS pour COMPTER, sans
// vouloir un seul texte ; l'Accueil en veut trente, avec leurs textes. Tant
// que « sans les lignes » était un DRAPEAU, le besoin commun des deux ne
// pouvait s'écrire : il fallait choisir, et choisir « avec les lignes »
// rapportait mille SMS à qui n'en voulait aucun. C'est pourquoi le harnais
// ne compte pas seulement les appels — il lit aussi ce qu'ils réclament.

import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const APERCU = "http://127.0.0.1:3210";
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";

// Quatre onglets, visités deux fois. Trois descentes est le PLANCHER, et il
// faut dire pourquoi plutôt que d'espérer mieux : un onglet ne se monte qu'à
// sa première visite, et chacun qui demande PLUS que ce qui est au cahier
// oblige à y retourner. L'accueil veut trente SMS ; les Comptes en COMPTENT
// mille ; la boîte de réception en RAPPORTE deux cents. Les Opérations, elles,
// ne demandent rien de neuf — et ne coûtent rien.
//
// Aller chercher tout de suite le besoin FINAL serait pire : ce serait faire
// attendre l'accueil, le seul écran que le propriétaire regarde vraiment,
// pour des lignes que trois onglets sur quatre ne liront jamais.
//
// Mesuré à 4 avant le cahier. Le gain de CE comptage-là est donc mince, et il
// ne faut pas prétendre l'inverse : le vrai gain se mesure plus bas, au
// retour devant l'application.
const APPELS_MAX = 3;
// Le poids : mesuré à 105 Ko avant, 117 Ko après. C'est PLUS, et c'est le prix
// d'un seul cahier — quand les Comptes s'ajoutent, il faut redescendre
// chercher mille SMS à compter, et cette descente rapporte aussi les trente
// lignes de l'accueil qu'on avait déjà. Douze kilo-octets, une fois par
// session. La borne est là pour que cela ne dérive pas.
const KO_MAX = 130;

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

const nav = await chromium.launch({ args: ["--disable-web-security"] });
const page = await nav.newPage({ viewport: { width: 390, height: 844 } });

/** Chaque descente au guichet, avec ce qu'elle réclame et ce qu'elle
 *  rapporte. On compte la RÉPONSE, pas la demande : une demande annulée en
 *  route n'a rien coûté au forfait. */
const descentes = [];
page.on("response", async (r) => {
  const u = new URL(r.url());
  if (!u.pathname.startsWith("/api/donnees")) return;
  const octets = (await r.body().catch(() => Buffer.alloc(0))).length;
  descentes.push({
    sms: u.searchParams.get("sms"),
    recus: u.searchParams.get("recus"),
    lignes: u.searchParams.get("lignes"),
    octets,
  });
});

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
  await attendre(2500);

  // ON NE REMET PAS LE COMPTEUR À ZÉRO APRÈS LA CONNEXION. Un premier
  // brouillon le faisait — « ce qu'on mesure est le coût de parcourir » — et
  // cela cachait la descente de l'accueil, celle qui part juste après le mot
  // de passe. La version d'avant sortait alors 3 descentes au lieu de 4, et
  // la comparaison avec la version d'après perdait tout son sens.

  const onglets = ["Accounts", "SMS", "Operations", "Home"];
  for (const nom of onglets) {
    const l = page.getByRole("tab", { name: new RegExp(`^${nom}$`) }).first();
    if (!(await l.count())) {
      console.log(`  ✗ l'onglet « ${nom} » est introuvable`);
      echecs++;
      continue;
    }
    await l.click();
    await attendre(2500);
  }
  // Un second tour : revenir sur un onglet déjà vu ne doit RIEN coûter.
  for (const nom of onglets) {
    await page.getByRole("tab", { name: new RegExp(`^${nom}$`) }).first().click();
    await attendre(1200);
  }

  const total = descentes.reduce((n, d) => n + d.octets, 0);
  console.log(`  quatre onglets, visités deux fois :`);
  console.log(`    descentes au guichet : ${descentes.length}`);
  for (const d of descentes) {
    console.log(`      sms=${d.sms} recus=${d.recus} lignes=${d.lignes}`
                + ` → ${(d.octets / 1024).toFixed(0)} Ko`);
  }
  console.log(`    en tout : ${(total / 1024).toFixed(0)} Ko`);

  if (descentes.length > APPELS_MAX) {
    console.log(`  ✗ ${descentes.length} descentes pour les mêmes chiffres`
                + ` (${APPELS_MAX} tolérées).`);
    echecs++;
  } else {
    console.log(`  ✓ ${descentes.length} descente${descentes.length > 1 ? "s" : ""}`
                + " pour quatre onglets : le cahier sert tout le monde.");
  }

  // ON JUGE AU POIDS, PAS AU PARAMÈTRE. Un premier brouillon lisait
  // « lignes », et à défaut « sms » — il accusait donc la version d'AVANT de
  // rapporter mille lignes, alors qu'elle envoyait le drapeau `sansLignes`
  // et recevait un kilo-octet. Ce que la demande dit ne prouve rien ; ce qui
  // revient sur le réseau, si.
  if (total / 1024 > KO_MAX) {
    console.log(`  ✗ ${(total / 1024).toFixed(0)} Ko descendus pour quatre`
                + ` onglets (${KO_MAX} Ko tolérés).`);
    echecs++;
  } else {
    console.log(`  ✓ ${(total / 1024).toFixed(0)} Ko en tout :`
                + " rien qui ne soit regardé.");
  }

  // ── LE RETOUR DEVANT L'APPLICATION ─────────────────────────────────
  //
  // C'EST ICI QU'EST LE VRAI GAIN, et il ne se voyait pas dans le comptage du
  // dessus. Chaque écran écoutait POUR LUI le retour au premier plan et les
  // notifications : quatre onglets montés, c'était quatre rechargements pour
  // un seul retour — et une notification par SMS reçu, quarante fois par jour
  // sur une caisse active. Ces deux oreilles vivent maintenant dans le
  // cahier, une seule fois.
  console.log("\n  on quitte l'application, on y revient :");
  descentes.length = 0;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState",
                          { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await attendre(600);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState",
                          { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await attendre(3000);
  console.log(`    descentes : ${descentes.length}`);
  if (descentes.length > 1) {
    console.log(`  ✗ ${descentes.length} rechargements pour UN retour :`
                + " chaque écran écoute encore pour lui.");
    echecs++;
  } else {
    console.log("  ✓ un seul rechargement pour un retour, quel que soit le"
                + " nombre d'onglets ouverts.");
  }

  // ── LE MATIN, SANS RÉSEAU ──────────────────────────────────────────
  //
  // C'est la moitié qui compte le plus. Le commerçant ouvre sa boutique dans
  // une zone qui ne capte pas : l'application ne montrait RIEN — pas « pas
  // de réseau », rien du tout. Or le téléphone AVAIT les chiffres d'hier
  // soir ; il les jetait à chaque fermeture.
  //
  // On coupe donc vraiment le guichet — pas un ralentissement, un refus sec
  // — et on recharge la page. Ce qui s'affiche doit être les chiffres du
  // cahier, avec la date de leur relevé.
  console.log("\n  le matin, sans réseau :");
  await page.route("**/api/donnees**", (r) => r.abort("failed"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await attendre(6000);

  const ecran = await page.evaluate(() => document.body.innerText);
  const montreDesChiffres = /FCFA/.test(ecran);
  // ET ELLE DOIT LE DIRE. Montrer un solde d'hier sans un mot serait pire
  // qu'un écran vide : on remet de l'argent en croyant qu'il est arrivé.
  const leDit = /No network|Pas de réseau/.test(ecran)
             && /last visit|dernier passage/.test(ecran);
  if (montreDesChiffres && leDit) {
    console.log("  ✓ l'application montre les chiffres du dernier passage,"
                + " et dit qu'ils datent.");
  } else if (montreDesChiffres) {
    console.log("  ✗ elle montre de vieux chiffres SANS dire qu'ils datent.");
    echecs++;
  } else {
    console.log("  ✗ écran sans un chiffre. Ce qu'il porte :");
    console.log("      " + ecran.replace(/\n+/g, " · ").slice(0, 220));
    echecs++;
  }

  // ET LE CAHIER SE FERME AVEC LA SESSION. Sans cette règle, un téléphone
  // perdu montrerait les SMS du propriétaire à qui l'ouvrirait, sans avoir
  // à entrer le moindre mot de passe.
  await page.unroute("**/api/donnees**");
  const restant = await page.evaluate(() => {
    try {
      localStorage.clear();          // ce que fait la déconnexion, en gros
      return localStorage.getItem("cahier-totem");
    } catch { return "?"; }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await attendre(3000);
  const apres = await page.evaluate(() => document.body.innerText);
  if (restant === null && /Sign in|Se connecter/.test(apres)) {
    console.log("  ✓ session fermée : le cahier est effacé, et le verrou revient.");
  } else {
    console.log("  ✗ après la fermeture de session, le cahier ou l'écran survit.");
    echecs++;
  }

} catch (e) {
  console.error(`\n✗ Le harnais s'est arrêté : ${e.message}`);
  echecs++;
}

await nav.close();
console.log("");
if (echecs) {
  console.log(`✗ ${echecs} vérification(s) en échec.`);
  process.exit(1);
}
console.log("✓ Un seul cahier, et il ne rapporte que ce qu'on regarde.");
