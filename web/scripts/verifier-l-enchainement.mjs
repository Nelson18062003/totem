// LE CHEMIN CONFIÉ AU BOÎTIER — un transfert, joué en entier, chronométré.
//
//     node scripts/verifier-l-enchainement.mjs
//
// « C'est trop lent », a dit le propriétaire, en regardant un transfert MTN
// passer par le menu : « Connecting to MTN… », « Sent: 1 », « Sent: 5 »…
// Mesuré sur trente-cinq transferts d'octobre, cinquante et une secondes,
// dont treize chez MTN : le reste était le trajet entre l'écran, la
// plateforme et le boîtier, refait pour CHAQUE écran de l'opérateur.
//
// L'écran confie maintenant le chemin entier à l'ouverture (`@noyau/deroule`,
// § 8) ; le boîtier le parcourt seul et ne rend que l'écran du code secret.
// Ce harnais joue un transfert dans un vrai navigateur, contre un vrai
// serveur et le faux nuage, et exige :
//
//   1. UNE seule demande déposée jusqu'au pavé du code, l'ouverture — et
//      elle porte le chemin : l'étape apprise, le numéro, le montant ;
//   2. rien de ce que le boîtier a fait n'est refait par l'écran : ni « 1 »,
//      ni le numéro, ni le montant ne repartent en réponse ;
//   3. le pavé s'ouvre SOUS le message entier de l'opérateur — ce qu'on
//      signe : le nom, le montant, les frais ;
//   4. LE TÉMOIN — un boîtier d'avant, qui ignore le chemin : l'écran fait
//      tout lui-même, comme avant, et arrive au même pavé, en quatre
//      demandes. C'est aussi ce qui garantit qu'un boîtier pas encore mis à
//      jour ne casse rien ;
//   5. un boîtier qui s'arrête en route (sa borne de temps) rend la main
//      à l'écran, qui reprend JUSTE APRÈS — sans rejouer ce qui est fait ;
//   6. et le chemin confié arrive au pavé en moins de la moitié du temps du
//      témoin.
//
// PORT_ENCHAINEMENT et PORT_NUAGE changent les ports (3143, 4999 par défaut).

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const PORT = Number(process.env.PORT_ENCHAINEMENT || 3143);
const PORT_NUAGE = Number(process.env.PORT_NUAGE || 4999);
const NUAGE = `http://127.0.0.1:${PORT_NUAGE}`;
const B = `http://127.0.0.1:${PORT}`;
const SECRET = "secret-d-essai-de-l-enchainement";
const MDP = "un-mot-de-passe-assez-long";

let echecs = 0;
const verifier = (quoi, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(60)} ${JSON.stringify(obtenu)}`);
};

async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}

// Un serveur resté ouvert ferait passer l'essai contre du vieux code.
for (const port of [PORT, PORT_NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé — arrêtez l'essai précédent.`);
    process.exit(1);
  }
}

// `next start` sert « .next », pas le disque : on compile à chaque fois.
console.log("\nCompilation de la plateforme…");
await new Promise((resoudre, rejeter) => {
  const build = spawn("npx", ["next", "build"], { stdio: "ignore" });
  build.on("exit", (code) => (code === 0 ? resoudre() : rejeter(
    new Error("la compilation a échoué — l'essai ne peut rien prouver"))));
});

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  stdio: "ignore", env: { ...process.env, PORT: String(PORT_NUAGE) },
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: NUAGE, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: "cle-de-secours-de-l-enchainement",
  },
  stdio: "ignore",
  // Son propre groupe : c'est le groupe qu'on arrête, serveur Next compris.
  detached: true,
});

/** Ce qu'une demande fait partir vers le réseau : sa réponse, son code, et
 *  le chemin confié au boîtier. */
const partis = (d) => [
  d.parametres?.texte, d.parametres?.code,
  ...(d.parametres?.suite?.trajet ?? []).map((p) => p[1]),
  ...(d.parametres?.suite?.champs ?? []).map((c) => c.valeur),
].filter((x) => x != null).map(String);

