// VERIFIER-LA-ROUE — la roue de « tirer pour rafraîchir » ne tourne que
// sous le doigt, et rien ne charge pour toujours.
//
//     node scripts/verifier-la-roue.mjs
//
// POURQUOI CE HARNAIS EXISTE. Le propriétaire, sur ses deux téléphones :
// « un truc de chargement en haut qui a calé ; tout part vers le bas ; il
// faut tout le temps redémarrer l'application ». Une première correction
// avait séparé deux drapeaux, passé TOUS les harnais au vert — et la roue
// restait plantée. Aucun harnais ne POUVAIT la voir : c'est un objet natif,
// et l'export web n'en dessine pas. Un contrôle qui ne peut pas voir le
// défaut ne peut pas dire qu'il est parti.
//
// CE QU'IL FAIT. Il exécute le VRAI `src/donnees.tsx` (transpilé tel quel)
// sous le VRAI React, dans Node, sans aucun port : les écrans y sont des
// coquilles qui passent leurs vraies bornes, le guichet est piloté à la main
// (réponse, échec, ou silence éternel), et chaque valeur que le composant
// natif `RefreshControl` RECEVRAIT est notée, écran par écran. Les délais
// du cahier (vingt secondes, une minute) y sont accélérés cinquante fois.
//
// LE TÉMOIN. Les mêmes scénarios sont joués contre le cahier d'AVANT la
// correction (commit 83bd033, la fusion de la PR #100 sur main — un
// commit qu'aucun rebase ne réécrira), branché comme les écrans d'alors le
// branchaient (`refreshing={chargement}`). S'il passe là où le nouveau
// passe, le harnais ne mesure rien et il s'arrête en le disant.
//
// CE QU'IL NE PEUT PAS DIRE. La DESCENTE du contenu sur iPhone quand la
// roue apparaît sans geste (`setContentOffset` dans le code natif de React
// Native), et le tirage qui reste bloqué, ne s'éprouvent que sur un vrai
// téléphone. Ce harnais garde la CAUSE : qu'aucun chargement ne puisse plus
// allumer la roue. Il garde aussi, statiquement, qu'aucun écran n'écrive son
// propre `RefreshControl`.

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const MOBILE = new URL("..", import.meta.url).pathname;
const ts = require(join(MOBILE, "node_modules/typescript"));

process.env.NODE_ENV = "development";
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

// --- 1. STATIQUE : une seule roue dans toute l'application ---------------
//
// Un écran qui écrit `<RefreshControl refreshing={…}>` lui-même peut la
// rebrancher sur un chargement, et tout recommence. La seule roue permise
// est celle de `useRoue`, dans `src/donnees.tsx`.
function fichiers(dossier) {
  const t = [];
  for (const nom of readdirSync(dossier)) {
    const c = join(dossier, nom);
    if (statSync(c).isDirectory()) t.push(...fichiers(c));
    else if (/\.tsx?$/.test(nom)) t.push(c);
  }
  return t;
}
const ROUE_PERMISE = join(MOBILE, "src/donnees.tsx");
const rouesEnDirect = (contenu) => contenu.split("\n")
  .map((l, i) => ({ l: l.trim(), i: i + 1 }))
  .filter(({ l }) => !l.startsWith("//") && !l.startsWith("*") && /<RefreshControl\b/.test(l));
{
  const temoin = rouesEnDirect(`  refreshControl={<RefreshControl refreshing={chargement} onRefresh={recharger} />}`);
  if (temoin.length !== 1) {
    console.error("✗ Le témoin statique n'est pas vu : la règle ne voit rien.");
    process.exit(1);
  }
}
let echecs = 0;
console.log("\nUne seule roue dans l'application :");
const fautives = [];
for (const f of fichiers(join(MOBILE, "src"))) {
  if (f === ROUE_PERMISE) continue;
  for (const { i } of rouesEnDirect(readFileSync(f, "utf8"))) fautives.push(`${f.slice(MOBILE.length)}:${i}`);
}
if (fautives.length) {
  echecs += fautives.length;
  console.log("  ✗ des écrans dessinent leur propre roue — elle doit venir de `useRoue` :");
  for (const f of fautives) console.log(`      ${f}`);
} else {
  console.log("  ✓ aucun écran ne dessine sa propre roue : elle vient de `useRoue`, sous le doigt.");
}

