// L'ADRESSAGE — UNE DEMANDE VA AU TERMINAL QUI PORTE LA CARTE.
//
//     node scripts/verifier-l-adressage.mjs
//
// Une demande USSD partait au terminal « le dernier à avoir donné signe de
// vie ». Avec un seul boîtier, c'était le bon. Dès deux boîtiers, un
// transfert sur une carte du boîtier de Douala partait à celui d'Akwa — qui
// n'a pas cette carte — et la demande échouait, ou attendait cinq minutes
// qu'on la déclare abandonnée.
//
// Le harnais monte une FLOTTE dans le faux nuage (FAUX_FLOTTE=1) :
//
//   · douala-faux porte MTN ·8901 et Orange ·4432 ;
//   · akwa-faux porte MTN ·9999, et c'est LUI qui a parlé le dernier ;
//   · Orange ·7777 a été retirée il y a une heure et demie.
//
// Il exige que chaque demande parte au boîtier de SA carte, qu'une carte que
// personne ne porte soit refusée sur-le-champ, et que la personne qui
// demande soit nommée PAR LA PLATEFORME — jamais par l'écran : c'est d'après
// elle que la carte décide à qui est son menu (voir totem/compte.py).
//
// LE TÉMOIN : une demande SANS carte part, elle, au dernier terminal vivant —
// akwa-faux. C'est là que serait partie, avant, la demande de la MTN ·8901.
// S'il partait ailleurs, la flotte ne serait pas montée, et le reste ne
// prouverait rien.
//
// Comme ses frères, il sert le code COMPILÉ : lancez « npx next build »
// avant, sans quoi il mesurerait l'application d'hier.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";

const SECRET = "secret-d-essai-pour-l-adressage";
const SECOURS = "cle-de-secours-d-essai-adressage";
const PORT = 3181;
const NUAGE = 4989;
const B = `http://127.0.0.1:${PORT}`;
const N = `http://127.0.0.1:${NUAGE}`;
const MTN_DOUALA = "89237010000000008901";
const MTN_AKWA = "89237010000000009999";
const RETIREE = "89237020000000007777";

let echecs = 0;
function verifier(quoi, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(62)} ${JSON.stringify(obtenu)}`);
}

// UN SERVEUR DÉJÀ LÀ EST UN PIÈGE : les vérifications porteraient sur SON
// code. On refuse de commencer.
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
    console.error("  encore : ces vérifications porteraient sur SON code. Arrêtez-le.");
    process.exit(1);
  }
}

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  env: { ...process.env, PORT: String(NUAGE), FAUX_FLOTTE: "1" }, stdio: "ignore",
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: N, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: SECOURS,
  },
  stdio: "ignore",
  // Son PROPRE groupe de processus : tuer « npx » seul laisse le vrai
  // serveur vivant, port occupé. On tue le groupe entier.
  detached: true,
});

let adresse = 1;
const poste = (chemin, corps, jeton) =>
  fetch(B + chemin, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.77.0.${adresse++ & 255}`,
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify(corps),
  });

/** Dépose une demande, et rend ce que le NUAGE en a reçu : son terminal et
 *  ses paramètres — pas ce que la plateforme en dit. */
