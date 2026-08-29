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
  verifier("/api/appareil sans jeton", await code("/api/appareil", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jeton: "ExpoPushToken[intrus]" }),
  }), 401);
  verifier("/ renvoie vers la connexion", await code("/", { redirect: "manual" }), 307);

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
  verifier("elle ne donne que trois clés", Object.keys(plate).sort().join(","),
           "configuree,relie,totem");

  console.log("\nPorte de l'application");
  const json = (corps) => ({
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });
  verifier("/api/session est atteignable", await code("/api/session", json({})), 401);

  const rep = await fetch(B + "/api/session", json({ motdepasse: MOTDEPASSE }));
  const { jeton } = await rep.json();
  verifier("le bon mot de passe rend un jeton", Boolean(jeton), true);
  verifier("le jeton porte le sujet « telephone »", jeton.split(".")[0], "telephone");

  // 503 = le verrou a laissé passer (la base n'est pas configurée ici).
  const avec = (j) => code("/api/donnees", { headers: { Authorization: `Bearer ${j}` } });
  console.log("\nLe jeton ouvre — et lui seul (401 = repoussé, 503 = entré)");
  const [sujet, expir, sign] = jeton.split(".");
  verifier("jeton authentique", await avec(jeton), 503);
  verifier("signature modifiée", await avec(`${sujet}.${expir}.${sign.slice(0, -1)}X`), 401);
  verifier("échéance repoussée", await avec(`${sujet}.99999999999999.${sign}`), 401);
  verifier("sujet changé", await avec(`proprietaire.${expir}.${sign}`), 401);
  verifier("jeton inventé", await avec("telephone.99999999999999.n-importe-quoi"), 401);
  verifier("jeton vide", await avec(""), 401);
  verifier("déjà expiré", await avec(`${sujet}.${Date.now() - 86400000}.${sign}`), 401);

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

  console.log(echecs === 0
    ? "\n✓ Le verrou tient : toutes les vérifications passent.\n"
    : `\n✗ ${echecs} vérification(s) en échec.\n`);
} finally {
  serveur.kill();
}
process.exit(echecs === 0 ? 0 : 1);
