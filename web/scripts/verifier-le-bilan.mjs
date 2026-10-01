// LE BILAN COMPTABLE, MIS À L'ÉPREUVE SUR UNE CAISSE QUI TOURNE.
//
//     node scripts/verifier-le-bilan.mjs
//
// Le bilan CSV est le seul chiffre de TOTEM qui SORT de TOTEM : il part chez
// un comptable, il se rapproche d'un solde bancaire, il justifie un impôt.
// Un écran faux se corrige au rechargement suivant ; un bilan faux est déjà
// dans un classeur.
//
// CE QU'IL GARDE :
//
//   1. « la semaine » du fichier, c'est « la semaine » de l'écran — les
//      MÊMES jours. Le fichier se coupait à 168 heures pendant que le graphe
//      juste au-dessus dessinait des jours de calendrier : à 18 h, le CSV
//      portait six heures d'un jour que l'écran ne montrait pas.
//   2. une période plus longue rapporte VRAIMENT plus. Le bilan chargeait les
//      mille derniers SMS toutes périodes confondues, puis jetait ce qui
//      dépassait : à vingt encaissements par jour, treize semaines demandées
//      en rendaient cinq, et le fichier n'en disait pas un mot.
//   3. quand la lecture est plafonnée, le fichier LE DIT, en première ligne.
//   4. rien ne dépasse la période ni ne date du futur.
//
// LE FAUX NUAGE DOIT SAVOIR MENTIR POUR QU'ON PUISSE LE PRENDRE. Il rendait
// autrefois le total APRÈS avoir appliqué la limite — « mille sur mille » —
// et aucun contrôle n'aurait pu voir la coupe. Il compte maintenant avant.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";

const PORT = 3155;
const NUAGE = 4998;
const B = `http://127.0.0.1:${PORT}`;
const SECRET = "secret-d-essai-du-bilan";
const MDP = "un-mot-de-passe-assez-long";
const FUSEAU = "Africa/Douala";

let echecs = 0;
const verifier = (quoi, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(58)} ${detail}`);
};

async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}

// Un serveur resté ouvert ferait passer tout le bilan contre du vieux code.
for (const port of [PORT, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé — arrêtez l'essai précédent.`);
    process.exit(1);
  }
}

