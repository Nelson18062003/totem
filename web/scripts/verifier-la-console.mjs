// LA CONSOLE, VRAIMENT ESSAYÉE.
//
//     node scripts/verifier-la-console.mjs
//
// Il lance un faux Supabase et un vrai serveur, puis essaie d'entrer dans la
// console de la plateforme : sans session, avec un compte invité, avec le
// compte du propriétaire, avec la clé de secours. « Ça compile » ne dit rien
// d'une garde.
//
// CE QU'IL CHERCHE À PRENDRE EN DÉFAUT, et c'est le cœur :
//
//   · un invité qui verrait la flotte, les comptes ou le frein ;
//   · un anonyme qui atteindrait une page ou une route de console ;
//   · un écran de flotte qui ne montrerait PAS ce que la base porte —
//     une console en vert sur une base qu'elle ne lit pas ne garde rien ;
//   · un mot de passe qui se changerait sans la preuve de l'ancien.
//
// Comme ses frères, il sert le code COMPILÉ : lancez « npx next build »
// avant, sans quoi il mesurerait l'application d'hier.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";

const SECRET = "secret-d-essai-pour-la-console";
const SECOURS = "cle-de-secours-d-essai-console";
const PORT = 3161;
const NUAGE = 4989;
const B = `http://127.0.0.1:${PORT}`;
const MDP = "un-mot-de-passe-assez-long";
const MDP2 = "le-nouveau-mot-de-passe-long";

