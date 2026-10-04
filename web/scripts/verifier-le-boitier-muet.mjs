// LE BOÎTIER QUI SE TAIT — ce que la plateforme en dit, et ce qu'elle refuse
// de faire en son nom.
//
//     node scripts/verifier-le-boitier-muet.mjs
//
// Une coupure de courant de dix minutes à la boutique, et la plateforme
// déclarait TOUTES les cartes « retirées » : l'accueil faisait disparaître
// les gestes, Comptes rangeait chaque carte sous « Cartes retirées ». Une
// demande déposée pendant le silence restait « en attente », et le boîtier,
// revenu des heures plus tard, la composait — numéro et montant compris —
// pour un écran qui avait abandonné depuis longtemps. Personne ne pouvait le
// voir : dans le faux nuage, le boîtier ne se taisait jamais.
//
// Le harnais monte la FLOTTE (FAUX_FLOTTE=1 : douala-faux et akwa-faux), fait
// taire un boîtier (« /essai/taire »), règle l'allure du robot joué
// (« /essai/robot » : pause, lent, normal), puis exige :
//
//   · LE SEUIL : un boîtier vu il y a quatre minutes parle encore — cinq
//     minutes, pas trois — et l'âge voyage en secondes, avec l'instant ;
//   · MUET ONZE MINUTES : aucune carte « retirée », ni dans les données, ni
//     sur la page Comptes, ni dans les réglages ; chaque carte jugée d'après
//     SON boîtier ;
//   · RIEN NE PART vers un boîtier qui se tait — même quand l'écran nomme un
//     autre boîtier, même sans carte ;
//   · L'ANNULATION : une demande que le robot n'a pas prise ne part plus ;
//     une demande qu'il a prise n'est JAMAIS dite annulée ; on n'annule que
//     les siennes ;
//   · LE SIGNAL « 99 » devient inconnu ; l'heure d'un solde vide reste vide ;
//   · UN SIGNAL FAIBLE se dit pareil partout : la carte que l'accueil
//     dessine d'une seule barre porte le point ORANGE sur la page Comptes ;
//   · LA LANGUE DE L'ÉCRAN : le refus et l'annulation parlent la langue que
//     le téléphone demande (« ?langue=fr »), pas celle d'un cookie qu'il n'a
//     pas ;
//   · UN GESTE REJOUÉ pendant que le boîtier se tait retrouve SA demande
//     (même clé), au lieu de s'entendre dire « rien n'est parti » ;
//   · CHAQUE CARTE PORTE L'ÉTAT DE SON BOÎTIER (`boitierMuet`,
//     `boitierVuLe`) — pas celui du boîtier montré en tête : deux boîtiers,
//     l'un muet, et la carte du muet le dit, avec SON heure ;
//   · L'ANNULATION SANS RELECTURE : si la plateforme ne peut pas relire la
//     demande pour en effacer le code secret, elle n'annule pas — et une
//     base à jour efface le code d'elle-même en fermant la demande ;
//   · UN TOUR DE TRANSMISSION RATÉ : signe de vie frais, cartes vues 3 min
//     10 s avant lui par un boîtier qui parle depuis longtemps — « en
//     place » ou « inconnue », jamais « retirée » ;
//   · LE RETOUR : le signe de vie revient AVANT les cartes — aucune n'est
//     dite retirée tant qu'il ne les a pas republiées ;
//   · UN BOÎTIER QUI NE VOIT PLUS AUCUNE CARTE : retirée une fois le délai de
//     relecture passé, « inconnue » sur une base qui ne sait pas dire depuis
//     quand il est revenu (c'est écrit, pas caché) ;
//   · L'HORLOGE DU PI EN RETARD : le silence se mesure sur l'heure de la
//     base — et sur une base d'avant, on dit ce qui se passe : refusé ;
//   · UN BOÎTIER SORTI DE LA FLOTTE : ses cartes sont retirées, pas
//     « inconnues » pour toujours.
//
// CHAQUE EXIGENCE A SON TÉMOIN, calculé sur les lignes BRUTES que le faux
// nuage sert : l'ancienne règle (« vue il y a moins de dix minutes », « muet
// au-delà de trois minutes », le signal recopié, « solde_maj ?? maj »), et le
// robot qu'on laisse composer sans annuler. Si un témoin ne tombait pas dans
// le piège, le scénario ne serait pas monté, et le reste ne prouverait rien.
//
// Comme ses frères, il sert le code COMPILÉ : lancez « npx next build »
// avant, sans quoi il mesurerait l'application d'hier.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";

const SECRET = "secret-d-essai-pour-le-boitier-muet";
const SECOURS = "cle-de-secours-d-essai-boitier-muet";
const PORT = 3192;
const NUAGE = 4986;
const B = `http://127.0.0.1:${PORT}`;
const N = `http://127.0.0.1:${NUAGE}`;
const MTN_DOUALA = "89237010000000008901";
const ORANGE_DOUALA = "89237020000000004432";
const RETIREE = "89237020000000007777";        // à Douala, plus vue depuis 90 min
const MTN_AKWA = "89237010000000009999";
const DE_DOUALA = [MTN_DOUALA, ORANGE_DOUALA, RETIREE];
const MIN = 60_000;

let echecs = 0;
function verifier(quoi, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(70)} ${JSON.stringify(obtenu)}`);
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
  env: { ...process.env, PORT: String(NUAGE), FAUX_FLOTTE: "1" }, stdio: "ignore",
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: N, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: SECOURS,
  },
  stdio: "ignore",
  // Son PROPRE groupe de processus : tuer « npx » seul laisse le vrai
  // serveur vivant, port occupé. On tue le groupe entier.
  detached: true,
});

let adresse = 1;
const poste = (chemin, corps, jeton) =>
  fetch(B + chemin, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.78.0.${adresse++ & 255}`,
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify(corps ?? {}),
  });
