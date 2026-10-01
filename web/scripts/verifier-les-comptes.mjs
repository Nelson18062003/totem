// LES COMPTES, VRAIMENT ESSAYÉS.
//
//     node scripts/verifier-les-comptes.mjs
//
// Il lance un faux Supabase (qui joue aussi le service de courrier) et un
// vrai serveur, puis déroule la vie entière d'un compte : la première
// inscription (celle du propriétaire), une deuxième (qui doit être refusée),
// les codes faux, l'approbation, la fermeture. On entre par un CODE reçu au
// courriel — il n'y a plus de mot de passe. « Ça compile » ne dit rien d'un
// verrou.
//
// CE QU'IL CHERCHE À PRENDRE EN DÉFAUT, et c'est le cœur :
//
//   · un compte non approuvé qui entrerait quand même — ou recevrait un code ;
//   · un invité qui pourrait administrer les comptes ;
//   · un code qui se retrouverait quelque part en clair ;
//   · une réponse qui dirait si un courriel a un compte ici ou non ;
//   · le deuxième inscrit qui deviendrait propriétaire.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";
import {
  adresseNeuve, attendreUneLettre, boite, demanderUnCode, entrerParCode, envCourrier,
} from "./entrer.mjs";

const SECRET = "secret-d-essai-pour-les-comptes";
const SECOURS = "cle-de-secours-d-essai";
const B = "http://127.0.0.1:3131";

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
    ...envCourrier(4999),
  },
  stdio: "ignore",
  // Son propre groupe de processus : tuer « npx » seul laissait vivre le
  // vrai serveur, port occupé, et le prochain essai l'aurait mesuré.
  detached: true,
});

// Chaque appel vient d'une adresse neuve : le frein de la porte ne doit pas
// confondre ce scénario avec une attaque (il a son propre harnais).
const poste = (chemin, corps, entetes = {}) =>
  fetch(B + chemin, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": adresseNeuve(), ...entetes },
    body: JSON.stringify(corps),
  });

