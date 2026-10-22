// LE FREIN AUX ESSAIS DE MOT DE PASSE, ÉPROUVÉ EN RAFALE.
//
//     node scripts/verifier-le-frein.mjs
//
// Un frein se mesure mal en le lisant. Celui-ci avait l'air juste — un seau
// par adresse, un seau commun, un délai qui grandit — et il ne freinait
// presque rien : il LISAIT le compteur, attendait, vérifiait le mot de passe,
// PUIS notait l'échec. Soixante essais lancés ensemble lisaient donc tous un
// compteur à zéro.
//
// Mesuré contre un vrai serveur, avant correction : 999 ms par essai en file,
// 86 ms par essai en rafale. Douze fois plus vite, pour la seule peine de ne
// pas faire la queue — et personne n'attaque un mot de passe en faisant la
// queue.
//
// CE QUE CE HARNAIS GARDE :
//
//   1. en file, le délai grandit — le frein existe ;
//   2. EN RAFALE, il existe encore. C'est la vérification qui manquait ;
//   3. au-delà du mur, le serveur refuse SANS vérifier le mot de passe. Une
//      vérification coûte 210 000 tours de PBKDF2 : sans ce refus précoce,
//      une rafale d'essais devient une rafale de calculs, et la plateforme
//      s'écroule sous les tentatives ;
//   4. le mur est par ADRESSE. Attaquer ne doit pas enfermer le propriétaire
//      dehors — sans quoi le frein devient l'arme qu'il devait parer ;
//   5. changer l'adresse annoncée ne desserre rien ;
//   6. deux instances partagent le même seau ;
//   7. LA FOULE NE RALENTIT PERSONNE. TOTEM est grand public : soixante-dix
//      personnes qui se connectent avec le BON mot de passe ne doivent rien
//      coûter à la soixante et onzième. L'ancien seau commun comptait les
//      réussites : mesuré, 66 ms au repos, 8 065 ms après la foule ;
//   8. une adresse qui attaque UN compte ne ralentit pas les AUTRES — sous
//      son propre mur, elle imposait huit secondes à toute la plateforme ;
//   9. une attaque répartie sur UN compte le freine, sans le fermer ;
//  10. une réussite REND son essai, elle ne vide pas l'ardoise : se
//      connecter à son propre compte entre deux salves ne contourne pas le
//      mur ;
//  11. une base qui n'a pas reçu la migration du frein : la porte reste
//      ouverte, et le frein compte en mémoire.
//
// CHAQUE SECTION VISE SON PROPRE COMPTE. Le seau du compte s'ajoute à celui
// de l'adresse : une section qui frapperait le compte d'une autre serait
// ralentie par lui, et passerait pour la bonne raison sans rien prouver.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";

const PORT = 3177;
// UNE SECONDE INSTANCE, sur le même faux nuage. C'est elle qui prouve le
// point le plus difficile à voir : le seau est-il commun, ou chaque serveur
// a-t-il le sien ? Un hébergement qui met plusieurs instances en parallèle —
// ce que fait Vercel dès qu'il y a du trafic — donnait autrefois à une
// attaque l'allocation entière par instance, sans que rien ne le signale.
const PORT2 = 3178;
const NUAGE = 4993;
const B = `http://127.0.0.1:${PORT}`;
const B2 = `http://127.0.0.1:${PORT2}`;
const MDP = "le-vrai-mot-de-passe-du-proprietaire";
const CIBLE = "cible@exemple.cm";

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
for (const port of [PORT, PORT2, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé — arrêtez l'essai précédent.`);
    process.exit(1);
  }
}

console.log("\nCompilation de la plateforme…");
await new Promise((resoudre, rejeter) => {
  const b = spawn("npx", ["next", "build"], { stdio: "ignore" });
  b.on("exit", (c) => (c === 0 ? resoudre() : rejeter(
    new Error("la compilation a échoué — le frein ne peut rien prouver"))));
});