// --- 2. LE BANC : le vrai cahier, sous le vrai React --------------------
const noop = () => {};
const faux = () => ({
  nodeType: 1, nodeName: "DIV", tagName: "DIV", style: {},
  addEventListener: noop, removeEventListener: noop, appendChild: noop,
  removeChild: noop, insertBefore: noop, setAttribute: noop, childNodes: [],
  ownerDocument: null,
});
const doc = { ...faux(), nodeType: 9, createElement: faux, createTextNode: faux,
  documentElement: faux(), body: faux(), activeElement: null, defaultView: null };
globalThis.document = doc;
globalThis.window = { document: doc, addEventListener: noop, removeEventListener: noop,
  event: undefined, HTMLIFrameElement: function () {}, navigator: { userAgent: "node" } };
doc.defaultView = globalThis.window;

const React = require(join(MOBILE, "node_modules/react"));
const { createRoot } = require(join(MOBILE, "node_modules/react-dom/client"));

// L'HORLOGE ACCÉLÉRÉE — installée APRÈS React, pour ne toucher que le cahier.
const ECHELLE = 50;
const vraiSetTimeout = globalThis.setTimeout;
const vraiSetInterval = globalThis.setInterval;
globalThis.setTimeout = (f, ms = 0, ...a) => vraiSetTimeout(f, ms / ECHELLE, ...a);
globalThis.setInterval = (f, ms = 0, ...a) => vraiSetInterval(f, ms / ECHELLE, ...a);
const pause = (ms) => new Promise((r) => vraiSetTimeout(r, ms));
/** Laisser passer `secondes` du temps du cahier. */
const laisserPasser = (secondes) => pause((secondes * 1000) / ECHELLE + 30);

const AVANT = "83bd033";   // le cahier d'avant la correction, sur main : le témoin

function charger(source, faux) {
  const out = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const m = { exports: {} };
  const req = (n) => {
    if (n in faux) return faux[n];
    throw new Error(`module non simulé : ${n}`);
  };
  new Function("require", "module", "exports", out)(req, m, m.exports);
  return m.exports;
}

const BORNES = {
  accueil: { sms: 30, recus: 60 },
  comptes: { sms: 1000, recus: 0, lignes: 0 },
  sms: { sms: 200 },
};