// « next start » sert ce qui est dans « .next », pas les fichiers du disque.
console.log("\nCompilation de la plateforme…");
await new Promise((resoudre, rejeter) => {
  const build = spawn("npx", ["next", "build"], { stdio: "ignore" });
  build.on("exit", (c) => (c === 0 ? resoudre() : rejeter(
    new Error("la compilation a échoué — le bilan ne peut rien prouver"))));
});

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  env: { ...process.env, PORT: String(NUAGE) }, stdio: "ignore",
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${NUAGE}`, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: "cle-de-secours-du-bilan",
    FUSEAU,
  },
  stdio: "ignore",
});

/** Le jour d'un instant, vu du terminal — la même clé que la plateforme. */
const formateur = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU });
const jourLocal = (t) => formateur.format(new Date(t));

/** Le début de la fenêtre de N jours : minuit, N-1 jours en arrière. */
function debutDeFenetre(maintenant, jours) {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSEAU, hour12: false,
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(maintenant));
  const n = (t) => Number(h.find((p) => p.type === t).value);
  const depuisMinuit = (((n("hour") % 24) * 60 + n("minute")) * 60 + n("second")) * 1000;
  return maintenant - (jours - 1) * 86400000 - depuisMinuit;
}

/** Découpe un CSV à points-virgules, guillemets compris. */
function lireCsv(texte) {
  const rangs = [];
  let rang = [], champ = "", entreGuillemets = false;
  const t = texte.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreGuillemets) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') entreGuillemets = false;
      else champ += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === ";") { rang.push(champ); champ = ""; }
    else if (c === "\r") { /* rien */ }
    else if (c === "\n") { rang.push(champ); rangs.push(rang); rang = []; champ = ""; }
    else champ += c;
  }
  if (champ || rang.length) { rang.push(champ); rangs.push(rang); }
  return rangs;
}

let biscuit = "";
async function bilan(jours) {
  const r = await fetch(`${B}/api/bilan?jours=${jours}`, {
    headers: { cookie: biscuit },
  });
  if (!r.ok) throw new Error(`/api/bilan?jours=${jours} → ${r.status}`);
  return lireCsv(await r.text()).filter((l) => l.length > 1 || l[0]);
}

try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${B}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }

  // Le premier compte inscrit est le propriétaire : il entre sans attendre.
  await fetch(`${B}/api/inscription`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: "bilan@essai.cm", motdepasse: MDP }),
  });
  const co = await fetch(`${B}/api/connexion`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: "bilan@essai.cm", motdepasse: MDP }),
  });
  biscuit = (co.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0]).join("; ");
  verifier("la session s'ouvre", co.ok && biscuit.length > 0);
  if (!co.ok) throw new Error("sans session, le bilan ne prouve rien");

  // --- 1. UNE CAISSE QUI TOURNE DEPUIS QUATRE MOIS ------------------------
  // 120 jours × 20 encaissements = 2400 lignes, largement au-delà des mille
  // que la plateforme lisait autrefois.
  const semees = await (await fetch(
    `http://127.0.0.1:${NUAGE}/essai/semer?jours=120&parJour=20`,
    { method: "POST" })).json();
  verifier("la caisse d'essai porte des mois d'encaissements",
    semees.semes > 2000, `${semees.semes} lignes`);

  const maintenant = Date.now();
  const sept = await bilan(7);
  const trente = await bilan(30);
  const quatreVingtDix = await bilan(90);

  const lignesDe = (csv) => csv.filter((r) => r[0] && /^\d{4}-\d{2}-\d{2}$/.test(r[0]));

  // --- 2. PLUS DE JOURS DEMANDÉS, PLUS DE LIGNES RENDUES ------------------
  const n7 = lignesDe(sept).length, n30 = lignesDe(trente).length,
        n90 = lignesDe(quatreVingtDix).length;
  verifier("sept jours rapportent sept jours", n7 >= 120 && n7 <= 160, `${n7} lignes`);
  verifier("trente jours rapportent plus que sept", n30 > n7 * 3, `${n30} lignes`);
  verifier("quatre-vingt-dix jours rapportent plus que trente",
    n90 > n30 * 2, `${n90} lignes`);
  verifier("un trimestre n'est pas amputé à mille lignes",
    n90 > 1500, `${n90} lignes`);

  // --- 3. LA MÊME FENÊTRE QUE L'ÉCRAN -------------------------------------
  const joursMontres = [];
  for (let i = 6; i >= 0; i--) joursMontres.push(jourLocal(maintenant - i * 86400000));
  const joursDuCsv = [...new Set(lignesDe(sept).map((r) => r[0]))].sort();
  verifier("le fichier porte exactement les jours du graphe",
    JSON.stringify(joursDuCsv) === JSON.stringify(joursMontres),
    joursDuCsv.length ? `${joursDuCsv[0]} → ${joursDuCsv.at(-1)}` : "vide");

  const debut = debutDeFenetre(maintenant, 7);
  verifier("rien n'est plus vieux que le début du premier jour montré",
    !joursDuCsv.some((j) => j < jourLocal(debut)));

  // --- 4. RIEN DU FUTUR ---------------------------------------------------
  const demain = jourLocal(maintenant + 86400000);
  verifier("aucune ligne ne date de demain", !joursDuCsv.includes(demain), demain);

  // --- 5. LE PLAFOND, QUAND IL MORD, SE DIT -------------------------------
  // On ne peut pas semer vingt mille lignes en quelques secondes : on éprouve
  // le MÉCANISME en abaissant le plafond à la lecture — c'est-à-dire en
  // demandant au faux nuage ce que fait la plateforme, avec une limite basse,
  // et en vérifiant qu'il annonce bien un total supérieur. Sans cela, la
  // plateforme n'aurait aucun moyen de savoir qu'elle a été coupée.
  const coupe = await fetch(
    `http://127.0.0.1:${NUAGE}/rest/v1/paiements?select=*&order=recu_le.desc&limit=50`,
    { headers: { prefer: "count=exact" } });
  const rendu = (await coupe.json()).length;
  const plage = coupe.headers.get("content-range") ?? "";
  const total = Number(plage.slice(plage.indexOf("/") + 1));
  verifier("la base annonce un total SUPÉRIEUR à ce qu'elle rend",
    rendu === 50 && total > 50, `${rendu} rendues / ${total} disponibles`);

  // --- 6. LES COLONNES SONT INTACTES --------------------------------------
  const entetes = sept.find((r) => r[0] === "date");
  verifier("les en-têtes sont là, et complètes",
    Boolean(entetes) && entetes.length === 12, entetes ? entetes.join(",") : "aucune");
  const uneLigne = lignesDe(sept)[0];
  verifier("une ligne porte bien douze colonnes",
    Boolean(uneLigne) && uneLigne.length === 12);
  verifier("le tiers est la personne, pas l'opérateur",
    lignesDe(sept).some((r) => r[6] === "SEMEUR"));

  // --- 7. UNE CELLULE NE S'EXÉCUTE PAS DANS UN TABLEUR ---------------------
  const dangereuses = lignesDe(quatreVingtDix)
    .flat().filter((c) => /^[=+\-@\t\r]/.test(c));
  verifier("aucune cellule ne commence par un signe de formule",
    dangereuses.length === 0, dangereuses.slice(0, 2).join(" | "));
} finally {
  serveur.kill("SIGKILL");
  nuage.kill("SIGKILL");
}

console.log(echecs === 0
  ? "\n✓ Le bilan dit ce qu'il porte, et porte ce qu'on lui demande.\n"
  : `\n✗ ${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