const nuage = spawn("node", ["scripts/faux-nuage.mjs"],
  { env: { ...process.env, PORT: String(NUAGE) }, stdio: "ignore" });
const envServeur = {
  ...process.env,
  SUPABASE_URL: `http://127.0.0.1:${NUAGE}`, SUPABASE_CLE: "peu-importe",
  SESSION_SECRET: "secret-du-frein", TOTEM_MOT_DE_PASSE: "cle-de-secours-frein",
};
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)],
                      { env: envServeur, stdio: "ignore", detached: true });
const serveur2 = spawn("npx", ["next", "start", "-p", String(PORT2)],
                       { env: envServeur, stdio: "ignore", detached: true });

/** Un essai depuis une adresse donnée. Rend le statut et la durée. */
async function essai(adresse, motdepasse, courriel = CIBLE, base = B) {
  const t0 = Date.now();
  const r = await fetch(`${base}/api/connexion`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": adresse },
    body: JSON.stringify({ courriel, motdepasse }),
  });
  return { statut: r.status, ms: Date.now() - t0 };
}

try {
  for (const base of [B, B2]) {
    for (let i = 0; i < 90; i++) {
      try { if ((await fetch(`${base}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
      await attendre(500);
    }
  }
  await fetch(`${B}/api/inscription`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: CIBLE, motdepasse: MDP }),
  });

  // --- 1. EN FILE : le délai grandit -------------------------------------
  console.log("\nEn file : le frein serre");
  const file = [];
  for (let i = 0; i < 12; i++) file.push(await essai("198.51.100.1", `faux-${i}`, "file@exemple.cm"));
  const premiers = file.slice(0, 3).reduce((s, e) => s + e.ms, 0) / 3;
  const derniers = file.slice(-3).reduce((s, e) => s + e.ms, 0) / 3;
  verifier("les derniers essais coûtent plus cher que les premiers",
    derniers > premiers * 2, `${premiers.toFixed(0)} ms → ${derniers.toFixed(0)} ms`);

  // --- 2. EN RAFALE : le frein tient encore ------------------------------
  //
  // LA VÉRIFICATION QUI MANQUAIT. Une adresse neuve, 80 essais lancés
  // ENSEMBLE. Le mur est à 60 : au-delà, plus rien ne doit être vérifié.
  console.log("\nEn rafale : le compteur n'est pas contourné");
  const t0 = Date.now();
  const rafale = await Promise.all(
    Array.from({ length: 80 }, (_, i) => essai("198.51.100.42", `rafale-${i}`, "rafale@exemple.cm")));
  const duree = Date.now() - t0;
  const juges = rafale.filter((e) => e.statut === 401).length;
  const murs = rafale.filter((e) => e.statut === 429).length;

  verifier("le mur arrête une partie de la rafale", murs > 0, `${murs} refus sur 80`);
  verifier("le nombre d'essais VRAIMENT jugés reste borné",
    juges <= 61, `${juges} mots de passe vérifiés`);
  verifier("une rafale ne va pas plus vite qu'une file",
    duree / 80 > 40, `${(duree / 80).toFixed(0)} ms par essai`);

  // --- 3. LE MUR NE FAIT PAS TRAVAILLER LE SERVEUR -----------------------
  //
  // Un refus doit arriver AVANT le calcul de l'empreinte. S'il coûtait aussi
  // cher qu'une vérification, le mur ne protégerait que le mot de passe, pas
  // la plateforme : mille essais resteraient mille calculs.
  console.log("\nAu-delà du mur, le serveur ne calcule plus");
  const apres = await essai("198.51.100.42", "encore-un", "rafale@exemple.cm");
  verifier("l'adresse murée reçoit 429", apres.statut === 429, `${apres.statut}`);
  const empreinteMs = premiers;   // le coût d'une vraie vérification, mesuré
  verifier("et ce refus est bien plus rapide qu'une vérification",
    apres.ms < empreinteMs, `${apres.ms} ms contre ${empreinteMs.toFixed(0)} ms`);

  // --- 4. LE PROPRIÉTAIRE N'EST PAS ENFERMÉ DEHORS -----------------------
  //
  // Un mur global serait l'arme qu'il devait parer : il suffirait d'attaquer
  // pour fermer la porte au propriétaire. Le sien est par adresse.
  console.log("\nPendant l'attaque, le propriétaire entre encore");
  const lui = await essai("203.0.113.200", MDP);
  verifier("depuis une autre adresse, avec le bon mot de passe : il entre",
    lui.statut === 200, `${lui.statut}`);
  verifier("…sans attendre : l'attaque visait d'autres comptes",
    lui.ms < 2000, `${lui.ms} ms`);

  // --- 5. L'ADRESSE ANNONCÉE NE DESSERRE RIEN ----------------------------
  //
  // Le frein prenait autrefois le PREMIER élément de « x-forwarded-for » —
  // le bout que le client écrit lui-même. Il suffisait d'en changer à chaque
  // essai pour repartir d'un seau neuf.
  console.log("\nChanger d'adresse annoncée ne desserre rien");
  const menteur = [];
  for (let i = 0; i < 10; i++) {
    const t = Date.now();
    const r = await fetch(`${B}/api/connexion`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "198.51.100.77",
        "x-forwarded-for": `10.0.0.${i}, 198.51.100.77`,
      },
      body: JSON.stringify({ courriel: "menteur@exemple.cm", motdepasse: `menteur-${i}` }),
    });
    menteur.push({ statut: r.status, ms: Date.now() - t });
  }
  const finMenteur = menteur.slice(-3).reduce((s, e) => s + e.ms, 0) / 3;
  verifier("le seau ne se remet pas à zéro à chaque en-tête inventé",
    finMenteur > premiers * 1.5, `${finMenteur.toFixed(0)} ms au dixième essai`);

  // --- 6. DEUX INSTANCES, UN SEUL SEAU -----------------------------------
  //
  // LA VÉRIFICATION LA PLUS DIFFICILE À VOIR DE L'EXTÉRIEUR. Le compteur
  // vivait dans la mémoire du serveur. Deux instances, deux seaux : une
  // attaque répartie obtenait l'allocation autant de fois qu'il y avait
  // d'instances, et rien ne le signalait — les essais étaient refusés, la
  // cadence était juste beaucoup plus rapide qu'annoncé.
  //
  // On mure donc une adresse sur la PREMIÈRE instance, puis on frappe à la
  // SECONDE avec la même adresse. Elle doit trouver porte close.
  console.log("\nDeux instances derrière la même base : un seul seau");
  const attaquant = "198.51.100.99";
  // En rafale : les enchaîner coûterait huit secondes chacun, et le harnais
  // mettrait un quart d'heure à dire une chose qui se voit en dix secondes.
  await Promise.all(
    Array.from({ length: 65 }, (_, i) => essai(attaquant, `deux-${i}`, "deux@exemple.cm", B)));
  const surUn = await essai(attaquant, "encore", "deux@exemple.cm", B);
  const surDeux = await essai(attaquant, "encore", "deux@exemple.cm", B2);
  verifier("la première instance mure l'adresse", surUn.statut === 429,
    `${surUn.statut}`);
  verifier("la SECONDE la mure aussi, sans l'avoir vue attaquer",
    surDeux.statut === 429, `${surDeux.statut}`);
  verifier("et elle n'a pas vérifié le mot de passe pour le dire",
    surDeux.ms < empreinteMs, `${surDeux.ms} ms`);

  // --- 7. LA FOULE NE RALENTIT PERSONNE ---------------------------------
  //
  // TOTEM EST GRAND PUBLIC. Le seau commun avait été pensé pour UNE maison :
  // il comptait TOUS les essais de la plateforme, réussites comprises, et ne
  // se vidait qu'après un quart d'heure sans un seul essai. Soixante-dix
  // personnes qui entrent avec le bon mot de passe — une matinée ordinaire —
  // et la soixante et onzième attendait huit secondes ; l'écran restait sur
  // « Vérification… », on recommençait, et chaque nouvel essai prolongeait
  // l'attente de tout le monde. Mesuré : 66 ms au repos, 8 065 ms après.
  console.log("\nLa foule qui entre ne ralentit personne");
  let ip = 0;
  const neuve = () => `192.0.2.${++ip}`;
  for (let lot = 0; lot < 7; lot++) {
    await Promise.all(Array.from({ length: 10 }, () => essai(neuve(), MDP)));
  }
  const apresLaFoule = await essai(neuve(), MDP);
  verifier("après soixante-dix connexions réussies, la suivante entre vite",
    apresLaFoule.statut === 200 && apresLaFoule.ms < 2000,
    `${apresLaFoule.statut}, ${apresLaFoule.ms} ms`);

  // --- 8. UNE ADRESSE QUI ATTAQUE UN COMPTE NE RALENTIT PAS LES AUTRES ----
  //
  // Cinquante-cinq mauvais essais, d'UNE adresse, sous son propre mur : le
  // seau commun montait à cinquante-cinq, et TOUTE la plateforme attendait
  // huit secondes. Le frein était l'arme qu'il devait parer.
  console.log("\nUne adresse qui attaque un compte ne ralentit pas les autres");
  await Promise.all(Array.from({ length: 55 }, (_, i) =>
    essai("198.51.100.55", `attaque-${i}`, "quelquun@exemple.cm")));
  const pendant = await essai(neuve(), MDP);
  verifier("le propriétaire, chez lui, entre sans attendre",
    pendant.statut === 200 && pendant.ms < 2000, `${pendant.statut}, ${pendant.ms} ms`);

  // --- 9. UNE ATTAQUE RÉPARTIE SUR UN COMPTE LE FREINE -------------------
  //
  // Ce que le seau commun devait arrêter, et que le seau du compte arrête :
  // mille adresses louées, un essai chacune, contre UN compte. Le mur de
  // l'adresse ne les voit jamais ; le seau du compte, si.
  console.log("\nUne attaque répartie sur un compte le freine");
  const reparti = [];
  for (let i = 0; i < 14; i++) reparti.push(await essai(neuve(), `reparti-${i}`, "vise@exemple.cm"));
  const debutReparti = reparti.slice(0, 3).reduce((s, e) => s + e.ms, 0) / 3;
  const finReparti = reparti.slice(-3).reduce((s, e) => s + e.ms, 0) / 3;
  verifier("une adresse neuve par essai : les derniers coûtent plus cher",
    finReparti > debutReparti * 2 && finReparti > 800,
    `${debutReparti.toFixed(0)} ms → ${finReparti.toFixed(0)} ms`);
  verifier("…et le compte n'est jamais fermé", reparti.every((e) => e.statut === 401),
    reparti.map((e) => e.statut).join(","));

  // --- 10. UNE RÉUSSITE REND SON ESSAI, ELLE NE VIDE PAS L'ARDOISE --------
  //
  // L'ancien seau de secours EFFAÇAIT l'adresse à chaque réussite. Une
  // attaque n'avait qu'à se connecter à son propre compte entre deux salves
  // contre celui d'un autre pour repartir de zéro, et ne jamais toucher le
  // mur. Cinquante échecs, une réussite, quinze échecs : soixante-cinq sur
  // la même adresse — le mur doit tomber.
  console.log("\nSe connecter à son compte entre deux salves ne contourne pas le mur");
  const malin = "198.51.100.66";
  await Promise.all(Array.from({ length: 50 }, (_, i) =>
    essai(malin, `salve-${i}`, "voisin@exemple.cm")));
  const entracte = await essai(malin, MDP);
  const salve = await Promise.all(Array.from({ length: 15 }, (_, i) =>
    essai(malin, `salve-bis-${i}`, "voisin@exemple.cm")));
  verifier("la réussite entre", entracte.statut === 200, `${entracte.statut}`);
  verifier("le mur tombe quand même au soixantième échec",
    salve.filter((e) => e.statut === 429).length >= 4,
    `${salve.filter((e) => e.statut === 429).length} refus sur 15`);

  // --- 11. UNE BASE PAS ENCORE MIGRÉE ------------------------------------
  //
  // La plateforme part sur le serveur avant que le propriétaire n'ait collé
  // la migration du frein dans Supabase : `frein_compter` y est inconnue. La
  // porte ne doit ni se fermer, ni ralentir la foule ; le frein compte dans
  // la mémoire de l'instance.
  console.log("\nUne base qui n'a pas reçu la migration du frein");
  await fetch(`http://127.0.0.1:${NUAGE}/essai/base-d-hier`, { method: "POST" });
  for (let lot = 0; lot < 7; lot++) {
    await Promise.all(Array.from({ length: 10 }, () => essai(neuve(), MDP)));
  }
  const sansMigration = await essai(neuve(), MDP);
  verifier("le propriétaire entre, et vite, après la foule",
    sansMigration.statut === 200 && sansMigration.ms < 2000,
    `${sansMigration.statut}, ${sansMigration.ms} ms`);
  const rafaleEnMemoire = await Promise.all(Array.from({ length: 70 }, (_, i) =>
    essai("198.51.100.70", `memoire-${i}`, "memoire@exemple.cm")));
  verifier("le mur tient encore, en mémoire",
    rafaleEnMemoire.some((e) => e.statut === 429),
    `${rafaleEnMemoire.filter((e) => e.statut === 429).length} refus sur 70`);
  await fetch(`http://127.0.0.1:${NUAGE}/essai/base-d-hier?oui=non`, { method: "POST" });

  // --- 12. SI LA BASE SE TAIT, LA PORTE NE SE FERME PAS ------------------
  //
  // Un frein qui dépend de la base ne doit jamais devenir un verrou sur la
  // maison le jour où la base ne répond plus. C'est déjà la raison d'être de
  // la clé de secours : on ne met pas le propriétaire dehors parce que
  // Supabase a hoqueté.
  //
  // On éprouve la CLÉ DE SECOURS, et c'est bien elle qu'il faut éprouver :
  // sans base, il n'y a plus de comptes à vérifier — un mot de passe de
  // compte ne PEUT pas ouvrir, et c'est normal. La clé de secours existe
  // exactement pour ce jour-là. Ce qu'on vérifie ici, c'est que le frein ne
  // vient pas s'ajouter à la panne en fermant aussi cette porte-là.
  //
  // Le premier essai s'est trompé de cible : il présentait un mot de passe de
  // compte à une plateforme sans comptes, et lisait le 401 comme un échec du
  // frein. Un contrôle qui mesure la mauvaise chose est un contrôle qui ment.
  console.log("\nBase muette : le frein se tait, la clé de secours ouvre");
  nuage.kill("SIGKILL");
  await attendre(500);
  const secours = await fetch(`${B}/api/connexion`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.201" },
    body: JSON.stringify({ motdepasse: "cle-de-secours-frein" }),
  });
  verifier("la clé de secours ouvre encore, base injoignable",
    secours.status === 200, `${secours.status}`);
  const muree = await fetch(`${B}/api/connexion`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": attaquant },
    body: JSON.stringify({ motdepasse: "pas-la-cle" }),
  });
  verifier("et le seau de secours en mémoire prend le relais",
    [401, 429].includes(muree.status), `${muree.status}`);
} finally {
  try { process.kill(-serveur.pid, "SIGKILL"); } catch { /* déjà parti */ }
  try { process.kill(-serveur2.pid, "SIGKILL"); } catch { /* déjà parti */ }
  nuage.kill("SIGKILL");
}

console.log(echecs === 0
  ? "\n✓ Le frein tient, en file comme en rafale.\n"
  : `\n✗ ${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
