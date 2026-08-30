// LES COMPTES, VRAIMENT ESSAYÉS.
//
//     node scripts/verifier-les-comptes.mjs
//
// Il lance un faux Supabase et un vrai serveur, puis déroule la vie entière
// d'un compte : la première inscription (celle du propriétaire), une
// deuxième (qui doit attendre), les mauvais mots de passe, l'approbation, la
// fermeture. « Ça compile » ne dit rien d'un verrou.
//
// CE QU'IL CHERCHE À PRENDRE EN DÉFAUT, et c'est le cœur :
//
//   · un compte non approuvé qui entrerait quand même ;
//   · un invité qui pourrait administrer les comptes ;
//   · un mot de passe qui se retrouverait quelque part en clair ;
//   · une réponse qui dirait si un courriel a un compte ici ou non ;
//   · le deuxième inscrit qui deviendrait propriétaire.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";

const SECRET = "secret-d-essai-pour-les-comptes";
const SECOURS = "cle-de-secours-d-essai";
const B = "http://127.0.0.1:3131";
const MDP = "un-mot-de-passe-assez-long";

let echecs = 0;
function verifier(quoi, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(48)} ${JSON.stringify(obtenu)}`);
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

for (const port of [3131, 4999]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé. Un essai précédent tourne`);
    console.error("  encore : ces vérifications porteraient sur SON code, pas sur");
    console.error("  celui d'ici. Arrêtez-le, puis relancez.");
    process.exit(1);
  }
}

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], { stdio: "ignore" });
const serveur = spawn("npx", ["next", "start", "-p", "3131"], {
  env: {
    ...process.env,
    SUPABASE_URL: "http://127.0.0.1:4999", SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: SECOURS,
  },
  stdio: "ignore",
});

const poste = (chemin, corps, entetes = {}) =>
  fetch(B + chemin, {
    method: "POST",
    headers: { "content-type": "application/json", ...entetes },
    body: JSON.stringify(corps),
  });

