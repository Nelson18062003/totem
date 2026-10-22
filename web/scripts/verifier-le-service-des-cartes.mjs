// UNE CARTE SANS SERVICE SE DIT — de la base jusqu'à l'écran.
//
//     node scripts/verifier-le-service-des-cartes.mjs
//
// « Check balance » répondait « no network service » pendant que l'accueil
// montrait quatre barres : la force du signal mesure l'antenne, pas
// l'inscription. Le boîtier publie maintenant le SERVICE de chaque carte
// dans son signe de vie (`terminaux.sante.cartes`) ; ce banc fait publier au
// faux nuage une carte sans service, et exige :
//
//   1. la plateforme le lit et le DATE sur l'horloge de la base ;
//   2. l'accueil le DIT (« Aucun service ») à la place des barres, et dit ce
//      que ça change pour l'argent ;
//   3. une publication abîmée laisse les barres, sans erreur ;
//   4. un boîtier qui se tait FIGE l'état : on signale le boîtier, pas la
//      carte (une alarme par écran) ;
//   5. ce que le boîtier publie ne sort jamais tel quel : il porte les ICCID
//      de toutes ses cartes, et chacun ne voit que les siennes.
//
// LE TÉMOIN passe d'abord : sans publication, l'écran ne dit rien de tel —
// sans quoi la sonde de l'étape 2 trouverait « Aucun service » partout et ne
// prouverait rien.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const PORT = 3194;
const NUAGE = 4988;
const B = `http://127.0.0.1:${PORT}`;
const N = `http://127.0.0.1:${NUAGE}`;
const SECRET = "secret-d-essai-du-service-des-cartes";
const MTN_DOUALA = "89237010000000008901";
const MIN = 60_000;

let echecs = 0;
const verifier = (quoi, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(72)} ${detail}`);
};

async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}
for (const port of [PORT, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé — un essai précédent tourne encore,`);
    console.error("  et ces vérifications porteraient sur SON code. Arrêtez-le.");
    process.exit(1);
  }
}

// « next start » sert ce qui est dans « .next », pas les fichiers du disque.
console.log("\nCompilation de la plateforme…");
await new Promise((resoudre, rejeter) => {
  const build = spawn("npx", ["next", "build"], { stdio: "ignore" });
  build.on("exit", (c) => (c === 0 ? resoudre() : rejeter(new Error("la compilation a échoué"))));
});

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  env: { ...process.env, PORT: String(NUAGE), FAUX_FLOTTE: "1" }, stdio: "ignore", detached: true,
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, SUPABASE_URL: N, SUPABASE_CLE: "peu-importe", SESSION_SECRET: SECRET },
  stdio: "ignore", detached: true,
});
// Un serveur de harnais a son propre groupe de processus : c'est le groupe
// qu'on arrête, sinon « next-server » survit et garde le port.
const arreter = () => {
  for (const p of [serveur, nuage]) { try { process.kill(-p.pid, "SIGTERM"); } catch { /* parti */ } }
};