let echecs = 0;
function verifier(quoi, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(52)} ${JSON.stringify(obtenu)}`);
}

// UN SERVEUR DÉJÀ LÀ EST UN PIÈGE. Si le port est occupé — par un essai
// précédent mal refermé — le serveur qu'on lance ici ne démarre pas, et
// TOUTES les vérifications s'exécutent contre l'ancien code. Elles passent,
// en vert, et ne prouvent rien. C'est arrivé. On refuse donc de commencer.
async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}

for (const port of [PORT, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé. Un essai précédent tourne`);
    console.error("  encore : ces vérifications porteraient sur SON code, pas sur");
    console.error("  celui d'ici. Arrêtez-le, puis relancez.");
    process.exit(1);
  }
}

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  env: { ...process.env, PORT: String(NUAGE) },
  stdio: "ignore",
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${NUAGE}`, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: SECOURS,
  },
  stdio: "ignore",
});

const poste = (chemin, corps, entetes = {}) =>
  fetch(B + chemin, {
    method: "POST",
    headers: { "content-type": "application/json", ...entetes },
    body: JSON.stringify(corps),
    redirect: "manual",
  });

// Une PAGE se demande avec le cookie : c'est ainsi qu'un navigateur la
// demande, et c'est le seul canal que les écrans serveur savent lire.
const page = (chemin, jeton) =>
  fetch(B + chemin, {
    headers: jeton ? { cookie: `totem_session=${jeton}` } : {},
    redirect: "manual",
  });

/** Où une page refusée envoie : le chemin de l'en-tête « location ». */
const renvoyeVers = (r) => {
  const brut = r.headers.get("location") || "";
  try { return new URL(brut, B).pathname; } catch { return brut; }
};

try {
  // Attendre les DEUX : le faux nuage d'abord, le serveur ensuite.
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${NUAGE}/rest/v1/utilisateurs`)).ok) break;
    } catch { /* pas encore */ }
    await attendre(300);
  }
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + "/api/plateforme")).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }

  console.log("\nSANS SESSION : la console n'existe pas");
  {
    const r = await page("/console");
    verifier("la flotte renvoie vers la connexion",
      [r.status, renvoyeVers(r)], [307, "/connexion"]);
    const g = await page("/console/gens");
    verifier("les gens aussi", [g.status, renvoyeVers(g)], [307, "/connexion"]);
    const v = await poste("/api/console/alertes/vue", { alerte: 1 });
    verifier("le geste d'alerte répond « connexion requise »", v.status, 401);
    const m = await poste("/api/motdepasse", { actuel: "x", nouveau: MDP2 });
    verifier("le mot de passe ne se change pas sans session", m.status, 401);
  }

  console.log("\nLE PROPRIÉTAIRE : il voit ce que la base porte");
  // La première inscription fait le propriétaire — comme en production.
  await poste("/api/inscription", { courriel: "patron@essai.cm", motdepasse: MDP });
  const patron = (await (await poste("/api/session",
    { courriel: "patron@essai.cm", motdepasse: MDP })).json()).jeton;
  verifier("le propriétaire a une session", Boolean(patron), true);
  {
    const r = await page("/console", patron);
    const corps = await r.text();
    verifier("la flotte s'ouvre", r.status, 200);
    // L'ÉCRAN DOIT MONTRER LA BASE. Une console qui rend 200 sans lire le
    // nuage passerait toutes les gardes et ne garderait rien : on exige le
    // nom du terminal que le faux nuage publie.
    verifier("et montre le terminal du nuage",
      corps.includes("Douala (faux)"), true);
    verifier("avec le logiciel qu'il annonce",
      corps.includes("0.0.0-essai"), true);
    // LA JOINTURE CARTE↔TERMINAL, ÉPROUVÉE. Le faux nuage a longtemps servi
    // des cartes SANS colonne « terminal » : la flotte affichait « aucune
    // SIM jamais vue » au-dessus de deux puces bien présentes — en vert.
    verifier("et il ne renie pas ses cartes SIM",
      corps.includes("no SIM ever seen"), false);

    const c = await page("/console/cartes", patron);
    verifier("le registre des cartes montre la puce MTN",
      (await c.text()).includes("MTN ·8901"), true);

    const g = await page("/console/gens", patron);
    const gens = await g.text();
    verifier("les gens montrent le compte du propriétaire",
      gens.includes("patron@essai.cm"), true);

    const j = await page("/console/journal", patron);
    verifier("le journal s'ouvre", j.status, 200);
    const t = await page("/console/terminal/douala-faux", patron);
    verifier("la fiche d'un terminal s'ouvre", t.status, 200);
    const a = await page("/console/alertes", patron);
    verifier("l'écran des alertes dit que personne n'y écrit",
      a.status, 200);
  }

  console.log("\nL'INVITÉ : il entre dans l'application, jamais dans la console");
  await poste("/api/comptes",
    { geste: "creer", courriel: "employe@essai.cm", motdepasse: MDP },
    { cookie: `totem_session=${patron}` });
  const employe = (await (await poste("/api/session",
    { courriel: "employe@essai.cm", motdepasse: MDP })).json()).jeton;
  verifier("l'invité a une session", Boolean(employe), true);
  {
    const accueil = await page("/", employe);
    verifier("l'application s'ouvre pour lui", accueil.status, 200);
    const r = await page("/console", employe);
    // Vers l'accueil, PAS vers la connexion : il est déjà entré, et le
    // renvoyer à la porte lui ferait croire que sa session a expiré.
    verifier("la console le renvoie vers l'accueil",
      [r.status, renvoyeVers(r)], [307, "/"]);
    const g = await page("/console/gens", employe);
    verifier("les comptes et le frein aussi",
      [g.status, renvoyeVers(g)], [307, "/"]);
    const v = await poste("/api/console/alertes/vue", { alerte: 1 },
      { cookie: `totem_session=${employe}` });
    verifier("le geste d'alerte lui est refusé", v.status, 403);
  }

  console.log("\nLA CLÉ DE SECOURS : elle administre aussi");
  {
    const secours = (await (await poste("/api/session",
      { motdepasse: SECOURS })).json()).jeton;
    const r = await page("/console", secours);
    verifier("la console s'ouvre avec la clé de secours", r.status, 200);
  }

  console.log("\nLE MOT DE PASSE : la preuve de l'ancien, ou rien");
  {
    const faux = await poste("/api/motdepasse",
      { actuel: "pas-le-bon-mot-de-passe", nouveau: MDP2 },
      { cookie: `totem_session=${employe}` });
    verifier("sans l'ancien mot de passe : refus", faux.status, 401);
    const court = await poste("/api/motdepasse",
      { actuel: MDP, nouveau: "court" },
      { cookie: `totem_session=${employe}` });
    verifier("un nouveau trop court : refus", court.status, 400);
    const bon = await poste("/api/motdepasse",
      { actuel: MDP, nouveau: MDP2 },
      { cookie: `totem_session=${employe}` });
    verifier("avec la preuve : le changement passe", bon.status, 200);
    const vieux = await poste("/api/session",
      { courriel: "employe@essai.cm", motdepasse: MDP });
    verifier("l'ancien mot de passe n'ouvre plus", vieux.status, 401);
    const neuf = await poste("/api/session",
      { courriel: "employe@essai.cm", motdepasse: MDP2 });
    verifier("le nouveau ouvre", neuf.status, 200);
  }

  console.log("");
  if (echecs) {
    console.error(`✗ ${echecs} vérification(s) en défaut.`);
    process.exitCode = 1;
  } else {
    console.log("✓ La console tient : toutes les vérifications passent.");
  }
} finally {
  serveur.kill();
  nuage.kill();
}
process.exit(echecs ? 1 : 0);