const lireApi = async (chemin, jeton) =>
  (await fetch(B + chemin, { headers: { authorization: `Bearer ${jeton}` } })).json();
const page = async (chemin, cookie) =>
  (await fetch(B + chemin, { headers: { cookie: `totem_session=${cookie}; totem_langue=fr` } }))
    .text();

/** Ce que le faux nuage porte VRAIMENT — pas ce que la plateforme en dit. */
const brut = async (table, filtre = "") =>
  (await fetch(`${N}/rest/v1/${table}?select=*${filtre}`)).json();
const commandeBrute = async (id) =>
  (await (await fetch(`${N}/rest/v1/commandes?id=eq.${id}`)).json())[0] ?? null;
const nombreDeCommandes = async () => {
  let n = 0;
  for (let id = 1; ; id++) {
    if (!(await commandeBrute(id))) return n;
    n++;
  }
};
const essai = (chemin) => fetch(`${N}/essai/${chemin}`, { method: "POST" });
const taire = (terminal, minutes) => essai(`taire?terminal=${terminal}&minutes=${minutes}`);
const reveiller = (terminal, cartes) =>
  essai(`reveiller?terminal=${terminal}${cartes ? `&cartes=${cartes}` : ""}`);
const allure = (a) => essai(`robot?allure=${a}`);

/** Dépose une demande ; rend le statut, l'erreur, la raison, et la ligne du
 *  NUAGE (son terminal, son état). `langue` : comme le téléphone la dit,
 *  dans l'adresse. */
async function deposer(corps, jeton, langue) {
  const r = await poste(`/api/commande${langue ? `?langue=${langue}` : ""}`, corps, jeton);
  const rendu = await r.json().catch(() => ({}));
  const ligne = rendu.id ? await commandeBrute(rendu.id) : null;
  return { statut: r.status, id: rendu.id ?? null, erreur: rendu.erreur ?? "",
           raison: rendu.raison ?? null, terminal: ligne?.terminal ?? null };
}
const annuler = async (id, jeton, langue) => {
  const r = await poste(
    `/api/commande/${id}/annuler${langue ? `?langue=${langue}` : ""}`, {}, jeton);
  return { statut: r.status, ...(await r.json().catch(() => ({}))) };
};
async function attendreEtat(id, etat, ms = 6000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if ((await commandeBrute(id))?.etat === etat) return true;
    await attendre(100);
  }
  return false;
}

// Deux instants « égaux » : le faux nuage recalcule ses heures à chaque
// lecture (« il y a 30 min » glisse d'une lecture à l'autre).
const proche = (a, b) => typeof a === "string" && typeof b === "string"
  && Math.abs(Date.parse(a) - Date.parse(b)) < 5000;