async function deposer(corps, jeton) {
  const r = await poste("/api/commande", corps, jeton);
  const rendu = await r.json().catch(() => ({}));
  if (!r.ok || !rendu.id) return { statut: r.status, terminal: null, parametres: null };
  const lignes = await (await fetch(`${N}/rest/v1/commandes?id=eq.${rendu.id}`)).json();
  return { statut: r.status, terminal: lignes[0]?.terminal ?? null,
           parametres: lignes[0]?.parametres ?? null };
}

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${N}/rest/v1/utilisateurs`)).ok) break; } catch { /* */ }
    await attendre(300);
  }
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + "/api/plateforme")).ok) break; } catch { /* */ }
    await attendre(500);
  }

  const patron = (await (await poste("/api/inscription",
    { courriel: "patron@flotte.cm", motdepasse: "le-mot-de-passe-du-patron" })).json()).jeton;
  verifier("le propriétaire entre", Boolean(patron), true);

  console.log("\nLE TÉMOIN : sans carte, la demande part au dernier terminal vivant");
  {
    const d = await deposer({ type: "solde", parametres: {} }, patron);
    verifier("« actualiser » part à akwa-faux, le dernier à avoir parlé", d.terminal, "akwa-faux");
  }

  console.log("\nCHAQUE DEMANDE PART AU BOÎTIER DE SA CARTE");
  {
    const d = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } }, patron);
    verifier("un code sur MTN ·8901 part à douala-faux", d.terminal, "douala-faux");
    const r = await deposer({ type: "ussd_reponse",
      parametres: { texte: "1", carte: MTN_DOUALA } }, patron);
    verifier("la réponse suit la même carte, au même boîtier", r.terminal, "douala-faux");
    const f = await deposer({ type: "ussd_fin", parametres: { carte: MTN_DOUALA } }, patron);
    verifier("le raccrochage aussi", f.terminal, "douala-faux");
    const a = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_AKWA } }, patron);
    verifier("un code sur MTN ·9999 part à akwa-faux", a.terminal, "akwa-faux");
    const i = await deposer({ type: "identite",
      parametres: { iccid: MTN_AKWA, nom: "BOUTIQUE AKWA" } }, patron);
    verifier("le nom d'une carte part au boîtier qui la porte", i.terminal, "akwa-faux");
  }

  console.log("\nUNE CARTE QUE PERSONNE NE PORTE EST REFUSÉE SUR-LE-CHAMP");
  {
    const d = await deposer({ type: "ussd", parametres: { code: "#150#", carte: RETIREE } }, patron);
    verifier("une carte retirée il y a 90 min : refusée (409)", d.statut, 409);
    verifier("et aucune demande n'a été déposée", d.terminal, null);
    const inconnue = await deposer({ type: "ussd",
      parametres: { code: "#150#", carte: "89237099999999999999" } }, patron);
    verifier("une carte jamais vue : refusée (409)", inconnue.statut, 409);
    const r = await poste("/api/commande",
      { type: "ussd", parametres: { code: "#150#", carte: RETIREE } }, patron);
    const texte = (await r.json()).erreur ?? "";
    verifier("le refus le dit en clair", /aucun terminal|not in any terminal/.test(texte), true);
  }

  console.log("\nLA PERSONNE QUI DEMANDE EST NOMMÉE PAR LA PLATEFORME, PAS PAR L'ÉCRAN");
  {
    const d = await deposer({ type: "ussd",
      parametres: { code: "*126#", carte: MTN_DOUALA, par: "c:999" } }, patron);
    const par = d.parametres?.par ?? null;
    verifier("la demande porte la personne", typeof par === "string" && par.startsWith("c:"), true);
    verifier("et pas celle que l'écran prétendait être", par === "c:999", false);
    const s = await poste("/api/session", { motdepasse: SECOURS });
    const secours = (await s.json()).jeton;
    const ds = await deposer({ type: "ussd",
      parametres: { code: "*126#", carte: MTN_DOUALA } }, secours);
    verifier("la clé de secours est une autre personne que le patron",
      Boolean(ds.parametres?.par) && ds.parametres.par !== par, true);
  }

  console.log("\nL'APPLICATION D'HIER : UNE RÉPONSE SANS CARTE VA À LA SESSION DE SA PERSONNE");
  // L'application 1.0.0 ne nomme pas la carte dans ses réponses. La
  // plateforme la retrouvait dans « la dernière ouverture du terminal » —
  // juste tant que le robot ne tenait qu'un menu à la fois. Ici, un vendeur
  // ouvre sur SA carte de Douala, puis le patron ouvre sur une carte d'Akwa :
  // la dernière ouverture n'est plus celle du vendeur.
  {
    await poste("/api/comptes", { geste: "creer", prenom: "Awa", nom: "Ngono",
      courriel: "vendeuse@flotte.cm", motdepasse: "le-mot-de-passe-d-awa" }, patron);
    const liste = (await (await fetch(B + "/api/comptes",
      { headers: { authorization: `Bearer ${patron}` } })).json()).comptes ?? [];
    const idAwa = liste.find((c) => c.courriel === "vendeuse@flotte.cm")?.id;
    await poste("/api/comptes", { geste: "attribuer", id: idAwa, iccid: MTN_DOUALA }, patron);
    const awa = (await (await poste("/api/session",
      { courriel: "vendeuse@flotte.cm", motdepasse: "le-mot-de-passe-d-awa" })).json()).jeton;
    verifier("la vendeuse entre", Boolean(awa), true);

    const o = await deposer({ type: "ussd",
      parametres: { code: "*126#", carte: MTN_DOUALA } }, awa);
    verifier("elle ouvre un menu sur SA carte, à Douala", o.terminal, "douala-faux");
    const p2 = await deposer({ type: "ussd",
      parametres: { code: "*126#", carte: MTN_AKWA } }, patron);
    verifier("puis le patron ouvre sur une carte d'Akwa", p2.terminal, "akwa-faux");

    const r = await deposer({ type: "ussd_reponse", parametres: { texte: "1" } }, awa);
    verifier("sa réponse sans carte est acceptée", r.statut, 200);
    verifier("et part à SA carte", r.parametres?.carte ?? null, MTN_DOUALA);
    verifier("sur SON boîtier", r.terminal, "douala-faux");
    const rp = await deposer({ type: "ussd_reponse", parametres: { texte: "2" } }, patron);
    verifier("celle du patron part à la sienne, à Akwa",
      [rp.parametres?.carte ?? null, rp.terminal], [MTN_AKWA, "akwa-faux"]);
  }
} finally {
  try { process.kill(-serveur.pid, "SIGTERM"); } catch { /* déjà parti */ }
  nuage.kill();
}

console.log(echecs
  ? `\n✗ ${echecs} vérification(s) en échec — une demande peut partir au mauvais boîtier.`
  : "\n✓ Chaque demande va au boîtier qui porte sa carte.");
process.exit(echecs ? 1 : 0);
