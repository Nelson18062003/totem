// VERIFIER-LE-GUICHET — une demande au réseau finit TOUJOURS, et ce
// qu'elle rapporte est vrai.
//
//     node scripts/verifier-le-guichet.mjs
//
// POURQUOI CE HARNAIS EXISTE. Le propriétaire, sur ses deux téléphones :
// une roue plantée en haut des quatre onglets, sur des chiffres pourtant à
// jour, « il faut redémarrer l'application ». Une enquête a trouvé la cause
// au fond du guichet : le `fetch` du téléphone (celui d'Expo 57) rend la
// main dès les EN-TÊTES, et le délai de quinze secondes s'arrêtait là. Ce
// qui venait ensuite n'était gardé par personne :
//
//   — sur iPhone, une coupure après les en-têtes laisse la lecture du corps
//     en suspens POUR TOUJOURS — même une annulation ne la réveille pas ;
//   — sur Android, une coupure rend le MORCEAU reçu comme s'il était
//     complet, et le `{}` de secours en faisait une boutique vide :
//     « Aucune carte », recopié dans le cahier du téléphone ;
//   — et ce qui finissait par échouer montait jusqu'à l'écran tel quel :
//     « fetch failed: Fetch request has been canceled », en anglais.
//
// Aucun harnais ne pouvait le voir : tous parlent à l'export WEB, et le
// fetch d'un navigateur ne se comporte pas ainsi.
//
// CE QU'IL FAIT. Il transpile le VRAI `src/api/guichet.ts` (et le vrai
// `src/api/cahier.ts`, et la vraie inscription de `src/sonnerie.tsx`), le
// branche sur le VRAI dictionnaire du noyau, et le met devant de faux
// `fetch` qui suivent à la lettre la machine à états native d'Expo 57 :
// `text()` n'attend QUE l'état « corps complet » (ExpoFetchModule.swift,
// ExpoFetchModule.kt) ; une coupure ou une annulation pose « erreur reçue »
// sur iPhone — et rien ne réveille plus `text()` —, « erreur reçue » puis
// « corps complet » sur Android — et `text()` rend le morceau.
//
// LE TEMPS EST SIMULÉ. Une horloge à la main remplace `setTimeout` dans
// les modules essayés : trente secondes d'échéance passent en une
// milliseconde, et « en suspens pour toujours » se constate exactement —
// plus aucune minuterie ne peut réveiller la promesse.
//
// IL EXIGE, pour chaque panne : que la demande rende la main AVANT
// l'échéance, qu'elle ne rende jamais `{}` ni une caisse sans ses listes,
// que son message soit une phrase du dictionnaire dans la langue de
// l'écran, et que la connexion soit libérée. Et pour la réponse saine :
// qu'elle soit rendue telle quelle.
//
// LE TÉMOIN. Les mêmes épreuves sont jouées contre le guichet, le cahier et
// la sonnerie d'AVANT la correction. Trois exigences :
//   — chaque épreuve marquée DÉFAUT doit y ÉCHOUER — sinon elle ne mesure
//     rien, et le harnais s'arrête en le disant ;
//   — chaque épreuve marquée SOCLE (la réponse saine, le mot de passe
//     refusé…) doit y RÉUSSIR — sinon c'est le faux réseau qui ment, pas
//     l'ancien code ;
//   — aucune épreuve ne doit y PLANTER. Une épreuve qui plante n'a rien
//     mesuré : compter son plantage comme « le défaut vu » ferait passer
//     un témoin introuvable, ou un module oublié, pour une preuve.
//
// Le témoin est un commit de MAIN (la fusion de la PR #100), et ce n'est
// pas un détail. Le premier visait le dernier commit de la branche de
// travail : le rebase que les consignes imposent avant une PR le réécrit,
// un clone neuf ne l'a plus — et le harnais affichait alors vingt « ✗
// (attendu) » qui n'étaient que vingt « commande git échouée ». Un commit de
// main ne se réécrit pas. Le harnais vérifie qu'il est là AVANT de jouer.
//
// CE QU'IL NE PEUT PAS DIRE. Le comportement réel des piles réseau d'iOS
// et d'Android. La machine à états est RECOPIÉE du code natif d'Expo
// (node_modules/expo/ios/Fetch, android/…/fetch) : si Expo change, ce
// harnais doit être relu avec lui.

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const MOBILE = new URL("..", import.meta.url).pathname;
const NOYAU = join(MOBILE, "../web/noyau");
const ts = require(join(MOBILE, "node_modules/typescript"));

// Le guichet d'avant la correction : le témoin. Un commit de MAIN (voir
// l'en-tête), qu'aucun rebase ne réécrit.
const AVANT = "83bd033";
const FICHIERS_DU_TEMOIN = ["src/api/guichet.ts", "src/api/cahier.ts", "src/sonnerie.tsx"];

// Les échéances promises par le guichet, vues de dehors : les en-têtes en
// quinze secondes, tout l'échange en trente. Le harnais les vérifie à la
// milliseconde près — le temps est simulé.
const ECHEANCE_EN_TETES = 15_000;
const ECHEANCE_TOTALE = 30_000;
// La patience qu'on accorde à une demande avant de la déclarer en suspens.
const PATIENCE = 180_000;

// --- L'HORLOGE À LA MAIN ----------------------------------------------------

function horloge() {
  let maintenant = 0;
  let prochain = 1;
  const minuteries = new Map();
  const h = {
    get maintenant() { return maintenant; },
    setTimeout(f, ms = 0, ...a) {
      const id = prochain++;
      minuteries.set(id, { quand: maintenant + Math.max(0, Number(ms) || 0), f, a });
      return id;
    },
    clearTimeout(id) { minuteries.delete(id); },
    /** Fait avancer le temps, minuterie après minuterie, jusqu'à ce que
     *  `fini()` soit vrai. Rend `"fini"`, `"jamais"` (plus aucune minuterie :
     *  RIEN ne peut plus la réveiller) ou `"patience"` (horizon atteint). */
    async jusqua(fini, horizon = PATIENCE) {
      for (;;) {
        // Les promesses enchaînées se résolvent toutes avant le tour suivant.
        await new Promise((r) => setImmediate(r));
        if (fini()) return "fini";
        let suivante = null;
        for (const [id, m] of minuteries) {
          if (!suivante || m.quand < suivante.m.quand) suivante = { id, m };
        }
        if (!suivante) return "jamais";
        if (suivante.m.quand > horizon) { maintenant = horizon; return "patience"; }
        minuteries.delete(suivante.id);
        maintenant = suivante.m.quand;
        suivante.m.f(...suivante.m.a);
      }
    },
  };
  // `Date.now()` suit la même horloge : la sonnerie mesure l'âge d'une
  // tentative avec.
  const ORIGINE = Date.UTC(2026, 9, 4, 8, 0, 0);
  h.Date = class extends Date {
    static now() { return ORIGINE + maintenant; }
  };
  return h;
}

