// LES CARTES DE CHACUN — VRAIMENT ESSAYÉES.
//
//     node scripts/verifier-les-cartes.mjs
//
// Il lance un faux Supabase et un vrai serveur, puis déroule ce que fait le
// propriétaire : il entre, crée le compte d'un vendeur (prénom, nom,
// courriel, mot de passe), lui confie UNE carte. Et il se met à la place du
// vendeur pour chercher ce qui FUIT :
//
//   · les SMS, les soldes, les cartes d'une carte qu'on ne lui a pas confiée —
//     par l'application, par les pages, par le bilan, par la pastille ;
//   · un reçu d'une autre carte, en devinant son numéro ;
//   · un lien signé de bilan, en réécrivant à qui il était destiné ;
//   · un compte qui se confierait des cartes lui-même ;
//   · une réponse qui ne nomme pas sa carte — l'application installée sur
//     les téléphones n'en nomme aucune après l'ouverture — et qui tomberait
//     dans la session qu'un autre parcourt sur une autre carte.
//
// LE TÉMOIN, D'ABORD : le propriétaire doit VOIR les deux cartes et leurs
// SMS. Sans lui, « le vendeur ne voit pas la carte MTN » et « le faux nuage
// n'a pas de carte MTN » se ressembleraient.
//
// Comme ses frères, il sert le code COMPILÉ : lancez « npx next build »
// avant, sans quoi il mesurerait l'application d'hier.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";

const MDP_PATRON = "le-mot-de-passe-du-patron";
const MDP_VENDEUR = "le-mot-de-passe-du-vendeur";
let adresse = 1;
// Une adresse d'origine neuve à chaque appel : le frein de la porte ne doit
// pas confondre ce scénario avec une attaque (il a son propre harnais).
const adresseNeuve = () => `10.88.${(adresse >> 8) & 255}.${adresse++ & 255}`;

const SECRET = "secret-d-essai-pour-les-cartes";
const SECOURS = "cle-de-secours-d-essai-cartes";
const PORT = 3171;
const NUAGE = 4979;
const B = `http://127.0.0.1:${PORT}`;
const MTN = "89237010000000008901";
const ORANGE = "89237020000000004432";