/** Un monde neuf : un cahier, un guichet piloté, des écrans. */
function monde(source) {
  const appels = [];
  const ecritures = { cahier: 0, apresFermeture: 0 };
  const etat = { connecte: true, ferme: false, devant: "accueil", montes: ["accueil"] };
  const appState = new Set();
  const notifs = new Set();
  const roues = {};          // nom -> { valeurs: [], tirages: 0, onRefresh }
  const ecrans = {};
  class ErreurGuichet extends Error { constructor(m, s) { super(m); this.statut = s; } }
  const NomEcran = React.createContext("?");

  function RefreshControl({ refreshing, onRefresh }) {
    const nom = React.useContext(NomEcran);
    const r = roues[nom] ??= { valeurs: [], onRefresh: null };
    r.onRefresh = onRefresh;
    if (r.valeurs.at(-1) !== Boolean(refreshing)) r.valeurs.push(Boolean(refreshing));
    return null;
  }

  const D = charger(source, {
    react: React,
    "react/jsx-runtime": require(join(MOBILE, "node_modules/react/jsx-runtime")),
    "react-native": {
      AppState: {
        currentState: "active",
        addEventListener: (_e, f) => { appState.add(f); return { remove: () => appState.delete(f) }; },
      },
      View: () => null,
      RefreshControl,
    },
    "expo-notifications": {
      addNotificationReceivedListener: (f) => { notifs.add(f); return { remove: () => notifs.delete(f) }; },
      addNotificationResponseReceivedListener: () => ({ remove: noop }),
    },
    "expo-router": {
      useIsFocused: () => React.useContext(NomEcran) === etat.devant,
      useFocusEffect: (f) => {
        const devant = React.useContext(NomEcran) === etat.devant;
        React.useEffect(() => (devant ? f() : undefined), [devant, f]);
      },
    },
    "@/api/guichet": {
      ErreurGuichet,
      chargerDonnees: (langue, bornes, signal) => new Promise((resolve, reject) => {
        appels.push({ bornes: { ...bornes }, resolve, reject, fini: false });
        signal?.addEventListener?.("abort", () => reject(new Error("abandon")));
      }),
    },
    "@/api/cahier": {
      lire: async () => null,
      ecrire: async () => { ecritures.cahier += 1; if (etat.ferme) ecritures.apresFermeture += 1; },
      fermer: async () => { etat.ferme = true; },
    },
    "@/langue": { useLangue: () => "fr" },
    "@noyau/textes/connexion": { textesConnexion: {
      fr: { reseauEnPanne: "Le réseau ne répond pas." }, en: { reseauEnPanne: "No network." } } },
    "@/session": { useSession: () => ({ connecte: etat.connecte, perdue: noop }) },
    "@/theme/jetons": { couleurs: { encrePale: "#999" } },
  });

  function Ecran({ nom }) {
    const e = D.useDonnees(BORNES[nom]);
    ecrans[nom] = e;
    // Le nouveau cahier fournit SA roue ; l'ancien laissait chaque écran la
    // brancher sur `chargement` — exactement ce que faisaient les écrans.
    const roue = D.useRoue
      ? D.useRoue()
      : React.createElement(RefreshControl, { refreshing: e.chargement, onRefresh: e.recharger });
    return React.createElement(NomEcran.Provider, { value: nom }, roue);
  }
  function Coquille({ nom }) {
    return React.createElement(NomEcran.Provider, { value: nom },
      React.createElement(Ecran, { nom }));
  }
  function App() {
    return React.createElement(D.FournisseurDonnees, null,
      etat.montes.map((n) => React.createElement(Coquille, { key: n, nom: n })));
  }
  const racine = createRoot(doc.createElement("div"));
  const rendre = async () => { racine.render(React.createElement(App)); await pause(15); };

  const donneesPour = (b, version = 1, enAttente = 0) => ({
    relie: true, raccourcis: {},
    sims: [{ iccid: "1", enPlace: true, solde: 1000 * version }],
    paiements: Array.from({ length: Math.min(b.sms, b.lignes ?? b.sms) },
      (_, i) => ({ id: `v${version}-${i}` })),
    terminal: { enLigne: true, enAttente },
  });

  return {
    appels, ecritures, ecrans, roues, etat,
    demarrer: rendre,
    async ouvrir(nom) {
      etat.devant = nom;
      if (!etat.montes.includes(nom)) etat.montes = [...etat.montes, nom];
      await rendre();
    },
    async repondre(i, { ok = true, version = 1, enAttente = 0 } = {}) {
      const a = appels[i];
      a.fini = true;
      ok ? a.resolve(donneesPour(a.bornes, version, enAttente))
        : a.reject(new TypeError("Network request failed"));
      await pause(20);
    },
    async repondreAuxEnSuspens(options) {
      for (let i = 0; i < appels.length; i++) if (!appels[i].fini) await this.repondre(i, options);
    },
    async tirer(nom) { roues[nom]?.onRefresh?.(); await pause(20); },
    async notification() { for (const f of notifs) f({}); await pause(20); },
    async appState(...etats) { for (const e of etats) { for (const f of appState) f(e); await pause(10); } },
    async deconnecter() { etat.connecte = false; await rendre(); },
    roueAllumee: (nom) => Boolean(roues[nom]?.valeurs.at(-1)),
    roueAEteAllumee: (nom) => Boolean(roues[nom]?.valeurs.includes(true)),
    fin: () => racine.unmount(),
  };
}