// --- LE CHARGEUR DE MODULES -------------------------------------------------

function transpiler(source, nom) {
  return ts.transpileModule(source, {
    fileName: nom,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
}

const transpilesDuNoyau = new Map();
/** Un fichier du noyau, le VRAI — le dictionnaire en premier. */
function noyau(chemin) {
  if (!transpilesDuNoyau.has(chemin)) {
    const fichier = chemin.endsWith(".ts") ? chemin : `${chemin}.ts`;
    const m = { exports: {} };
    const code = transpiler(readFileSync(fichier, "utf8"), fichier);
    const req = (n) => {
      if (n.startsWith(".")) return noyau(join(dirname(fichier), n));
      if (n.startsWith("@noyau/")) return noyau(join(NOYAU, n.slice(7)));
      throw new Error(`module non simulé dans le noyau : ${n}`);
    };
    new Function("require", "module", "exports", code)(req, m, m.exports);
    transpilesDuNoyau.set(chemin, m.exports);
  }
  return transpilesDuNoyau.get(chemin);
}

/** Un module de l'application, exécuté dans un monde donné : son horloge,
 *  son réseau, ses voisins. Chaque épreuve a le sien — l'état gardé dans
 *  un module (la tentative en cours de la sonnerie) ne passe pas de l'une
 *  à l'autre. */
function executer(code, monde, voisins) {
  const m = { exports: {} };
  const req = (n) => {
    if (n in voisins) return voisins[n];
    if (n.startsWith("@noyau/")) return noyau(join(NOYAU, n.slice(7)));
    throw new Error(`module non simulé : ${n}`);
  };
  new Function(
    "require", "module", "exports", "process", "fetch", "setTimeout",
    "clearTimeout", "Date", "localStorage", code,
  )(
    req, m, m.exports, { env: {} }, monde.fetch,
    monde.h.setTimeout, monde.h.clearTimeout, monde.h.Date, monde.rangement,
  );
  return m.exports;
}

// --- LE DICTIONNAIRE --------------------------------------------------------

const { textesConnexion } = noyau(join(NOYAU, "textes/connexion"));
const phrases = (langue) =>
  new Set(Object.values(textesConnexion[langue]).filter((v) => typeof v === "string"));
const DU_DICTIONNAIRE = { fr: phrases("fr"), en: phrases("en") };

// --- LE FETCH D'EXPO 57, RÉDUIT À SA MACHINE À ÉTATS -------------------------
//
// Un serveur se décrit par ce qu'il fait, et quand (millisecondes simulées) :
//   enTetes   les en-têtes arrivent — `fetch` rend la main
//   morceaux  [[quand, texte], …] — le corps, par morceaux
//   complet   le corps est entier
//   coupure   le réseau tombe (avant ou après les en-têtes)
//   rejet     `fetch` rejette, comme une pile réseau qui renonce
//   pendant   [[quand, geste], …] — ce qui se passe AILLEURS pendant ce temps

//
// Un serveur peut aussi être une FONCTION de l'adresse demandée : il répond
// alors selon ce que la demande dit (sa langue, par exemple).

function fetchExpo(monde, plateforme, serveurOuRegle) {
  const { h } = monde;
  return (url, init = {}) => {
    const serveur = typeof serveurOuRegle === "function" ? serveurOuRegle(url, init) : serveurOuRegle;
    const appel = { url, init, annule: false };
    monde.appels.push(appel);
    const n = { etat: "started", morceaux: [], ecouteurs: [] };
    const poser = (e) => {
      n.etat = e;
      n.ecouteurs = n.ecouteurs.filter((f) => !f(e));
    };
    const attendre = (etats, cb) => {
      if (etats.includes(n.etat)) return cb(n.etat);
      n.ecouteurs.push((e) => (etats.includes(e) ? (cb(e), true) : false));
    };
    const minuteries = [];
    const plus = (ms, f) => minuteries.push(h.setTimeout(f, ms));
    const erreurPendantLeCorps = () => {
      if (n.etat === "bodyCompleted") return;
      // iPhone : NativeResponse.swift — l'état « erreur reçue », point.
      // Android : NativeResponse.kt — l'erreur, puis la pompe force
      // « corps complet » : `text()` rend ce qui est arrivé.
      poser("errorReceived");
      if (plateforme === "android" && n.vuEnTetes) poser("bodyCompleted");
    };
    init.signal?.addEventListener("abort", () => {
      appel.annule = true;
      minuteries.forEach((id) => h.clearTimeout(id));
      erreurPendantLeCorps();
    });

    for (const [quand, geste] of serveur.pendant ?? []) plus(quand, geste);
    if (serveur.enTetes != null) {
      plus(serveur.enTetes, () => { n.vuEnTetes = true; poser("responseReceived"); });
    }
    for (const [quand, texte] of serveur.morceaux ?? []) plus(quand, () => n.morceaux.push(texte));
    if (serveur.complet != null) plus(serveur.complet, () => poser("bodyCompleted"));
    if (serveur.coupure != null) plus(serveur.coupure, erreurPendantLeCorps);

    const statut = serveur.statut ?? 200;
    const reponse = {
      status: statut,
      ok: statut >= 200 && statut < 300,
      headers: { get: () => null },
      // Le `text()` natif : il n'attend QUE « corps complet ».
      text: () => new Promise((res) =>
        attendre(["bodyCompleted"], () => res(n.morceaux.join("")))),
      json() { return this.text().then(JSON.parse); },
    };
    return new Promise((res, rej) => {
      if (serveur.rejet != null) {
        plus(serveur.rejet[0], () => rej(serveur.rejet[1]));
        return;
      }
      attendre(["responseReceived", "errorReceived"], (e) =>
        e === "responseReceived"
          ? res(reponse)
          : rej(new TypeError("fetch failed: Fetch request has been canceled")));
    });
  };
}

// Les réponses de la plateforme, telles qu'elle les écrit.
const CAISSE = {
  relie: true, terminal: null, raccourcis: {},
  sims: [{ iccid: "8923701", operateur: "MTN", solde: 154000, enPlace: true, signal: 18 }],
  paiements: [{ id: 41, montant: 25000, sens: "entree", recuLe: "2026-10-04T07:58:00Z" }],
  serveurA: "2026-10-04T08:00:00Z",
};
const CORPS = JSON.stringify(CAISSE);
const DEBUT = CORPS.slice(0, 40);
const PORTAIL =
  "<!doctype html><html><head><title>Connexion au Wi-Fi</title></head>" +
  "<body>Identifiez-vous pour accéder à Internet</body></html>";

const SERVEURS = {
  sain: { enTetes: 300, morceaux: [[450, CORPS]], complet: 600 },
  iosCoupure: { enTetes: 300, morceaux: [[800, DEBUT]], coupure: 2000 },
  silence: { enTetes: 300, morceaux: [[800, DEBUT]] },
  rienDuTout: {},
  reseauCoupe: { rejet: [900, new TypeError("Network request failed")] },
  pageWeb: { enTetes: 300, morceaux: [[450, PORTAIL]], complet: 600 },
  erreur500: { statut: 500, enTetes: 300, morceaux: [[450, "Internal Server Error"]], complet: 600 },
  formeFausse: { enTetes: 300, morceaux: [[450, "{}"]], complet: 600 },
};

// --- LES MONDES -------------------------------------------------------------

function coffre(initial) {
  const m = new Map(Object.entries(initial));
  const ecrits = [];
  const effaces = [];
  return {
    m, ecrits, effaces,
    module: {
      lire: async (k) => (m.has(k) ? m.get(k) : null),
      ecrire: async (k, v) => { ecrits.push([k, v]); m.set(k, v); },
      effacer: async (k) => { effaces.push(k); m.delete(k); },
    },
  };
}

const JETON = "jeton-du-proprietaire";

/** Un monde neuf : une horloge, un coffre, un réseau. */
function monde({ plateforme = "ios", serveur = SERVEURS.sain, coffreInitial } = {}) {
  const w = { h: horloge(), appels: [] };
  w.coffre = coffre(coffreInitial ?? { "totem.jeton": JETON, "totem.langue": "fr" });
  w.fetch = fetchExpo(w, plateforme, serveur);
  const donnees = new Map();
  w.rangement = {
    getItem: (k) => (donnees.has(k) ? donnees.get(k) : null),
    setItem: (k, v) => donnees.set(k, String(v)),
    removeItem: (k) => donnees.delete(k),
  };
  return w;
}

const SOURCES = {};
function sources(quand) {
  if (SOURCES[quand]) return SOURCES[quand];
  const lire = (chemin) => quand === "nouveau"
    ? readFileSync(join(MOBILE, chemin), "utf8")
    : execFileSync("git", ["show", `${AVANT}:mobile/${chemin}`], { cwd: MOBILE, encoding: "utf8" });
  SOURCES[quand] = {
    guichet: transpiler(lire("src/api/guichet.ts"), "guichet.ts"),
    cahier: transpiler(lire("src/api/cahier.ts"), "cahier.ts"),
    sonnerie: transpiler(lire("src/sonnerie.tsx"), "sonnerie.tsx"),
  };
  return SOURCES[quand];
}

function guichet(quand, w) {
  return executer(sources(quand).guichet, w, {
    "./coffre": w.coffre.module,
    // Le témoin rangeait encore une adresse choisie à la main : aucune ici.
    "./reglage": { lire: async () => null, ecrire: async () => {} },
    "expo-constants": { __esModule: true, default: { expoConfig: { extra: { adressePlateforme: "https://totem.essai" } } } },
  });
}

function cahier(quand, w) {
  const g = guichet(quand, w);
  return executer(sources(quand).cahier, w, {
    "react-native": { Platform: { OS: "web" } },
    "./guichet": g,
  });
}

/** La sonnerie, avec un téléphone et un guichet pilotés à la main. */
function sonnerie(quand, w, { jeton, envoi, annonceA }) {
  const g = guichet(quand, w);
  const ecoutes = new Set();
  const notifications = {
    appelsJeton: 0,
    setNotificationHandler() {},
    setNotificationChannelAsync: async () => {},
    AndroidImportance: { HIGH: 4 },
    AndroidNotificationVisibility: { PUBLIC: 1 },
    getPermissionsAsync: async () => ({ status: "granted", canAskAgain: true }),
    requestPermissionsAsync: async () => ({ status: "granted" }),
    // Comme le module natif (PushTokenModule.swift `didRegister`,
    // PushTokenModule.kt `onNewToken`) : OBTENIR le jeton de l'appareil
    // émet aussi « onDevicePushToken » à ceux qui écoutent — AVANT que le
    // jeton d'Expo ne revienne, puisqu'il faut encore le demander aux
    // serveurs d'Expo (`annonceA` millisecondes après l'appel).
    getExpoPushTokenAsync() {
      notifications.appelsJeton += 1;
      if (annonceA != null) {
        w.h.setTimeout(() => ecoutes.forEach((f) => f({ data: "natif" })), annonceA);
      }
      return jeton(notifications.appelsJeton);
    },
    addPushTokenListener: (f) => { ecoutes.add(f); return { remove: () => ecoutes.delete(f) }; },
  };
  const s = executer(sources(quand).sonnerie, w, {
    // Un effet se pose aussitôt : `useSonnerie` y branche ses écoutes.
    react: { useEffect(f) { f(); } },
    "react-native": { Platform: { OS: "android" }, AppState: { addEventListener: () => ({ remove() {} }) } },
    "expo-notifications": notifications,
    "expo-device": { isDevice: true, modelName: "Téléphone d'essai" },
    "expo-constants": { __esModule: true, default: { expoConfig: { extra: { eas: { projectId: "projet-essai" } } } } },
    "@/api/guichet": { ...g, enregistrerAppareil: envoi },
    "@/theme/jetons": { couleurs: { laterite: "#b5502f" } },
  });
  s.notifications = notifications;
  return s;
}

// --- L'ISSUE D'UNE PROMESSE, SOUS L'HORLOGE ----------------------------------

async function issue(w, promesse, horizon = PATIENCE) {
  const r = { etat: "suspens" };
  promesse.then(
    (v) => { r.etat = "rendue"; r.valeur = v; r.a = w.h.maintenant; },
    (e) => { r.etat = "rejetee"; r.erreur = e; r.a = w.h.maintenant; },
  );
  const fin = await w.h.jusqua(() => r.etat !== "suspens", horizon);
  if (r.etat === "suspens") {
    r.pourquoi = fin === "jamais"
      ? "en suspens POUR TOUJOURS — plus rien ne peut la réveiller"
      : `toujours en suspens après ${horizon / 1000} s`;
  }
  return r;
}

const s = (ms) => `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0)} s`;

/** Ce qu'une issue est, en clair, pour le message d'échec. */
function decrire(r) {
  if (r.etat === "suspens") return r.pourquoi;
  if (r.etat === "rendue") {
    const v = r.valeur;
    if (v && typeof v === "object" && Object.keys(v).length === 0) {
      return `a rendu {} à ${s(r.a)} — une boutique vide, prise pour une réponse`;
    }
    return `a rendu ${JSON.stringify(v)?.slice(0, 70)} à ${s(r.a)}`;
  }
  return `a rejeté à ${s(r.a)} : « ${r.erreur?.message} »`;
}

/** Un rejet en bonne et due forme : avant l'échéance, avec une phrase du
 *  dictionnaire dans la langue attendue. Rend `null` si tout va bien, ou ce
 *  qui ne va pas. */
function rejetPropre(r, { avant, langue = "fr", phrase }) {
  if (r.etat !== "rejetee") return decrire(r);
  if (r.a > avant) return `a rendu la main trop tard : ${s(r.a)} (échéance ${s(avant)})`;
  const m = r.erreur?.message ?? "";
  if (!DU_DICTIONNAIRE[langue].has(m)) {
    return `message hors du dictionnaire (${langue}) : « ${m} »`;
  }
  if (phrase && m !== textesConnexion[langue][phrase]) {
    return `message « ${m} » au lieu de « ${textesConnexion[langue][phrase]} »`;
  }
  return null;
}

// --- LES ÉPREUVES -----------------------------------------------------------
//
// Chacune rend `null` (tenue) ou la raison de son échec. `genre` : DÉFAUT
// (doit échouer sur le témoin) ou SOCLE (doit y réussir).

const EPREUVES = [
  // Le cahier du téléphone va au guichet par `chargerDonnees`.
  ["DÉFAUT", "iPhone : en-têtes, puis coupure — la lecture du corps ne finit jamais", async (q) => {
    const w = monde({ plateforme: "ios", serveur: SERVEURS.iosCoupure });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, phrase: "reseauEnPanne" })
      ?? (w.appels[0]?.annule ? null : "la connexion n'a pas été libérée (aucune annulation)");
  }],
  ["DÉFAUT", "en-têtes, puis plus rien (la connexion reste ouverte)", async (q) => {
    const w = monde({ plateforme: "android", serveur: SERVEURS.silence });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, phrase: "reseauEnPanne" })
      ?? (w.appels[0]?.annule ? null : "la connexion n'a pas été libérée (aucune annulation)");
  }],
  ["DÉFAUT", "Android : coupure, et le morceau reçu rendu comme s'il était entier", async (q) => {
    const w = monde({ plateforme: "android", serveur: SERVEURS.iosCoupure });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, phrase: "reponseIncomplete" });
  }],
  ["DÉFAUT", "200 avec une page web (le wifi d'un hôtel) au lieu de la plateforme", async (q) => {
    const w = monde({ serveur: SERVEURS.pageWeb });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, phrase: "reseauIntercepte" });
  }],
  ["DÉFAUT", "500 sans JSON — « Internal Server Error »", async (q) => {
    const w = monde({ serveur: SERVEURS.erreur500 });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, phrase: "plateformeEnPanne" })
      ?? (r.erreur.statut === 500 ? null : `statut ${r.erreur.statut} au lieu de 500`);
  }],
  ["DÉFAUT", "200 avec « {} » : une réponse sans ses listes n'est pas une caisse", async (q) => {
    const w = monde({ serveur: SERVEURS.formeFausse });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    return rejetPropre(r, { avant: ECHEANCE_TOTALE });
  }],
  ["DÉFAUT", "le réseau renonce : « Network request failed » ne monte pas à l'écran", async (q) => {
    const w = monde({ serveur: SERVEURS.reseauCoupe });
    const r = await issue(w, guichet(q, w).chargerDonnees("en", { sms: 30 }));
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, langue: "en", phrase: "reseauEnPanne" });
  }],
  ["SOCLE", "rien du tout, pas même les en-têtes : quinze secondes, pas une de plus", async (q) => {
    const w = monde({ serveur: SERVEURS.rienDuTout });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    // L'ancien guichet tenait CELLE-LÀ : son délai couvrait les en-têtes.
    // Mais son message était celui du système — on ne l'exige donc qu'ici.
    if (r.etat !== "rejetee") return decrire(r);
    if (r.a > ECHEANCE_EN_TETES) return `a rendu la main trop tard : ${s(r.a)}`;
    return q === "nouveau" ? rejetPropre(r, { avant: ECHEANCE_EN_TETES, phrase: "reseauEnPanne" }) : null;
  }],
  ["SOCLE", "la réponse saine est rendue telle quelle", async (q) => {
    const w = monde({ serveur: SERVEURS.sain });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    if (r.etat !== "rendue") return decrire(r);
    return JSON.stringify(r.valeur) === CORPS ? null : `a rendu autre chose : ${decrire(r)}`;
  }],
  ["DÉFAUT", "l'écran renonce (déconnexion) : la demande rend la main tout de suite", async (q) => {
    const w = monde({ serveur: SERVEURS.silence });
    const renoncer = new AbortController();
    w.h.setTimeout(() => renoncer.abort(), 1000);
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }, renoncer.signal));
    return rejetPropre(r, { avant: 1000, phrase: "demandeAbandonnee" });
  }],
  ["DÉFAUT", "une demande sans langue parle celle que l'écran a rangée dans le coffre", async (q) => {
    const w = monde({ serveur: SERVEURS.reseauCoupe });
    const r = await issue(w, guichet(q, w).deposerCommande("solde", {}, null, "cle-1"));
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, langue: "fr", phrase: "reseauEnPanne" });
  }],
  ["DÉFAUT", "la raison donnée par la plateforme arrive dans la langue de l'écran", async (q) => {
    // La plateforme écrit ses refus dans la langue que l'ADRESSE lui dit,
    // l'anglais sinon — comme `langueDemandee`. Le coffre dit « fr ».
    const w = monde({
      serveur: (url) => ({
        statut: 400, enTetes: 300, complet: 600,
        morceaux: [[450, JSON.stringify({
          erreur: new URL(url).searchParams.get("langue") === "fr"
            ? "Le propriétaire voit déjà toutes les cartes."
            : "The owner already sees every card.",
        })]],
      }),
    });
    const r = await issue(w, guichet(q, w).agirSurCompte({ id: 1, iccid: "8923701", geste: "attribuer" }));
    if (r.etat !== "rejetee") return decrire(r);
    return r.erreur.message === "Le propriétaire voit déjà toutes les cartes."
      ? null
      : `écran français, raison « ${r.erreur.message} » — la demande est partie vers ${w.appels[0]?.url}`;
  }],
  ["DÉFAUT", "chaque demande dit sa langue à la plateforme, une fois et une seule", async (q) => {
    const demandes = [
      ["chargerDonnees", (g) => g.chargerDonnees("fr", { sms: 30 })],
      ["essaiNotification", (g) => g.essaiNotification("fr")],
      ["deposerCommande", (g) => g.deposerCommande("solde", {}, null, "cle-1")],
      ["lireCommande", (g) => g.lireCommande(7)],
      ["definirNature", (g) => g.definirNature(41, "vente")],
      ["marquerLu", (g) => g.marquerLu(41)],
      ["enregistrerAppareil", (g) => g.enregistrerAppareil("ExponentPushToken[essai]", "ios", "x")],
      ["lienRecu", (g) => g.lienRecu("R-1")],
      ["listerComptes", (g) => g.listerComptes()],
      ["agirSurCompte", (g) => g.agirSurCompte({ id: 1, geste: "approuver" })],
      ["lienCoordonnees", (g) => g.lienCoordonnees("8923701")],
      ["lienBilan", (g) => g.lienBilan(7)],
      ["agirSurBeneficiaire", (g) => g.agirSurBeneficiaire({ geste: "supprimer", id: 3 })],
      // Née après le témoin : elle n'y existe pas, on ne l'y cherche pas.
      ["annulerCommande", (g) => g.annulerCommande(7), { recente: true }],
    ];
    const fautes = [];
    for (const [nom, f, { recente } = {}] of demandes) {
      const w = monde({ serveur: { enTetes: 300, morceaux: [[450, '{"ok":true}']], complet: 600 } });
      const g = guichet(q, w);
      if (typeof g[nom] !== "function") {
        if (q === "nouveau" || !recente) fautes.push(`${nom} n'existe pas`);
        continue;
      }
      await issue(w, f(g));
      const url = w.appels[0]?.url;
      const langues = url ? new URL(url).searchParams.getAll("langue") : [];
      if (langues.length !== 1 || langues[0] !== "fr") fautes.push(`${nom} → ${url ?? "rien n'est parti"}`);
    }
    return fautes.length
      ? `${fautes.length} demande(s) sur ${demandes.length} sans la langue de l'écran : ${fautes.join(" ; ")}`
      : null;
  }],

  // La connexion.
  ["DÉFAUT", "connexion : un corps coupé ne range JAMAIS un jeton absent", async (q) => {
    const w = monde({
      plateforme: "android", coffreInitial: {},
      serveur: { enTetes: 300, morceaux: [[800, '{"jeton":"abc.17']], coupure: 2000 },
    });
    const r = await issue(w, guichet(q, w).ouvrirSession("", "secret", "fr"));
    const range = w.coffre.ecrits.find(([k, v]) => k === "totem.jeton" && (typeof v !== "string" || !v));
    if (range) return `le coffre a reçu le jeton ${JSON.stringify(range[1])} — une session « ouverte » sans clé`;
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, phrase: "reponseIncomplete" });
  }],
  ["DÉFAUT", "connexion : iPhone, en-têtes puis silence — plus de « Vérification… » sans fin", async (q) => {
    const w = monde({ plateforme: "ios", serveur: SERVEURS.iosCoupure, coffreInitial: {} });
    const r = await issue(w, guichet(q, w).ouvrirSession("a@b.cm", "secret", "en"));
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, langue: "en", phrase: "reseauEnPanne" });
  }],
  ["SOCLE", "connexion : la réponse saine range le jeton", async (q) => {
    const w = monde({
      coffreInitial: {},
      serveur: { enTetes: 300, morceaux: [[450, '{"jeton":"abc.1791000000000","expire":1791000000000}']], complet: 600 },
    });
    const r = await issue(w, guichet(q, w).ouvrirSession("a@b.cm", "secret", "fr"));
    if (r.etat !== "rendue") return decrire(r);
    return w.coffre.m.get("totem.jeton") === "abc.1791000000000" ? null : "le jeton n'est pas dans le coffre";
  }],
  ["SOCLE", "connexion : la raison donnée par la plateforme passe telle quelle", async (q) => {
    const w = monde({
      coffreInitial: {},
      serveur: { statut: 401, enTetes: 300, morceaux: [[450, '{"erreur":"Mot de passe incorrect."}']], complet: 600 },
    });
    const r = await issue(w, guichet(q, w).ouvrirSession("a@b.cm", "faux", "fr"));
    if (r.etat !== "rejetee") return decrire(r);
    return r.erreur.message === "Mot de passe incorrect." && r.erreur.statut === 401
      ? null : decrire(r);
  }],

  // « Y a-t-il un TOTEM au bout de l'adresse ? »
  ["DÉFAUT", "plateforme : iPhone, en-têtes puis coupure — « injoignable », à temps", async (q) => {
    const w = monde({ plateforme: "ios", serveur: SERVEURS.iosCoupure });
    const r = await issue(w, guichet(q, w).verifierPlateforme());
    if (r.etat !== "rendue") return decrire(r);
    if (r.a > ECHEANCE_TOTALE) return `a répondu trop tard : ${s(r.a)}`;
    return r.valeur === "injoignable" ? null : `« ${r.valeur} » au lieu de « injoignable »`;
  }],
  ["DÉFAUT", "plateforme : Android, corps coupé — une coupure n'est pas « pas un TOTEM »", async (q) => {
    const w = monde({ plateforme: "android", serveur: SERVEURS.iosCoupure });
    const r = await issue(w, guichet(q, w).verifierPlateforme());
    if (r.etat !== "rendue") return decrire(r);
    return r.valeur === "injoignable" ? null : `« ${r.valeur} » au lieu de « injoignable » — la porte se fermait sur une coupure`;
  }],
  ["DÉFAUT", "plateforme : 502, 504, 429, 408 de l'hébergeur — une panne passagère, pas « pas un TOTEM »", async (q) => {
    // « Absente » ferme les champs et dit au propriétaire de « contacter la
    // personne qui gère votre TOTEM » : c'est lui.
    const fautes = [];
    for (const [statut, corps] of [
      [502, "Bad Gateway"],
      [504, "An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT"],
      [429, "Too Many Requests"],
      [408, "Request Timeout"],
    ]) {
      const w = monde({ serveur: { statut, enTetes: 300, morceaux: [[450, corps]], complet: 600 } });
      const r = await issue(w, guichet(q, w).verifierPlateforme());
      if (r.etat !== "rendue" || r.valeur !== "injoignable") {
        fautes.push(`${statut} → ${r.etat === "rendue" ? `« ${r.valeur} »` : decrire(r)}`);
      }
    }
    return fautes.length ? `${fautes.join(" ; ")} au lieu de « injoignable »` : null;
  }],
  ["SOCLE", "plateforme : un 404 n'est pas un TOTEM", async (q) => {
    const w = monde({ serveur: { statut: 404, enTetes: 300, morceaux: [[450, "Not Found"]], complet: 600 } });
    const r = await issue(w, guichet(q, w).verifierPlateforme());
    return r.etat === "rendue" && r.valeur === "absente" ? null : decrire(r);
  }],
  ["SOCLE", "plateforme : une page web pleine n'est pas un TOTEM — le mot de passe n'y part pas", async (q) => {
    const w = monde({ serveur: SERVEURS.pageWeb });
    const r = await issue(w, guichet(q, w).verifierPlateforme());
    return r.etat === "rendue" && r.valeur === "absente" ? null : decrire(r);
  }],
  ["SOCLE", "plateforme : la réponse saine trouve le TOTEM", async (q) => {
    const w = monde({ serveur: { enTetes: 300, morceaux: [[450, '{"totem":true,"configuree":true}']], complet: 600 } });
    const r = await issue(w, guichet(q, w).verifierPlateforme());
    return r.etat === "rendue" && r.valeur === "trouvee" ? null : decrire(r);
  }],

  // La session.
  ["DÉFAUT", "401 de la session en cours : le coffre se ferme, la phrase le dit", async (q) => {
    const w = monde({ serveur: { statut: 401, enTetes: 300, morceaux: [[450, '{"erreur":"x"}']], complet: 600 } });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    if (w.coffre.m.has("totem.jeton")) return "le coffre garde un jeton refusé";
    return rejetPropre(r, { avant: ECHEANCE_TOTALE, phrase: "sessionExpiree" })
      ?? (r.erreur.statut === 401 ? null : `statut ${r.erreur.statut} au lieu de 401`);
  }],
  ["DÉFAUT", "401 d'une session PASSÉE : la personne connectée depuis reste connectée", async (q) => {
    // La demande part avec le jeton du propriétaire ; pendant qu'elle
    // voyage, il se déconnecte et passe le téléphone à son vendeur.
    const w = monde({
      serveur: {
        statut: 401, enTetes: 300, morceaux: [[450, '{"erreur":"x"}']], complet: 600,
        pendant: [[200, () => w.coffre.m.set("totem.jeton", "jeton-du-vendeur")]],
      },
    });
    const r = await issue(w, guichet(q, w).chargerDonnees("fr", { sms: 30 }));
    if (w.coffre.m.get("totem.jeton") !== "jeton-du-vendeur") {
      return "le vendeur a été déconnecté par le refus de la session d'avant";
    }
    if (r.etat !== "rejetee") return decrire(r);
    return r.erreur.statut === 401 ? "rejet en 401 : l'écran fermerait la session du vendeur" : null;
  }],

  // Le cahier du téléphone.
  ["DÉFAUT", "cahier : une page sans ses listes ne s'écrit pas et ne se relit pas", async (q) => {
    const w = monde();
    const c = cahier(q, w);
    const bornes = { sms: 30, recus: 60, lignes: 30 };
    await c.ecrire({ quand: 1, bornes, donnees: CAISSE });
    await c.ecrire({ quand: 2, bornes, donnees: {} });
    const p = await c.lire();
    if (p && Array.isArray(p.donnees?.sims)) return null;
    return p ? `relit la page abîmée : ${JSON.stringify(p.donnees)}` : "a perdu la bonne page";
  }],
  ["DÉFAUT", "cahier : une page abîmée déjà rangée n'est pas montrée", async (q) => {
    const w = monde();
    w.rangement.setItem("cahier-totem", JSON.stringify({ quand: 1, bornes: { sms: 30, recus: 60, lignes: 30 }, donnees: {} }));
    const p = await cahier(q, w).lire();
    return p === null ? null : `relit ${JSON.stringify(p.donnees)} comme une caisse`;
  }],
  ["SOCLE", "cahier : une bonne page se relit", async (q) => {
    const w = monde();
    const c = cahier(q, w);
    await c.ecrire({ quand: 1, bornes: { sms: 30, recus: 60, lignes: 30 }, donnees: CAISSE });
    const p = await c.lire();
    return p && JSON.stringify(p.donnees) === CORPS ? null : `relit ${JSON.stringify(p)}`;
  }],

  // L'inscription aux notifications.
  ["DÉFAUT", "sonnerie : le service de notification ne rend jamais le jeton", async (q) => {
    const w = monde();
    const son = sonnerie(q, w, { jeton: () => new Promise(() => {}), envoi: async () => ({ ok: true }) });
    const r = await issue(w, son.inscrireLAppareil());
    if (r.etat !== "rendue") return decrire(r);
    if (r.valeur !== "sansJeton") return `« ${r.valeur} » au lieu de « sansJeton »`;
    const souci = son.souciDeLaSonnerie();
    return DU_DICTIONNAIRE.fr.has(souci) ? null : `souci hors du dictionnaire : « ${souci} »`;
  }],
  ["DÉFAUT", "sonnerie : hors ligne, le service de jeton ne montre pas « fetch failed » aux Réglages", async (q) => {
    // Ce que rejettent vraiment les modules, sans réseau : expo-notifications
    // (build/getExpoPushTokenAsync.js) sur iPhone, le service de Google
    // (PushTokenModule.kt) sur Android.
    const pannes = [
      Object.assign(new Error(
        "Error encountered while fetching Expo token: TypeError: fetch failed: " +
        "The Internet connection appears to be offline.."), { code: "ERR_NOTIFICATIONS_NETWORK_ERROR" }),
      Object.assign(new Error(
        "Fetching the token failed: java.io.IOException: SERVICE_NOT_AVAILABLE"), { code: "E_REGISTRATION_FAILED" }),
    ];
    const fautes = [];
    for (const panne of pannes) {
      const w = monde();
      const son = sonnerie(q, w, { jeton: () => Promise.reject(panne), envoi: async () => ({ ok: true }) });
      const r = await issue(w, son.inscrireLAppareil());
      const souci = son.souciDeLaSonnerie();
      if (r.etat !== "rendue" || r.valeur !== "sansJeton") fautes.push(`« ${panne.code} » → ${decrire(r)}`);
      else if (!DU_DICTIONNAIRE.fr.has(souci)) fautes.push(`les Réglages montreraient « ${souci} »`);
    }
    return fautes.length ? fautes.join(" ; ") : null;
  }],
  ["SOCLE", "sonnerie : « Default FirebaseApp is not initialized » garde ses mots — ils nomment la panne", async (q) => {
    const message = "Default FirebaseApp is not initialized in this process cm.totem. " +
      "Make sure to call FirebaseApp.initializeApp(Context) first.";
    const w = monde();
    const son = sonnerie(q, w, { jeton: () => Promise.reject(new Error(message)), envoi: async () => ({ ok: true }) });
    const r = await issue(w, son.inscrireLAppareil());
    if (r.etat !== "rendue" || r.valeur !== "sansJeton") return decrire(r);
    const souci = son.souciDeLaSonnerie();
    return souci === message ? null : `souci « ${souci} » au lieu des mots du système`;
  }],
  ["DÉFAUT", "sonnerie : l'envoi à la plateforme ne revient jamais", async (q) => {
    const w = monde();
    const son = sonnerie(q, w, { jeton: async () => ({ data: "ExponentPushToken[essai]" }), envoi: () => new Promise(() => {}) });
    const r = await issue(w, son.inscrireLAppareil());
    if (r.etat !== "rendue") return decrire(r);
    return r.valeur === "echec" ? null : `« ${r.valeur} » au lieu de « echec »`;
  }],
  ["DÉFAUT", "sonnerie : « Réessayer » ne rejoint pas l'attente entre deux essais", async (q) => {
    // Trois essais ratés (2 s, 5 s, puis 15 s d'attente) ; la personne
    // appuie sur « Réessayer » pendant la dernière attente, et cette fois
    // le service de notification répond.
    const w = monde();
    const son = sonnerie(q, w, {
      jeton: (n) => (n <= 3
        ? Promise.reject(new Error("SERVICE_NOT_AVAILABLE"))
        : Promise.resolve({ data: "ExponentPushToken[essai]" })),
      envoi: async () => ({ ok: true }),
    });
    const premiere = son.inscrireAvecPatience(true);
    await w.h.jusqua(() => false, 10_000);
    const t0 = w.h.maintenant;
    const r = await issue(w, son.inscrireAvecPatience(true), t0 + 120_000);
    if (r.etat !== "rendue") return `« Réessayer » ${decrire(r)}`;
    if (r.valeur !== "inscrit") return `« Réessayer » rend « ${r.valeur} »`;
    if (r.a - t0 > 1000) return `« Réessayer » a attendu ${s(r.a - t0)} la fin d'une attente`;
    const p = await issue(w, premiere, w.h.maintenant + 1);
    return p.etat === "rendue" && p.valeur === "inscrit"
      ? null : `ceux qui attendaient la première attendent encore : ${decrire(p)}`;
  }],
  ["DÉFAUT", "sonnerie : « Réessayer » pendant un essai MUET, le réseau revenu — réponse tout de suite", async (q) => {
    // Une connexion à demi ouverte : le service de jeton se tait, chaque
    // essai tombe à son échéance (essais à 0, 32, 67 et 112 s). Le réseau
    // revient à 114 s ; on appuie à 115 s, pendant l'essai parti à 112 s —
    // quand le réseau manquait encore. Mesuré sur l'ancienne règle, qui
    // rejoignait cet essai : 87 s de bouton occupé.
    const RETOUR = 114_000;
    const w = monde();
    const son = sonnerie(q, w, {
      jeton: () => (w.h.maintenant < RETOUR
        ? new Promise(() => {})
        : Promise.resolve({ data: "ExponentPushToken[essai]" })),
      envoi: async () => ({ ok: true }),
    });
    son.useSonnerie(true);                                  // l'ouverture de session
    await w.h.jusqua(() => false, 1_000);
    const reglages = son.inscrireAvecPatience();            // les Réglages, ouverts
    await w.h.jusqua(() => false, 115_000);
    const t0 = w.h.maintenant;
    const r = await issue(w, son.inscrireAvecPatience(true), t0 + 300_000);
    if (r.etat !== "rendue") return `« Réessayer » ${decrire(r)}`;
    if (r.valeur !== "inscrit") return `« Réessayer » rend « ${r.valeur} »`;
    if (r.a - t0 > 1000) return `« Réessayer » a attendu ${s(r.a - t0)} un essai parti sans réseau`;
    const p = await issue(w, reglages, w.h.maintenant + 1);
    if (p.etat !== "rendue" || p.valeur !== "inscrit") {
      return `les Réglages attendent encore l'essai muet : ${decrire(p)}`;
    }
    // L'essai muet tombe à 142 s, dans son coin : il ne doit pas écrire
    // son échec par-dessus la réussite.
    await w.h.jusqua(() => false, 300_000);
    const souci = son.souciDeLaSonnerie();
    return souci === null ? null : `l'essai remplacé a écrit son échec après coup : « ${souci} »`;
  }],
  ["SOCLE", "sonnerie : obtenir le jeton réveille l'écoute du jeton — sans boucler", async (q) => {
    // `useSonnerie` force une inscription quand le jeton change, et le
    // module natif annonce le jeton à CHAQUE obtention : une inscription
    // forcée qui remplacerait celle en cours se relancerait sans fin.
    const w = monde();
    const son = sonnerie(q, w, {
      annonceA: 100,
      jeton: () => new Promise((r) => w.h.setTimeout(() => r({ data: "ExponentPushToken[essai]" }), 500)),
      envoi: async () => ({ ok: true }),
    });
    son.useSonnerie(true);
    await w.h.jusqua(() => false, 120_000);
    const n = son.notifications.appelsJeton;
    return n <= 2 ? null : `${n} demandes de jeton en deux minutes : l'inscription se relance elle-même`;
  }],
];