// LE POINT DU SIGNAL, sur la page Comptes : force → classe de couleur, lue
// dans le HTML que la plateforme a VRAIMENT rendu (« 9/31 » suit son point).
const POINT = /(<span class="size-1\.5 rounded-full )([^"]*?)("\s*><\/span>(?:<!-- -->)?)(\d+)\/31/g;
const pointsDuSignal = (html) =>
  new Map([...html.matchAll(POINT)].map((m) => [Number(m[4]), m[2].trim()]));
/** La même page, chaque point recoloré par une AUTRE expression — celle
 *  d'avant : le contrôle doit la prendre en défaut. */
const recolorer = (html, couleur) =>
  html.replace(POINT, (_, avant, _c, apres, n) => `${avant}${couleur(Number(n))}${apres}${n}/31`);
/** Les barres de l'accueil : la force annoncée, et combien sont pleines. */
function barresDeLAccueil(html) {
  const m = /aria-label="Signal (\d+)\/31"[^>]*>((?:<span[^>]*><\/span>){4})/.exec(html);
  return m ? { force: Number(m[1]), pleines: (m[2].match(/bg-white\/90/g) ?? []).length } : null;
}

// LES ANCIENNES RÈGLES — les témoins, réécrits ici en une ligne chacun.
const ancienneEnPlace = (derniereVue) => Date.now() - Date.parse(derniereVue) < 10 * MIN;
const ancienEnLigne = (vuLe) => Date.now() - Date.parse(vuLe) < 3 * MIN;

const MUET_FR = "Le boîtier de la boutique ne donne plus de nouvelles : rien n’est parti.";
const MUET_EN = "The shop's box has stopped checking in: nothing was sent.";
const RETIREES = /Cartes retirées|Removed cards/;
const AUCUNE = /Aucune carte dans le terminal|No card in the terminal/;
const SANS_NOUVELLES = /Pas de nouvelles récentes de cette carte/;

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${N}/rest/v1/utilisateurs`)).ok) break; } catch { /* */ }
    await attendre(300);
  }
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + "/api/plateforme")).ok) break; } catch { /* */ }
    await attendre(500);
  }

  const IDENTIFIANTS = { courriel: "patron@boutique.cm", motdepasse: "le-mot-de-passe-du-patron" };
  const patron = (await (await poste("/api/inscription", IDENTIFIANTS)).json()).jeton;
  const rc = await poste("/api/connexion", IDENTIFIANTS);
  const cookie = /totem_session=([^;]+)/.exec(rc.headers.get("set-cookie") ?? "")?.[1];
  verifier("le propriétaire entre, au téléphone et au navigateur",
    [Boolean(patron), Boolean(cookie)], [true, true]);
  const sims = async () => Object.fromEntries(
    ((await lireApi("/api/donnees?sms=0&recus=0", patron)).sims ?? [])
      .map((s) => [s.iccid, s]));

  console.log("\nLE TÉMOIN : QUAND LE BOÎTIER PARLE, LA RÈGLE SAIT DIRE « RETIRÉE »");
  {
    const s = await sims();
    verifier("Orange ·7777, plus vue depuis 90 min par un boîtier vivant : retirée",
      [s[RETIREE]?.presence, s[RETIREE]?.enPlace], ["retiree", false]);
    verifier("MTN ·8901, vue à l'instant : en place",
      [s[MTN_DOUALA]?.presence, s[MTN_DOUALA]?.enPlace], ["en_place", true]);
    verifier("la page Comptes range la carte retirée sous « Cartes retirées »",
      RETIREES.test(await page("/cartes", cookie)), true);
    verifier("les réglages la disent retirée",
      /retirée le/.test(await page("/reglages", cookie)), true);
  }

  console.log("\nLE SEUIL : CINQ MINUTES SANS NOUVELLES, PAS TROIS");
  {
    await taire("akwa-faux", 4);
    await taire("douala-faux", 11);
    const brutAkwa = (await brut("terminaux", "&id=eq.akwa-faux"))[0];
    verifier("LE TÉMOIN : l'ancienne règle (3 min) dit muet un boîtier vu il y a 4 min",
      ancienEnLigne(brutAkwa.vu_le), false);
    const d = await lireApi("/api/donnees?sms=0&recus=0", patron);
    verifier("le terminal montré est le plus récent : akwa-faux", d.terminal?.id, "akwa-faux");
    verifier("vu il y a 4 min : il parle encore", d.terminal?.enLigne, true);
    verifier("l'instant voyage : l'heure où la BASE l'a entendu",
      proche(d.terminal?.vuLe, brutAkwa.entendu_le), true);
    verifier("l'âge, en secondes, mesuré par la plateforme (≈ 240)",
      Math.abs((d.terminal?.vuIlYa ?? -1) - 240) <= 3, true);
    const ecart = (Date.parse(d.serveurA) - Date.parse(d.terminal?.vuLe)) / 1000;
    verifier("l'heure de la réponse, sur la même horloge que l'âge",
      Math.abs(ecart - d.terminal?.vuIlYa) <= 2, true);
    const s = Object.fromEntries(d.sims.map((x) => [x.iccid, x]));
    verifier("chaque carte jugée d'après SON boîtier : Akwa en place, Douala inconnue",
      [s[MTN_AKWA]?.presence, s[MTN_DOUALA]?.presence], ["en_place", "inconnue"]);
    await taire("akwa-faux", 6);
    const d6 = await lireApi("/api/donnees?sms=0&recus=0", patron);
    verifier("vu il y a 6 min : sans nouvelles", [d6.terminal?.enLigne, d6.terminal?.vuIlYa >= 360],
      [false, true]);
    await reveiller("akwa-faux");
    await reveiller("douala-faux");
  }

  console.log("\nBOÎTIER MUET ONZE MINUTES : AUCUNE CARTE N'EST DITE RETIRÉE");
  {
    await taire("douala-faux", 11);
    const cartes = (await brut("cartes")).filter((c) => DE_DOUALA.includes(c.iccid));
    verifier("LE TÉMOIN : l'ancienne règle déclare retirées les trois cartes de Douala",
      cartes.map((c) => ancienneEnPlace(c.derniere_vue)), [false, false, false]);
    const s = await sims();
    verifier("ses trois cartes : présence inconnue",
      DE_DOUALA.map((i) => s[i]?.presence), ["inconnue", "inconnue", "inconnue"]);
    verifier("et toujours « en place » pour les applications d'avant",
      DE_DOUALA.map((i) => s[i]?.enPlace), [true, true, true]);
    verifier("aucune carte retirée, nulle part",
      Object.values(s).filter((x) => x.presence === "retiree" || !x.enPlace).length, 0);
    verifier("la carte d'Akwa, dont le boîtier parle, reste en place",
      s[MTN_AKWA]?.presence, "en_place");
    const comptes = await page("/cartes", cookie);
    verifier("la page Comptes n'a pas de « Cartes retirées »", RETIREES.test(comptes), false);
    verifier("ni « Aucune carte dans le terminal »", AUCUNE.test(comptes), false);
    verifier("elle dit que le boîtier ne donne plus de nouvelles", SANS_NOUVELLES.test(comptes), true);
    verifier("les réglages ne disent plus « retirée le »",
      /retirée le/.test(await page("/reglages", cookie)), false);
    const qui = await lireApi("/api/comptes", patron);
    verifier("la liste des cartes à confier n'en marque aucune absente",
      (qui.cartes ?? []).filter((c) => !c.enPlace).length, 0);
    await reveiller("douala-faux");
  }

  console.log("\nCHAQUE CARTE PORTE L'ÉTAT DE SON BOÎTIER, PAS CELUI DU BOÎTIER MONTRÉ");
  {
    await taire("douala-faux", 11);
    const d = await lireApi("/api/donnees?sms=0&recus=0", patron);
    const s = Object.fromEntries((d.sims ?? []).map((x) => [x.iccid, x]));
    const douala = (await brut("terminaux", "&id=eq.douala-faux"))[0];
    const akwa = (await brut("terminaux", "&id=eq.akwa-faux"))[0];
    // LE TÉMOIN : l'écran qui lisait le boîtier d'EN TÊTE — le dernier
    // entendu — disait la carte de Douala « en ligne », ou la datait de
    // l'heure d'Akwa.
    verifier("LE TÉMOIN : le boîtier montré en tête est Akwa, qui parle",
      [d.terminal?.id, d.terminal?.enLigne], ["akwa-faux", true]);
    verifier("LE TÉMOIN : son heure n'est pas celle de Douala",
      proche(d.terminal?.vuLe, douala.entendu_le), false);
    verifier("les cartes de Douala : leur boîtier se tait",
      DE_DOUALA.map((i) => s[i]?.boitierMuet), [true, true, true]);
    verifier("…depuis SON heure à lui, celle où la base l'a entendu",
      DE_DOUALA.map((i) => proche(s[i]?.boitierVuLe, douala.entendu_le)), [true, true, true]);
    verifier("la carte d'Akwa : son boîtier parle, avec SON heure",
      [s[MTN_AKWA]?.boitierMuet, proche(s[MTN_AKWA]?.boitierVuLe, akwa.entendu_le)], [false, true]);
    // « inconnue » ne veut pas dire « il se tait » : il vient de revenir, et
    // n'a pas encore republié ses cartes. Rien ne doit se mettre en pause.
    await reveiller("douala-faux", "plus-tard");
    const r = Object.fromEntries(((await lireApi("/api/donnees?sms=0&recus=0", patron)).sims ?? [])
      .map((x) => [x.iccid, x]));
    verifier("revenu, cartes pas encore relues : « inconnue », mais son boîtier PARLE",
      [r[MTN_DOUALA]?.presence, r[MTN_DOUALA]?.boitierMuet], ["inconnue", false]);
    await essai("cartes?terminal=douala-faux");
    // Une carte dont on ne connaît pas le boîtier n'en dit rien.
    await essai("carte-sans-boitier?iccid=89237010000000005555");
    const x = await sims();
    verifier("une carte sans boîtier connu : ni « muet », ni heure",
      [Boolean(x["89237010000000005555"]), "boitierMuet" in (x["89237010000000005555"] ?? {}),
       "boitierVuLe" in (x["89237010000000005555"] ?? {})], [true, false, false]);
    await essai("carte-sans-boitier?iccid=89237010000000005555&annuler=1");
  }

  console.log("\nRIEN NE PART VERS UN BOÎTIER QUI SE TAIT");
  {
    await taire("douala-faux", 6);
    const ligne = (await brut("cartes", `&iccid=eq.${MTN_DOUALA}`))[0];
    verifier("LE TÉMOIN : muet depuis 6 min, l'ancienne règle tenait la carte en place",
      ancienneEnPlace(ligne.derniere_vue), true);
    const avant = await nombreDeCommandes();
    const d = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } },
      patron, "fr");
    verifier("un code sur MTN ·8901 est refusé (409)", [d.statut, d.raison], [409, "boitier_muet"]);
    verifier("et le refus le dit en clair, dans la langue de l'écran", d.erreur, MUET_FR);
    const t = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA },
      terminal: "akwa-faux" }, patron);
    verifier("même quand l'écran nomme un boîtier vivant (le téléphone d'hier)",
      [t.statut, t.raison], [409, "boitier_muet"]);
    const secret = await deposer({ type: "ussd_reponse",
      parametres: { texte: "4821", secret: true, carte: MTN_DOUALA } }, patron);
    verifier("un code secret non plus : il n'entre même pas dans la base", secret.statut, 409);
    const sans = await deposer({ type: "solde", parametres: {}, terminal: "douala-faux" }, patron);
    verifier("une demande sans carte, pour ce boîtier : refusée aussi", sans.statut, 409);
    verifier("aucune demande n'a été déposée", await nombreDeCommandes(), avant);
    const a = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_AKWA } }, patron);
    verifier("LE TÉMOIN : la même demande sur la carte d'Akwa, dont le boîtier parle, part",
      [a.statut, a.terminal, await nombreDeCommandes()], [200, "akwa-faux", avant + 1]);
    await reveiller("douala-faux");
    const r = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } }, patron);
    verifier("revenu, le boîtier de Douala reçoit de nouveau ses demandes",
      [r.statut, r.terminal], [200, "douala-faux"]);
  }

  console.log("\nANNULER : CE QUE LE BOÎTIER N'A PAS PRIS NE PART PLUS");
  {
    await allure("pause");
    const a = await deposer({ type: "ussd", parametres: { code: "*126*1*677998877*5000#",
      carte: MTN_DOUALA }, cle: "abandon-a" }, patron);
    const temoin = await deposer({ type: "ussd", parametres: { code: "*126*1*677998877*5000#",
      carte: MTN_DOUALA }, cle: "abandon-temoin" }, patron);
    verifier("deux demandes en attente : le boîtier ne les a pas encore prises",
      [(await commandeBrute(a.id))?.etat, (await commandeBrute(temoin.id))?.etat],
      ["en_attente", "en_attente"]);
    const x = await annuler(a.id, patron);
    verifier("l'écran abandonne la première : l'annulation a pris",
      [x.statut, x.annulee], [200, true]);
    verifier("dans la base, elle est close", (await commandeBrute(a.id))?.etat, "echouee");
    await allure("normal");
    verifier("LE TÉMOIN : la seconde, laissée telle quelle, est composée au retour",
      await attendreEtat(temoin.id, "faite"), true);
    verifier("la première, elle, ne l'est jamais", (await commandeBrute(a.id))?.etat, "echouee");
    const encore = await annuler(a.id, patron);
    verifier("annuler une seconde fois (la réponse s'était perdue) : toujours prise",
      [encore.statut, encore.annulee], [200, true]);
    const lue = await lireApi(`/api/commande/${a.id}`, patron);
    verifier("l'écran qui la relit lit « rien n'est parti »",
      [lue.etat, /nothing was sent/.test(lue.resultat ?? "")], ["echouee", true]);

    // LE CODE SECRET. Une réponse qui le porte l'attend en clair dans la
    // base : c'est le robot qui l'efface en la traitant. Annulée, elle ne
    // sera jamais traitée — le code ne doit pas y rester pour toujours.
    await allure("pause");
    const pin = await deposer({ type: "ussd_reponse",
      parametres: { texte: "4821", secret: true, carte: MTN_DOUALA } }, patron);
    verifier("LE TÉMOIN : en attente, la réponse porte le code en clair dans la base",
      (await commandeBrute(pin.id))?.parametres?.texte, "4821");
    const xp = await annuler(pin.id, patron);
    const apres = (await commandeBrute(pin.id))?.parametres ?? {};
    verifier("annulée, le code a disparu ; restent le drapeau et la carte",
      [xp.annulee, JSON.stringify(apres).includes("4821"), apres.secret, apres.carte],
      [true, false, true, MTN_DOUALA]);

    // LA RELECTURE QUI ÉCHOUE. Pour effacer le code, la plateforme relit la
    // demande ; quand la base hoquetait sur cette lecture, `lire` rendait une
    // liste vide, l'annulation partait SANS masquer… et réussissait : le
    // code restait dans une demande close, pour toujours. D'abord sur une
    // base qui n'a pas encore la règle « commandes_code_efface ».
    await essai("base?effacement=non");
    const secrete = (texte) => deposer({ type: "ussd_reponse",
      parametres: { texte, secret: true, carte: MTN_DOUALA } }, patron);
    const fermerSansRelire = (id) => fetch(`${N}/rest/v1/commandes?id=eq.${id}&etat=eq.en_attente`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ etat: "echouee", resultat: "Annulée" }) });
    const hoquet = async (fois) =>
      (await (await essai(`hoquet?select=id,parametres&fois=${fois}`)).json()).servis;
    const pin2 = await secrete("5937");
    const servisAvant = await hoquet(1);
    const xh = await annuler(pin2.id, patron, "fr");
    const servis = (await hoquet(0)) - servisAvant;
    verifier("LE TÉMOIN : la relecture qui précède l'annulation a bien échoué", servis, 1);
    const ligne = await commandeBrute(pin2.id);
    verifier("sans relecture, pas d'annulation : « incertaine » (502), rien d'écrit",
      [xh.statut, ligne?.etat], [502, "en_attente"]);
    const temoinPin = await secrete("6048");
    await fermerSansRelire(temoinPin.id);
    const t1 = await commandeBrute(temoinPin.id);
    verifier("LE TÉMOIN : écrite sans relecture, l'annulation laisse le code dans la demande close",
      [t1?.etat, t1?.parametres?.texte], ["echouee", "6048"]);
    const redemandee = await annuler(pin2.id, patron, "fr");
    const apres2 = (await commandeBrute(pin2.id))?.parametres ?? {};
    verifier("redemandée, la relecture passe : l'annulation prend, et le code s'en va",
      [redemandee.statut, redemandee.annulee, JSON.stringify(apres2).includes("5937"), apres2.carte],
      [200, true, false, MTN_DOUALA]);
    // UNE BASE À JOUR retire le code d'elle-même, dans la MÊME écriture que
    // la fermeture — même écrite sans relecture.
    await essai("base?effacement=oui");
    const basePin = await secrete("7159");
    await fermerSansRelire(basePin.id);
    const t2 = await commandeBrute(basePin.id);
    verifier("une base à jour : fermée sans relecture, la demande perd quand même son code",
      [t2?.etat, JSON.stringify(t2?.parametres ?? {}).includes("7159"), t2?.parametres?.carte],
      ["echouee", false, MTN_DOUALA]);
    await allure("normal");
  }

  console.log("\n…ET CE QUE LE BOÎTIER A PRIS N'EST JAMAIS DIT ANNULÉ");
  {
    await allure("lent");
    const c = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } }, patron);
    verifier("le boîtier l'a prise : en cours", await attendreEtat(c.id, "en_cours"), true);
    const x = await annuler(c.id, patron);
    verifier("l'annulation n'a pas pris, et le dit", [x.statut, x.annulee, x.etat],
      [200, false, "en_cours"]);
    verifier("la demande reste en cours dans la base", (await commandeBrute(c.id))?.etat, "en_cours");
    await allure("normal");
    verifier("et elle aboutit", await attendreEtat(c.id, "faite"), true);
    const y = await annuler(c.id, patron);
    verifier("finie : l'annulation ne prend pas non plus", [y.annulee, y.etat], [false, "faite"]);
    const inconnue = await annuler(987654, patron);
    verifier("une demande qui n'existe pas : introuvable", inconnue.statut, 404);
  }

  console.log("\nON N'ANNULE QUE LES SIENNES");
  let awa = null;
  {
    await poste("/api/comptes", { geste: "creer", prenom: "Awa", nom: "Ngono",
      courriel: "vendeuse@boutique.cm", motdepasse: "le-mot-de-passe-d-awa" }, patron);
    const liste = (await lireApi("/api/comptes", patron)).comptes ?? [];
    const idAwa = liste.find((c) => c.courriel === "vendeuse@boutique.cm")?.id;
    await poste("/api/comptes", { geste: "attribuer", id: idAwa, iccid: MTN_DOUALA }, patron);
    awa = (await (await poste("/api/session",
      { courriel: "vendeuse@boutique.cm", motdepasse: "le-mot-de-passe-d-awa" })).json()).jeton;
    verifier("la vendeuse entre, avec la MTN ·8901", Boolean(awa), true);

    await allure("pause");
    const p = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } }, patron);
    const q = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_AKWA } }, patron);
    const w = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } }, awa);
    verifier("trois demandes en attente", [p.statut, q.statut, w.statut], [200, 200, 200]);
    verifier("elle n'annule pas celle du patron, même sur SA carte",
      (await annuler(p.id, awa)).statut, 404);
    verifier("ni une demande sur une carte qui ne lui est pas confiée",
      (await annuler(q.id, awa)).statut, 404);
    verifier("le patron n'annule pas la sienne à elle", (await annuler(w.id, patron)).statut, 404);
    verifier("aucune n'a bougé",
      [(await commandeBrute(p.id))?.etat, (await commandeBrute(q.id))?.etat,
       (await commandeBrute(w.id))?.etat], ["en_attente", "en_attente", "en_attente"]);
    const sienne = await annuler(w.id, awa);
    verifier("LE TÉMOIN : la sienne, elle l'annule", [sienne.statut, sienne.annulee], [200, true]);
    await allure("normal");
  }

  console.log("\nLE SIGNAL QUE LE MODEM NE SAIT PAS DIRE");
  {
    const compte = (await brut("comptes", `&iccid=eq.${MTN_AKWA}`))[0];
    verifier("LE TÉMOIN : le nuage porte bien « 99 » pour la carte d'Akwa", compte?.signal, 99);
    const s = await sims();
    verifier("la plateforme le rend inconnu (null), pas « 99 »", s[MTN_AKWA]?.signal, null);
    verifier("un vrai signal passe tel quel", s[MTN_DOUALA]?.signal, 22);
  }

  console.log("\nUN SIGNAL FAIBLE : UNE BARRE SUR L'ACCUEIL, UN POINT ORANGE SUR COMPTES");
  {
    // Trois cartes qui n'ont qu'UNE barre (une barre va de 4 à 11 sur 31).
    // L'ancienne page Comptes (« rouge à 2 et moins ») leur donnait un point
    // VERT ; le premier seuil commun (7) en laissait encore verte une à
    // 9/31. Quelle que soit la carte que l'accueil montre, elle est faible.
    const FORCES = { [MTN_DOUALA]: 9, [ORANGE_DOUALA]: 5, [MTN_AKWA]: 10 };
    for (const [iccid, valeur] of Object.entries(FORCES)) {
      await essai(`signal?iccid=${iccid}&valeur=${valeur}`);
    }
    const s = await sims();
    verifier("la plateforme les rend telles quelles",
      Object.keys(FORCES).map((i) => s[i]?.signal), Object.values(FORCES));
    const comptes = await page("/cartes", cookie);
    const points = pointsDuSignal(comptes);
    verifier("la page Comptes : une barre, un point ORANGE — 9, 5 et 10 sur 31",
      [points.get(9), points.get(5), points.get(10)], ["bg-alert", "bg-alert", "bg-alert"]);
    // LES TÉMOINS : la MÊME page, chaque point recoloré par une expression
    // d'avant, passée au même contrôle. Il doit les prendre en défaut.
    const site = pointsDuSignal(recolorer(comptes, (n) => (n <= 2 ? "bg-negative" : "bg-positive-vif")));
    verifier("LE TÉMOIN : l'ancienne page (rouge à 2 et moins) les laisse vertes",
      [site.get(9), site.get(5), site.get(10)],
      ["bg-positive-vif", "bg-positive-vif", "bg-positive-vif"]);
    const sept = pointsDuSignal(recolorer(comptes, (n) => (n <= 7 ? "bg-alert" : "bg-positive-vif")));
    verifier("LE TÉMOIN : le seuil 7 laisse verte la MTN à 9/31, qui n'a qu'une barre",
      [sept.get(9), sept.get(5)], ["bg-positive-vif", "bg-alert"]);
    // UN SEUL VERDICT : la carte que l'accueil dessine avec une barre porte
    // le point orange sur Comptes. Les barres viennent du noyau, la couleur
    // aussi — ici, on regarde ce que les DEUX pages ont rendu.
    const accueil = barresDeLAccueil(await page("/", cookie));
    verifier("l'accueil dessine sa carte avec une seule barre",
      [Object.values(FORCES).includes(accueil?.force), accueil?.pleines], [true, 1]);
    verifier("…et Comptes lui donne le point orange : un seul verdict",
      points.get(accueil?.force), "bg-alert");
    // Deux barres : ce n’est plus « faible », le point redevient vert.
    await essai(`signal?iccid=${MTN_DOUALA}&valeur=12`);
    verifier("12/31, deux barres : le point est vert",
      pointsDuSignal(await page("/cartes", cookie)).get(12), "bg-positive-vif");
    for (const iccid of Object.keys(FORCES)) await essai(`signal?iccid=${iccid}&annuler=1`);
  }

  console.log("\nL'HEURE D'UN SOLDE : CELLE DU SOLDE, OU RIEN");
  {
    const compte = (await brut("comptes", `&iccid=eq.${MTN_AKWA}`))[0];
    let s = await sims();
    verifier("l'heure du solde, pas celle du signe de vie",
      [proche(s[MTN_AKWA]?.soldeLe, compte.solde_maj), proche(s[MTN_AKWA]?.soldeLe, compte.maj)],
      [true, false]);
    const douala = (await brut("comptes", `&iccid=eq.${MTN_DOUALA}`))[0];
    verifier("base sans la colonne : on retombe sur « maj », comme avant",
      [("solde_maj" in douala), proche(s[MTN_DOUALA]?.soldeLe, douala.maj)], [false, true]);
    await essai(`solde-maj?iccid=${MTN_AKWA}&minutes=null`);
    const vide = (await brut("comptes", `&iccid=eq.${MTN_AKWA}`))[0];
    verifier("LE TÉMOIN : « solde_maj ?? maj » aurait daté ce solde du signe de vie",
      [vide.solde_maj, typeof (vide.solde_maj ?? vide.maj)], [null, "string"]);
    s = await sims();
    verifier("colonne présente mais vide : ni heure, ni instant",
      [s[MTN_AKWA]?.soldeMaj, s[MTN_AKWA]?.soldeLe], [null, null]);
  }

  console.log("\nLA LANGUE DE L'ÉCRAN, PAS CELLE D'UN COOKIE QUE LE TÉLÉPHONE N'A PAS");
  {
    await taire("douala-faux", 6);
    const fr = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } },
      patron, "fr");
    verifier("le téléphone réglé en français (« ?langue=fr ») : le refus en français",
      [fr.statut, fr.erreur], [409, MUET_FR]);
    const sans = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } },
      patron);
    verifier("LE TÉMOIN : sans langue dans l'adresse, la langue par défaut (anglais)",
      [sans.statut, sans.erreur], [409, MUET_EN]);
    await reveiller("douala-faux");
    await allure("pause");
    const a = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } },
      patron, "fr");
    const x = await annuler(a.id, patron, "fr");
    const lue = await lireApi(`/api/commande/${a.id}?langue=fr`, patron);
    verifier("annulée depuis un écran français : la demande le dit en français",
      [x.annulee, lue.resultat], [true,
        "Annulée depuis l’application avant que le boîtier de la boutique ne la prenne : "
        + "rien n’est parti."]);
    await allure("normal");
  }

  console.log("\nUN GESTE REJOUÉ RETROUVE SA DEMANDE, MÊME QUAND LE BOÎTIER SE TAIT");
  {
    await allure("pause");
    const geste = { type: "ussd", cle: "geste-rejoue-1",
      parametres: { code: "*126*1*677998877*5000#", carte: MTN_DOUALA } };
    const premier = await deposer(geste, patron, "fr");
    verifier("le premier envoi dépose la demande, qui attend le boîtier",
      [premier.statut, (await commandeBrute(premier.id))?.etat], [200, "en_attente"]);
    // La réponse s'est perdue en route ; entre-temps, le boîtier se tait.
    await taire("douala-faux", 6);
    const avant = await nombreDeCommandes();
    const rejoue = await deposer(geste, patron, "fr");
    verifier("rejoué boîtier muet : la MÊME demande, pas « rien n'est parti »",
      [rejoue.statut, rejoue.id], [200, premier.id]);
    const neuf = await deposer({ ...geste, cle: "geste-rejoue-2" }, patron, "fr");
    verifier("LE TÉMOIN : au même instant, un geste NEUF est refusé",
      [neuf.statut, neuf.raison], [409, "boitier_muet"]);
    const autre = await deposer(geste, awa, "fr");
    verifier("la clé du patron rejouée par la vendeuse ne lui rend pas SA demande",
      [autre.statut === 200, autre.id === premier.id], [false, false]);
    verifier("aucune demande de plus", await nombreDeCommandes(), avant);
    await reveiller("douala-faux");
    const vivant = await deposer(geste, awa, "fr");
    verifier("boîtier revenu : la vendeuse ne retrouve pas non plus celle du patron",
      vivant.id === premier.id, false);
    await allure("normal");
    verifier("revenu, le boîtier compose la demande — une fois",
      await attendreEtat(premier.id, "faite"), true);
  }

  console.log("\nUN TOUR DE TRANSMISSION RATÉ : DES CARTES EN RETARD SUR LE SIGNE DE VIE");
  {
    // Internet capricieux : le petit signe de vie passe, la poussée des
    // cartes échoue. Un robot d'hier ne la retentait qu'au tour suivant.
    await essai("revenu?terminal=douala-faux&minutes=60");
    await essai("cartes-en-retard?terminal=douala-faux&secondes=190");
    const t = (await brut("terminaux", "&id=eq.douala-faux"))[0];
    const cartes = (await brut("cartes"))
      .filter((c) => [MTN_DOUALA, ORANGE_DOUALA].includes(c.iccid));
    const retard = (c) => (Date.parse(t.vu_le) - Date.parse(c.derniere_vue)) / 1000;
    verifier("le nuage porte des cartes vues 3 min 10 s avant un signe de vie frais",
      [cartes.length, cartes.every((c) => Math.abs(retard(c) - 190) <= 3),
       (Date.now() - Date.parse(t.entendu_le)) / 1000 < 120], [2, true, true]);
    verifier("par un boîtier qui parle depuis une heure : il a relu ses puces",
      (Date.now() - Date.parse(t.revenu_le)) / 1000 > 3000, true);
    const regleDesTroisMinutes = (c) => (retard(c) > 180 ? "retiree" : "en_place");
    verifier("LE TÉMOIN : la règle des trois minutes les dit retirées",
      cartes.map(regleDesTroisMinutes), ["retiree", "retiree"]);
    const s = await sims();
    verifier("la plateforme : « en place » ou « inconnue », jamais « retirée »",
      [MTN_DOUALA, ORANGE_DOUALA].map((i) => ["en_place", "inconnue"].includes(s[i]?.presence)),
      [true, true]);
    verifier("…et toujours « en place » pour les applications d'avant",
      [MTN_DOUALA, ORANGE_DOUALA].map((i) => s[i]?.enPlace), [true, true]);
    const d = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } },
      patron, "fr");
    verifier("une demande sur la MTN part chez lui", [d.statut, d.terminal], [200, "douala-faux"]);
    await essai("cartes-en-retard?terminal=douala-faux&annuler=1");
  }

  console.log("\nAU RETOUR, LES CARTES NE SONT PAS RETIRÉES AVANT D'AVOIR ÉTÉ RELUES");
  {
    // Vingt minutes de coupure ; le signe de vie revient AVANT les cartes,
    // comme chez le vrai robot (deux envois séparés, jusqu'à une minute).
    await taire("douala-faux", 20);
    await reveiller("douala-faux", "plus-tard");
    const t = (await brut("terminaux", "&id=eq.douala-faux"))[0];
    const cartes = (await brut("cartes")).filter((c) => DE_DOUALA.includes(c.iccid));
    const regleSansRelecture = (c) =>
      (Date.parse(t.vu_le) - Date.parse(c.derniere_vue)) / 1000 > 180 ? "retiree" : "en_place";
    verifier("LE TÉMOIN : « il parle et ne la voit plus » les dit TOUTES retirées",
      cartes.map(regleSansRelecture), ["retiree", "retiree", "retiree"]);
    let s = await sims();
    verifier("ses trois cartes : inconnues, pas retirées",
      DE_DOUALA.map((i) => s[i]?.presence), ["inconnue", "inconnue", "inconnue"]);
    verifier("toujours « en place » pour les applications d'avant",
      DE_DOUALA.map((i) => s[i]?.enPlace), [true, true, true]);
    verifier("la page Comptes n'a pas de « Cartes retirées »",
      RETIREES.test(await page("/cartes", cookie)), false);
    verifier("le boîtier, lui, est bien revenu",
      (await lireApi("/api/donnees?sms=0&recus=0", patron)).terminal?.enLigne, true);
    const d = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } },
      patron, "fr");
    verifier("une demande sur la MTN part chez lui (c'est lui qui dira si la puce est là)",
      [d.statut, d.terminal], [200, "douala-faux"]);
    // Le robot republie ses cartes.
    await essai("cartes?terminal=douala-faux");
    s = await sims();
    verifier("relues : celles qui sont là sont en place, celle qu'on a ôtée est retirée",
      DE_DOUALA.map((i) => s[i]?.presence), ["en_place", "en_place", "retiree"]);
  }

  console.log("\nUN BOÎTIER QUI NE VOIT PLUS AUCUNE CARTE");
  {
    // On ôte la seule puce du boîtier d'Akwa, qui parle depuis longtemps.
    await essai(`carte-perdue?iccid=${MTN_AKWA}&minutes=20`);
    await essai("revenu?terminal=akwa-faux&minutes=60");
    const t = (await brut("terminaux", "&id=eq.akwa-faux"))[0];
    const siennes = (await brut("cartes")).filter((c) => c.terminal === "akwa-faux");
    verifier("LE TÉMOIN : aucune carte fraîche à Akwa — « une autre est fraîche » ne conclut rien",
      siennes.some((c) => (Date.parse(t.vu_le) - Date.parse(c.derniere_vue)) / 1000 <= 180), false);
    let s = await sims();
    verifier("il parle depuis une heure et ne la voit plus : retirée",
      [s[MTN_AKWA]?.presence, s[MTN_AKWA]?.enPlace], ["retiree", false]);
    await essai("revenu?terminal=akwa-faux&minutes=0");
    s = await sims();
    verifier("revenu à l'instant : on attend qu'il ait relu — inconnue", s[MTN_AKWA]?.presence,
      "inconnue");
    const d = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_AKWA } },
      patron, "fr");
    verifier("une demande sur elle part chez lui, qui parle", [d.statut, d.terminal],
      [200, "akwa-faux"]);
    // UNE BASE D'AVANT : sans l'heure de son retour, on ne peut pas trancher.
    await essai("base?oreille=non");
    await essai("revenu?terminal=akwa-faux&minutes=60");
    s = await sims();
    verifier("base pas encore migrée : « inconnue », jamais « retirée » à tort",
      s[MTN_AKWA]?.presence, "inconnue");
    await essai("base?oreille=oui");
    await essai(`carte-perdue?iccid=${MTN_AKWA}&annuler=1`);
  }

  console.log("\nL'HORLOGE DU BOÎTIER EN RETARD DE HUIT MINUTES");
  {
    await essai("horloge?terminal=douala-faux&retard=8");
    const t = (await brut("terminaux", "&id=eq.douala-faux"))[0];
    verifier("LE TÉMOIN : compté sur la date du Pi, il se tait depuis plus de cinq minutes",
      (Date.now() - Date.parse(t.vu_le)) / 1000 > 300, true);
    const s = await sims();
    verifier("il parle : ses cartes restent en place",
      [s[MTN_DOUALA]?.presence, s[ORANGE_DOUALA]?.presence], ["en_place", "en_place"]);
    const d = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } },
      patron, "fr");
    verifier("et ce qu'on lui demande part chez lui", [d.statut, d.terminal], [200, "douala-faux"]);
    // CE QUI SE PASSE SUR UNE BASE D'AVANT : l'âge se mesure sur la date du
    // Pi, et il paraît muet. Écrit, pas caché.
    await essai("base?oreille=non");
    const v = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_DOUALA } },
      patron, "fr");
    verifier("base pas encore migrée : refusé comme un boîtier muet",
      [v.statut, v.raison], [409, "boitier_muet"]);
    await essai("base?oreille=oui");
    await essai("horloge?terminal=douala-faux&retard=0");
  }

  console.log("\nUN BOÎTIER SORTI DE LA FLOTTE NE REVIENDRA PAS");
  {
    // Le registre de la console : combien de cartes y sont dites « Retirée »,
    // combien « On ne sait pas ». La page arrive en flux (ses cellules
    // suivent la table) : on compte les états, on ne découpe pas les rangées.
    const registreConsole = async () => {
      const h = await page("/console/cartes", cookie);
      return { retirees: h.split(">Retirée<").length - 1,
               inconnues: h.split(">On ne sait pas<").length - 1 };
    };
    await taire("akwa-faux", 60);
    let s = await sims();
    verifier("LE TÉMOIN : muet, sa carte n'est qu'« inconnue » — parmi les actives, pour toujours",
      s[MTN_AKWA]?.presence, "inconnue");
    const avant = await registreConsole();
    verifier("LE TÉMOIN : la console aussi la dit « on ne sait pas » (seule Orange ·7777 retirée)",
      [avant.retirees, avant.inconnues > 0], [1, true]);
    await essai("retirer?terminal=akwa-faux");
    s = await sims();
    verifier("mis hors service : sa carte est retirée",
      [s[MTN_AKWA]?.presence, s[MTN_AKWA]?.enPlace], ["retiree", false]);
    const r = await deposer({ type: "ussd", parametres: { code: "*126#", carte: MTN_AKWA } },
      patron, "fr");
    verifier("rien ne part vers elle", [r.statut, r.raison], [409, "carte_absente"]);
    verifier("la page Comptes la range sous « Cartes retirées »",
      RETIREES.test(await page("/cartes", cookie)), true);
    const apres = await registreConsole();
    verifier("la console la dit retirée, elle aussi — la même règle",
      [apres.retirees, apres.inconnues], [2, 0]);
    await essai("retirer?terminal=akwa-faux&annuler=1");
    await reveiller("akwa-faux");
  }
} finally {
  try { process.kill(-serveur.pid, "SIGTERM"); } catch { /* déjà parti */ }
  nuage.kill();
}

console.log(echecs
  ? `\n✗ ${echecs} vérification(s) en échec — un boîtier muet fait encore dire faux, ou partir ce qui ne devait pas.`
  : "\n✓ Un boîtier qui se tait ne fait déclarer aucune carte retirée, et rien ne part en son nom.");
process.exit(echecs ? 1 : 0);