let nav;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${B}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }
  const etat = await (await fetch(`${NUAGE}/essai/enchainement`)).json();
  if (!etat.noyau) {
    console.error("\n✗ Le faux nuage n'a pas chargé le noyau : il ne sait pas enchaîner.");
    process.exit(1);
  }
  await fetch(`${B}/api/inscription`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: "enchainement@totem.test", motdepasse: MDP }),
  });

  nav = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" },
  });
  const page = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const demandes = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/commande") && r.method() === "POST") {
      try { demandes.push(JSON.parse(r.postData() || "{}")); } catch { /* ignore */ }
    }
  });

  await page.goto(B, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]:not([readonly])').fill("enchainement@totem.test");
  await page.locator('input[type="password"]').fill(MDP);
  await page.getByText(/^(Sign in|Se connecter)$/).last().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 15000 });

  /** Un transfert MTN de 5 000 F, jusqu'au pavé du code. Rend le temps
   *  écoulé entre « Confirmer » et le pavé, et les demandes déposées. */
  async function transfert() {
    await page.goto(`${B}/actions`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /MTN/ }).first().click();
    await page.getByRole("button", { name: /^(Transfert|Transfer)/ }).first().click();
    const fenetre = page.getByRole("dialog");
    await fenetre.waitFor({ timeout: 5000 });
    await fenetre.locator("input").first().fill("677998877");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await fenetre.locator("input").first().fill("5000");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const debut = demandes.length;
    const t0 = Date.now();
    await fenetre.getByRole("button", { name: /^(Confirmer|Confirm)$/ }).click();
    // On attend un ÉTAT — le pavé —, jamais une durée.
    let pave = 0;
    while (pave < 9 && Date.now() - t0 < 40000) {
      await page.waitForTimeout(100);
      pave = await fenetre.getByRole("button", { name: /^[0-9]$/ }).count();
    }
    const duree = Date.now() - t0;
    const texte = await fenetre.innerText();
    const siennes = demandes.slice(debut);
    await page.getByRole("button", { name: /^(Raccrocher|Hang up|Terminé|Done)$/ })
      .first().click().catch(() => {});
    await page.waitForTimeout(600);
    return { pave, duree, texte, siennes };
  }

  console.log("\nAvec le boîtier d'aujourd'hui : le chemin confié en une fois");
  const neuf = await transfert();
  const ouverture = neuf.siennes.find((d) => d.type === "ussd");
  verifier("le pavé du code s'ouvre", neuf.pave >= 9, true);
  verifier("une seule demande jusqu'au pavé : l'ouverture",
           neuf.siennes.map((d) => d.type), ["ussd"]);
  verifier("elle porte le chemin : l'étape apprise",
           ouverture?.parametres?.suite?.trajet, [["1", "1"]]);
  verifier("…le numéro et le montant, en chiffres",
           (ouverture?.parametres?.suite?.champs ?? []).map((c) => [c.cle, c.valeur]),
           [["numero", "677998877"], ["montant", "5000"]]);
  verifier("rien n'est refait par l'écran",
           neuf.siennes.filter((d) => d.type === "ussd_reponse").flatMap(partis), []);
  // Un écran qui ignorerait le rapport rejouerait l'étape « 1 » sur l'écran
  // du code : elle n'y est pas proposée, rien ne partirait, mais il
  // annoncerait à tort que « la suite n'est pas partie ».
  verifier("aucun faux « l'étape suivante n'est pas proposée »",
           /does not offer|ne propose pas/.test(neuf.texte), false);
  verifier("le pavé est SOUS le message entier : le nom", neuf.texte.includes("JEAN DUPONT"), true);
  verifier("…le montant et les frais", /5 000 FCFA[\s\S]*Frais/.test(neuf.texte), true);
  const rapport = (await (await fetch(`${NUAGE}/essai/enchainement`)).json()).enchaines.at(-1);
  verifier("le boîtier dit ce qu'il a parcouru",
           { trajet: rapport?.trajet, servis: rapport?.servis },
           { trajet: 1, servis: ["numero", "montant"] });

  // LE BOÎTIER S'ARRÊTE EN ROUTE — sa borne de temps, un écran qu'il ne
  // sert pas : il rend l'écran où il en est, et dit ce qu'il a fait. Un
  // écran qui ignorerait ce rapport rejouerait le chemin depuis le début,
  // sur un menu qui en est déjà ailleurs : au mieux il s'arrête à tort, au
  // pire il appuie sur un choix d'une autre branche.
  console.log("\nLe boîtier s'arrête en route : l'écran reprend juste après");
  await fetch(`${NUAGE}/essai/enchainement?oui=1&pas=1`, { method: "POST" });
  const enRoute = await transfert();
  await fetch(`${NUAGE}/essai/enchainement?oui=1`, { method: "POST" });
  const rapportEnRoute = (await (await fetch(`${NUAGE}/essai/enchainement`)).json()).enchaines.at(-1);
  verifier("le boîtier a fait l'étape apprise, rien d'autre",
           { trajet: rapportEnRoute?.trajet, servis: rapportEnRoute?.servis }, { trajet: 1, servis: [] });
  verifier("l'écran sert la suite : le numéro, puis le montant",
           enRoute.siennes.filter((d) => d.type === "ussd_reponse").flatMap(partis),
           ["677998877", "5000"]);
  verifier("…sans rejouer l'étape déjà faite",
           /does not offer|ne propose pas/.test(enRoute.texte), false);
  verifier("…jusqu'au pavé du code", enRoute.pave >= 9, true);

  console.log("\nLe témoin : un boîtier d'avant, qui ignore le chemin");
  await fetch(`${NUAGE}/essai/enchainement?oui=0`, { method: "POST" });
  const ancien = await transfert();
  await fetch(`${NUAGE}/essai/enchainement?oui=1`, { method: "POST" });
  verifier("le pavé s'ouvre aussi : rien ne casse", ancien.pave >= 9, true);
  verifier("l'écran fait tout lui-même, en quatre demandes",
           ancien.siennes.map((d) => d.type), ["ussd", "ussd_reponse", "ussd_reponse", "ussd_reponse"]);
  // Ce qui est parti vers MTN après l'ouverture : les réponses de l'écran,
  // d'un côté ; ce que le boîtier dit avoir parcouru et servi, de l'autre.
  const parLeBoitier = [
    ...(ouverture?.parametres?.suite?.trajet ?? []).slice(0, rapport?.trajet ?? 0).map((p) => p[1]),
    ...(rapport?.servis ?? []).map((cle) =>
      ouverture?.parametres?.suite?.champs.find((c) => c.cle === cle)?.valeur),
  ];
  verifier("…et envoie au réseau exactement ce que le boîtier a envoyé",
           ancien.siennes.filter((d) => d.type === "ussd_reponse").flatMap(partis), parLeBoitier);
  verifier("…jusqu'au même message", ancien.texte.includes("JEAN DUPONT"), true);

  console.log(`\n  Jusqu'au pavé du code : ${(neuf.duree / 1000).toFixed(1)} s avec le chemin confié, `
    + `${(ancien.duree / 1000).toFixed(1)} s écran par écran.`);
  verifier("le chemin confié prend moins de la moitié du temps", neuf.duree * 2 < ancien.duree, true);

  console.log(echecs === 0
    ? "\n✓ Le chemin confié tient : une demande, rien de refait, le même pavé.\n"
    : `\n✗ ${echecs} vérification(s) en échec.\n`);
} finally {
  if (nav) await nav.close().catch(() => {});
  try { process.kill(-serveur.pid, "SIGTERM"); } catch { /* déjà parti */ }
  nuage.kill();
}
process.exit(echecs === 0 ? 0 : 1);
