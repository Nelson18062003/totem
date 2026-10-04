// L'ATTENTE NE FAIT PAS SAUTER L'ÉCRAN.
//
//     node scripts/verifier-l-attente.mjs
//
// Prérequis, comme `verifier-les-formats` :
//   node web/scripts/faux-nuage.mjs
//   cd web && SUPABASE_URL=http://127.0.0.1:4999 SUPABASE_CLE=x \
//     SESSION_SECRET=essai TOTEM_MOT_DE_PASSE=essai npx next start -p 3120
//   cd mobile && EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3120 EXPO_PUBLIC_APERCU=1 \
//     npx expo export --platform web --output-dir /tmp/apercu
//   cd /tmp/apercu && python3 -m http.server 3210 --bind 127.0.0.1
//
// POURQUOI. Pendant le premier chargement, les écrans principaux ne
// montraient RIEN : un écran blanc, sans un mot. Le propriétaire ne peut pas
// distinguer « ça arrive » de « c'est cassé ». Des formes grises à la bonne
// place répondent aux deux questions d'un coup.
//
// MAIS UNE FORME À LA MAUVAISE HAUTEUR EST PIRE QUE PAS DE FORME. Si elle ne
// fait pas exactement la taille de ce qu'elle remplace, l'écran SAUTE au
// moment de la substitution — et il saute juste au moment où le doigt
// s'approche d'un bouton. Premier essai ici : 72 points de saut, parce que la
// forme oubliait les trois commandes rondes sous la carte. Mesuré, pas
// supposé — à l'œil, on ne l'aurait pas vu.
//
// Le harnais RALENTIT le réseau pour attraper l'état d'attente : sans cela il
// ne verrait jamais que l'écran d'après.

import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const APERCU = "http://127.0.0.1:3210";
// Le MÊME compte que `verifier-les-formats` : les deux harnais peuvent
// alors se suivre sur le même faux nuage sans se fermer la porte.
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";
// Un décalage qu'on ne voit pas. Au-delà, l'écran bouge sous le doigt.
const SAUT_TOLERE = 20;

const FORMATS = [["téléphone", 390, 844], ["petit", 360, 640], ["large", 430, 932]];

let echecs = 0;

// Les deux serveurs sont vérifiés AVANT d'ouvrir le navigateur : sans cela,
// l'absence de l'aperçu sortait en trace brute de Playwright
// (« ERR_CONNECTION_REFUSED ») au lieu de dire quoi lancer.
for (const [quoi, adresse] of [["La plateforme d'essai", "http://127.0.0.1:3120/api/plateforme"],
                               ["L'aperçu de l'application", APERCU]]) {
  try {
    const r = await fetch(adresse, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error("muet");
  } catch {
    console.error(`\n✗ ${quoi} ne répond pas (${adresse}).`);
    console.error("  Voir l'en-tête de ce fichier pour la chaîne à lancer.");
    process.exit(1);
  }
}
// 403 dit « inscriptions fermées » — pas « VOTRE compte existe ». On le
// prouve maintenant, pas au moment de la connexion avec le mauvais
// diagnostic : sans cela le harnais annonce « l'écran ne montre rien »
// alors qu'on est simplement resté devant la porte.
{
  const inscription = await fetch("http://127.0.0.1:3120/api/inscription", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
  });
  if (inscription.status === 403) {
    const porte = await fetch("http://127.0.0.1:3120/api/connexion", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
    });
    if (!porte.ok) {
      console.error("\n✗ Les inscriptions sont fermées par un AUTRE compte :");
      console.error("  un autre harnais a déjà utilisé ce faux nuage.");
      console.error("  Redémarrez le faux nuage, puis relancez.");
      process.exit(1);
    }
  }
}

const nav = await chromium.launch({
  args: ["--disable-web-security", "--disable-features=IsolateOrigins,site-per-process"],
});

/** Le haut du titre « Derniers mouvements » — un repère placé SOUS tout ce
 *  que la forme d'attente remplace (la carte, sa ligne d'état, les ronds).
 *  S'il ne bouge pas, rien n'a sauté. */
const repere = () => {
  // Le titre est un EN-TÊTE (un `h2` sur le web), pas un `div`. Chercher
  // dans les `div` trouvait sa RANGÉE tant qu'elle ne portait que lui —
  // pendant l'attente — puis plus rien dès que « Tout voir » la rejoignait :
  // le harnais aurait crié au saut sur un écran immobile. On prend donc
  // l'élément le plus INTÉRIEUR qui porte exactement ce texte : le dernier
  // dans l'ordre du document, puisqu'un parent précède ses enfants.
  const el = [...document.querySelectorAll("body *")]
    .filter((e) => /^(Latest transactions|Derniers mouvements)$/.test(e.textContent?.trim() || ""))
    .pop();
  return el ? Math.round(el.getBoundingClientRect().top) : null;
};