// --- 3. LES SCÉNARIOS — chacun tiré de l'enquête -------------------------
const SCENARIOS = [
  {
    nom: "Sans le doigt, la roue ne tourne jamais",
    pourquoi: "ouverture, onglet neuf, notification, retour devant : la roue tournait, et sur iPhone le contenu descendait",
    async jouer(m) {
      await m.demarrer(); await m.repondreAuxEnSuspens();
      await m.ouvrir("comptes"); await m.repondreAuxEnSuspens();
      await m.ouvrir("sms"); await m.repondreAuxEnSuspens();
      await m.notification(); await m.repondreAuxEnSuspens();
      await m.appState("background", "active"); await m.repondreAuxEnSuspens();
      await laisserPasser(6); await m.repondreAuxEnSuspens();
      const allumees = ["accueil", "comptes", "sms"].filter((n) => m.roueAEteAllumee(n));
      return allumees.length ? `roue allumée sans geste sur : ${allumees.join(", ")}` : null;
    },
  },
  {
    nom: "Un appel qui ne finit jamais ne retient pas la roue",
    pourquoi: "le fetch d'Expo rend la main aux en-têtes ; une coupure pendant le corps laissait la roue pour toujours",
    async jouer(m) {
      await m.demarrer(); await m.repondreAuxEnSuspens();
      await m.tirer("accueil");                 // cet appel-là ne répondra JAMAIS
      if (!m.roueAllumee("accueil")) return "le tirage n'allume même pas la roue";
      await laisserPasser(25);
      return m.roueAllumee("accueil") ? "la roue tourne encore 25 s après, pour toujours" : null;
    },
  },
  {
    nom: "Un onglet raté une fois se dit, et se réessaie seul",
    pourquoi: "Comptes restait en formes grises et en roue pour toujours, sans un mot",
    async jouer(m) {
      await m.demarrer(); await m.repondreAuxEnSuspens();
      await m.ouvrir("comptes");
      const n = m.appels.length;
      await m.repondre(n - 1, { ok: false });
      if (!m.ecrans.comptes.erreur) return "après l'échec, Comptes ne dit rien (formes grises sans fin)";
      await laisserPasser(4);
      if (m.appels.length === n) return "personne ne réessaie : il faut redémarrer";
      await m.repondreAuxEnSuspens();
      return m.ecrans.comptes.donnees ? null : "le nouvel essai a réussi, et Comptes n'a toujours rien";
    },
  },
  {
    nom: "Une vieille réponse n'écrase pas une plus récente",
    pourquoi: "un encaissement apparaissait puis disparaissait une seconde plus tard",
    async jouer(m) {
      await m.demarrer(); await m.repondreAuxEnSuspens();
      await m.notification(); await m.notification();
      const n = m.appels.length;
      if (n < 3) return "deux notifications n'ont pas donné deux relectures";
      await m.repondre(n - 1, { version: 3 });   // la plus récente arrive d'abord
      await m.repondre(n - 2, { version: 2 });   // la plus ancienne ensuite
      const id = m.ecrans.accueil.donnees?.paiements[0]?.id ?? "";
      return id.startsWith("v3") ? null : `l'écran montre la réponse la plus ancienne (${id})`;
    },
  },
  {
    nom: "Une session fermée n'hérite de rien",
    pourquoi: "le vendeur qui se connectait après le propriétaire voyait toutes ses cartes",
    async jouer(m) {
      await m.demarrer(); await m.repondreAuxEnSuspens();
      await m.notification();                    // part sous le propriétaire…
      await m.deconnecter();                     // …qui se déconnecte
      await m.repondreAuxEnSuspens({ version: 7 });
      if (m.ecrans.accueil?.donnees) return "après la déconnexion, l'écran montre les chiffres de la session d'avant";
      return m.ecritures.apresFermeture ? "le cahier a été réécrit après sa fermeture" : null;
    },
  },
  {
    nom: "La notification relit une seconde fois si rien n'a bougé",
    pourquoi: "la notification arrive avant que le SMS soit en base : la liste ne le montrait pas",
    async jouer(m) {
      await m.demarrer(); await m.repondreAuxEnSuspens();
      await m.notification();
      const n = m.appels.length;
      await m.repondre(n - 1, { version: 1 });  // rien de neuf encore
      await laisserPasser(6);
      return m.appels.length > n ? null : "une seule relecture, trop tôt : le SMS n'y est pas";
    },
  },
  {
    nom: "Le centre de notifications ne recharge pas",
    pourquoi: "tirer le centre de notifications d'un iPhone recoupait la liste sous le doigt",
    async jouer(m) {
      await m.demarrer(); await m.repondreAuxEnSuspens();
      const n = m.appels.length;
      await m.appState("inactive", "active");
      if (m.appels.length !== n) return "un passage par « inactive » a rechargé";
      await m.appState("background", "active");
      return m.appels.length > n ? null : "un vrai retour depuis l'arrière-plan n'a rien rechargé";
    },
  },
  {
    nom: "Un message de panne ne s'efface qu'au succès",
    pourquoi: "le message « le réseau ne répond pas » disparaissait tout seul, et il ne restait qu'une roue",
    async jouer(m) {
      await m.demarrer();
      await m.repondre(0, { ok: false });
      if (!m.ecrans.accueil.erreur) return "le premier échec ne se dit pas";
      await m.appState("background", "active");  // un nouvel essai part…
      if (!m.ecrans.accueil.erreur) return "l'erreur s'efface dès qu'un nouvel essai PART";
      await m.repondreAuxEnSuspens();
      return m.ecrans.accueil.erreur ? "l'erreur reste après le succès" : null;
    },
  },
  {
    nom: "Des SMS en route : deux relectures, pas un pouls",
    pourquoi: "chaque relecture qui retrouvait « en attente » en reprogrammait deux autres — une toutes les vingt secondes",
    async jouer(m) {
      await m.demarrer();
      await m.repondre(0, { enAttente: 3 });
      // Le terminal dit « 3 en attente » à chaque réponse, trois minutes durant.
      for (let k = 0; k < 12; k++) {
        await laisserPasser(15);
        await m.repondreAuxEnSuspens({ enAttente: 3 });
      }
      const n = m.appels.length;
      return n <= 3 ? null : `${n} relectures en trois minutes pour un même « 3 en attente »`;
    },
  },
];