let echecs = 0;
function verifier(quoi, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(60)} ${JSON.stringify(obtenu)}`);
}

// UN SERVEUR DÉJÀ LÀ EST UN PIÈGE : les vérifications porteraient sur SON
// code. On refuse de commencer.
async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}
for (const port of [PORT, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé. Un essai précédent tourne`);
    console.error("  encore : ces vérifications porteraient sur SON code. Arrêtez-le.");
    process.exit(1);
  }
}

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  env: { ...process.env, PORT: String(NUAGE) }, stdio: "ignore",
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${NUAGE}`, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: SECOURS,
  },
  stdio: "ignore",
  // Son PROPRE groupe de processus : « npx » lance le vrai serveur en
  // dessous, et tuer « npx » seul le laissait vivant, port occupé — le
  // prochain essai aurait mesuré CE serveur-là. On tue le groupe entier.
  detached: true,
});

const avec = (jeton) => ({ authorization: `Bearer ${jeton}` });
const lire = (chemin, jeton) =>
  fetch(B + chemin, { headers: jeton ? avec(jeton) : {}, redirect: "manual" });
const page = (chemin, jeton) =>
  fetch(B + chemin, { headers: { cookie: `totem_session=${jeton}` }, redirect: "manual" });
const poste = (chemin, corps, jeton, entetes = {}) =>
  fetch(B + chemin, {
    method: "POST",
    headers: {
      "content-type": "application/json", "x-forwarded-for": adresseNeuve(),
      ...(jeton ? avec(jeton) : {}), ...entetes,
    },
    body: JSON.stringify(corps),
    redirect: "manual",
  });
const donnees = async (jeton) => (await lire("/api/donnees?sms=1000", jeton)).json();
const cartesDe = (d) => (d.sims ?? []).map((s) => s.iccid).sort();
const cartesDesSms = (d) => [...new Set((d.paiements ?? []).map((p) => p.carte))].sort();

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${NUAGE}/rest/v1/utilisateurs`)).ok) break; } catch { /* */ }
    await attendre(300);
  }
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + "/api/plateforme")).ok) break; } catch { /* */ }
    await attendre(500);
  }

  console.log("\nLE PROPRIÉTAIRE ENTRE");
  const patron = (await (await poste("/api/inscription",
    { courriel: "patron@essai.cm", motdepasse: MDP_PATRON })).json()).jeton;
  verifier("le premier compte est le propriétaire, et il entre", Boolean(patron), true);

  console.log("\nLE TÉMOIN : le propriétaire voit les deux cartes et leurs SMS");
  const tout = await donnees(patron);
  verifier("le propriétaire voit les deux cartes", cartesDe(tout), [MTN, ORANGE].sort());
  verifier("et les SMS des deux", cartesDesSms(tout), [MTN, ORANGE].sort());

  console.log("\nLE PROPRIÉTAIRE CRÉE UN VENDEUR");
  {
    const sansNom = await poste("/api/comptes",
      { geste: "creer", courriel: "anonyme@essai.cm", motdepasse: MDP_VENDEUR }, patron);
    verifier("sans prénom ni nom : refusé", sansNom.status, 400);
    const court = await poste("/api/comptes", { geste: "creer", prenom: "Jean", nom: "Mbarga",
      courriel: "court@essai.cm", motdepasse: "court" }, patron);
    verifier("un mot de passe trop court : refusé", court.status, 400);
    const r = await poste("/api/comptes", { geste: "creer", prenom: "Jean", nom: "Mbarga",
      courriel: "vendeur@essai.cm", motdepasse: MDP_VENDEUR }, patron);
    verifier("le propriétaire crée le compte du vendeur", r.status, 201);
  }
  const s = await poste("/api/session", { courriel: "vendeur@essai.cm", motdepasse: MDP_VENDEUR });
  verifier("le vendeur entre avec le mot de passe que le propriétaire a choisi", s.status, 200);
  const vendeur = (await s.json()).jeton;
  const fiche = (await (await lire("/api/comptes", patron)).json()).comptes
    .find((c) => c.courriel === "vendeur@essai.cm");
  verifier("la liste le nomme", [fiche?.prenom, fiche?.nom], ["Jean", "Mbarga"]);
  verifier("et ne laisse sortir aucune empreinte",
    JSON.stringify(fiche ?? {}).includes("pbkdf2"), false);
  const idVendeur = fiche?.id;

  console.log("\nSANS CARTE CONFIÉE, LE VENDEUR NE VOIT RIEN");
  {
    const d = await donnees(vendeur);
    verifier("aucune carte", cartesDe(d), []);
    verifier("aucun SMS", (d.paiements ?? []).length, 0);
    const a = await (await lire("/api/actualite", vendeur)).json();
    verifier("la pastille ne compte rien", [a.dernier, a.nonLus], [0, 0]);
  }

  console.log("\nLE PROPRIÉTAIRE LUI CONFIE LA CARTE ORANGE");
  {
    const r = await poste("/api/comptes", { geste: "attribuer", id: idVendeur, iccid: ORANGE }, patron);
    verifier("la carte est confiée", r.status, 200);
    const deux = await poste("/api/comptes", { geste: "attribuer", id: idVendeur, iccid: ORANGE }, patron);
    verifier("la confier deux fois n'est pas une erreur", deux.status, 200);
    const liste = await (await lire("/api/comptes", patron)).json();
    verifier("la liste des comptes le dit",
      liste.comptes.find((c) => c.id === idVendeur)?.cartes, [ORANGE]);
    verifier("le propriétaire n'a pas de liste : il voit tout",
      liste.comptes.find((c) => c.courriel === "patron@essai.cm")?.cartes, null);
  }

  console.log("\nLE VENDEUR NE VOIT QUE LA CARTE ORANGE — partout");
  {
    const d = await donnees(vendeur);
    verifier("l'application : une seule carte", cartesDe(d), [ORANGE]);
    verifier("l'application : les SMS de cette carte seulement", cartesDesSms(d), [ORANGE]);
    verifier("aucun SMS MTN ne passe dans le texte",
      JSON.stringify(d).includes("NKENGAFAC"), false);

    for (const chemin of ["/", "/encaissements", "/cartes", "/analyse"]) {
      const html = await (await page(chemin, vendeur)).text();
      verifier(`la page ${chemin} ne montre rien de la carte MTN`,
        html.includes("NKENGAFAC") || html.includes("8901"), false);
    }
    const accueil = await (await page("/", vendeur)).text();
    verifier("l'accueil montre bien la carte Orange", accueil.includes("4432"), true);

    const bilan = await (await lire("/api/bilan?jours=90", vendeur)).text();
    verifier("le bilan ne porte que la carte Orange",
      [bilan.includes(ORANGE), bilan.includes(MTN)], [true, false]);
  }

  console.log("\nLE VENDEUR CHERCHE CE QUI N'EST PAS À LUI");
  {
    // Le reçu du faux nuage est celui d'un encaissement MTN : son numéro se
    // devine (TM-…-0003, 0004…).
    const recu = "TM-20250829-0003";
    verifier("un reçu MTN : refusé", (await lire(`/api/recu/${recu}`, vendeur)).status, 404);
    verifier("son lien signé : refusé", (await lire(`/api/recu/${recu}/lien`, vendeur)).status, 404);
    verifier("sa fiche : muette",
      (await (await lire(`/api/recu/${recu}/fiche`, vendeur)).json()).etabliLe, null);
    verifier("le propriétaire, lui, l'atteint (témoin)",
      (await lire(`/api/recu/${recu}/fiche`, patron)).status, 200);
    verifier("les coordonnées de la carte MTN : refusées",
      (await lire(`/api/coordonnees/${MTN}`, vendeur)).status, 404);
    verifier("leur lien signé : refusé",
      (await lire(`/api/coordonnees/${MTN}/lien`, vendeur)).status, 404);
    verifier("les coordonnées de SA carte : servies",
      (await lire(`/api/coordonnees/${ORANGE}`, vendeur)).status, 200);

    const se = await poste("/api/comptes", { geste: "attribuer", id: idVendeur, iccid: MTN }, vendeur);
    verifier("il ne peut pas se confier une carte", se.status, 403);
    const liste = await lire("/api/comptes", vendeur);
    verifier("ni lire la liste des comptes", liste.status, 403);
    const console_ = await page("/console/gens", vendeur);
    verifier("ni entrer dans la console", console_.status, 307);
  }

  console.log("\nSA CARTE EST LA SIENNE : IL Y TRAVAILLE");
  {
    // UNE CARTE CONFIÉE EST UNE CARTE DONNÉE. Le vendeur ne fait pas que
    // regarder la carte Orange : il compose, répond au menu, établit ses
    // reçus. Rien de tout cela ne doit déborder sur la MTN.
    const commande = async (corps, jeton) => {
      const r = await poste("/api/commande", corps, jeton);
      return { statut: r.status, id: r.ok ? (await r.json()).id : null };
    };
    const ouvre = await commande(
      { type: "ussd", parametres: { code: "#150#", carte: ORANGE } }, vendeur);
    verifier("il compose sur SA carte", ouvre.statut, 200);
    verifier("il lit la réponse de l'opérateur",
      (await lire(`/api/commande/${ouvre.id}`, vendeur)).status, 200);
    verifier("il répond au menu de SA carte",
      (await commande({ type: "ussd_reponse", parametres: { texte: "1", carte: ORANGE } },
                      vendeur)).statut, 200);

    // L'APPLICATION D'AVANT, celle qui est installée sur les téléphones :
    // elle nomme la carte en ouvrant, et plus ensuite. Le guichet refusait
    // alors au titulaire son propre code secret — « cette carte ne vous a
    // pas été confiée », sur SA carte. La carte d'une réponse, c'est celle
    // de la session où elle tombe.
    const brute = async (id) => (await (await fetch(
      `http://127.0.0.1:${NUAGE}/rest/v1/commandes?id=eq.${id}`)).json())[0]?.parametres ?? {};
    const sansCarte = await commande(
      { type: "ussd_reponse", parametres: { texte: "2" } }, vendeur);
    verifier("l'application d'avant répond sans nommer la carte : passe",
      sansCarte.statut, 200);
    verifier("…et la demande porte la carte de SA session",
      (await brute(sansCarte.id)).carte, ORANGE);
    const code = await commande(
      { type: "ussd_reponse", parametres: { texte: "1234", secret: true } }, vendeur);
    verifier("il tape SON code secret, sans nommer la carte : passe", code.statut, 200);
    // Le robot efface le code dès qu'il l'a lu. S'il effaçait la carte avec,
    // le titulaire ne pourrait plus lire la réponse du réseau — l'argent
    // serait parti sans qu'il le sache.
    let lu = null;
    for (let i = 0; i < 20 && lu?.etat !== "faite"; i++) {
      await attendre(250);
      const r = await lire(`/api/commande/${code.id}`, vendeur);
      lu = r.ok ? await r.json() : { statut: r.status };
    }
    verifier("il lit la réponse à SON code secret", lu?.etat, "faite");
    verifier("le code s'est effacé, la carte est restée",
      await brute(code.id), { secret: true, carte: ORANGE });
    verifier("l'application d'avant raccroche sans nommer la carte : passe",
      (await commande({ type: "ussd_fin" }, vendeur)).statut, 200);
    verifier("il raccroche SA session",
      (await commande({ type: "ussd_fin", parametres: { carte: ORANGE } }, vendeur)).statut, 200);
    verifier("il actualise", (await commande({ type: "solde" }, vendeur)).statut, 200);
    verifier("il renomme SA carte",
      (await commande({ type: "identite", parametres: { iccid: ORANGE, nom: "Boutique" } },
                      vendeur)).statut, 200);
    verifier("il établit le reçu d'un SMS de SA carte",
      (await commande({ type: "recu", parametres: { source_id: 2 }, terminal: "douala-faux" },
                      vendeur)).statut, 200);
    verifier("il classe un SMS de SA carte (le verrou le laisse passer)",
      (await poste("/api/nature", { id: 2, nature: "retrait" }, vendeur)).status !== 403, true);

    // SON CARNET DE BÉNÉFICIAIRES : il suit la carte.
    const carnet = (corps, jeton) => poste("/api/beneficiaires", corps, jeton);
    verifier("il enregistre un bénéficiaire sur SA carte",
      (await carnet({ geste: "enregistrer", carte: ORANGE, numero: "237 677 99 88 77", nom: "Maman" },
                    vendeur)).status, 200);
    verifier("le propriétaire en enregistre un sur la MTN (témoin)",
      (await carnet({ geste: "enregistrer", carte: MTN, numero: "699000111", nom: "Fournisseur" },
                    patron)).status, 200);
    const sesBenef = (await donnees(vendeur)).beneficiaires ?? [];
    verifier("il retrouve le sien, numéro rangé sans 237",
      sesBenef.map((b) => [b.nom, b.numero]), [["Maman", "677998877"]]);
    const tousBenef = (await donnees(patron)).beneficiaires ?? [];
    verifier("le propriétaire voit les deux carnets (témoin)", tousBenef.length, 2);
    const leSien = sesBenef[0]?.id;
    const celuiDuPatron = tousBenef.find((b) => b.carte === MTN)?.id;
    verifier("il renomme le sien",
      (await carnet({ geste: "renommer", id: leSien, nom: "Maman Douala" }, vendeur)).status, 200);

    console.log("\n…ET RIEN SUR LA CARTE D'UN AUTRE");
    verifier("enregistrer un bénéficiaire sur la MTN : refusé",
      (await carnet({ geste: "enregistrer", carte: MTN, numero: "677000000", nom: "Piege" },
                    vendeur)).status, 403);
    verifier("renommer celui du propriétaire : introuvable",
      (await carnet({ geste: "renommer", id: celuiDuPatron, nom: "Piege" }, vendeur)).status, 404);
    verifier("le supprimer : introuvable",
      (await carnet({ geste: "supprimer", id: celuiDuPatron }, vendeur)).status, 404);
    verifier("le carnet MTN n'a pas bougé (témoin)",
      ((await donnees(patron)).beneficiaires ?? []).find((b) => b.id === celuiDuPatron)?.nom,
      "Fournisseur");
    verifier("composer sur la MTN : refusé",
      (await commande({ type: "ussd", parametres: { code: "*126#", carte: MTN } }, vendeur)).statut, 403);
    verifier("composer sans dire sur quelle carte : refusé",
      (await commande({ type: "ussd", parametres: { code: "*126#" } }, vendeur)).statut, 403);
    verifier("répondre dans une session MTN : refusé",
      (await commande({ type: "ussd_reponse", parametres: { texte: "1234", secret: true, carte: MTN } },
                      vendeur)).statut, 403);
    verifier("raccrocher la session MTN : refusé",
      (await commande({ type: "ussd_fin", parametres: { carte: MTN } }, vendeur)).statut, 403);
    verifier("renommer la MTN : refusé",
      (await commande({ type: "identite", parametres: { iccid: MTN, nom: "Piege" } },
                      vendeur)).statut, 403);
    verifier("le reçu d'un SMS MTN : refusé",
      (await commande({ type: "recu", parametres: { source_id: 3 }, terminal: "douala-faux" },
                      vendeur)).statut, 403);
    verifier("reclasser un SMS MTN : refusé",
      (await poste("/api/nature", { id: 3, nature: "retrait" }, vendeur)).status, 403);
    verifier("marquer lu un SMS MTN : refusé",
      (await poste("/api/lu", { id: 3 }, vendeur)).status, 403);
    verifier("réécrire le carnet des boutons : au propriétaire seul",
      (await commande({ type: "raccourci", parametres: { operateur: "Orange", cle: "depot",
        etapes: ["#150#"], action: "definir" } }, vendeur)).statut, 403);
    // Le propriétaire compose sur la MTN : le vendeur énumère les numéros de
    // commande et tombe dessus. Elle n'existe pas pour lui — la réponse de
    // l'opérateur y porte un solde, un nom, et ce qu'on y a tapé.
    const sienne = await commande(
      { type: "ussd", parametres: { code: "*126#", carte: MTN } }, patron);
    verifier("le propriétaire compose sur la MTN (témoin)", sienne.statut, 200);
    verifier("le vendeur ne lit pas la commande du propriétaire",
      (await lire(`/api/commande/${sienne.id}`, vendeur)).status, 404);
    verifier("le propriétaire, lui, la lit (témoin)",
      (await lire(`/api/commande/${sienne.id}`, patron)).status, 200);

    // La session ouverte est maintenant celle du propriétaire, sur la MTN.
    // Une réponse sans carte prend celle de la session — donc la MTN — et
    // le vendeur ne la tient pas. Sans ce refus, son chiffre tomberait dans
    // le menu que le propriétaire est en train de parcourir.
    verifier("répondre sans carte dans la session MTN : refusé",
      (await commande({ type: "ussd_reponse", parametres: { texte: "1" } }, vendeur)).statut, 403);
    verifier("y taper un code secret sans carte : refusé",
      (await commande({ type: "ussd_reponse", parametres: { texte: "1234", secret: true } },
                      vendeur)).statut, 403);
    verifier("la raccrocher sans carte : refusé",
      (await commande({ type: "ussd_fin" }, vendeur)).statut, 403);
    const duPatron = await commande(
      { type: "ussd_reponse", parametres: { texte: "1" } }, patron);
    verifier("la réponse du propriétaire sans carte prend celle de SA session",
      (await brute(duPatron.id)).carte, MTN);
    // Une ouverture qui ne nomme aucune carte ne prête la sienne à personne :
    // on ne remonte pas chercher une session plus ancienne.
    verifier("le propriétaire compose sans nommer la carte (témoin)",
      (await commande({ type: "ussd", parametres: { code: "#150#" } }, patron)).statut, 200);
    verifier("répondre sans carte quand aucune ne se retrouve : refusé",
      (await commande({ type: "ussd_reponse", parametres: { texte: "1" } }, vendeur)).statut, 403);
  }

  console.log("\nLE LIEN SIGNÉ DU BILAN DIT POUR QUI IL A ÉTÉ FAIT");
  {
    const { url } = await (await lire("/api/bilan/lien?jours=90", vendeur)).json();
    const lien = new URL(url);
    verifier("le lien nomme le vendeur, pas « tout »", lien.searchParams.get("q"), `c${idVendeur}`);
    const sans = await fetch(`${B}${lien.pathname}${lien.search}`);
    const csv = await sans.text();
    verifier("ouvert sans session, il ne rend que la carte Orange",
      [sans.status, csv.includes(ORANGE), csv.includes(MTN)], [200, true, false]);
    lien.searchParams.set("q", "tout");
    const triche = await fetch(`${B}${lien.pathname}${lien.search}`, { redirect: "manual" });
    verifier("réécrit en « tout », il n'ouvre plus rien", triche.status, 401);
    const { url: url2 } = await (await lire("/api/bilan/lien?jours=90", patron)).json();
    const csv2 = await (await fetch(url2)).text();
    verifier("celui du propriétaire porte les deux cartes (témoin)",
      [csv2.includes(ORANGE), csv2.includes(MTN)], [true, true]);
  }

  console.log("\nCE QUE LA RÈGLE REFUSE");
  {
    const p = await poste("/api/comptes", { geste: "attribuer", id: 1, iccid: MTN }, patron);
    verifier("confier une carte au propriétaire : inutile, refusé", p.status, 400);
    const x = await poste("/api/comptes",
      { geste: "attribuer", id: idVendeur, iccid: "89000000000000000000" }, patron);
    verifier("confier une carte que la maison ne connaît pas : refusé", x.status, 404);
    const f = await poste("/api/comptes",
      { geste: "attribuer", id: idVendeur, iccid: "8923'--" }, patron);
    verifier("un ICCID mal formé : refusé", f.status, 400);
  }

  console.log("\nREPRENDRE LA CARTE, FERMER LA PORTE");
  {
    await poste("/api/comptes", { geste: "retirer", id: idVendeur, iccid: ORANGE }, patron);
    verifier("la carte reprise ne se voit plus — avec le même jeton",
      cartesDe(await donnees(vendeur)), []);
    await poste("/api/comptes", { geste: "attribuer", id: idVendeur, iccid: ORANGE }, patron);
    await poste("/api/comptes", { geste: "fermer", id: idVendeur }, patron);
    verifier("un compte fermé n'entre plus", (await lire("/api/donnees", vendeur)).status, 401);
    await poste("/api/comptes", { geste: "approuver", id: idVendeur }, patron);
  }

  console.log("\nSUPPRIMER LE COMPTE EMPORTE SES CARTES");
  {
    await poste("/api/comptes", { geste: "supprimer", id: idVendeur }, patron);
    const restes = await (await fetch(
      `http://127.0.0.1:${NUAGE}/rest/v1/attributions?utilisateur=eq.${idVendeur}`)).json();
    verifier("aucune attribution ne survit au compte", restes.length, 0);
    verifier("son jeton n'ouvre plus rien", (await lire("/api/donnees", vendeur)).status, 401);
  }
} finally {
  try { process.kill(-serveur.pid, "SIGTERM"); } catch { serveur.kill(); }
  nuage.kill();
}

console.log("");
if (echecs) {
  console.log(`✗ ${echecs} vérification(s) en échec.`);
  process.exit(1);
}
console.log("✓ Chacun ne voit que ses cartes — essayé, pas supposé.");
process.exit(0);