console.log("");
for (const [nom, w, h] of FORMATS) {
  const page = await nav.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  try {
    await page.goto(APERCU, { waitUntil: "networkidle" });
    for (let i = 0; i < 40; i++) {
      const pret = await page.locator('input[type="email"]').first()
        .evaluate((e) => !e.readOnly).catch(() => false);
      if (pret) break;
      await attendre(500);
    }
    // À partir d'ici, les données mettent quatre secondes — comme à Douala.
    await page.route("**/api/donnees**", async (route) => {
      await attendre(4000);
      await route.continue();
    });
    await page.locator('input[type="email"]').first().fill(COURRIEL);
    await page.locator('input[type="password"]').first().fill(MOTDEPASSE);
    await page.getByText(/^Sign in$|^Se connecter$/).last().click();

    // ON ATTEND L'ÉTAT, PAS UNE DURÉE. Un délai fixe après le clic paraît
    // marcher — puis la connexion prend une seconde de plus (le frein compte
    // les essais, le calcul de l'empreinte est lent à dessein) et le harnais
    // mesure l'écran de connexion en annonçant « rien à l'écran ». Un
    // contrôle qui dépend d'un chronomètre finit par mesurer autre chose.
    let enAttente = null;
    for (let i = 0; i < 40; i++) {
      enAttente = await page.evaluate(repere);
      if (enAttente !== null) break;
      await attendre(400);
    }
    // On compte les formes PAR LEUR MARQUE, pas par leur couleur : le gris
    // des squelettes est celui du thème, employé partout ailleurs.
    const formes = await page.evaluate(
      () => document.querySelectorAll("[data-squelette]").length);
    // Puis on attend que les chiffres remplacent les formes : le repère
    // existe déjà, on guette qu'il se stabilise après la substitution.
    await page.waitForFunction(
      () => !![...document.querySelectorAll("div")]
        .find((e) => /FCFA/.test(e.textContent || "")),
      null, { timeout: 20000 }).catch(() => {});
    await attendre(600);
    const arrive = await page.evaluate(repere);

    if (enAttente === null) {
      console.log(`  ✗ ${nom.padEnd(10)} l'écran ne montre RIEN pendant l'attente`);
      echecs++;
    } else {
      const saut = Math.abs(enAttente - arrive);
      const ok = saut <= SAUT_TOLERE;
      if (!ok) echecs++;
      console.log(`  ${ok ? "✓" : "✗"} ${nom.padEnd(10)} ${formes} formes en attente · `
        + `le repère passe de ${enAttente} à ${arrive} px — saut de ${saut} px`);
    }
  } finally { await page.close(); }
}
// ---------------------------------------------------------------------------
// CHAQUE ONGLET, PAS SEULEMENT L'ACCUEIL.
//
// J'avais annoncé « quatre écrans montrent des formes » après n'en avoir
// mesuré qu'UN. Les trois autres pouvaient très bien être restés blancs — et
// personne ne l'aurait su. On visite donc les quatre, réseau ralenti, et on
// exige que chacun montre quelque chose pendant qu'il charge.
// ---------------------------------------------------------------------------
console.log("\n  Chaque onglet montre quelque chose pendant qu'il charge");
{
  const page = await nav.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  try {
    await page.goto(APERCU, { waitUntil: "networkidle" });
    for (let i = 0; i < 40; i++) {
      const pret = await page.locator('input[type="email"]').first()
        .evaluate((e) => !e.readOnly).catch(() => false);
      if (pret) break;
      await attendre(500);
    }
    await page.route("**/api/donnees**", async (route) => {
      await attendre(3000);
      await route.continue();
    });
    await page.locator('input[type="email"]').first().fill(COURRIEL);
    await page.locator('input[type="password"]').first().fill(MOTDEPASSE);
    await page.getByText(/^Sign in$|^Se connecter$/).last().click();
    await page.waitForFunction(
      () => !![...document.querySelectorAll("div")].find((e) => /FCFA/.test(e.textContent || "")),
      null, { timeout: 25000 }).catch(() => {});

    /** Combien de formes d'attente sont à l'écran en ce moment. */
    const formes = () => document.querySelectorAll("[data-squelette]").length;

    // CE QU'ON ATTEND DE CHAQUE ONGLET, écrit noir sur blanc. Un contrôle qui
    // se contente de « l'écran n'est pas vide » passe sur à peu près tout : il
    // suffit d'un titre. On dit donc, pour chacun, combien de formes il DOIT
    // montrer — le nombre est celui des composants, et un écart signale soit
    // une forme perdue, soit une forme de trop.
    //
    // « Actions » n'en a aucune, et c'est voulu : il ne lit que l'état du
    // terminal (`sms: 0`), un aller-retour minuscule — rien à faire attendre.
    // On exige alors qu'il ne soit pas blanc.
    const ONGLETS = [
      ["Cartes", /^(Accounts|Comptes)$/, 2],
      ["Boîte", /^(SMS|Messages)$/, 24],
      ["Actions", /^(Operations|Opérations)$/, 0],
    ];
    for (const [nom, motif, attendues] of ONGLETS) {
      const bouton = page.getByLabel(motif).first();
      if (!(await bouton.count())) {
        console.log(`  ✗ ${nom.padEnd(10)} onglet introuvable — rien n'a été mesuré`);
        echecs++;
        continue;
      }
      await bouton.click();
      // On regarde TÔT : la forme ne vit que le temps du chargement.
      await attendre(700);
      const pendant = await page.evaluate(formes);
      const texte = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      const vide = texte.trim().length < 30;
      const ok = pendant === attendues && !vide;
      if (!ok) echecs++;
      console.log(`  ${ok ? "✓" : "✗"} ${nom.padEnd(10)} ${pendant} formes `
        + `(attendu ${attendues})${vide ? " — ET L'ÉCRAN EST VIDE" : ""}`);
      await attendre(3200);          // on laisse les chiffres arriver
    }

    // LE RETOUR SUR UN ONGLET DÉJÀ VU EST INSTANTANÉ, et c'est une bonne
    // nouvelle qu'il faut garder : expo-router laisse l'écran monté, ses
    // données sont encore là — aucune forme, aucun temps d'attente. Si un
    // jour un écran se remonte à chaque visite, il remontrera des formes, et
    // ce contrôle le dira.
    await page.getByLabel(/^(Home|Accueil)$/).first().click();
    await attendre(700);
    const auRetour = await page.evaluate(formes);
    const chiffresLa = await page.evaluate(
      () => !![...document.querySelectorAll("div")].find((e) => /FCFA/.test(e.textContent || "")));
    const retourOk = auRetour === 0 && chiffresLa;
    if (!retourOk) echecs++;
    console.log(`  ${retourOk ? "✓" : "✗"} Accueil    revenu instantanément `
      + `(${auRetour} forme${auRetour > 1 ? "s" : ""}, chiffres ${chiffresLa ? "déjà là" : "ABSENTS"})`);
  } finally { await page.close(); }
}