// --- LE DÉROULEMENT ---------------------------------------------------------

async function jouer(quand) {
  const resultats = [];
  for (const [genre, nom, epreuve] of EPREUVES) {
    let raison;
    let plantee = false;
    try {
      raison = await epreuve(quand);
    } catch (e) {
      plantee = true;
      raison = `l'épreuve a planté : ${String(e?.message ?? e).split("\n")[0]}`;
    }
    resultats.push({ genre, nom, raison, plantee });
  }
  return resultats;
}

// LE TÉMOIN DOIT EXISTER AVANT QU'ON LE JOUE. Introuvable, chaque épreuve
// planterait — et un plantage ressemble beaucoup à « le défaut est vu ».
const introuvables = FICHIERS_DU_TEMOIN.filter((f) => {
  try {
    execFileSync("git", ["cat-file", "-e", `${AVANT}:mobile/${f}`], { cwd: MOBILE, stdio: "ignore" });
    return false;
  } catch {
    return true;
  }
});
if (introuvables.length) {
  console.error(`✗ Le témoin est introuvable : ${introuvables.map((f) => `${AVANT}:mobile/${f}`).join(", ")}.`);
  console.error("  Un clone partiel ne remonte peut-être pas jusqu'à lui : « git fetch --unshallow origin main ».");
  console.error("\nLe harnais s'arrête : sans témoin, il ne peut pas dire ce que valent ses épreuves.");
  process.exit(1);
}