async function jouerTout(source) {
  const resultats = [];
  for (const s of SCENARIOS) {
    const m = monde(source);
    let faute;
    try { faute = await s.jouer(m); } catch (e) { faute = `le scénario a planté : ${e.message}`; }
    try { m.fin(); } catch { /* déjà démonté */ }
    resultats.push({ s, faute });
    await pause(20);
  }
  return resultats;
}

console.log("\nLe cahier d'aujourd'hui, sous le vrai React :");
const neuf = await jouerTout(readFileSync(join(MOBILE, "src/donnees.tsx"), "utf8"));
for (const { s, faute } of neuf) {
  console.log(`  ${faute ? "✗" : "✓"} ${s.nom}${faute ? `\n      ${faute}\n      (${s.pourquoi})` : ""}`);
  if (faute) echecs += 1;
}

console.log(`\nLe témoin — le cahier d'avant la correction (${AVANT}) :`);
let ancien;
try {
  ancien = execFileSync("git", ["show", `${AVANT}:mobile/src/donnees.tsx`],
    { cwd: MOBILE, encoding: "utf8" });
} catch {
  console.error("  ✗ le cahier d'avant est introuvable dans l'historique : pas de témoin, pas de mesure.");
  process.exit(1);
}
const vieux = await jouerTout(ancien);
const prisEnDefaut = vieux.filter((r) => r.faute);
for (const { s, faute } of vieux) console.log(`  ${faute ? "✓ échoue" : "· passe "}  ${s.nom}`);
// Les trois défauts que le propriétaire VOYAIT doivent être pris sur l'ancien
// cahier — sinon le harnais ne voit pas ce qu'il prétend garder.
const essentiels = SCENARIOS.slice(0, 3);
const manques = essentiels.filter((s) => !vieux.find((r) => r.s === s).faute);
if (manques.length) {
  console.error("\n✗ Le témoin passe là où il devait échouer :");
  for (const s of manques) console.error(`    ${s.nom}`);
  console.error("  Le harnais ne mesure rien. On s'arrête ici.");
  process.exit(1);
}

console.log("");
if (echecs) {
  console.log(`✗ ${echecs} défaut(s) : la roue ou l'attente peuvent encore mentir.`);
  process.exit(1);
}
console.log(`✓ La roue ne tourne que sous le doigt, et rien ne charge pour toujours`
  + ` (le cahier d'avant échoue ${prisEnDefaut.length} fois sur ${SCENARIOS.length}).`);
process.exit(0);
