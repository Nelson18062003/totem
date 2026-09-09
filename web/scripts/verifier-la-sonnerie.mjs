// LA SONNERIE : ce que l'écran a le droit d'annoncer.
//
//     cd web && node scripts/verifier-la-sonnerie.mjs
//
// ─────────────────────────────────────────────────────────────────────────
// CE QUE CE HARNAIS GARDE, ET LA PANNE QUI L'A FAIT ÉCRIRE
//
// Sur un iPhone où AUCUNE notification n'est jamais arrivée, l'écran des
// réglages répondait « Envoyé. Votre téléphone devrait sonner dans quelques
// secondes ». Il n'y avait pas une panne à réparer, il y avait un écran qui
// disait que tout allait bien — et tant qu'il le disait, on cherchait
// ailleurs.
//
// La cause tient en une phrase : LE BILLET N'EST PAS L'ACCUSÉ. Le guichet
// d'Expo répond immédiatement « accepté » (le billet) ; ce qui se passe
// ensuite — Apple qui refuse parce que le projet n'a pas de clé, le
// téléphone désinstallé — ne s'écrit que dans l'ACCUSÉ DE RÉCEPTION, qu'il
// faut aller chercher. La plateforme ne lisait que le billet, et comptait
// donc « servi » un appareil que rien n'avait servi.
//
// ─────────────────────────────────────────────────────────────────────────
// IL PORTE SON PROPRE TÉMOIN, et il s'arrête si le témoin passe.
//
// Le témoin, c'est L'ANCIENNE FAÇON DE COMPTER, réécrite ici en quinze
// lignes : elle ne lit que le billet. Les mêmes exigences lui sont posées,
// et elles DOIVENT échouer sur lui. Si elles passent, ce ne sont pas les
// exigences qui sont satisfaites — c'est qu'elles ne mesurent rien, et le
// harnais le dit au lieu de sortir en vert.
//
// Il ne parle à AUCUN serveur : `pousser` passe par `fetch`, on met un faux
// guichet à sa place. Ce qu'on éprouve est la LECTURE des réponses d'Expo,
// pas le réseau — et un harnais qui aurait besoin d'Internet pour dire si
// la lecture est juste ne serait lançable nulle part.

import { pousser } from "../lib/pousser.ts";

const GUICHET = "https://exp.host/--/api/v2/push/send";
const ACCUSES = "https://exp.host/--/api/v2/push/getReceipts";

const JETON = "ExponentPushToken[abc]";

/** Un faux guichet d'Expo : des billets d'abord, des accusés ensuite. */
function fauxGuichet({ billets, accuses = {}, statutEnvoi = 200 }) {
  const vus = { envois: 0, accuses: 0 };
  const faux = async (url, options) => {
    if (url === GUICHET) {
      vus.envois += 1;
      if (statutEnvoi >= 300) {
        return new Response("non", { status: statutEnvoi });
      }
      return Response.json({ data: billets });
    }
    if (url === ACCUSES) {
      vus.accuses += 1;
      const demandes = JSON.parse(options.body).ids;
      const rendus = {};
      for (const id of demandes) if (accuses[id]) rendus[id] = accuses[id];
      return Response.json({ data: rendus });
    }
    throw new Error(`guichet inattendu : ${url}`);
  };
  return { faux, vus };
}

/** L'ANCIENNE FAÇON DE COMPTER — le témoin. Elle ne lit que le billet. */
async function pousserALAncienne(jetons) {
  const r = await fetch(GUICHET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(jetons.map((to) => ({ to }))),
  });
  if (!r.ok) return jetons.map((jeton) => ({ jeton, etat: "refuse" }));
  const billets = (await r.json()).data ?? [];
  return jetons.map((jeton, i) => {
    const b = billets[i];
    if (b?.status === "ok") return { jeton, etat: "ok" };
    if (b?.details?.error === "DeviceNotRegistered") return { jeton, etat: "inconnu" };
    return { jeton, etat: "invalide" };
  });
}

// ── Les cas, écrits une seule fois : ils servent au vrai code ET au témoin ──

const CAS = [
  {
    nom: "la clé du projet manque : le téléphone n'a PAS sonné",
    guichet: {
      billets: [{ status: "ok", id: "b1" }],
      accuses: { b1: { status: "error", details: { error: "InvalidCredentials" } } },
    },
    exiger: (v) => v.etat === "invalide" && v.cause === "sansCle",
    quoi: "« invalide », cause « sansCle »",
  },
  {
    nom: "l'accusé n'est pas revenu : on ne promet rien",
    guichet: { billets: [{ status: "ok", id: "b1" }], accuses: {} },
    exiger: (v) => v.etat === "attente",
    quoi: "« attente »",
  },
  {
    nom: "l'application a été désinstallée : le jeton s'oublie",
    guichet: {
      billets: [{ status: "ok", id: "b1" }],
      accuses: { b1: { status: "error", details: { error: "DeviceNotRegistered" } } },
    },
    exiger: (v) => v.etat === "inconnu",
    quoi: "« inconnu »",
  },
];