// ---------------------------------------------------------------------------
// LES RÉGLAGES NE SE COMPOSENT PLUS EN SECOUSSES.
//
// « Sécurité » et « Se déconnecter » s'affichaient, puis descendaient d'un
// bloc entier une à trois secondes plus tard : la liste « Qui peut se
// connecter » arrivait au-dessus d'eux. Sa place est maintenant gardée, à la
// hauteur du dernier nombre de comptes connu — et ce nombre est rangé SUR LE
// TÉLÉPHONE : on vient aux Réglages une fois par mois, et la mémoire se perd
// à chaque lancement. Un premier jet ne le gardait qu'en mémoire ; il aurait
// passé ce contrôle s'il ne mesurait que deux visites de suite. On mesure
// donc APRÈS UN RELANCEMENT complet (`goto` : la mémoire repart de zéro, le
// rangement reste).
//
// LE TÉMOIN : le même relancement, avec un nombre rangé FAUX. La forme est
// alors trop haute, et « Sécurité » doit remonter à l'arrivée de la liste.
// Si la mesure ne voit pas ce saut-là, elle ne voit rien, et elle le dit.
// ---------------------------------------------------------------------------
console.log("\n  Réglages : « Sécurité » ne bouge pas quand la liste des comptes arrive");
{
  const page = await nav.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  try {
    await page.goto(APERCU, { waitUntil: "networkidle" });
    for (let i = 0; i < 40; i++) {
      const pret = await page.locator('input[type="email"]').first()
        .evaluate((e) => !e.readOnly).catch(() => false);
      if (pret) break;
      await attendre(500);
    }
    await page.locator('input[type="email"]').first().fill(COURRIEL);
    await page.locator('input[type="password"]').first().fill(MOTDEPASSE);
    await page.getByText(/^Sign in$|^Se connecter$/).last().click();

    // La LISTE des comptes met trois secondes — le temps de voir la forme.
    // Les gestes sur les comptes (POST) passent sans attendre.
    await page.route("**/api/comptes**", async (route) => {
      if (route.request().method() === "GET") await attendre(3000);
      await route.continue();
    });

    /** Le haut du titre « Sécurité » : tout ce qui se compose au-dessus de
     *  lui le pousse. L'élément le plus intérieur qui porte ce texte. */
    const securite = () => {
      const el = [...document.querySelectorAll("body *")]
        .filter((e) => /^(Security|Sécurité)$/.test(e.textContent?.trim() || "")).pop();
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    };
    /** La liste est là : le courriel du compte connecté s'y lit en entier. */
    const listeLa = (courriel) => [...document.querySelectorAll("body *")]
      .some((e) => (e.textContent || "").trim() === courriel);

    /** Depuis l'accueil chargé : ouvrir les Réglages, mesurer « Sécurité »
     *  pendant que la liste arrive, puis une fois qu'elle est là. */
    const visite = async () => {
      await page.waitForFunction(
        () => !![...document.querySelectorAll("div")].find((e) => /FCFA/.test(e.textContent || "")),
        null, { timeout: 25000 });
      await page.getByLabel(/^(Settings|Réglages)$/).first().click();
      let pendant = null;
      for (let i = 0; i < 40 && pendant === null; i++) {
        pendant = await page.evaluate(securite);
        if (pendant === null) await attendre(100);
      }
      // ON ATTEND L'ÉTAT : si la liste était déjà là, rien n'a été mesuré
      // pendant l'attente — et la visite le dit au lieu de passer en vert.
      const deja = await page.evaluate(listeLa, COURRIEL);
      await page.waitForFunction(listeLa, COURRIEL, { timeout: 20000 }).catch(() => {});
      await attendre(600);
      const apres = await page.evaluate(securite);
      return { pendant, apres, deja };
    };
    const relancer = () => page.goto(APERCU, { waitUntil: "networkidle" });
    const range = () => page.evaluate(() => localStorage.getItem("totem.qui.comptes"));

    // 1. Une première visite, sur un téléphone neuf : le nombre se range.
    await visite();
    const nombre = Number(await range());
    if (!Number.isInteger(nombre) || nombre < 1) {
      console.log("  ✗ Réglages   le nombre de comptes n'est PAS rangé sur le téléphone");
      echecs++;
    } else {
      // 2. Le témoin : un nombre rangé faux, puis un relancement.
      const faux = nombre >= 4 ? 1 : nombre + 3;
      await page.evaluate((n) => localStorage.setItem("totem.qui.comptes", String(n)), faux);
      await relancer();
      const temoin = await visite();
      // 3. Le vrai : la visite du témoin a rangé le bon nombre en partant.
      await relancer();
      const vrai = await visite();

      const decrire = (v) => (v.pendant === null || v.apres === null
        ? "« Sécurité » introuvable"
        : `« Sécurité » passe de ${v.pendant} à ${v.apres} px — saut de ${Math.abs(v.pendant - v.apres)} px`);
      const saut = (v) => (v.pendant === null || v.apres === null ? null : Math.abs(v.pendant - v.apres));

      const temoinVu = !temoin.deja && saut(temoin) !== null && saut(temoin) > SAUT_TOLERE;
      if (!temoinVu) {
        console.log(`  ✗ témoin      ${faux} comptes rangés pour ${nombre} : la mesure ne voit `
          + `pas le saut qu'elle doit voir (${decrire(temoin)}${temoin.deja ? ", liste déjà là" : ""})`);
        echecs++;
      } else {
        console.log(`  ✓ témoin      ${faux} comptes rangés pour ${nombre} : ${decrire(temoin)}`);
        const ok = !vrai.deja && saut(vrai) !== null && saut(vrai) <= SAUT_TOLERE;
        if (!ok) echecs++;
        console.log(`  ${ok ? "✓" : "✗"} relancé     ${nombre} compte${nombre > 1 ? "s" : ""} rangé`
          + `${nombre > 1 ? "s" : ""} : ${decrire(vrai)}${vrai.deja ? " — LISTE DÉJÀ LÀ, rien n'a été mesuré" : ""}`);
      }
    }
  } finally { await page.close(); }
}

await nav.close();

console.log(echecs === 0
  ? "\n✓ L'attente se montre, et l'écran ne saute pas quand les chiffres arrivent.\n"
  : `\n✗ ${echecs} format(s) où l'attente ment ou fait sauter l'écran.\n`);
process.exit(echecs === 0 ? 0 : 1);
