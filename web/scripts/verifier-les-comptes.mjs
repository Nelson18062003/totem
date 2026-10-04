// LES COMPTES, VRAIMENT ESSAYÉS.
//
//     node scripts/verifier-les-comptes.mjs
//
// Il lance un faux Supabase et un vrai serveur, puis déroule la vie entière
// d'un compte TOTEM — application GRAND PUBLIC, publiée sur l'App Store et le
// Play Store : n'importe qui crée son compte, entre tout de suite, ne voit
// RIEN de la maison tant que TOTEM ne lui a pas attribué de carte, et peut
// supprimer son compte lui-même. « Ça compile » ne dit rien d'un verrou.
//
// CE QU'IL CHERCHE À PRENDRE EN DÉFAUT, et c'est le cœur :
//
//   · une inscription publique qui verrait quelque chose de la maison —
//     une carte, un SMS, le bilan, la pastille, les coordonnées, un reçu ;
//   · une inscription qui fabriquerait un second propriétaire, même en
//     courant plus vite qu'une autre ;
//   · une réponse qui dirait si un courriel a un compte ici ou non — par ses
//     mots, ou par sa DURÉE ;
//   · une rafale d'inscriptions qui ne serait freinée par rien ;
//   · une suppression qui laisserait un jeton vivant, des téléphones inscrits
//     ou des cartes attribuées ; qui passerait sans le bon mot de passe ; ou
//     qui effacerait le propriétaire ou la vitrine ;
//   · un invité qui pourrait administrer ; un mot de passe en clair quelque
//     part.
//
// LES TÉMOINS. Chaque exigence neuve a été lancée contre le code qui ne la
// tenait pas — l'ancienne plateforme (inscription fermée, pas de
// suppression), puis la nouvelle privée d'une seule garde à la fois (le
// frein des inscriptions, la réponse neutre, l'empreinte calculée avant de
// savoir, le refus du propriétaire, la cascade des téléphones dans le faux
// nuage) — et y échoue. Le détail est dans le rapport de la branche.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";

const SECRET = "secret-d-essai-pour-les-comptes";
const SECOURS = "cle-de-secours-d-essai";
const B = "http://127.0.0.1:3131";
const NUAGE = "http://127.0.0.1:4999";
const MDP = "un-mot-de-passe-assez-long";
const MTN = "89237010000000008901";
const ORANGE = "89237020000000004432";