/** Les cas qui n'ont pas de témoin : l'ancienne façon les traitait déjà
 *  correctement. On les garde quand même — une correction qui casse ce qui
 *  marchait n'est pas une correction. */
const CAS_SANS_TEMOIN = [
  {
    nom: "l'accusé confirme : le téléphone a sonné",
    guichet: {
      billets: [{ status: "ok", id: "b1" }],
      accuses: { b1: { status: "ok" } },
    },
    exiger: (v) => v.etat === "ok",
    quoi: "« ok »",
  },
  {
    nom: "le guichet refuse la requête entière",
    guichet: { billets: [], statutEnvoi: 500 },
    exiger: (v) => v.etat === "refuse" && v.cause === "guichet",
    quoi: "« refuse », cause « guichet »",
  },
  {
    nom: "un billet déjà en erreur ne réclame aucun accusé",
    guichet: {
      billets: [{ status: "error", details: { error: "MismatchSenderId" } }],
      accuses: {},
    },
    exiger: (v, vus) => v.etat === "invalide" && v.cause === "mauvaisProjet"
      && vus.accuses === 0,
    quoi: "« invalide », cause « mauvaisProjet », aucun accusé demandé",
  },
];

async function jouer(cas, pousserLe) {
  const { faux, vus } = fauxGuichet(cas.guichet);
  const vrai = globalThis.fetch;
  globalThis.fetch = faux;
  try {
    const [verdict] = await pousserLe([JETON], "T", "C");
    return { verdict: verdict ?? { etat: "(rien)" }, vus };
  } finally {
    globalThis.fetch = vrai;
  }
}

let fautes = 0;

console.log("\nLE TÉMOIN — l'ancienne façon de compter doit ÉCHOUER ici :");
let temoinPasse = 0;
for (const cas of CAS) {
  const { verdict, vus } = await jouer(cas, pousserALAncienne);
  const passe = cas.exiger(verdict, vus);
  if (passe) temoinPasse += 1;
  console.log(`  ${passe ? "⚠️ " : "✓ "} ${cas.nom} → l'ancienne dit `
    + `« ${verdict.etat} »${passe ? " (elle PASSE : l'exigence ne mesure rien)" : ""}`);
}
if (temoinPasse) {
  console.error(
    `\n✗ ARRÊT : ${temoinPasse} exigence(s) sur ${CAS.length} passent avec `
    + `l'ancienne façon de compter, celle qui a laissé un iPhone muet.\n`
    + `  Une sonde qui dit oui à tout est indiscernable d'une application qui marche.`);
  process.exit(1);
}

// On ne joue chaque cas QU'UNE FOIS : l'un d'eux attend les accusés
// jusqu'au bout, et le rejouer pour la seconde liste tripleraît l'attente
// sans rien mesurer de plus.
const joues = [];
for (const cas of [...CAS, ...CAS_SANS_TEMOIN]) {
  joues.push({ cas, ...(await jouer(cas, pousser)) });
}

console.log("\nLA SONNERIE :");
for (const { cas, verdict, vus } of joues) {
  const ok = cas.exiger(verdict, vus);
  if (!ok) fautes += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${cas.nom}`
    + (ok ? "" : ` — attendu ${cas.quoi}, obtenu « ${verdict.etat} »`
        + (verdict.cause ? ` / cause « ${verdict.cause} »` : "")));
}

// Ce que l'écran a le droit d'écrire. La règle tient en une ligne, et c'est
// celle qui manquait : SEUL un accusé confirmé autorise « votre téléphone a
// sonné ».
console.log("\nCE QUE L'ÉCRAN ANNONCE :");
for (const { cas, verdict } of joues) {
  const promet = verdict.etat === "ok";
  const droit = cas.quoi.includes("« ok »");
  const ok = promet === droit;
  if (!ok) fautes += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${cas.nom} → `
    + (promet ? "« remis »" : "pas de promesse"));
}

console.log(fautes ? `\n✗ ${fautes} faute(s).` : "\n✓ La sonnerie ne promet que ce qu'elle a vu.");
process.exit(fautes ? 1 : 0);
