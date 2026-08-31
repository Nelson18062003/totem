// Le verrou de la plateforme, mis à l'épreuve pour de vrai.
//
//     node scripts/verifier-le-verrou.mjs
//
// Le script lance un VRAI serveur (compilé, verrou armé), frappe à toutes
// les portes, essaie de forger des jetons, et vérifie que le frein est bien
// partagé entre l'écran du navigateur et l'application du téléphone.
//
// À relancer après toute retouche au middleware, aux sessions ou au frein.
// « Ça compile » ne dit rien d'un verrou : seul un serveur qu'on attaque le dit.

import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PORT = 3199;
const B = `http://127.0.0.1:${PORT}`;
const SECRET = "verrou-de-test-uniquement-jamais-en-production";
const MOTDEPASSE = "motdepasse-de-test";

let echecs = 0;
function verifier(nom, obtenu, attendu) {
  const ok = String(obtenu) === String(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${nom.padEnd(48)} ${obtenu}${ok ? "" : ` (attendu ${attendu})`}`);
}

const code = async (chemin, options = {}) =>
  (await fetch(B + chemin, options).catch(() => ({ status: 0 }))).status;

const poste = (chemin, corps, entetes = {}) =>
  fetch(B + chemin, {
    method: "POST",
    headers: { "content-type": "application/json", ...entetes },
    body: JSON.stringify(corps),
  }).catch(() => ({ status: 0 }));


// ---------------------------------------------------------------------------
// LE RELEVÉ STATIQUE — la porte qu'on oubliera un jour.
//
// Le verrou du bord (`middleware.ts`) protège tout d'un coup ; le garde
// (`lib/garde.ts`), lui, se pose porte par porte. C'est sa force — il relit
// la base, ce que le bord ne peut pas faire — et c'est sa faiblesse : rien
// n'oblige la PROCHAINE route à y penser. C'est exactement ainsi que
// « /api/nature » et « /api/lu » sont restées ouvertes aux invités pendant
// que leurs deux voisines se fermaient.
//
// Ce relevé lit donc `middleware.ts` pour connaître les portes ouvertes, puis
// parcourt tous les fichiers de routes et d'écrans et exige que chacun des
// autres appelle un garde. Il ne prouve pas que le garde est bien employé —
// c'est le rôle des attaques plus bas. Il prouve qu'on n'en a oublié aucun,
// ce qu'aucune attaque ne peut faire : on n'attaque pas une porte dont on
// ignore l'existence.
// ---------------------------------------------------------------------------
function fichiers(racine, nom) {
  const trouves = [];
  const parcourir = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (e === nom) trouves.push(p);
    }
  };
  parcourir(racine);
  return trouves.sort();
}

/** Le chemin d'URL que sert ce fichier : « app/api/lu/route.ts » → « /api/lu ».
 *  Les dossiers entre parenthèses ne comptent pas (groupes de Next). */
const cheminServi = (fichier) =>
  "/" + fichier
    .replace(/^app\//, "").replace(/\/(route|page)\.tsx?$/, "")
    .split("/").filter((m) => !m.startsWith("(")).join("/");

console.log("\nAucune porte n'a oublié son garde");
{
  const middleware = readFileSync("middleware.ts", "utf8");
  const bloc = middleware.match(/const OUVERT = \[([\s\S]*?)\];/);
  if (!bloc) {
    console.log("  ✗ la liste OUVERT est introuvable dans middleware.ts");
    echecs++;
  }
  const ouvertes = [...(bloc?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  console.log(`     (${ouvertes.length} portes ouvertes déclarées : ${ouvertes.join(" ")})`);

  const aGarder = [...fichiers("app", "route.ts"), ...fichiers("app", "page.tsx")]
    .filter((f) => {
      const c = cheminServi(f);
      return !ouvertes.some((o) => c === o || c.startsWith(o + "/"));
    });

  const nues = aGarder.filter((f) => {
    const src = readFileSync(f, "utf8");
    return !/\bexiger(Session|Proprietaire|SessionOuLien|Ecran)\b/.test(src);
  });

  verifier(`${aGarder.length} portes fermées, toutes gardées`, nues.length, 0);
  for (const f of nues) console.log(`     ↳ SANS GARDE : ${f}`);
}

// UN SERVEUR DÉJÀ LÀ EST UN PIÈGE. Si le port est occupé — par un essai
// précédent mal refermé — le serveur qu'on lance ici ne démarre pas, et
// TOUTES les vérifications s'exécutent contre l'ancien code. Elles passent,
// en vert, et ne prouvent rien. C'est arrivé. On refuse donc de commencer.
async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;       // quelqu'un a répondu : le port est pris
  } catch {
    return true;
  }
}

if (!(await portLibre(PORT))) {
  console.error(`\n✗ Le port ${PORT} est déjà occupé. Un essai précédent tourne`);
  console.error("  encore : ces vérifications porteraient sur SON code, pas sur");
  console.error("  celui d'ici. Arrêtez-le, puis relancez.");
  process.exit(1);
}

const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: MOTDEPASSE },
  stdio: "ignore",
});

try {
  // Attendre que le serveur réponde.
  for (let i = 0; i < 60; i++) {
    if (await code("/connexion")) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nPortes fermées sans session");
  verifier("/api/donnees sans jeton", await code("/api/donnees"), 401);
  verifier("/api/bilan sans jeton", await code("/api/bilan"), 401);
  // L'inscription d'un telephone aux notifications est une ECRITURE : sans
  // verrou, n'importe qui pourrait inscrire son appareil et recevoir les
  // encaissements du proprietaire sur son propre ecran.
  verifier("/api/comptes sans jeton", await code("/api/comptes"), 401);
  // Faire sonner le téléphone du propriétaire n'est pas un geste qu'on offre
  // à un inconnu : ce serait un moyen commode de le harceler.
  verifier("/api/essai-notification sans jeton",
           await code("/api/essai-notification", { method: "POST" }), 401);
  verifier("/api/appareil sans jeton", await code("/api/appareil", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jeton: "ExponentPushToken[intrusAaBbCc001122]" }),
  }), 401);
  verifier("/ renvoie vers la connexion", await code("/", { redirect: "manual" }), 307);

  console.log("\nLes pages que Google Play exige ouvertes");
  // Un examinateur du Play Store l'ouvre SANS COMPTE, depuis un lien collé
  // dans un formulaire. Derrière le verrou, l'application serait refusée sans
  // plus d'explication — et l'on chercherait longtemps pourquoi.
  const rc = await fetch(B + "/confidentialite");
  verifier("/confidentialite s'ouvre sans session", rc.status, 200);
  const page = await rc.text();
  // Elle décrit le logiciel ; elle ne doit contenir AUCUNE donnée.
  verifier("elle ne montre aucun paiement", page.includes("FCFA"), false);
  verifier("elle ne montre pas le mot de passe", page.includes(MOTDEPASSE), false);

  // La marche à suivre pour se faire effacer. Même exigence, même piège : le
  // formulaire « Sécurité des données » refuse un lien qui mène au verrou.
  const rs = await fetch(B + "/suppression");
  verifier("/suppression s'ouvre sans session", rs.status, 200);
  const pageS = await rs.text();
  verifier("elle nomme l'application", pageS.includes("com.bonzinilabs.totem"), true);
  verifier("elle ne montre aucun paiement", pageS.includes("FCFA"), false);
  verifier("elle ne montre pas le mot de passe", pageS.includes(MOTDEPASSE), false);
  // Une adresse par défaut inventée promettrait une boîte qui n'existe pas.
  verifier("elle n'affiche pas d'adresse inventée",
           pageS.includes("contact@bonzinilabs.com"), false);

  console.log("\nLa porte à laquelle on frappe avant d'avoir la clé");
  // « /api/plateforme » est OUVERTE, et doit l'être : sans elle, l'application
  // du téléphone ne peut pas savoir si un TOTEM habite à l'adresse qu'elle
  // porte — et enverrait le mot de passe du propriétaire à un inconnu.
  // Ouverte ne veut pas dire bavarde : on vérifie ce qu'elle ne dit pas.
  const rp = await fetch(B + "/api/plateforme");
  verifier("/api/plateforme répond sans jeton", rp.status, 200);
  const plate = await rp.json();
  verifier("elle se présente comme un TOTEM", plate.totem, true);
  const dit = JSON.stringify(plate);
  verifier("elle ne donne pas le mot de passe", dit.includes(MOTDEPASSE), false);
  verifier("elle ne donne pas le secret", dit.includes(SECRET), false);
  verifier("elle ne donne que quatre clés", Object.keys(plate).sort().join(","),
           "configuree,inscription,relie,totem");

  console.log("\nPorte de l'application");
  const json = (corps) => ({
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });
  verifier("/api/session est atteignable", await code("/api/session", json({})), 401);

  // Sans courriel, c'est la CLÉ DE SECOURS qu'on présente — celle des
  // variables d'environnement. Les comptes ont leur propre script,
  // « verifier-les-comptes.mjs » ; ici on éprouve le JETON lui-même.
  const rep = await fetch(B + "/api/session", json({ motdepasse: MOTDEPASSE }));
  const { jeton } = await rep.json();
  verifier("le bon mot de passe rend un jeton", Boolean(jeton), true);
  verifier("le jeton porte le sujet « secours »", jeton.split(".")[0], "secours");

  // 503 = le verrou a laissé passer (la base n'est pas configurée ici).
  const avec = (j) => code("/api/donnees", { headers: { Authorization: `Bearer ${j}` } });
  console.log("\nLe jeton ouvre — et lui seul (401 = repoussé, 503 = entré)");
  const [sujet, expir, sign] = jeton.split(".");
  verifier("jeton authentique", await avec(jeton), 503);
  // On altère un caractère DU MILIEU, jamais le dernier : le dernier
  // caractère d'une signature base64url ne porte que quatre bits utiles,
  // et « …W » → « …X » peut décoder les MÊMES octets — l'altération ne
  // serait alors pas une altération, et le contrôle échouerait à tort une
  // fois sur vingt. C'est arrivé.
  const altere = sign.slice(0, 10)
    + (sign[10] === "A" ? "B" : "A") + sign.slice(11);
  verifier("signature modifiée", await avec(`${sujet}.${expir}.${altere}`), 401);
  // Et l'écriture NON CANONIQUE de la vraie signature (le dernier caractère
  // récrit avec les mêmes bits utiles) est refusée aussi : une signature n'a
  // qu'une seule écriture, sinon un jeton a plusieurs formes valables.
  const dernier = sign[sign.length - 1];
  const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const jumeau = ABC[(ABC.indexOf(dernier) ^ 1)];
  verifier("signature récrite (mêmes octets, autre écriture)",
    await avec(`${sujet}.${expir}.${sign.slice(0, -1)}${jumeau}`), 401);
  verifier("échéance repoussée", await avec(`${sujet}.99999999999999.${sign}`), 401);
  verifier("sujet changé", await avec(`proprietaire.${expir}.${sign}`), 401);
  verifier("jeton inventé", await avec("telephone.99999999999999.n-importe-quoi"), 401);
  verifier("jeton vide", await avec(""), 401);
  verifier("déjà expiré", await avec(`${sujet}.${Date.now() - 86400000}.${sign}`), 401);

  // LA FORME DU JETON D'UN TÉLÉPHONE — et pourquoi ce contrôle existe.
  //
  // La route n'acceptait que « ExpoPushToken[…] ». Expo rend en réalité
  // « ExponENTPushToken[…] ». Tous les téléphones réels étaient donc refusés,
  // la table des appareils est restée vide, et le robot a envoyé ses
  // notifications à personne pendant des jours.
  //
  // Ce harnais n'a rien vu parce qu'il présentait « ExpoPushToken[intrus] » —
  // la forme inventée dans la route. Il validait la faute contre elle-même.
  // On présente donc les DEUX formes, et on exige que la vraie passe.
  //
  // 503 = la forme est acceptée et le verrou a laissé passer (la base n'est
  // pas branchée ici) ; 400 = la forme est refusée.
  console.log("\nLe jeton d'un téléphone, dans sa VRAIE forme");
  const inscrire = (j) => code("/api/appareil", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ jeton: j, plateforme: "android", nom: "harnais" }),
  });
  verifier("« ExponentPushToken[…] » est accepté",
           await inscrire("ExponentPushToken[G0PZ1nT5bBRl8yQ2xKvJ_a]"), 503);
  verifier("« ExpoPushToken[…] » aussi (anciennes applications)",
           await inscrire("ExpoPushToken[G0PZ1nT5bBRl8yQ2xKvJ_a]"), 503);
  verifier("une adresse qui n'est pas d'Expo est refusée",
           await inscrire("https://chez-moi.example/sonner"), 400);
  verifier("un jeton vide est refusé", await inscrire(""), 400);

  // LE LIEN DE REÇU SIGNÉ — la seule brèche volontaire du verrou, et donc
  // celle qu'on attaque le plus fort. Le navigateur du téléphone n'a ni
  // cookie ni jeton : l'application demande un laissez-passer signé de dix
  // minutes pour UN reçu. On vérifie que ce passe ouvre, et surtout que
  // tout ce qui n'est pas exactement lui reste dehors.
  //
  // 404 = le verrou a laissé passer et la route a cherché le reçu (aucune
  // base ici) ; 401 = repoussé à la porte. C'est toute la différence.
  console.log("\nLe lien de reçu signé — la brèche volontaire, attaquée");
  const { createHmac } = await import("node:crypto");
  const signer = (numero, exp) =>
    createHmac("sha256", SECRET).update(`recu:${numero}:${exp}`).digest("base64url");
  const futur = Date.now() + 600_000;
  const passe = Date.now() - 1_000;
  const bonne = signer("essai-1", futur);

  verifier("le PDF sans rien reste fermé", await code("/api/recu/essai-1"), 401);
  verifier("un lien signé valable ouvre (404 : cherché, pas repoussé)",
           await code(`/api/recu/essai-1?e=${futur}&s=${bonne}`), 404);
  verifier("signature falsifiée : dehors",
           await code(`/api/recu/essai-1?e=${futur}&s=${bonne.slice(0, -2)}xx`), 401);
  verifier("échéance passée : dehors",
           await code(`/api/recu/essai-1?e=${passe}&s=${signer("essai-1", passe)}`), 401);
  verifier("échéance repoussée après signature : dehors",
           await code(`/api/recu/essai-1?e=${futur + 9}&s=${bonne}`), 401);
  verifier("le passe d'un reçu n'ouvre pas un autre reçu",
           await code(`/api/recu/essai-2?e=${futur}&s=${bonne}`), 401);
  verifier("la fabrique de liens reste derrière le verrou",
           await code("/api/recu/essai-1/lien"), 401);
  const rLien = await fetch(`${B}/api/recu/essai-1/lien`, {
    headers: { Authorization: `Bearer ${jeton}` },
  });
  verifier("authentifié, elle rend un lien", rLien.status, 200);
  const { url: lienSigne } = await rLien.json();
  verifier("et ce lien-là ouvre vraiment",
           (await fetch(lienSigne)).status, 404);

  console.log("\nLe lien de coordonnées signé — la seconde porte, attaquée");
  // Même mécanique que le reçu, GENRE distinct dans le corps signé : la
  // vérification qui compte le plus ici est la CROISÉE — un lien de reçu
  // présenté à la porte des coordonnées, et l'inverse. Si l'une des deux
  // passait, les deux portes n'en feraient qu'une.
  const signerCoord = (iccid, exp) =>
    createHmac("sha256", SECRET).update(`coordonnees:${iccid}:${exp}`).digest("base64url");
  const bonneCoord = signerCoord("8901essai", futur);
  verifier("le PDF sans rien reste fermé",
           await code("/api/coordonnees/8901essai"), 401);
  verifier("un lien signé valable ouvre (404 : cherché, pas repoussé)",
           await code(`/api/coordonnees/8901essai?e=${futur}&s=${bonneCoord}`), 404);
  verifier("signature falsifiée : dehors",
           await code(`/api/coordonnees/8901essai?e=${futur}&s=${bonneCoord.slice(0, -2)}xx`), 401);
  verifier("échéance passée : dehors",
           await code(`/api/coordonnees/8901essai?e=${passe}&s=${signerCoord("8901essai", passe)}`), 401);
  verifier("échéance repoussée après signature : dehors",
           await code(`/api/coordonnees/8901essai?e=${futur + 9}&s=${bonneCoord}`), 401);
  verifier("un lien de REÇU n'ouvre pas des coordonnées (même identifiant)",
           await code(`/api/coordonnees/8901essai?e=${futur}&s=${signer("8901essai", futur)}`), 401);
  verifier("ni l'inverse : un lien de coordonnées n'ouvre pas un reçu",
           await code(`/api/recu/8901essai?e=${futur}&s=${bonneCoord}`), 401);
  verifier("la fabrique de liens reste derrière le verrou",
           await code("/api/coordonnees/8901essai/lien"), 401);
  const rLienCoord = await fetch(`${B}/api/coordonnees/8901essai/lien`, {
    headers: { Authorization: `Bearer ${jeton}` },
  });
  verifier("authentifiée, elle rend un lien", rLienCoord.status, 200);
  const { url: lienCoordSigne } = await rLienCoord.json();
  verifier("et ce lien-là ouvre vraiment",
           (await fetch(lienCoordSigne)).status, 404);

  console.log("\nLe lien de bilan signé — la troisième porte, attaquée");
  // La signature couvre le NOMBRE DE JOURS : un lien signé pour la semaine
  // ne doit pas ouvrir le trimestre. (503 = entré, la base n'est pas
  // configurée ici ; 401 = repoussé par le verrou.)
  const signerBilan = (jours, exp) =>
    createHmac("sha256", SECRET).update(`bilan:${jours}:${exp}`).digest("base64url");
  const bonBilan = signerBilan("7", futur);
  verifier("le CSV sans rien reste fermé", await code("/api/bilan?jours=7"), 401);
  verifier("un lien signé valable entre (503 : base absente ici)",
           await code(`/api/bilan?jours=7&e=${futur}&s=${bonBilan}`), 503);
  verifier("le lien de la semaine n'ouvre pas le trimestre",
           await code(`/api/bilan?jours=90&e=${futur}&s=${bonBilan}`), 401);
  verifier("échéance passée : dehors",
           await code(`/api/bilan?jours=7&e=${passe}&s=${signerBilan("7", passe)}`), 401);
  verifier("un lien de reçu n'ouvre pas le bilan",
           await code(`/api/bilan?jours=7&e=${futur}&s=${signer("7", futur)}`), 401);
  verifier("la fabrique reste derrière le verrou",
           await code("/api/bilan/lien?jours=7"), 401);
  const rLienBilan = await fetch(`${B}/api/bilan/lien?jours=7`, {
    headers: { Authorization: `Bearer ${jeton}` },
  });
  verifier("authentifiée, elle rend un lien", rLienBilan.status, 200);
  const { url: lienBilanSigne } = await rLienBilan.json();
  verifier("et ce lien-là entre vraiment",
           (await fetch(lienBilanSigne)).status, 503);

  console.log("\nLe navigateur, inchangé");
  const co = await fetch(B + "/api/connexion", json({ motdepasse: MOTDEPASSE }));
  verifier("connexion navigateur acceptée", co.status, 200);
  const biscuit = (co.headers.get("set-cookie") || "").split(";")[0];
  verifier("le cookie est posé", biscuit.startsWith("totem_session="), true);
  verifier("il est httpOnly",
    (co.headers.get("set-cookie") || "").toLowerCase().includes("httponly"), true);
  verifier("le cookie ouvre les pages",
    await code("/", { headers: { cookie: biscuit }, redirect: "manual" }), 200);

  console.log("\nLe frein, partagé entre les deux portes");
  const frapper = (chemin, ip) =>
    fetch(B + chemin, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ motdepasse: "faux" }),
    });
  const chrono = async (f) => { const t = Date.now(); await f(); return Date.now() - t; };

  const neuve = await chrono(() => frapper("/api/session", "10.9.0.1"));
  for (let i = 0; i < 9; i++) await frapper("/api/connexion", "10.9.0.2");  // porte navigateur
  const punie = await chrono(() => frapper("/api/session", "10.9.0.2"));    // porte application
  const innocente = await chrono(() => frapper("/api/session", "10.9.0.3"));

  console.log(`     (référence ${neuve}ms · punie ${punie}ms · innocente ${innocente}ms)`);
  verifier("les échecs du navigateur freinent l'application", punie - neuve > 1000, true);
  verifier("une adresse innocente reste libre", innocente < 300, true);

  console.log("\nLe frein ne se contourne pas en changeant d'en-tête");
  // LE PIÈGE. Le frein compte les échecs par adresse, et cette adresse, il la
  // lisait dans « X-Forwarded-For » — un en-tête que le CLIENT écrit. Il
  // suffisait donc d'en changer à chaque essai pour obtenir un compteur neuf
  // à chaque fois : le frein comptait jusqu'à un, indéfiniment, pendant qu'on
  // essayait les mots de passe à pleine cadence.
  //
  // On mesure le contournement, pas le code : vingt essais, vingt adresses
  // inventées, puis un vingt-et-unième. S'il repart libre, le frein ne freine
  // personne.
  {
    const essai = (xff) => poste("/api/session",
      { motdepasse: "ce-n-est-pas-le-bon" }, { "x-forwarded-for": xff });
    for (let i = 0; i < 20; i++) await essai(`203.0.113.${i}`);
    const debut = Date.now();
    await essai("203.0.113.200");
    const attente = Date.now() - debut;
    console.log(`     (le 21ᵉ essai, sous une 21ᵉ adresse inventée : ${attente}ms)`);
    // Le frein ne doit PAS se laisser remettre à zéro par un en-tête. Après
    // vingt échecs, le vingt-et-unième attend, quelle que soit l'adresse
    // annoncée. On vise large — un demi-palier suffit à distinguer « freiné »
    // de « libre » sans dépendre de la vitesse de la machine.
    verifier("vingt adresses inventées ne remettent pas le compteur à zéro",
             attente > 400, true);
  }

  console.log(echecs === 0
    ? "\n✓ Le verrou tient : toutes les vérifications passent.\n"
    : `\n✗ ${echecs} vérification(s) en échec.\n`);
} finally {
  serveur.kill();
}
process.exit(echecs === 0 ? 0 : 1);