const essai = (chemin) => fetch(N + chemin, { method: "POST" }).then((r) => r.json());
let nav = null;
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${B}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }
  const jeton = (await (await fetch(`${B}/api/inscription`, {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.79.0.1" },
    body: JSON.stringify({ courriel: "patron@service.cm", motdepasse: "un-mot-de-passe-du-service" }),
  })).json()).jeton;
  verifier("le propriétaire entre", Boolean(jeton));
  if (!jeton) throw new Error("sans session, rien ne se prouve");
  const donnees = async () => {
    const r = await fetch(`${B}/api/donnees`, { headers: { authorization: `Bearer ${jeton}` } });
    return { statut: r.status, texte: await r.text() };
  };
  const laCarte = (texte) => JSON.parse(texte).sims.find((s) => s.iccid === MTN_DOUALA);

  nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "totem_session", value: jeton, domain: "127.0.0.1", path: "/" },
                        { name: "totem_langue", value: "fr", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  const accueil = async () => {
    await page.goto(`${B}/`, { waitUntil: "networkidle" });
    return page.locator("main").innerText();
  };
  const barresDeLaCarte = () => page.locator('main [aria-label^="Signal"]').count();

  // 0. Le témoin : sans publication, rien de tel.
  console.log("\n— sans publication (témoin)");
  let d = await donnees();
  verifier("la carte n'a pas de service à dire", laCarte(d.texte).service === undefined);
  let texte = await accueil();
  verifier("TÉMOIN : l'accueil ne dit pas « Aucun service »", !/Aucun service/.test(texte));
  verifier("TÉMOIN : l'accueil dessine les barres", (await barresDeLaCarte()) > 0);

  // 1. La carte n'a plus de réseau depuis douze minutes.
  console.log("\n— MTN ·8901 sans service depuis 12 min");
  await essai(`/essai/service?iccid=${MTN_DOUALA}&etat=aucun&minutes=12&coupures=3&cumul=1500`);
  d = await donnees();
  const s = laCarte(d.texte).service;
  verifier("la plateforme le lit", s?.etat === "aucun", JSON.stringify(s));
  const terminal = (await (await fetch(`${N}/rest/v1/terminaux?select=*&id=eq.douala-faux`)).json())[0];
  const entendu = Date.parse(terminal.entendu_le ?? terminal.vu_le);
  const ecart = Math.abs(Date.parse(s?.depuisLe) - (entendu - 12 * MIN));
  verifier("et le date sur l'horloge de la base (douze minutes avant)", ecart < 5000, `${ecart} ms`);
  verifier("les coupures de la journée suivent", s?.coupures24h === 3 && s?.sansService24hS === 1500);
  verifier("rien de figé : son boîtier parle", s?.fige === false);

  // 2. L'écran le dit.
  texte = await accueil();
  verifier("l'accueil dit « Aucun service »", /Aucun service/.test(texte));
  verifier("à la place des barres", (await barresDeLaCarte()) === 0, `${await barresDeLaCarte()} barre(s)`);
  verifier("et ce que ça change pour l'argent", /arrive bien sur le compte chez MTN/.test(texte));

  // 3. Une publication abîmée : les barres, sans erreur.
  console.log("\n— une publication abîmée");
  await essai(`/essai/service?iccid=${MTN_DOUALA}&brut=${encodeURIComponent(JSON.stringify({ etat: "panne-inventee", depuis_s: -5 }))}`);
  d = await donnees();
  verifier("la plateforme répond", d.statut === 200, `${d.statut}`);
  verifier("et ne dit rien de la carte", laCarte(d.texte).service === undefined);
  texte = await accueil();
  verifier("l'accueil garde ses barres", !/Aucun service/.test(texte) && (await barresDeLaCarte()) > 0);

  // 4. Le boîtier se tait : on signale le boîtier, pas la carte.
  console.log("\n— le boîtier se tait");
  await essai(`/essai/service?iccid=${MTN_DOUALA}&etat=aucun&minutes=12`);
  await essai("/essai/taire?terminal=douala-faux&minutes=11");
  d = await donnees();
  verifier("l'état est figé", laCarte(d.texte).service?.fige === true);
  texte = await accueil();
  verifier("la carte ne crie pas « Aucun service » par-dessus le boîtier", !/Aucun service/.test(texte));
  await essai("/essai/reveiller?terminal=douala-faux");

  // 5. Ce que le boîtier publie ne sort pas tel quel.
  console.log("\n— ce qui sort de la plateforme");
  d = await donnees();
  // `terminal.sante` existe déjà : c'est la PHRASE de santé du Pi (une
  // chaîne). Ce qui ne doit pas sortir, c'est l'OBJET que le boîtier publie.
  verifier("aucune « santé » brute dans la réponse", !/"sante"\s*:\s*\{/.test(d.texte));
  verifier("ni la table des cartes du boîtier", !/"cartes"\s*:\s*\{/.test(d.texte));
  // Les deux sondes, sur une réponse qui laisserait fuir l'objet publié.
  const fuite = JSON.stringify({ terminal: { sante: { cartes: { [MTN_DOUALA]: { etat: "aucun" } } } } });
  verifier("TÉMOIN : les deux sondes voient une fuite", /"sante"\s*:\s*\{/.test(fuite) && /"cartes"\s*:\s*\{/.test(fuite));
  await ctx.close();
} catch (e) {
  echecs++;
  console.error(`\n✗ ${e.stack || e}`);
} finally {
  if (nav) await nav.close();
  arreter();
}

console.log(echecs ? `\n✗ ${echecs} échec(s)\n` : "\n✓ Une carte sans service se dit, de la base jusqu'à l'écran.\n");
process.exit(echecs ? 1 : 0);