/** Un code frais pour ce courriel — ou `null` si aucune lettre n'arrive. */
async function codePour(courriel) {
  await fetch("http://127.0.0.1:4999/essai/vieillir-les-codes", { method: "POST" });
  const avant = (await boite(4999, courriel)).nombre;
  await demanderUnCode(B, courriel);
  return (await attendreUneLettre(4999, courriel, avant, 2500))?.code ?? null;
}

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

  console.log("\nTROIS INSCRIPTIONS LANCÉES ENSEMBLE : un seul propriétaire");
  // LA COURSE. La plateforme comptait les comptes, voyait zéro, puis créait
  // un propriétaire. Entre les deux : un aller-retour vers la base, plus le
  // calcul de l'empreinte du mot de passe — lent à dessein, 210 000 tours.
  // Une fenêtre d'un cinquième de seconde, largement de quoi s'y glisser.
  //
  // Ce harnais a montré TROIS propriétaires, trois sessions ouvertes, trois
  // comptes approuvés : chacun pouvait lire tous les SMS, faire composer des
  // codes par le terminal, et fermer le compte des deux autres — dont celui
  // du vrai propriétaire. C'est la base qui tranche désormais (index
  // « utilisateurs_un_seul_proprietaire »), au moment de l'écriture : une
  // vérification faite AVANT une écriture ne garantit jamais rien.
  const COURRIELS_DE_LA_COURSE =
    ["nelson@exemple.cm", "intrus@exemple.cm", "intrus2@exemple.cm"];
  const course = await Promise.all([
    poste("/api/inscription", { courriel: "Nelson@Exemple.CM" }),
    poste("/api/inscription", { courriel: "intrus@exemple.cm" }),
    poste("/api/inscription", { courriel: "intrus2@exemple.cm" }),
  ]);
  const corpsCourse = await Promise.all(course.map((r) => r.json()));
  const proprios = corpsCourse.filter((c) => c.proprietaire === true);
  verifier("un seul propriétaire sort de la course", proprios.length, 1);
  verifier("aucune session n'est rendue par l'inscription",
    corpsCourse.filter((c) => Boolean(c.jeton)).length, 0);
  // Les perdants n'apprennent RIEN de ce qui s'est passé : ils reçoivent le
  // refus de toute inscription tardive. « Vous avez perdu une course » dirait
  // qu'un compte vient d'être créé, et à quelle seconde.
  verifier("les perdants reçoivent le refus ordinaire",
    course.filter((r) => r.status === 403).length, 2);
  verifier("aucun ne dit qu'il y a eu une course",
    corpsCourse.some((c) => /course|simultan|concurrent/i.test(c.erreur ?? "")), false);

  console.log("\nLa première inscription : celle du propriétaire");
  // L'ORDRE DE LA COURSE N'EST PAS GARANTI, et c'est le principe même d'une
  // course : n'importe lequel des trois peut gagner. On continue avec le
  // courriel du VAINQUEUR, quel qu'il soit : c'est lui, le propriétaire.
  const gagnant = corpsCourse.findIndex((c) => c.proprietaire === true);
  const proprio = COURRIELS_DE_LA_COURSE[gagnant] ?? COURRIELS_DE_LA_COURSE[0];
  verifier("le premier compte est créé", course[gagnant]?.status, 200);
  const lettre1 = await attendreUneLettre(4999, proprio, 0);
  verifier("un code part au courriel du propriétaire", Boolean(lettre1?.code), true);
  await attendre(500);
  const perdants = COURRIELS_DE_LA_COURSE.filter((c) => c !== proprio);
  const lettresPerdants = (await Promise.all(perdants.map((c) => boite(4999, c))))
    .reduce((n, b) => n + b.nombre, 0);
  verifier("aucun code ne part aux perdants", lettresPerdants, 0);
  const rEntre1 = await poste("/api/session", { courriel: proprio, code: lettre1?.code });
  verifier("ce code ouvre la session du propriétaire", rEntre1.status, 200);
  const jetonProprio = (await rEntre1.json()).jeton;

  console.log("\nLe courriel est rangé sous une seule forme");
  // « NELSON@Exemple.CM » et « nelson@exemple.cm » sont la MÊME personne :
  // deux lignes en feraient deux comptes qu'on croirait un seul.
  await fetch("http://127.0.0.1:4999/essai/vieillir-les-codes", { method: "POST" });
  const avantMaj = (await boite(4999, proprio)).nombre;
  await demanderUnCode(B, proprio.toUpperCase());
  const lettreMaj = await attendreUneLettre(4999, proprio, avantMaj);
  const rMaj = await poste("/api/session",
    { courriel: proprio.toUpperCase(), code: lettreMaj?.code });
  verifier("les majuscules ne font pas un autre compte", rMaj.status, 200);

  console.log("\nLA PORTE EST FERMÉE : plus aucune inscription");
  // C'est la vérification qui compte le plus de ce fichier. L'inscription ne
  // sert qu'à poser le PREMIER compte ; dès qu'il existe, plus personne ne
  // s'inscrit. Un inconnu ne doit pas pouvoir déposer un compte ici, même un
  // compte qui attendrait sagement une approbation.
  const r2 = await poste("/api/inscription", { courriel: "inconnu@exemple.cm" });
  const c2 = await r2.json();
  verifier("une deuxième inscription est refusée", r2.status, 403);
  verifier("aucun compte n'est créé", c2.proprietaire, undefined);
  verifier("aucune session n'est rendue", c2.jeton, undefined);

  await attendre(500);
  verifier("aucun code ne part à cette adresse",
    (await boite(4999, "inconnu@exemple.cm")).nombre, 0);
  const rEntreInconnu = await poste("/api/session", { courriel: "inconnu@exemple.cm", code: "000000" });
  verifier("et ce compte n'existe donc pas", rEntreInconnu.status, 401);

  console.log("\nLa plateforme le dit d'elle-même");
  // L'écran s'en sert pour ne pas afficher un bouton qui mène à un refus.
  const plate = await (await fetch(B + "/api/plateforme")).json();
  verifier("elle annonce l'inscription fermée", plate.inscription, false);

  console.log("\nCe qu'on ne dit pas à un inconnu");
  const dInconnu = await demanderUnCode(B, "personne@exemple.cm");
  const dConnu = await demanderUnCode(B, proprio);
  verifier("demander un code : la même réponse pour tous",
    [dInconnu.status, (await dInconnu.json()).message === (await dConnu.json()).message],
    [dConnu.status, true]);
  const rInconnu = await poste("/api/session", { courriel: "personne@exemple.cm", code: "123456" });
  const rMauvais = await poste("/api/session", { courriel: proprio, code: "123456" });
  const mInconnu = (await rInconnu.json()).erreur;
  const mMauvais = (await rMauvais.json()).erreur;
  verifier("compte inconnu : refusé", rInconnu.status, 401);
  verifier("code faux : refusé", rMauvais.status, 401);
  // Deux messages différents diraient quelles adresses ont un compte ici.
  verifier("le MÊME message dans les deux cas", mInconnu === mMauvais, true);

  console.log("\nLe code ne se retrouve nulle part");
  const rMoi = await fetch(B + "/api/comptes", {
    headers: { authorization: `Bearer ${jetonProprio}` },
  });
  const liste = await rMoi.text();
  verifier("le propriétaire voit la liste", rMoi.status, 200);
  verifier("le code n'y est pas", liste.includes(lettre1?.code ?? "--"), false);
  verifier("aucune empreinte n'en sort", /empreinte|pbkdf2/.test(liste), false);
  verifier("le jeton ne porte pas le code", jetonProprio.includes(lettre1?.code ?? "--"), false);
  const enBase = await (await fetch("http://127.0.0.1:4999/rest/v1/utilisateurs")).json();
  verifier("la base ne garde aucune empreinte de mot de passe",
    enBase.filter((u) => u.empreinte).length, 0);

  console.log("\nL'administration est réservée au propriétaire");
  // Un compte NON approuvé, posé directement en base (l'écran du
  // propriétaire, lui, crée des comptes déjà approuvés) : c'est ce qui permet
  // d'éprouver qu'une porte fermée ne reçoit même pas de code.
  await fetch("http://127.0.0.1:4999/rest/v1/utilisateurs", {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify([{ courriel: "ami@exemple.cm", role: "invite", approuve: false }]),
  });
  verifier("un compte fermé ne reçoit pas de code",
    await codePour("ami@exemple.cm"), null);
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
  const jetonAmi = await entrerParCode(B, 4999, "ami@exemple.cm");
  verifier("l'invité entre maintenant, par son code", Boolean(jetonAmi), true);

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

  // La LECTURE d'une commande, longtemps ouverte à tout compte, portait
  // fugitivement le code secret dans « resultat » avant que le robot ne le
  // masque : un invité pouvait l'énumérer. Fermée au propriétaire.
  const rLire = await fetch(B + "/api/commande/1",
    { headers: { authorization: `Bearer ${jetonAmi}` } });
  verifier("il ne lit pas une commande (le code y passe)", rLire.status, 403);
  // Et il n'écrit pas dans le registre : ni la nature, ni le lu/non-lu.
  const rNature = await poste("/api/nature", { id: 1, nature: "publicite" },
                              { authorization: `Bearer ${jetonAmi}` });
  verifier("il ne reclasse pas un SMS", rNature.status, 403);
  const rLu = await poste("/api/lu", { id: 1 },
                          { authorization: `Bearer ${jetonAmi}` });
  verifier("il ne marque rien lu", rLu.status, 403);
  // ET IL NE S'ABONNE PAS AUX NOTIFICATIONS. Une notification porte le SMS
  // reçu en aperçu : s'y inscrire, c'est recevoir chaque mouvement d'argent
  // du propriétaire en direct, sur son propre écran verrouillé, sans jamais
  // rouvrir la plateforme. Aucun écran ne liste les appareils inscrits :
  // l'abonné clandestin serait resté invisible. Et le robot ne servant que
  // les vingt derniers vus, s'inscrire en boucle rendait MUET le vrai
  // téléphone du propriétaire.
  const rAbonne = await poste("/api/appareil",
    { jeton: "ExponentPushToken[G0PZ1nT5bBRl8yQ2xKvJ_a]", plateforme: "android" },
    { authorization: `Bearer ${jetonAmi}` });
  verifier("il ne s'abonne pas aux SMS du propriétaire", rAbonne.status, 403);
  const rLireProprio = await fetch(B + "/api/commande/1",
    { headers: { authorization: `Bearer ${jetonProprio}` } });
  verifier("le propriétaire, lui, passe le verrou de lecture",
           rLireProprio.status !== 403, true);

  console.log("\nLe propriétaire crée un compte lui-même");
  // L'inscription libre est fermée et le reste. C'est désormais le SEUL
  // chemin pour faire entrer quelqu'un — et il en fallait un : Google exige
  // un compte qui fonctionne pour examiner l'application, et sans cela il
  // aurait fallu livrer le sien.
  const rCree = await poste("/api/comptes",
    { geste: "creer", courriel: "Examen@Google.COM" },
    { authorization: `Bearer ${jetonProprio}` });
  verifier("le propriétaire peut créer un compte — un courriel suffit", rCree.status, 201);

  // Créé PAR le propriétaire, donc déjà approuvé : créer EST décider.
  const jetonNouveau = await entrerParCode(B, 4999, "examen@google.com");
  verifier("ce compte entre tout de suite, par son code", Boolean(jetonNouveau), true);

  const rPasProprio = await fetch(B + "/api/comptes", {
    headers: { authorization: `Bearer ${jetonNouveau}` },
  });
  // Il naît « invite », jamais « proprietaire » : l'écran des comptes ne
  // doit pas pouvoir fabriquer un second propriétaire, qui pourrait
  // ensuite fermer la porte au premier.
  verifier("mais il n'administre rien", rPasProprio.status, 403);

  const rInvitecree = await poste("/api/comptes",
    { geste: "creer", courriel: "encore@exemple.cm" },
    { authorization: `Bearer ${jetonNouveau}` });
  verifier("un invité ne crée personne", rInvitecree.status, 403);

  const rDejaLa = await poste("/api/comptes",
    { geste: "creer", courriel: "examen@google.com" },
    { authorization: `Bearer ${jetonProprio}` });
  verifier("deux fois le même courriel : refusé", rDejaLa.status, 409);

  const rFaible = await poste("/api/comptes",
    { geste: "creer", courriel: "pas-un-courriel" },
    { authorization: `Bearer ${jetonProprio}` });
  verifier("un courriel qui n'en est pas un : refusé", rFaible.status, 400);

  const rAnonCree = await poste("/api/comptes",
    { geste: "creer", courriel: "intrus@exemple.cm" });
  verifier("sans session : refusé", rAnonCree.status, 401);

  console.log("\nLe propriétaire referme");
  await poste("/api/comptes", { id: idAmi, geste: "fermer" },
              { authorization: `Bearer ${jetonProprio}` });
  verifier("l'invité ne reçoit plus de code", await codePour("ami@exemple.cm"), null);

  // LE JETON DÉJÀ DÉLIVRÉ — la seule chose que l'intrus possède vraiment.
  //
  // Ce harnais fermait le compte puis éprouvait une NOUVELLE connexion : 403,
  // tout allait bien. Il ne présentait jamais le jeton déjà en main, or c'est
  // exactement ce qu'un invité renvoyé emporte avec lui. La porte est restée
  // grande ouverte trente jours durant — SMS en clair, soldes, bilan du
  // trimestre, reçus — sans qu'aucune vérification ne s'en émeuve.
  //
  // On présente donc l'ANCIEN jeton, sur les routes qui portent l'argent.
  const avecAncien = { headers: { authorization: `Bearer ${jetonAmi}` } };
  for (const chemin of ["/api/donnees", "/api/bilan?jours=90", "/api/actualite"]) {
    const r = await fetch(B + chemin, avecAncien);
    verifier(`l'ancien jeton ne lit plus ${chemin}`, r.status, 401);
  }
  const rAncienAppareil = await poste("/api/appareil",
    { jeton: "ExponentPushToken[G0PZ1nT5bBRl8yQ2xKvJ_a]", plateforme: "android" },
    { authorization: `Bearer ${jetonAmi}` });
  verifier("l'ancien jeton n'inscrit plus de téléphone",
           rAncienAppareil.status === 401 || rAncienAppareil.status === 403, true);

  // ROUVRIR DOIT ROUVRIR. Une révocation qu'on ne peut pas défaire serait un
  // autre défaut : le propriétaire n'oserait plus fermer, de peur de casser
  // quelque chose sans retour.
  await poste("/api/comptes", { id: idAmi, geste: "approuver" },
              { authorization: `Bearer ${jetonProprio}` });
  verifier("le même jeton rouvre après réapprobation",
           (await fetch(B + "/api/donnees", avecAncien)).status, 200);

  // SUPPRIMER N'EST PAS FERMER. Un compte fermé garde sa ligne, avec
  // « approuve » à faux ; un compte supprimé n'en a plus du tout. Ce sont
  // deux états différents de la base, et rien ne garantit qu'un contrôle
  // écrit pour l'un vaille pour l'autre — il faut les éprouver tous les deux.
  await poste("/api/comptes", { id: idAmi, geste: "supprimer" },
              { authorization: `Bearer ${jetonProprio}` });
  verifier("le jeton d'un compte EFFACÉ ne vaut rien non plus",
           (await fetch(B + "/api/donnees", avecAncien)).status, 401);

  console.log("\nOn ne se ferme pas la porte à soi-même");
  const idMoi = JSON.parse(liste).comptes.find((c) => c.courriel === proprio).id;
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

  // ELLE ADMINISTRE, MAIS ELLE NE VIDE PAS LA MAISON.
  //
  // La clé de secours ouvre l'administration sans désigner personne : la
  // garde « on ne se supprime pas soi-même » ne s'appliquait pas à elle, et
  // le compte du propriétaire pouvait disparaître. Ce qui suivait, joué
  // contre un vrai serveur : la table se vidait, la plateforme lisait
  // « aucun compte » comme « jamais installée », et ROUVRAIT ses
  // inscriptions. Le premier passant venu du réseau devenait propriétaire —
  // tous les SMS, tous les soldes, et le terminal qui compose ce qu'on lui
  // dit de composer.
  const avecSecours = { authorization: `Bearer ${jetonSec}` };
  const rSup = await poste("/api/comptes",
    { id: idMoi, geste: "supprimer" }, avecSecours);
  verifier("la clé de secours ne supprime pas le propriétaire", rSup.status, 400);
  const rFer = await poste("/api/comptes",
    { id: idMoi, geste: "fermer" }, avecSecours);
  verifier("elle ne ferme pas son compte non plus", rFer.status, 400);

  // Et la porte est restée fermée. C'est CELA qui compte : le reste n'était
  // qu'un chemin pour y arriver.
  const porte = await (await fetch(B + "/api/plateforme")).json();
  verifier("la porte des inscriptions est restée fermée", porte.inscription, false);
  const rPassant = await poste("/api/inscription",
    { courriel: "passant@internet.example" });
  verifier("un passant ne s'inscrit toujours pas", rPassant.status, 403);
  verifier("et il n'est surtout pas propriétaire",
    (await rPassant.json()).proprietaire, undefined);

  // LA CLÉ D'INTENTION — l'argent ne part pas deux fois.
  //
  // Un code USSD complet porte le bénéficiaire ET le montant : le composer
  // deux fois, c'est transférer deux fois. Une même demande peut être
  // présentée deux fois sans que personne l'ait voulu — un appui recompté,
  // une requête reprise après un délai côté téléphone alors qu'elle avait
  // abouti. La clé rend le geste idempotent, côté SERVEUR : l'écran ne se
  // garde pas tout seul.
  console.log("\nLa clé d'intention : un geste, une seule demande");
  const CODE = { code: "*126*1*677123456*5000#" };
  const commande = async (corps) => {
    const r = await poste("/api/commande", corps,
                          { authorization: `Bearer ${jetonProprio}` });
    return r.json().catch(() => ({}));
  };
  const idem1 = await commande({ type: "ussd", parametres: CODE, cle: "essai-A" });
  const idem2 = await commande({ type: "ussd", parametres: CODE, cle: "essai-A" });
  verifier("le même geste ne crée qu'UNE demande", Boolean(idem1.id) && idem1.id === idem2.id, true);
  const idemAutre = await commande({ type: "ussd", parametres: CODE, cle: "essai-B" });
  verifier("un geste distinct garde sa demande", Boolean(idemAutre.id) && idemAutre.id !== idem1.id, true);
  // Naviguer dans un menu répond souvent « 1 » plusieurs fois : deux gestes
  // distincts doivent rester deux demandes, sinon la navigation casse.
  const idemR1 = await commande({ type: "ussd_reponse", parametres: { texte: "1" }, cle: "essai-C1" });
  const idemR2 = await commande({ type: "ussd_reponse", parametres: { texte: "1" }, cle: "essai-C2" });
  verifier("répondre « 1 » deux fois reste possible", Boolean(idemR1.id) && idemR1.id !== idemR2.id, true);

  console.log("\nCe qu'on refuse d'enregistrer");
  // La forme est vérifiée AVANT la porte : un courriel qui n'en est pas un
  // est refusé pour ce qu'il est, sur une plateforme neuve comme ici.
  const rPasCourriel = await poste("/api/inscription", { courriel: "pas-un-courriel" });
  verifier("un courriel qui n'en est pas un", rPasCourriel.status, 400);
  const rAncien = await poste("/api/session", { courriel: proprio, motdepasse: "un-mot-de-passe-assez-long" });
  verifier("un mot de passe n'ouvre plus aucun compte", rAncien.status, 401);
  // On ne distingue PAS « ce courriel est pris » de « inscriptions
  // fermées » : la porte se referme avant de regarder le courriel. Les
  // distinguer dirait à un inconnu quelles adresses ont un compte ici.
  const rDeja = await poste("/api/inscription", { courriel: proprio });
  verifier("le courriel du propriétaire : même refus", rDeja.status, 403);

  console.log(echecs
    ? `\n✗ ${echecs} vérification(s) en échec.`
    : "\n✓ Les comptes tiennent : toutes les vérifications passent.");
} finally {
  try { process.kill(-serveur.pid, "SIGTERM"); } catch { serveur.kill(); }
  nuage.kill();
}
process.exit(echecs ? 1 : 0);