try {
  // Attendre les DEUX : le faux nuage d'abord, le serveur ensuite. Sans
  // cela, la toute première inscription part vers une base encore muette —
  // et c'est justement celle qui compte, puisqu'elle fait le propriétaire.
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://127.0.0.1:4999/rest/v1/utilisateurs")).ok) break;
    } catch { /* pas encore */ }
    await attendre(300);
  }
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + "/api/plateforme")).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }

  console.log("\nLa première inscription : celle du propriétaire");
  const r1 = await poste("/api/inscription", { courriel: "Nelson@Exemple.CM", motdepasse: MDP });
  const c1 = await r1.json();
  verifier("le premier compte est créé", r1.status, 200);
  verifier("il est propriétaire", c1.proprietaire, true);
  verifier("il repart avec une session", Boolean(c1.jeton), true);
  const jetonProprio = c1.jeton;

  console.log("\nLe courriel est rangé sous une seule forme");
  // « Nelson@Exemple.CM » et « nelson@exemple.cm » sont la MÊME personne :
  // deux lignes en feraient deux comptes qu'on croirait un seul.
  const rMaj = await poste("/api/session", { courriel: "NELSON@exemple.cm", motdepasse: MDP });
  verifier("les majuscules ne font pas un autre compte", rMaj.status, 200);

  console.log("\nLA PORTE EST FERMÉE : plus aucune inscription");
  // C'est la vérification qui compte le plus de ce fichier. L'inscription ne
  // sert qu'à poser le PREMIER compte ; dès qu'il existe, plus personne ne
  // s'inscrit. Un inconnu ne doit pas pouvoir déposer un compte ici, même un
  // compte qui attendrait sagement une approbation.
  const r2 = await poste("/api/inscription", { courriel: "inconnu@exemple.cm", motdepasse: MDP });
  const c2 = await r2.json();
  verifier("une deuxième inscription est refusée", r2.status, 403);
  verifier("aucun compte n'est créé", c2.proprietaire, undefined);
  verifier("aucune session n'est rendue", c2.jeton, undefined);

  const rEntreInconnu = await poste("/api/session", { courriel: "inconnu@exemple.cm", motdepasse: MDP });
  verifier("et ce compte n'existe donc pas", rEntreInconnu.status, 401);

  console.log("\nLa plateforme le dit d'elle-même");
  // L'écran s'en sert pour ne pas afficher un bouton qui mène à un refus.
  const plate = await (await fetch(B + "/api/plateforme")).json();
  verifier("elle annonce l'inscription fermée", plate.inscription, false);

  console.log("\nCe qu'on ne dit pas à un inconnu");
  const rInconnu = await poste("/api/session", { courriel: "personne@exemple.cm", motdepasse: "x" });
  const rMauvais = await poste("/api/session", { courriel: "nelson@exemple.cm", motdepasse: "faux" });
  const mInconnu = (await rInconnu.json()).erreur;
  const mMauvais = (await rMauvais.json()).erreur;
  verifier("compte inconnu : refusé", rInconnu.status, 401);
  verifier("mot de passe faux : refusé", rMauvais.status, 401);
  // Deux messages différents diraient quelles adresses ont un compte ici.
  verifier("le MÊME message dans les deux cas", mInconnu === mMauvais, true);

  // L'empreinte réelle du propriétaire, lue dans le faux nuage : elle
  // servira à poser un invité qui puisse vraiment se connecter.
  const empreinteConnue = (await (await fetch(
    "http://127.0.0.1:4999/rest/v1/utilisateurs?courriel=eq.nelson@exemple.cm"
  )).json())[0].empreinte;

  console.log("\nLe mot de passe ne se retrouve nulle part");
  const rMoi = await fetch(B + "/api/comptes", {
    headers: { authorization: `Bearer ${jetonProprio}` },
  });
  const liste = await rMoi.text();
  verifier("le propriétaire voit la liste", rMoi.status, 200);
  verifier("le mot de passe n'y est pas", liste.includes(MDP), false);
  verifier("aucune empreinte n'en sort", liste.includes("pbkdf2"), false);
  verifier("le jeton ne porte pas le mot de passe", jetonProprio.includes(MDP), false);

  console.log("\nL'administration est réservée au propriétaire");
  // Un invité n'existe plus par inscription : on en pose un directement en
  // base, comme le fera l'écran du propriétaire le jour où il pourra inviter
  // quelqu'un. Le reste du scénario — approuver, fermer — vaut toujours.
  await fetch("http://127.0.0.1:4999/rest/v1/utilisateurs", {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify([{
      courriel: "ami@exemple.cm",
      // L'empreinte du même mot de passe que le propriétaire : ce qui est
      // éprouvé ici est l'approbation, pas le hachage (il a ses tests).
      empreinte: empreinteConnue,
      role: "invite", approuve: false,
    }]),
  });
  const liste2 = await (await fetch(B + "/api/comptes", {
    headers: { authorization: `Bearer ${jetonProprio}` },
  })).text();
  const idAmi = JSON.parse(liste2).comptes.find((c) => c.courriel === "ami@exemple.cm").id;
  const rAnon = await fetch(B + "/api/comptes");
  verifier("sans session : refusé", rAnon.status, 401);

  console.log("\nLe propriétaire ouvre la porte");
  const rApp = await poste("/api/comptes", { id: idAmi, geste: "approuver" },
                           { authorization: `Bearer ${jetonProprio}` });
  verifier("l'approbation passe", rApp.status, 200);
  const rEntre = await poste("/api/session", { courriel: "ami@exemple.cm", motdepasse: MDP });
  verifier("l'invité entre maintenant", rEntre.status, 200);
  const jetonAmi = (await rEntre.json()).jeton;

  console.log("\nUn invité n'administre rien");
  const rInvite = await fetch(B + "/api/comptes", {
    headers: { authorization: `Bearer ${jetonAmi}` },
  });
  verifier("il ne voit pas la liste des comptes", rInvite.status, 403);
  const rPromo = await poste("/api/comptes", { id: idAmi, geste: "approuver" },
                             { authorization: `Bearer ${jetonAmi}` });
  verifier("il ne s'approuve personne", rPromo.status, 403);

  console.log("\nUn invité ne touche pas aux cartes");
  // C'est le contrôle le plus important de ce script. Un compte approuvé
  // ouvrait jusqu'ici le GUICHET : déposer une demande, c'est faire composer
  // un code sur une vraie carte SIM, avec de vrais francs derrière. Un
  // examinateur du magasin, à qui l'on donne un compte pour qu'il regarde,
  // pouvait lancer une opération réelle. Il regarde ; il ne compose pas.
  const rSolde = await poste("/api/commande", { type: "solde" },
                             { authorization: `Bearer ${jetonAmi}` });
  verifier("il ne demande pas un solde", rSolde.status, 403);
  const rUssd = await poste("/api/commande",
    { type: "ussd", parametres: { code: "*126#" } },
    { authorization: `Bearer ${jetonAmi}` });
  verifier("il ne compose pas un code USSD", rUssd.status, 403);
  const rRacc = await poste("/api/commande",
    { type: "raccourci", parametres: { operateur: "MTN", cle: "depot",
      etapes: ["*126#"], action: "definir" } },
    { authorization: `Bearer ${jetonAmi}` });
  verifier("il ne range rien dans le carnet", rRacc.status, 403);
  const rSansJeton = await poste("/api/commande", { type: "solde" });
  verifier("un inconnu non plus", rSansJeton.status, 401);
  // Le propriétaire, lui, passe : 503 parce que la base n'est pas branchée
  // ici, et 503 se lit « le verrou a laissé passer, la base s'est tue ».
  const rProprio = await poste("/api/commande", { type: "solde" },
                               { authorization: `Bearer ${jetonProprio}` });
  verifier("le propriétaire passe le verrou", rProprio.status !== 403, true);

  // La sonnerie d'essai obéit à la même règle : un invité pouvait faire
  // sonner en boucle tous les téléphones du propriétaire, et le ménage des
  // jetons se déclenchait sur SES essais. Il regarde ; il ne sonne pas.
  const rSonne = await poste("/api/essai-notification", {},
                             { authorization: `Bearer ${jetonAmi}` });
  verifier("il ne fait pas sonner les téléphones", rSonne.status, 403);
  const rSonneProprio = await poste("/api/essai-notification", {},
                                    { authorization: `Bearer ${jetonProprio}` });
  verifier("le propriétaire, lui, sonne", rSonneProprio.status !== 403, true);

  console.log("\nLe propriétaire crée un compte lui-même");
  // L'inscription libre est fermée et le reste. C'est désormais le SEUL
  // chemin pour faire entrer quelqu'un — et il en fallait un : Google exige
  // un compte qui fonctionne pour examiner l'application, et sans cela il
  // aurait fallu livrer le sien.
  const MDP2 = "un-autre-mot-de-passe-long";
  const rCree = await poste("/api/comptes",
    { geste: "creer", courriel: "Examen@Google.COM", motdepasse: MDP2 },
    { authorization: `Bearer ${jetonProprio}` });
  verifier("le propriétaire peut créer un compte", rCree.status, 201);

  const rNouveau = await poste("/api/session",
    { courriel: "examen@google.com", motdepasse: MDP2 });
  // Créé PAR le propriétaire, donc déjà approuvé : créer EST décider.
  verifier("ce compte entre tout de suite", rNouveau.status, 200);
  const jetonNouveau = (await rNouveau.json()).jeton;

  const rPasProprio = await fetch(B + "/api/comptes", {
    headers: { authorization: `Bearer ${jetonNouveau}` },
  });
  // Il naît « invite », jamais « proprietaire » : l'écran des comptes ne
  // doit pas pouvoir fabriquer un second propriétaire, qui pourrait
  // ensuite fermer la porte au premier.
  verifier("mais il n'administre rien", rPasProprio.status, 403);

  const rInvitecree = await poste("/api/comptes",
    { geste: "creer", courriel: "encore@exemple.cm", motdepasse: MDP2 },
    { authorization: `Bearer ${jetonNouveau}` });
  verifier("un invité ne crée personne", rInvitecree.status, 403);

  const rDejaLa = await poste("/api/comptes",
    { geste: "creer", courriel: "examen@google.com", motdepasse: MDP2 },
    { authorization: `Bearer ${jetonProprio}` });
  verifier("deux fois le même courriel : refusé", rDejaLa.status, 409);

  const rFaible = await poste("/api/comptes",
    { geste: "creer", courriel: "faible@exemple.cm", motdepasse: "court" },
    { authorization: `Bearer ${jetonProprio}` });
  verifier("un mot de passe trop court : refusé", rFaible.status, 400);

  const rAnonCree = await poste("/api/comptes",
    { geste: "creer", courriel: "intrus@exemple.cm", motdepasse: MDP2 });
  verifier("sans session : refusé", rAnonCree.status, 401);

  console.log("\nLe propriétaire referme");
  await poste("/api/comptes", { id: idAmi, geste: "fermer" },
              { authorization: `Bearer ${jetonProprio}` });
  const rRefuse = await poste("/api/session", { courriel: "ami@exemple.cm", motdepasse: MDP });
  verifier("l'invité ne rentre plus", rRefuse.status, 403);

  console.log("\nOn ne se ferme pas la porte à soi-même");
  const idMoi = JSON.parse(liste).comptes.find((c) => c.courriel === "nelson@exemple.cm").id;
  const rSoi = await poste("/api/comptes", { id: idMoi, geste: "supprimer" },
                           { authorization: `Bearer ${jetonProprio}` });
  verifier("le propriétaire ne se supprime pas", rSoi.status, 400);

  console.log("\nLa clé de secours, pour le jour où la base se tait");
  const rSec = await poste("/api/session", { motdepasse: SECOURS });
  verifier("elle ouvre, sans courriel", rSec.status, 200);
  const jetonSec = (await rSec.json()).jeton;
  const rSecAdmin = await fetch(B + "/api/comptes", {
    headers: { authorization: `Bearer ${jetonSec}` },
  });
  // Qui a accès aux variables d'environnement de l'hébergement EST le
  // propriétaire : lui refuser l'administration n'aurait aucun sens.
  verifier("et elle administre", rSecAdmin.status, 200);
  const rSecFaux = await poste("/api/session", { motdepasse: "pas-la-cle" });
  verifier("une fausse clé ne passe pas", rSecFaux.status, 401);

  console.log("\nCe qu'on refuse d'enregistrer");
  // La forme est vérifiée AVANT la porte : un mot de passe trop court est
  // refusé pour ce qu'il est, sur une plateforme neuve comme sur celle-ci.
  const rCourt = await poste("/api/inscription", { courriel: "x@y.cm", motdepasse: "court" });
  verifier("un mot de passe trop court", rCourt.status, 400);
  const rPasCourriel = await poste("/api/inscription", { courriel: "pas-un-courriel", motdepasse: MDP });
  verifier("un courriel qui n'en est pas un", rPasCourriel.status, 400);
  // On ne distingue PAS « ce courriel est pris » de « inscriptions
  // fermées » : la porte se referme avant de regarder le courriel. Les
  // distinguer dirait à un inconnu quelles adresses ont un compte ici.
  const rDeja = await poste("/api/inscription", { courriel: "nelson@exemple.cm", motdepasse: MDP });
  verifier("le courriel du propriétaire : même refus", rDeja.status, 403);

  console.log(echecs
    ? `\n✗ ${echecs} vérification(s) en échec.`
    : "\n✓ Les comptes tiennent : toutes les vérifications passent.");
} finally {
  serveur.kill();
  nuage.kill();
}
process.exit(echecs ? 1 : 0);
