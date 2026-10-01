// CE QUI S'EST PASSÉ — la page qui manquait, et ce qu'elle ne doit pas dire.
//
//     node scripts/verifier-le-journal.mjs
//
// POURQUOI. Le terminal tient un journal depuis toujours : modem redémarré,
// SMS illisible, nuage injoignable. Il le pousse dans la base — et personne
// ne le lisait. Aucun écran ne l'affichait : on collectait pour jeter. La
// plateforme, elle, n'écrivait rien du tout ; ses pannes partaient dans la
// sortie d'erreur de l'hébergeur, que le propriétaire n'ouvrira jamais.
//
// CE QUE CE HARNAIS GARDE :
//
//   1. la page montre VRAIMENT ce que la base porte — un écran de journal
//      vide est indiscernable d'un écran de journal cassé ;
//   2. elle distingue qui a parlé : le terminal, ou la plateforme ;
//   3. elle se lit dans les deux langues ;
//   4. ELLE NE PORTE AUCUNE DONNÉE PERSONNELLE. C'est la vérification qui
//      compte le plus. Un journal se garde longtemps et se lit à plusieurs :
//      c'est exactement l'endroit où un code de confirmation, un courriel ou
//      un mot de passe survivrait à tout le reste ;
//   5. elle reste derrière le verrou : ce qui s'est passé chez quelqu'un ne
//      regarde pas les passants.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";

const PORT = 3144;
const NUAGE = 4991;
const B = `http://127.0.0.1:${PORT}`;
const MDP = "un-mot-de-passe-assez-long";

let echecs = 0;
const verifier = (quoi, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(56)} ${detail}`);
};

async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}
for (const port of [PORT, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé — arrêtez l'essai précédent.`);
    process.exit(1);
  }
}

console.log("\nCompilation de la plateforme…");
await new Promise((resoudre, rejeter) => {
  const b = spawn("npx", ["next", "build"], { stdio: "ignore" });
  b.on("exit", (c) => (c === 0 ? resoudre() : rejeter(
    new Error("la compilation a échoué — le journal ne peut rien prouver"))));
});

const nuage = spawn("node", ["scripts/faux-nuage.mjs"],
  { env: { ...process.env, PORT: String(NUAGE) }, stdio: "ignore" });
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${NUAGE}`, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: "secret-du-journal", TOTEM_MOT_DE_PASSE: "cle-de-secours-journal",
  },
  stdio: "ignore",
});

/** Le texte visible d'une page, balises retirées. */
const lisible = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${B}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }

  // --- 1. LE JOURNAL EST DERRIÈRE LE VERROU ------------------------------
  const sansSession = await fetch(`${B}/journal`, { redirect: "manual" });
  verifier("sans session, le journal ne s'ouvre pas",
    [302, 307, 308].includes(sansSession.status), `${sansSession.status}`);

  await fetch(`${B}/api/inscription`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: "journal@essai.cm", motdepasse: MDP }),
  });
  const co = await fetch(`${B}/api/connexion`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: "journal@essai.cm", motdepasse: MDP }),
  });
  const biscuit = (co.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0]).join("; ");

  // --- 2. LA PAGE MONTRE CE QUE LA BASE PORTE ----------------------------
  //
  // On lit d'abord la base, puis la page : un écran de journal VIDE est
  // indiscernable d'un écran de journal cassé.
  const dansLaBase = await (await fetch(
    `http://127.0.0.1:${NUAGE}/rest/v1/evenements?select=*`)).json();
  verifier("le faux nuage porte bien des incidents", dansLaBase.length > 0,
    `${dansLaBase.length} lignes`);

  const page = lisible(await (await fetch(`${B}/journal`,
    { headers: { cookie: biscuit } })).text());

  const manquants = dansLaBase.filter(
    (e) => !page.includes(e.texte.slice(0, 40)));
  verifier("chaque incident de la base est à l'écran", manquants.length === 0,
    manquants.map((e) => e.texte.slice(0, 24)).join(" | "));

  // --- 3. ON SAIT QUI A PARLÉ --------------------------------------------
  const duTerminal = dansLaBase.some((e) => e.terminal);
  const deLaPlateforme = dansLaBase.some((e) => !e.terminal);
  verifier("les deux voix sont représentées dans l'essai",
    duTerminal && deLaPlateforme);
  verifier("l'écran dit « le terminal »", /terminal/i.test(page));
  verifier("l'écran dit « la plateforme »", /plateforme|platform/i.test(page));

  // --- 4. AUCUNE DONNÉE PERSONNELLE --------------------------------------
  //
  // LA VÉRIFICATION QUI COMPTE LE PLUS. Un journal se garde longtemps et se
  // lit à plusieurs : c'est l'endroit où un code de confirmation, un
  // courriel ou un mot de passe survivrait à tout le reste.
  const interdits = [
    ["le mot de passe du propriétaire", MDP],
    ["un courriel de compte", "journal@essai.cm"],
    ["la clé de secours", "cle-de-secours-journal"],
    ["la clé de session", "secret-du-journal"],
    ["l'adresse de la base", "127.0.0.1:" + NUAGE],
  ];
  for (const [quoi, aiguille] of interdits) {
    verifier(`le journal ne porte pas ${quoi}`, !page.includes(aiguille));
  }
  // CE QU'ON NE PEUT PAS VÉRIFIER SUR LA PAGE, et pourquoi c'est ailleurs.
  //
  // Un premier essai cherchait ici « aucune suite de 4 à 8 chiffres » — pour
  // attraper un code à usage unique. Il se déclenchait sur les montants, les
  // comptes de messages et les années : un contrôle qu'on aurait affaibli
  // jusqu'à ce qu'il ne dise plus rien.
  //
  // Surtout, il visait le mauvais endroit. La page montre fidèlement ce que
  // la base porte ; si quelqu'un ÉCRIT un code dans un incident, la page
  // l'affichera, et c'est normal. La règle doit tenir du côté de l'écriture —
  // c'est ce que garde le contrôle ci-dessous, sur le code source.
  const source = await import("node:fs").then((fs) =>
    ["lib/serveur.ts", "app/api/bilan/route.ts"]
      .map((f) => fs.readFileSync(f, "utf8")).join("\n"));
  // « function noterIncident(texte: string) » est la DÉCLARATION, pas un
  // appel : la compter faisait échouer le contrôle sur son propre sujet.
  const appels = [...source.matchAll(/(?<!function\s)noterIncident\(\s*([^\n]{0,40})/g)]
    .filter((a) => !a[1].startsWith("texte: string"));
  const suspects = appels.filter((a) => !/^[`"']/.test(a[1].trim()));
  verifier("chaque incident noté part d'un texte écrit par nous",
    suspects.length === 0,
    suspects.map((a) => a[1].trim().slice(0, 30)).join(" | "));
  verifier("et il y a bien des appels à contrôler", appels.length > 0,
    `${appels.length} appel(s)`);

  // --- 5. LES DEUX LANGUES -----------------------------------------------
  const enFrancais = lisible(await (await fetch(`${B}/journal`, {
    headers: { cookie: `${biscuit}; totem_langue=fr` },
  })).text());
  verifier("en français, la page s'annonce en français",
    enFrancais.includes("Ce qui s"), "");
  verifier("et l'incident s'y lit encore",
    enFrancais.includes("redémarré"), "");
} finally {
  serveur.kill("SIGKILL");
  nuage.kill("SIGKILL");
}

console.log(echecs === 0
  ? "\n✓ Le journal dit ce qui s'est passé, et rien de personnel.\n"
  : `\n✗ ${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