let echecs = 0;
function verifier(quoi, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(58)} ${JSON.stringify(obtenu)}`);
}

// CHAQUE DEMANDE VIENT D'UNE ADRESSE NEUVE, sauf quand on éprouve le frein :
// sans cela, les essais de ce harnais s'accumuleraient dans un seul seau, et
// le frein — qui fait son travail — ralentirait tout le reste jusqu'au mur.
let adresse = 1;
const adresseNeuve = () => `10.77.${(adresse >> 8) & 255}.${adresse++ & 255}`;

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
    SUPABASE_URL: NUAGE, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: SECOURS,
    CONTACT_COURRIEL: "aide@totem-essai.cm",
  },
  stdio: "ignore",
  // Son PROPRE groupe de processus : « npx » lance le vrai serveur en
  // dessous, et tuer « npx » seul le laissait vivant, port occupé — le
  // harnais suivant refusait de démarrer, ou mesurait CE serveur-là.
  detached: true,
});

const poste = (chemin, corps, entetes = {}) =>
  fetch(B + chemin, {
    method: "POST",
    headers: {
      "content-type": "application/json", "x-forwarded-for": adresseNeuve(), ...entetes,
    },
    body: JSON.stringify(corps),
  });
// Une réponse qui n'est pas du JSON (une page 404 de l'ancienne plateforme,
// un 500) ne fait pas tomber le harnais : elle échoue À SA LIGNE, et la
// suite continue de mesurer.
const json = (r) => r.json().catch(() => ({}));
const avec = (jeton) => ({ authorization: `Bearer ${jeton}` });
const lire = (chemin, jeton) =>
  fetch(B + chemin, { headers: { ...(jeton ? avec(jeton) : {}), "x-forwarded-for": adresseNeuve() } });

/** Une inscription COMPLÈTE, telle que l'application l'envoie. */
const personne = (courriel, plus = {}) => ({
  prenom: "Awa", nom: "Ngono", adresse: "Rue Joss, Bonapriso, Douala, Cameroun",
  telephone: "+237 6 77 12 34 56", courriel, motdepasse: MDP, ...plus,
});
const inscrire = (corps, entetes = {}) => poste("/api/inscription?langue=fr", corps, entetes);
const supprimer = (motdepasse, jeton, entetes = {}) =>
  poste("/api/moi/suppression?langue=fr", { motdepasse }, { ...(jeton ? avec(jeton) : {}), ...entetes });
const ligneDuNuage = async (courriel) => (await (await fetch(
  `${NUAGE}/rest/v1/utilisateurs?courriel=eq.${encodeURIComponent(courriel)}`)).json())[0];

try {
  // Attendre les DEUX : le faux nuage d'abord, le serveur ensuite. Sans
  // cela, la toute première inscription part vers une base encore muette —
  // et c'est justement celle qui compte, puisqu'elle fait le propriétaire.
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${NUAGE}/rest/v1/utilisateurs`)).ok) break;
    } catch { /* pas encore */ }
    await attendre(300);
  }
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + "/api/plateforme")).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }

  // -------------------------------------------------------------------------
  console.log("\nTROIS INSCRIPTIONS LANCÉES ENSEMBLE SUR UNE PLATEFORME NEUVE");
  // LA COURSE. La plateforme compte les comptes, voit zéro, puis crée un
  // propriétaire. Entre les deux : un aller-retour vers la base, plus le
  // calcul de l'empreinte du mot de passe — lent à dessein. Ce harnais a
  // déjà montré TROIS propriétaires sortir d'une telle course. C'est la base
  // qui tranche (index « utilisateurs_un_seul_proprietaire ») ; les perdants
  // deviennent des comptes ordinaires — l'inscription est publique — sans
  // rien apprendre de la course.
  const COURRIELS = ["nelson@exemple.cm", "intrus@exemple.cm", "intrus2@exemple.cm"];
  const course = await Promise.all([
    inscrire(personne("Nelson@Exemple.CM", { prenom: "Nelson" })),
    inscrire(personne("intrus@exemple.cm", { prenom: "Intrus" })),
    inscrire(personne("intrus2@exemple.cm", { prenom: "Intrus2" })),
  ]);
  const corpsCourse = await Promise.all(course.map(json));
  verifier("les trois inscriptions passent", course.map((r) => r.status), [200, 200, 200]);
  verifier("chacune repart avec une session",
    corpsCourse.filter((c) => Boolean(c.jeton)).length, 3);
  verifier("chacune porte son échéance", corpsCourse.every((c) => Number.isFinite(c.expire)), true);
  verifier("aucune réponse ne parle d'une course",
    corpsCourse.some((c) => /course|simultan|concurrent|race/i.test(JSON.stringify(c))), false);
  // QUI EST PROPRIÉTAIRE, on ne le croit pas sur parole : on demande à la
  // plateforme (seul le propriétaire lit la liste des comptes) ET à la base.
  const administrent = await Promise.all(corpsCourse.map(
    async (c) => (await lire("/api/comptes", c.jeton)).status === 200));
  verifier("UN SEUL des trois administre", administrent.filter(Boolean).length, 1);
  const lignesCourse = await Promise.all(COURRIELS.map(ligneDuNuage));
  verifier("la base ne porte qu'un propriétaire",
    lignesCourse.filter((l) => l?.role === "proprietaire").length, 1);
  verifier("les deux autres sont des comptes ordinaires, ouverts",
    lignesCourse.filter((l) => l?.role === "invite" && l?.approuve === true).length, 2);
  const gagnant = administrent.findIndex(Boolean);
  verifier("la réponse du gagnant le dit propriétaire",
    corpsCourse[gagnant]?.proprietaire, true);
  // L'ORDRE DE LA COURSE N'EST PAS GARANTI : on continue avec le VAINQUEUR.
  const proprio = COURRIELS[gagnant] ?? COURRIELS[0];
  const jetonProprio = corpsCourse[gagnant]?.jeton;

  console.log("\nLe courriel est rangé sous une seule forme");
  // « NELSON@Exemple.CM » et « nelson@exemple.cm » sont la MÊME personne.
  const rMaj = await poste("/api/session", { courriel: proprio.toUpperCase(), motdepasse: MDP });
  verifier("les majuscules ne font pas un autre compte", rMaj.status, 200);

  // -------------------------------------------------------------------------
  console.log("\nUNE INSCRIPTION PUBLIQUE ENTRE TOUT DE SUITE");
  const plate = await (await fetch(B + "/api/plateforme")).json();
  verifier("la plateforme annonce l'inscription ouverte", plate.inscription, true);
  // « Contacter TOTEM » est le seul geste d'un compte neuf : il doit mener à
  // une adresse, pas à la politique de confidentialité.
  verifier("elle donne l'adresse où écrire à TOTEM", plate.contact, "aide@totem-essai.cm");
  const rAwa = await inscrire(personne("awa@exemple.cm"));
  const cAwa = await json(rAwa);
  verifier("le compte est créé", rAwa.status, 200);
  verifier("la réponse suit le contrat { ok, jeton, expire }",
    [cAwa.ok, typeof cAwa.jeton, typeof cAwa.expire], [true, "string", "number"]);
  verifier("elle n'est pas propriétaire", cAwa.proprietaire === true, false);
  const jetonAwa = cAwa.jeton;
  const rAwaEntre = await poste("/api/session", { courriel: "awa@exemple.cm", motdepasse: MDP });
  verifier("elle se reconnecte sans attendre personne", rAwaEntre.status, 200);
  const ligneAwa = await ligneDuNuage("awa@exemple.cm");
  verifier("la base garde ses six champs (le mot de passe en empreinte)",
    [ligneAwa?.prenom, ligneAwa?.nom, ligneAwa?.adresse, ligneAwa?.telephone,
      String(ligneAwa?.empreinte).startsWith("pbkdf2$")],
    ["Awa", "Ngono", "Rue Joss, Bonapriso, Douala, Cameroun", "+237677123456", true]);
  verifier("le numéro est rangé sans espaces ni tirets", ligneAwa?.telephone, "+237677123456");

  // -------------------------------------------------------------------------
  console.log("\nTANT QU'AUCUNE CARTE NE LUI EST ATTRIBUÉE, ELLE NE VOIT RIEN");
  // LE TÉMOIN D'ABORD : la maison a bien des cartes et des SMS. Sans lui,
  // « elle ne voit rien » et « il n'y a rien à voir » se ressembleraient.
  const toutProprio = await json(await lire("/api/donnees?sms=1000", jetonProprio));
  verifier("TÉMOIN : le propriétaire voit les cartes de la maison",
    (toutProprio.sims ?? []).map((s) => s.iccid).sort(), [MTN, ORANGE].sort());
  verifier("TÉMOIN : et des SMS", (toutProprio.paiements ?? []).length > 0, true);
  const bilanProprio = await (await lire("/api/bilan?jours=90", jetonProprio)).text();
  verifier("TÉMOIN : son bilan porte les cartes", bilanProprio.includes(MTN), true);
  verifier("TÉMOIN : ses coordonnées MTN s'ouvrent",
    (await lire(`/api/coordonnees/${MTN}`, jetonProprio)).status, 200);

  const dAwa = await json(await lire("/api/donnees?sms=1000", jetonAwa));
  verifier("aucune carte", (dAwa.sims ?? []).length, 0);
  verifier("aucun SMS", (dAwa.paiements ?? []).length, 0);
  const aAwa = await json(await lire("/api/actualite", jetonAwa));
  verifier("la pastille ne compte rien", [aAwa.dernier, aAwa.nonLus], [0, 0]);
  const bilanAwa = await (await lire("/api/bilan?jours=90", jetonAwa)).text();
  verifier("le bilan ne porte aucune carte",
    [bilanAwa.includes(MTN), bilanAwa.includes(ORANGE)], [false, false]);
  const { url: lienAwa } = await json(await lire("/api/bilan/lien?jours=90", jetonAwa));
  const bilanSigne = lienAwa ? await (await fetch(lienAwa.replace(/^https?:\/\/[^/]+/, B))).text() : "";
  verifier("son lien de bilan signé ne porte rien non plus",
    [bilanSigne.includes(MTN), bilanSigne.includes(ORANGE)], [false, false]);
  for (const carte of [MTN, ORANGE]) {
    verifier(`les coordonnées ${carte === MTN ? "MTN" : "Orange"} : refusées`,
      (await lire(`/api/coordonnees/${carte}`, jetonAwa)).status, 404);
  }
  verifier("un reçu dont on devine le numéro : refusé",
    (await lire("/api/recu/TM-20250829-0003", jetonAwa)).status, 404);
  verifier("la liste des comptes : refusée", (await lire("/api/comptes", jetonAwa)).status, 403);
  verifier("la console : refusée (renvoi à l'accueil)",
    (await fetch(B + "/console", { headers: avec(jetonAwa), redirect: "manual" })).status, 307);
  verifier("elle ne compose rien",
    (await poste("/api/commande", { type: "solde" }, avec(jetonAwa))).status, 403);
  verifier("ni en nommant une carte de la maison",
    (await poste("/api/commande", { type: "ussd", parametres: { code: "*126#", carte: MTN } },
      avec(jetonAwa))).status, 403);
  verifier("elle ne reclasse aucun SMS",
    (await poste("/api/nature", { id: 1, nature: "publicite" }, avec(jetonAwa))).status, 403);
  verifier("elle ne marque rien lu",
    (await poste("/api/lu", { id: 1 }, avec(jetonAwa))).status, 403);
  const lireCommande = await lire("/api/commande/1", jetonAwa);
  verifier("elle ne lit pas une commande (un code secret y passe)",
    lireCommande.status === 403 || lireCommande.status === 404, true);
  // LE JOURNAL DE TOTEM. Il nomme les boîtiers de tous les clients, leurs
  // pannes, leurs heures, et les incidents de la plateforme. TÉMOIN : le
  // propriétaire, lui, l'ouvre et y lit le boîtier du faux nuage — sans
  // quoi un refus et une page vide se ressembleraient.
  const biscuit = (j) => ({ cookie: `totem_session=${j}` });
  const journalProprio = await fetch(B + "/journal",
    { headers: biscuit(jetonProprio), redirect: "manual" });
  verifier("TÉMOIN : le propriétaire ouvre « Ce qui s'est passé »", journalProprio.status, 200);
  const journalAwa = await fetch(B + "/journal", { headers: biscuit(jetonAwa), redirect: "manual" });
  verifier("« Ce qui s'est passé » : refusé (renvoi à l'accueil)", journalAwa.status, 307);
  verifier("…et rien du journal n'en sort",
    /Douala \(faux\)|douala-faux|modem/i.test(await journalAwa.text()), false);
  // LE BOÎTIER D'UN AUTRE. `leBoitierMontre` prenait le dernier entendu
  // dans toute la flotte : un inscrit sans carte recevait le nom, la
  // version et la santé du boîtier de TOTEM — ou de celui d'un autre client.
  verifier("TÉMOIN : le propriétaire voit le terminal et ses raccourcis",
    [Boolean(toutProprio.terminal?.id), Object.keys(toutProprio.raccourcis ?? {}).length > 0],
    [true, true]);
  verifier("aucun terminal (elle n'a pas de boîtier)", dAwa.terminal ?? null, null);
  verifier("aucun raccourci du carnet du propriétaire",
    Object.keys(dAwa.raccourcis ?? {}).length, 0);
  const reglagesAwa = await (await fetch(B + "/reglages", { headers: biscuit(jetonAwa) })).text();
  verifier("ses Réglages ne nomment pas le boîtier d'un autre",
    reglagesAwa.includes("Douala (faux)"), false);
  // CE QUI LUI REVIENT : son prénom, pour la saluer, et son CODE DE COMPTE,
  // à joindre à sa puce — jamais son adresse e-mail, que n'importe qui a
  // pu prendre avant elle.
  verifier("son prénom, pour la saluer", dAwa.prenom, "Awa");
  const codeAwa = dAwa.codeCompte;
  verifier("son code de compte, à joindre à sa puce",
    /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(String(codeAwa)), true);
  verifier("le propriétaire n'a pas de code (il ne reçoit pas de puce ainsi)",
    toutProprio.codeCompte ?? null, null);
  const accueilAwa = await (await fetch(B + "/", { headers: biscuit(jetonAwa) })).text();
  verifier("l'accueil du site lui dit « Ajouter ma carte », avec son code",
    [accueilAwa.includes("Ajouter ma carte") || accueilAwa.includes("Add my card"),
      accueilAwa.includes(String(codeAwa))], [true, true]);
  verifier("…et pas « Aucune carte dans le terminal »",
    /Aucune carte dans le terminal|No card in the terminal/.test(accueilAwa), false);

  console.log("\nCE QUE LE PROPRIÉTAIRE VOIT D'ELLE");
  const listeTexte = await (await lire("/api/comptes", jetonProprio)).text();
  const ficheAwa = JSON.parse(listeTexte).comptes.find((c) => c.courriel === "awa@exemple.cm");
  verifier("son nom, son adresse et son téléphone, pour installer sa carte",
    [ficheAwa?.prenom, ficheAwa?.nom, ficheAwa?.adresse, ficheAwa?.telephone],
    ["Awa", "Ngono", "Rue Joss, Bonapriso, Douala, Cameroun", "+237677123456"]);
  verifier("son compte exige un code pour recevoir une puce", ficheAwa?.codeExige, true);
  verifier("le code n'est PAS dans la liste (on le recopie de la puce)",
    listeTexte.includes(String(codeAwa)), false);
  verifier("aucune empreinte n'en sort", listeTexte.includes("pbkdf2"), false);
  verifier("aucun mot de passe n'en sort", listeTexte.includes(MDP), false);

  // -------------------------------------------------------------------------
  console.log("\nCE QU'UNE INSCRIPTION DOIT DONNER");
  const refusDe = async (corps) => {
    const r = await inscrire(corps);
    return [r.status, typeof (await json(r)).erreur];
  };
  verifier("sans prénom : refusée", await refusDe(personne("a1@exemple.cm", { prenom: "" })), [400, "string"]);
  verifier("sans nom : refusée", await refusDe(personne("a2@exemple.cm", { nom: undefined })), [400, "string"]);
  verifier("sans adresse : refusée", await refusDe(personne("a3@exemple.cm", { adresse: "   " })), [400, "string"]);
  verifier("sans téléphone : refusée", await refusDe(personne("a4@exemple.cm", { telephone: "" })), [400, "string"]);
  verifier("un téléphone fait de lettres : refusé",
    await refusDe(personne("a5@exemple.cm", { telephone: "appelez-moi" })), [400, "string"]);
  verifier("un téléphone de 5 chiffres : refusé",
    await refusDe(personne("a6@exemple.cm", { telephone: "12345" })), [400, "string"]);
  verifier("un téléphone de 16 chiffres : refusé",
    await refusDe(personne("a7@exemple.cm", { telephone: "+1234567890123456" })), [400, "string"]);
  verifier("un « + » au milieu : refusé",
    await refusDe(personne("a8@exemple.cm", { telephone: "677+123456" })), [400, "string"]);
  verifier("un prénom de 61 caractères : refusé",
    await refusDe(personne("a9@exemple.cm", { prenom: "A".repeat(61) })), [400, "string"]);
  verifier("une adresse de 201 caractères : refusée",
    await refusDe(personne("a10@exemple.cm", { adresse: "r".repeat(201) })), [400, "string"]);
  verifier("un courriel qui n'en est pas un : refusé",
    await refusDe(personne("pas-un-courriel")), [400, "string"]);
  verifier("un mot de passe trop court : refusé",
    await refusDe(personne("a11@exemple.cm", { motdepasse: "court" })), [400, "string"]);
  const rFr = await inscrire(personne("a12@exemple.cm", { telephone: "abc" }));
  const rEn = await poste("/api/inscription?langue=en",
    personne("a12@exemple.cm", { telephone: "abc" }));
  const [mFr, mEn] = [(await json(rFr)).erreur, (await json(rEn)).erreur];
  verifier("le refus parle la langue demandée", mFr !== mEn && /téléphone/.test(mFr)
    && /phone/.test(mEn), true);
  verifier("aucun de ces refus n'a créé de compte",
    (await Promise.all(["a1", "a3", "a5", "a9", "a11", "a12"].map(
      (p) => ligneDuNuage(`${p}@exemple.cm`)))).filter(Boolean).length, 0);

  // -------------------------------------------------------------------------
  console.log("\nUN COURRIEL DÉJÀ PRIS NE SE TRAHIT PAS");
  const rPris = await inscrire(personne("awa@exemple.cm", { prenom: "Autre" }));
  const mPris = (await json(rPris)).erreur ?? "";
  verifier("refusé, sans session", rPris.status >= 400 && rPris.status < 500, true);
  verifier("la phrase neutre, celle du contrat",
    mPris, "Impossible de créer ce compte. Si vous en avez déjà un, connectez-vous.");
  verifier("elle ne dit pas « déjà pris » ni « existe »",
    /pris|existe|exists|taken|utilis/i.test(mPris), false);
  const rProprioPris = await inscrire(personne(proprio));
  verifier("même phrase pour le courriel du propriétaire",
    (await json(rProprioPris)).erreur, mPris);
  const rVitrine = await inscrire(personne("examen@totemlabs.app"));
  verifier("même phrase pour le courriel de la vitrine",
    (await json(rVitrine)).erreur, mPris);
  verifier("l'ancien compte est intact (ni écrasé ni renommé)",
    (await ligneDuNuage("awa@exemple.cm"))?.prenom, "Awa");
  // PAR SA DURÉE NON PLUS. Une adresse prise doit coûter le même calcul
  // qu'une adresse libre — l'empreinte du mot de passe est faite AVANT que
  // la base ne dise « pris ». Sinon, un chronomètre suffit : 5 ms pour une
  // adresse connue, 150 pour une inconnue. On compare des médianes, et l'on
  // ne demande que la moitié : une machine chargée bouge, une faute non.
  const chrono = async (corps) => {
    const t0 = performance.now();
    await (await inscrire(corps)).text();
    return performance.now() - t0;
  };
  const mediane = (l) => l.sort((a, b) => a - b)[Math.floor(l.length / 2)];
  const libres = [], prises = [];
  for (let i = 0; i < 5; i++) {
    libres.push(await chrono(personne(`chrono${i}@exemple.cm`)));
    prises.push(await chrono(personne("awa@exemple.cm")));
  }
  const [mLibre, mPrise] = [mediane(libres), mediane(prises)];
  console.log(`      (médiane : ${mLibre.toFixed(0)} ms libre, ${mPrise.toFixed(0)} ms prise)`);
  verifier("une adresse prise coûte autant qu'une libre", mPrise >= mLibre * 0.5, true);

  // -------------------------------------------------------------------------
  console.log("\nUNE RAFALE D'INSCRIPTIONS EST FREINÉE");
  // TOUTES DE LA MÊME ADRESSE, ensemble. Sans frein, chacune coûte au
  // serveur 210 000 tours de PBKDF2 et crée un compte : de quoi remplir la
  // base et sonder les courriels. Le mur des inscriptions est à vingt par
  // quart d'heure et par adresse.
  const ATTAQUANT = "10.66.0.66";
  const rafale = await Promise.all(Array.from({ length: 30 }, (_, i) =>
    inscrire(personne(`rafale${i}@exemple.cm`), { "x-forwarded-for": ATTAQUANT })));
  const statuts = rafale.map((r) => r.status);
  const creees = statuts.filter((s) => s === 200).length;
  verifier("le mur refuse le surplus (429)", statuts.filter((s) => s === 429).length >= 10, true);
  verifier("vingt comptes au plus sortent de la rafale", creees <= 20, true);
  const tConnexion = performance.now();
  const rPendant = await poste("/api/session", { courriel: "awa@exemple.cm", motdepasse: MDP },
    { "x-forwarded-for": ATTAQUANT });
  verifier("la CONNEXION depuis cette adresse n'est pas murée", rPendant.status, 200);
  verifier("…ni ralentie par les inscriptions", performance.now() - tConnexion < 3000, true);
  verifier("une inscription d'ailleurs passe toujours",
    (await inscrire(personne("ailleurs@exemple.cm"))).status, 200);

  // -------------------------------------------------------------------------
  console.log("\nSES TÉLÉPHONES ET SES CARTES, AVANT LA SUPPRESSION");
  const ficheId = ficheAwa?.id;
  const JETON_TEL = "ExponentPushToken[AwaNgonoTelephone01]";
  verifier("elle inscrit son téléphone",
    (await poste("/api/appareil", { jeton: JETON_TEL, plateforme: "ios" }, avec(jetonAwa))).status, 200);
  // LA PUCE S'ATTRIBUE D'APRÈS LE CODE, JAMAIS D'APRÈS L'ADRESSE. Un
  // inconnu qui a créé le compte au courriel d'une autre ne doit pas
  // recevoir sa puce : le propriétaire attribue d'après le code joint à la
  // puce, et la plateforme refuse tout le reste.
  const attribuer = (corps) => poste("/api/comptes",
    { geste: "attribuer", id: ficheId, iccid: ORANGE, ...corps }, avec(jetonProprio));
  verifier("sans code : l'attribution est refusée",
    (await attribuer({})).status, 409);
  const codeIntrus = (await json(await lire("/api/donnees", corpsCourse.find(
    (c, i) => i !== gagnant)?.jeton))).codeCompte;
  verifier("avec le code d'un AUTRE compte : refusée",
    [codeIntrus !== codeAwa, (await attribuer({ code: codeIntrus })).status], [true, 409]);
  verifier("…avec une phrase qui dit pourquoi",
    /code/i.test((await json(await attribuer({ code: "AAAA-AAAA" }))).erreur ?? ""), true);
  verifier("TOTEM lui attribue sa carte Orange, d'après SON code",
    (await attribuer({ code: String(codeAwa).toLowerCase().replace("-", " ") })).status, 200);
  const dAvec = await json(await lire("/api/donnees?sms=1000", jetonAwa));
  verifier("elle voit SA carte, et seulement elle",
    (dAvec.sims ?? []).map((s) => s.iccid), [ORANGE]);
  verifier("ses coordonnées s'ouvrent", (await lire(`/api/coordonnees/${ORANGE}`, jetonAwa)).status, 200);
  verifier("celles de la carte MTN restent fermées",
    (await lire(`/api/coordonnees/${MTN}`, jetonAwa)).status, 404);

  // -------------------------------------------------------------------------
  console.log("\nSUPPRIMER SON COMPTE");
  const rSansSession = await supprimer(MDP);
  verifier("sans session : refusé", rSansSession.status, 401);
  const rMauvais = await supprimer("pas-le-bon-mot-de-passe", jetonAwa);
  verifier("un mauvais mot de passe : refusé", rMauvais.status, 401);
  verifier("…avec une phrase", typeof (await json(rMauvais)).erreur, "string");
  verifier("…et le compte est toujours là",
    (await lire("/api/donnees", jetonAwa)).status, 200);
  const rVide = await supprimer("", jetonAwa);
  verifier("sans mot de passe : refusé", rVide.status, 401);

  const rBon = await supprimer(MDP, jetonAwa);
  verifier("le bon mot de passe : supprimé", rBon.status, 200);
  verifier("la réponse suit le contrat { ok: true }", (await json(rBon)).ok, true);
  const coupe = /totem_session=;|totem_session=[^;]*;[^,]*(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/i
    .test(rBon.headers.get("set-cookie") ?? "");
  verifier("le cookie de session est effacé (navigateur)", coupe, true);
  verifier("le compte n'existe plus en base", Boolean(await ligneDuNuage("awa@exemple.cm")), false);
  const restes = await (await fetch(`${NUAGE}/rest/v1/appareils`)).json();
  verifier("son téléphone ne sonnera plus (appareil effacé)",
    restes.some((a) => a.jeton === JETON_TEL), false);
  const attribs = await (await fetch(`${NUAGE}/rest/v1/attributions`)).json();
  verifier("sa carte ne lui est plus attribuée", attribs.some((a) => a.utilisateur === ficheId), false);
  // LE JETON DÉJÀ DÉLIVRÉ — la seule chose qui reste dans le téléphone.
  for (const chemin of ["/api/donnees", "/api/actualite", "/api/bilan?jours=90",
    `/api/coordonnees/${ORANGE}`]) {
    verifier(`l'ancien jeton ne lit plus ${chemin}`, (await lire(chemin, jetonAwa)).status, 401);
  }
  const rMort = await supprimer(MDP, jetonAwa);
  verifier("l'ancien jeton ne supprime plus rien", rMort.status, 401);
  // LE 401 DU VERROU DIT DE QUOI IL S'AGIT — et dans la langue demandée.
  // Sans `raison: "session"`, le téléphone prenait ce refus pour « mot de
  // passe incorrect », gardait le jeton mort, et affichait « sign-in
  // required » à une personne qui lit le français.
  const cMort = await json(rMort);
  verifier("…en disant que c'est la session, pas le mot de passe",
    [cMort.raison, cMort.erreur], ["session", "connexion requise"]);
  verifier("la connexion est refusée",
    (await poste("/api/session", { courriel: "awa@exemple.cm", motdepasse: MDP })).status, 401);
  // UNE SUPPRESSION EFFACE, ELLE NE MARQUE PAS : l'adresse est de nouveau
  // libre, et le nouveau compte ne retrouve rien de l'ancien.
  const rRevient = await inscrire(personne("awa@exemple.cm"));
  const jetonRevient = (await json(rRevient)).jeton;
  verifier("la même adresse peut recréer un compte", rRevient.status, 200);
  verifier("…qui ne retrouve pas la carte de l'ancien",
    ((await json(await lire("/api/donnees", jetonRevient))).sims ?? []).length, 0);

  console.log("\nCEUX QUI NE SE SUPPRIMENT PAS PAR LÀ");
  const rProprio = await supprimer(MDP, jetonProprio);
  const mProprio = (await json(rProprio)).erreur ?? "";
  verifier("le propriétaire de la plateforme : refusé (403)", rProprio.status, 403);
  verifier("…avec une phrase qui dit pourquoi", /propriétaire/.test(mProprio), true);
  verifier("…et il est toujours là", (await lire("/api/comptes", jetonProprio)).status, 200);
  const rDemo = await poste("/api/session",
    { courriel: "examen@totemlabs.app", motdepasse: "TOTEM-Examen-2026" });
  const jetonDemo = (await json(rDemo)).jeton;
  verifier("TÉMOIN : la vitrine entre", rDemo.status, 200);
  const rSupDemo = await supprimer("TOTEM-Examen-2026", jetonDemo);
  verifier("la vitrine : refusée (403)", rSupDemo.status, 403);
  verifier("…avec une phrase", /démonstration/.test((await json(rSupDemo)).erreur ?? ""), true);
  verifier("…et elle entre toujours",
    (await poste("/api/session", { courriel: "examen@totemlabs.app",
      motdepasse: "TOTEM-Examen-2026" })).status, 200);
  const jetonSec = (await json(await poste("/api/session", { motdepasse: SECOURS }))).jeton;
  verifier("la clé de secours : refusée (403)", (await supprimer(SECOURS, jetonSec)).status, 403);

  // -------------------------------------------------------------------------
  console.log("\nCe qu'on ne dit pas à un inconnu, à la connexion");
  const rInconnu = await poste("/api/session", { courriel: "personne@exemple.cm", motdepasse: "x" });
  const rFaux = await poste("/api/session", { courriel: proprio, motdepasse: "faux" });
  verifier("compte inconnu : refusé", rInconnu.status, 401);
  verifier("mot de passe faux : refusé", rFaux.status, 401);
  verifier("le MÊME message dans les deux cas",
    (await json(rInconnu)).erreur === (await json(rFaux)).erreur, true);

  // -------------------------------------------------------------------------
  console.log("\nL'administration est réservée au propriétaire");
  const rAmi = await inscrire(personne("ami@exemple.cm", { prenom: "Ami" }));
  const jetonAmi = (await json(rAmi)).jeton;
  const idAmi = JSON.parse(await (await lire("/api/comptes", jetonProprio)).text())
    .comptes.find((c) => c.courriel === "ami@exemple.cm")?.id;
  verifier("sans session : refusé", (await fetch(B + "/api/comptes")).status, 401);
  verifier("un inscrit ne voit pas la liste des comptes",
    (await lire("/api/comptes", jetonAmi)).status, 403);
  verifier("il ne s'attribue aucune carte",
    (await poste("/api/comptes", { geste: "attribuer", id: idAmi, iccid: MTN }, avec(jetonAmi))).status, 403);
  verifier("il ne crée personne",
    (await poste("/api/comptes", { geste: "creer", prenom: "X", nom: "Y",
      courriel: "x@exemple.cm", motdepasse: MDP }, avec(jetonAmi))).status, 403);

  // SES NOTIFICATIONS, À SON NOM : le robot ne fait sonner un téléphone de
  // compte que pour les cartes qui lui sont attribuées (aucune, ici).
  const JETON_AMI = "ExponentPushToken[G0PZ1nT5bBRl8yQ2xKvJ_a]";
  verifier("il inscrit son téléphone",
    (await poste("/api/appareil", { jeton: JETON_AMI, plateforme: "android" }, avec(jetonAmi))).status, 200);
  const inscrits = await (await fetch(`${NUAGE}/rest/v1/appareils`)).json();
  verifier("…à SON nom, jamais à celui du propriétaire",
    inscrits.find((a) => a.jeton === JETON_AMI)?.utilisateur, idAmi);
  const rSonne = await poste("/api/essai-notification", {}, avec(jetonAmi));
  verifier("il ne fait pas sonner les téléphones des autres",
    rSonne.status === 200 ? (await json(rSonne)).appareils?.length ?? 0 : -1, 1);

  // L'essai de sonnerie a pu faire oublier ce téléphone (le faux guichet
  // d'Expo le dit désinstallé) : on en inscrit un second, qui reste, pour
  // que la cascade de la suppression ait quelque chose à effacer.
  const JETON_AMI2 = "ExponentPushToken[AmiSecondTelephone02]";
  verifier("il inscrit un second téléphone",
    (await poste("/api/appareil", { jeton: JETON_AMI2, plateforme: "ios" }, avec(jetonAmi))).status, 200);
  verifier("TÉMOIN : il est bien inscrit, à son nom",
    (await (await fetch(`${NUAGE}/rest/v1/appareils`)).json())
      .find((a) => a.jeton === JETON_AMI2)?.utilisateur, idAmi);

  console.log("\nLe propriétaire crée un compte lui-même");
  // L'autre chemin : un vendeur, posé par le propriétaire avec le mot de
  // passe qu'il lui transmet.
  const MDP2 = "un-autre-mot-de-passe-long";
  const rCree = await poste("/api/comptes",
    { geste: "creer", prenom: "Essai", nom: "Compte", courriel: "Vendeur@Boutique.COM", motdepasse: MDP2 },
    avec(jetonProprio));
  verifier("le propriétaire peut créer un compte", rCree.status, 201);
  const rNouveau = await poste("/api/session", { courriel: "vendeur@boutique.com", motdepasse: MDP2 });
  verifier("ce compte entre tout de suite", rNouveau.status, 200);
  verifier("mais il n'administre rien",
    (await lire("/api/comptes", (await json(rNouveau)).jeton)).status, 403);
  verifier("deux fois le même courriel : refusé (au propriétaire, on le dit)",
    (await poste("/api/comptes", { geste: "creer", prenom: "Essai", nom: "Compte",
      courriel: "vendeur@boutique.com", motdepasse: MDP2 }, avec(jetonProprio))).status, 409);

  console.log("\nLe propriétaire referme un compte");
  await poste("/api/comptes", { id: idAmi, geste: "fermer" }, avec(jetonProprio));
  verifier("le compte fermé ne rentre plus",
    (await poste("/api/session", { courriel: "ami@exemple.cm", motdepasse: MDP })).status, 403);
  // LE JETON DÉJÀ DÉLIVRÉ — la seule chose que l'intrus possède vraiment.
  for (const chemin of ["/api/donnees", "/api/bilan?jours=90", "/api/actualite"]) {
    verifier(`l'ancien jeton ne lit plus ${chemin}`, (await lire(chemin, jetonAmi)).status, 401);
  }
  // ROUVRIR DOIT ROUVRIR.
  await poste("/api/comptes", { id: idAmi, geste: "approuver" }, avec(jetonProprio));
  verifier("le même jeton rouvre après réouverture", (await lire("/api/donnees", jetonAmi)).status, 200);
  // SUPPRIMER N'EST PAS FERMER : les deux états de la base sont éprouvés.
  await poste("/api/comptes", { id: idAmi, geste: "supprimer" }, avec(jetonProprio));
  verifier("le jeton d'un compte supprimé par le propriétaire ne vaut rien",
    (await lire("/api/donnees", jetonAmi)).status, 401);
  verifier("…et ses téléphones sont partis avec lui",
    (await (await fetch(`${NUAGE}/rest/v1/appareils`)).json()).some((a) => a.jeton === JETON_AMI2), false);

  console.log("\nLa maison garde son propriétaire");
  const idMoi = JSON.parse(listeTexte).comptes.find((c) => c.courriel === proprio)?.id;
  verifier("le propriétaire ne se supprime pas par l'écran des comptes",
    (await poste("/api/comptes", { id: idMoi, geste: "supprimer" }, avec(jetonProprio))).status, 400);
  const avecSecours = avec(jetonSec);
  verifier("la clé de secours administre", (await lire("/api/comptes", jetonSec)).status, 200);
  verifier("mais ne supprime pas le propriétaire",
    (await poste("/api/comptes", { id: idMoi, geste: "supprimer" }, avecSecours)).status, 400);
  verifier("ni ne ferme son compte",
    (await poste("/api/comptes", { id: idMoi, geste: "fermer" }, avecSecours)).status, 400);
  verifier("une fausse clé ne passe pas",
    (await poste("/api/session", { motdepasse: "pas-la-cle" })).status, 401);
  // ET UNE INSCRIPTION NE DEVIENT JAMAIS PROPRIÉTAIRE, maintenant que la
  // maison en a un. C'est CELA que toute la course protégeait.
  const rPassant = await inscrire(personne("passant@internet.example"));
  const cPassant = await json(rPassant);
  verifier("un passant s'inscrit", rPassant.status, 200);
  verifier("mais il n'administre rien", (await lire("/api/comptes", cPassant.jeton)).status, 403);
  verifier("la base ne porte toujours qu'un propriétaire",
    (await (await fetch(`${NUAGE}/rest/v1/utilisateurs`)).json())
      .filter((u) => u.role === "proprietaire").length, 1);

  // LA CLÉ D'INTENTION — l'argent ne part pas deux fois.
  console.log("\nLa clé d'intention : un geste, une seule demande");
  const CODE = { code: "*126*1*677123456*5000#" };
  const commande = async (corps) =>
    (await poste("/api/commande", corps, avec(jetonProprio))).json().catch(() => ({}));
  const idem1 = await commande({ type: "ussd", parametres: CODE, cle: "essai-A" });
  const idem2 = await commande({ type: "ussd", parametres: CODE, cle: "essai-A" });
  verifier("le même geste ne crée qu'UNE demande", Boolean(idem1.id) && idem1.id === idem2.id, true);
  const idemAutre = await commande({ type: "ussd", parametres: CODE, cle: "essai-B" });
  verifier("un geste distinct garde sa demande", Boolean(idemAutre.id) && idemAutre.id !== idem1.id, true);

  console.log(echecs
    ? `\n✗ ${echecs} vérification(s) en échec.`
    : "\n✓ Les comptes tiennent : toutes les vérifications passent.");
} finally {
  try { process.kill(-serveur.pid, "SIGTERM"); } catch { /* déjà parti */ }
  nuage.kill();
}
process.exit(echecs ? 1 : 0);