console.log("Le guichet d'aujourd'hui, devant le fetch d'Expo 57 :\n");
const nouveau = await jouer("nouveau");
for (const { nom, raison } of nouveau) {
  console.log(raison ? `  ✗ ${nom}\n      ${raison}` : `  ✓ ${nom}`);
}
const ratees = nouveau.filter((r) => r.raison);

console.log(`\nLe témoin — le guichet d'avant (${AVANT}), mêmes épreuves :\n`);
const temoin = await jouer("temoin");
const muettes = [];   // DÉFAUT que le témoin passe : l'épreuve ne voit rien
const fausses = [];   // SOCLE que le témoin rate : c'est le faux réseau qui ment
const plantees = [];  // le témoin n'a pas pu être joué : rien n'est mesuré
for (const { genre, nom, raison, plantee } of temoin) {
  if (plantee) {
    console.log(`  ✗ ?? ${nom}\n      ${raison}`);
    plantees.push({ nom, raison });
  } else if (genre === "DÉFAUT") {
    console.log(raison ? `  ✗ (attendu) ${nom}\n      ${raison}` : `  ✓ ?? ${nom}`);
    if (!raison) muettes.push(nom);
  } else {
    console.log(raison ? `  ✗ ?? ${nom}\n      ${raison}` : `  ✓ (socle) ${nom}`);
    if (raison) fausses.push(nom);
  }
}

console.log("");
if (muettes.length || fausses.length || plantees.length) {
  for (const { nom } of plantees) {
    console.error(`✗ « ${nom} » a planté sur le témoin : elle ne mesure rien — le témoin n'a pas pu être joué.`);
  }
  for (const nom of muettes) {
    console.error(`✗ Le témoin passe « ${nom} » : cette épreuve ne mesure rien.`);
  }
  for (const nom of fausses) {
    console.error(`✗ Le témoin rate le socle « ${nom} » : le faux réseau ment, pas l'ancien code.`);
  }
  console.error("\nLe harnais s'arrête : il ne peut pas dire ce que vaut le guichet d'aujourd'hui.");
  process.exit(1);
}
const defauts = temoin.filter((r) => r.genre === "DÉFAUT").length;
console.log(`  témoin : ${defauts} défauts vus sur l'ancien guichet, socle tenu ✓`);
if (ratees.length) {
  console.error(`\n✗ ${ratees.length} épreuve(s) sur ${nouveau.length} échouent sur le guichet d'aujourd'hui.`);
  process.exit(1);
}
console.log(`\n✓ ${nouveau.length} épreuves tenues : chaque demande finit, et ce qu'elle rapporte est vrai.`);
