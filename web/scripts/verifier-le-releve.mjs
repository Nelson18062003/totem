// LE RELEVÉ DE COMPTE, MIS À L'ÉPREUVE SUR UNE CAISSE QUI TOURNE DEPUIS SIX MOIS.
//
//     node scripts/verifier-le-releve.mjs
//
// Le relevé SORT de TOTEM : il part chez un comptable, une banque, un
// associé, qui le liront comme une pièce. Un écran faux se corrige au
// rechargement ; un relevé faux est déjà dans un classeur.
//
// CE QU'IL EXIGE :
//
//   1. UNE PÉRIODE PASSÉE ET DENSE (il y a quatre à trois mois, quarante
//      mouvements par jour, deux cartes MTN) rapporte EXACTEMENT ce que le
//      faux nuage porte pour cette carte et ces jours — interrogé directement,
//      c'est la vérité indépendante —, au franc près.
//      LE TÉMOIN : la lecture d'avant, sans borne de FIN, réécrite ici en
//      quelques lignes, doit perdre cette période. Sans ce témoin, « le
//      relevé est juste » et « la caisse d'essai est trop petite pour que la
//      borne compte » se ressembleraient.
//   2. LES BORNES SE PRENNENT SUR L'HEURE QUI FAIT FOI : un SMS émis à 23:50
//      la veille et relevé après minuit est DEHORS ; un SMS émis le dernier
//      jour à 23:59 et relevé le lendemain est DEDANS.
//   3. LA PORTÉE : un vendeur à qui l'on a confié UNE carte ne relève pas
//      l'autre (404), son « tout » ne rend que la sienne, un lien signé
//      réécrit (carte, période, format, personne) ou périmé est refusé, et
//      un lien dont la carte a été REPRISE depuis ne rend plus rien — la
//      portée se relit au moment où le lien sert. La vitrine relève son jeu
//      inventé, jamais la base.
//   4. LE PDF EST LU, pas seulement compté : plusieurs pages, CHAQUE
//      référence de la période exactement une fois (aucune perdue ni doublée
//      à un saut de page), le numéro en tranches, les totaux du CSV.
//   5. LES SOLDES SE LISENT : l'ouverture est le solde annoncé juste avant
//      la période ; une carte qui n'en a jamais annoncé dit « non connu »,
//      jamais 0.
//   6. LE CSV : un tiers piégé « =HYPERLINK(…) » sort désamorcé, et la ligne
//      de coupe est en tête quand le plafond mord — absente sinon.
//   7. UN SENS INCONNU n'entre dans aucun total et se compte à part ; un
//      code, une publicité, un échec n'y entrent pas du tout.
//
// Le plafond d'une carte est abaissé à 3 000 lignes (`RELEVE_LIGNES_MAX`) :
// on ne sème pas vingt mille lignes en quelques secondes. C'est ce qui rend
// la coupe visible, et le témoin capable d'échouer.

import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { setTimeout as attendre } from "node:timers/promises";

const PORT = 3156;
const NUAGE = 4997;
const B = `http://127.0.0.1:${PORT}`;
const N = `http://127.0.0.1:${NUAGE}`;
const SECRET = "secret-d-essai-du-releve";
const SECOURS = "cle-de-secours-du-releve";
const MDP_PATRON = "le-mot-de-passe-du-patron-releve";
const MDP_VENDEUR = "le-mot-de-passe-du-vendeur-releve";
const FUSEAU = "Africa/Douala";
const PLAFOND = 3000;
const MTN_A = "89237010000000008901";
const MTN_B = "89237010000000009999";
const ORANGE = "89237020000000004432";
const SANS_NUMERO = "89237020000000007777";
const ARGENT = ["encaissement", "envoi", "transfert", "depot", "retrait"];

let echecs = 0;
const verifier = (quoi, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(66)} ${detail}`);
};

async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}

// Un serveur resté ouvert ferait passer tout le relevé contre du vieux code.
for (const port of [PORT, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé — arrêtez l'essai précédent.`);
    process.exit(1);
  }
}

// « next start » sert ce qui est dans « .next », pas les fichiers du disque.
console.log("\nCompilation de la plateforme…");
await new Promise((resoudre, rejeter) => {
  const build = spawn("npx", ["next", "build"], { stdio: "ignore" });
  build.on("exit", (c) => (c === 0 ? resoudre() : rejeter(
    new Error("la compilation a échoué — le relevé ne peut rien prouver"))));
});

// La FLOTTE : une seconde carte MTN (9999, sur un autre boîtier) et une carte
// Orange SANS numéro (7777).
const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  env: { ...process.env, PORT: String(NUAGE), FAUX_FLOTTE: "1" }, stdio: "ignore",
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: N, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: SECOURS, FUSEAU,
    RELEVE_LIGNES_MAX: String(PLAFOND),
  },
  stdio: "ignore",
  // Son PROPRE groupe de processus : « npx » lance le vrai serveur en
  // dessous, et tuer « npx » seul le laissait vivant, port occupé.
  detached: true,
});

// --- Les outils -------------------------------------------------------------

const formateur = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU });
const jourLocal = (t) => formateur.format(new Date(t));
const decaler = (cle, n) => {
  const [a, m, j] = cle.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j) + n * 86400000).toISOString().slice(0, 10);
};
/** Un instant de Douala (UTC+1, sans heure d'été) : « 2026-06-06 », « 23:50 ». */
const aDouala = (cle, hhmm) => new Date(`${cle}T${hhmm}:00+01:00`).toISOString();
/** Le montant tel que le relevé l'écrit (noyau/releve.ts, `montantReleve`). */
const enFrancais = (n) => {
  const c = Math.round(Math.abs(n) * 100);
  const entier = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 && c > 0 ? "-" : ""}${entier}${c % 100 ? `,${String(c % 100).padStart(2, "0")}` : ""}`;
};

/** Découpe un CSV à points-virgules, guillemets compris. */
function lireCsv(texte) {
  const rangs = [];
  let rang = [], champ = "", dedans = false;
  const t = texte.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dedans) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') dedans = false;
      else champ += c;
    } else if (c === '"') dedans = true;
    else if (c === ";") { rang.push(champ); champ = ""; }
    else if (c === "\r") { /* rien */ }
    else if (c === "\n") { rang.push(champ); rangs.push(rang); rang = []; champ = ""; }
    else champ += c;
  }
  if (champ || rang.length) { rang.push(champ); rangs.push(rang); }
  return rangs;
}
const lignesDe = (csv) => csv.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0] ?? ""));
const cle = (csv, nom) => csv.find((r) => r.length === 2 && r[0] === nom)?.[1];

// Les signes que WinAnsi range de 0x80 à 0x9F (l'apostrophe du dictionnaire,
// les tirets) : le décodeur « latin1 » de Node les laisse en caractères de
// contrôle, on les remet à leur place.
const WINANSI = { "\x91": "‘", "\x92": "’", "\x93": "“", "\x94": "”",
  "\x95": "•", "\x96": "–", "\x97": "—", "\x85": "…", "\x80": "€" };

/** Les chaînes d'un PDF non compressé, dans l'ordre où elles sont écrites. */
function chainesDuPdf(octets) {
  const brut = new TextDecoder("latin1").decode(octets)
    .replace(/[\x80-\x9f]/g, (c) => WINANSI[c] ?? c);
  return {
    brut,
    pages: Number(/\/Count (\d+)/.exec(brut)?.[1] ?? 0),
    chaines: [...brut.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, "$1")),
  };
}

const avec = (jeton) => (jeton ? { authorization: `Bearer ${jeton}` } : {});
const lire = (chemin, jeton) => fetch(B + chemin, { headers: avec(jeton), redirect: "manual" });
let adresse = 1;
const poste = (chemin, corps, jeton) => fetch(B + chemin, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `10.77.0.${adresse++}`,
             ...avec(jeton) },
  body: JSON.stringify(corps), redirect: "manual",
});
const releve = (q, jeton) => lire(`/api/releve?langue=fr&${q}`, jeton);
const csvDe = async (q, jeton) => {
  const r = await releve(`${q}&format=csv`, jeton);
  return { statut: r.status, texte: r.ok ? await r.text() : "" };
};
const pdfDe = async (q, jeton) => {
  const r = await releve(`${q}&format=pdf`, jeton);
  return { statut: r.status, ...(r.ok ? chainesDuPdf(new Uint8Array(await r.arrayBuffer()))
                                       : { brut: "", pages: 0, chaines: [] }) };
};
const signer = (id, exp) =>
  createHmac("sha256", SECRET).update(`releve:${id}:${exp}`).digest("base64url");

try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${B}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }

  const patron = (await (await poste("/api/inscription",
    { courriel: "patron@releve.cm", motdepasse: MDP_PATRON })).json()).jeton;
  verifier("le propriétaire entre", Boolean(patron));
  if (!patron) throw new Error("sans session, le relevé ne prouve rien");

  // --- LA CAISSE --------------------------------------------------------------
  const semees = await (await fetch(`${N}/essai/semer-releve?jours=180&parJour=40`,
    { method: "POST" })).json();
  verifier("la caisse porte six mois, sur deux cartes MTN", semees.semes > 14000,
    `${semees.semes} lignes`);

  const aujourdhui = jourLocal(Date.now());
  const de = decaler(aujourdhui, -120);
  const a = decaler(aujourdhui, -90);
  const periode = `carte=${MTN_A}&de=${de}&a=${a}`;

  // Les bords, et ce qui ne doit jamais entrer.
  const ligne = (champs) => ({
    terminal: "douala-faux", compte: "MTN ·8901", carte: MTN_A, expediteur: "MTNMobileMoney",
    categorie: "encaissement", sens: "entree", montant: 1000, frais: null, tiers: "BORD",
    numero: "677000777", solde_apres: null, nature: null, lu_le: null, texte: "essai",
    ...champs,
  });
  const dans = decaler(de, 10);
  const bords = [
    // Émis à 23:50 la VEILLE, relevé après minuit : dehors.
    ligne({ reference: "BORD-VEILLE", montant: 777,
            emis_le: aDouala(decaler(de, -1), "23:50"), recu_le: aDouala(de, "00:20") }),
    // Émis le DERNIER jour à 23:59, relevé le lendemain : dedans.
    ligne({ reference: "BORD-FIN", montant: 888,
            emis_le: aDouala(a, "23:59"), recu_le: aDouala(decaler(a, 1), "01:30") }),
    // Un sens que le robot n'a pas compris : montré, compté nulle part.
    ligne({ reference: "SENS-INCONNU", sens: null, montant: 4321, categorie: "transfert",
            emis_le: aDouala(dans, "09:00"), recu_le: aDouala(dans, "09:00") }),
    // Un tiers piégé pour le tableur.
    ligne({ reference: "PIEGE-1", tiers: '=HYPERLINK("http://vol.example","clic")',
            emis_le: aDouala(dans, "09:10"), recu_le: aDouala(dans, "09:10") }),
    // Ce qui ne doit JAMAIS entrer dans un relevé.
    ligne({ reference: null, categorie: "code", sens: null, montant: null, tiers: null,
            texte: "Votre code de confirmation est 483921. Ne le communiquez a personne.",
            emis_le: aDouala(dans, "09:20"), recu_le: aDouala(dans, "09:20") }),
    ligne({ reference: "ECHEC-1", categorie: "echec", sens: "sortie", montant: 999,
            emis_le: aDouala(dans, "09:30"), recu_le: aDouala(dans, "09:30") }),
    ligne({ reference: null, categorie: "publicite", sens: null, montant: null,
            texte: "Gagnez des bonus !", emis_le: aDouala(dans, "09:40"),
            recu_le: aDouala(dans, "09:40") }),
    // La carte Orange SANS numéro : un mouvement, aucun solde annoncé, jamais.
    ligne({ reference: "ORANGE-7777", carte: SANS_NUMERO, compte: "Orange ·7777",
            terminal: "douala-faux", montant: 1500,
            emis_le: aDouala(dans, "10:00"), recu_le: aDouala(dans, "10:00") }),
  ];
  await fetch(`${N}/rest/v1/paiements`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bords),
  });

  // --- LA VÉRITÉ, DEMANDÉE AU FAUX NUAGE LUI-MÊME --------------------------------
  const tout = await (await fetch(`${N}/rest/v1/paiements?select=*&carte=eq.${MTN_A}`)).json();
  const jourDe = (l) => jourLocal(l.emis_le || l.recu_le);
  const instant = (l) => Date.parse(l.emis_le || l.recu_le);
  const dansLaPeriode = tout.filter((l) => jourDe(l) >= de && jourDe(l) <= a);
  const mouvements = dansLaPeriode.filter((l) => l.montant != null && ARGENT.includes(l.categorie));
  const centimes = (v) => Math.round(Number(v) * 100);
  const somme = (ls) => ls.reduce((s, l) => s + centimes(l.montant), 0) / 100;
  const entrees = somme(mouvements.filter((l) => l.sens === "entree"));
  const sorties = somme(mouvements.filter((l) => l.sens === "sortie"));
  const avantDe = tout.filter((l) => jourDe(l) < de && l.solde_apres != null)
    .sort((x, y) => instant(y) - instant(x))[0];
  const derniere = dansLaPeriode.filter((l) => l.solde_apres != null)
    .sort((x, y) => instant(y) - instant(x))[0];
  console.log(`\n  période ${de} → ${a} : ${mouvements.length} mouvements, `
    + `${enFrancais(entrees)} F d'entrées (vérité du faux nuage)`);

  // --- 1. LA PÉRIODE PASSÉE ET DENSE ---------------------------------------------
  console.log("\n1. UNE PÉRIODE PASSÉE, SUR UNE CAISSE CHARGÉE");
  const csv = await csvDe(periode, patron);
  const rangs = lireCsv(csv.texte);
  const lignes = lignesDe(rangs);
  verifier("le relevé CSV s'ouvre", csv.statut === 200, String(csv.statut));
  verifier("il porte EXACTEMENT les mouvements de la période",
    lignes.length === mouvements.length, `${lignes.length} / ${mouvements.length}`);
  const refs = new Set(lignes.map((r) => r[14]));
  verifier("les mêmes, une à une (par leur référence)",
    mouvements.every((l) => refs.has(l.reference)) && refs.size === lignes.length);
  verifier("les entrées tombent juste au franc près",
    Number(cle(rangs, "entrees")) === entrees, `${cle(rangs, "entrees")} / ${entrees}`);
  verifier("les sorties aussi", Number(cle(rangs, "sorties")) === sorties,
    `${cle(rangs, "sorties")} / ${sorties}`);
  const credits = lignes.reduce((s, r) => s + centimes(r[9] || 0), 0) / 100;
  verifier("la colonne crédit s'additionne au total annoncé", credits === entrees,
    `${credits}`);

  // LE TÉMOIN : la lecture d'avant, sans borne de fin, réécrite ici.
  const depuisBase = new Date(Date.parse(`${decaler(de, -1)}T00:00:00Z`) - 7 * 86400000)
    .toISOString();
  const jusquaBase = new Date(Date.parse(`${decaler(a, 2)}T00:00:00Z`) + 7 * 86400000)
    .toISOString();
  const lectureAncienne = async (borneDeFin) => {
    const q = `${N}/rest/v1/paiements?select=*&recu_le=gte.${encodeURIComponent(depuisBase)}`
      + (borneDeFin ? `&recu_le=lt.${encodeURIComponent(jusquaBase)}` : "")
      + `&carte=in.${encodeURIComponent(`("${MTN_A}")`)}&order=recu_le.desc&limit=${PLAFOND}`;
    const ls = await (await fetch(q)).json();
    return ls.filter((l) => jourDe(l) >= de && jourDe(l) <= a && l.montant != null
      && ARGENT.includes(l.categorie)).length;
  };
  const sansFin = await lectureAncienne(false);
  const avecFin = await lectureAncienne(true);
  verifier("TÉMOIN : sans borne de fin, la lecture PERD la période",
    sansFin < mouvements.length / 2, `${sansFin} / ${mouvements.length}`);
  verifier("et la même lecture, bornée, la retrouve", avecFin === mouvements.length,
    `${avecFin}`);

  // --- 2. LES BORNES DE JOUR ----------------------------------------------------
  console.log("\n2. L'HEURE QUI FAIT FOI");
  verifier("émis à 23:50 la veille, relevé après minuit : DEHORS", !refs.has("BORD-VEILLE"));
  verifier("émis le dernier jour à 23:59, relevé le lendemain : DEDANS", refs.has("BORD-FIN"));

  // --- 7. CE QUI N'ENTRE PAS, ET CE QUI NE COMPTE PAS ---------------------------
  console.log("\n7. LE SENS INCONNU, LES CODES, LES ÉCHECS");
  const inconnue = lignes.find((r) => r[14] === "SENS-INCONNU");
  verifier("la ligne de sens inconnu est montrée", Boolean(inconnue));
  verifier("… ni au débit ni au crédit, et « non comptée »",
    inconnue && !inconnue[8] && !inconnue[9] && inconnue[16] === "non",
    inconnue ? inconnue.slice(6, 10).join("|") : "");
  verifier("… et dénombrée à part", cle(rangs, "sens_inconnu") === "1",
    String(cle(rangs, "sens_inconnu")));
  verifier("aucun code de confirmation dans le CSV", !csv.texte.includes("483921"));
  verifier("ni échec, ni publicité", !refs.has("ECHEC-1") && !csv.texte.includes("bonus"));

  // --- 5. LES SOLDES ------------------------------------------------------------
  console.log("\n5. LES SOLDES SE LISENT");
  verifier("l'ouverture est le solde annoncé juste avant la période",
    Number(cle(rangs, "solde_ouverture")) === Number(avantDe?.solde_apres),
    `${cle(rangs, "solde_ouverture")} / ${avantDe?.solde_apres}`);
  verifier("la clôture, le dernier annoncé dans la période",
    Number(cle(rangs, "solde_cloture")) === Number(derniere?.solde_apres),
    `${cle(rangs, "solde_cloture")} / ${derniere?.solde_apres}`);

  // --- 6. LE CSV ----------------------------------------------------------------
  console.log("\n6. LE TABLEUR");
  verifier("le tiers piégé sort désamorcé", csv.texte.includes(`"'=HYPERLINK(""http`));
  verifier("aucune cellule ne commence par un signe de formule",
    !lignes.flat().some((c) => /^[=+\-@\t\r]/.test(c)));
  verifier("pas de coupe, pas d'annonce de coupe", !csv.texte.includes("INCOMPLET"));
  const long = await csvDe(`carte=${MTN_A}&de=${de}&a=${decaler(aujourdhui, -30)}`, patron);
  verifier("trois mois sur 3 000 lignes : la coupe se dit EN TÊTE",
    /^"?RELEVÉ INCOMPLET/.test(long.texte.replace(/^﻿/, "")),
    long.texte.slice(1, 40));

  // --- 4. LE PDF ----------------------------------------------------------------
  console.log("\n4. LE PDF, LU");
  const pdf = await pdfDe(periode, patron);
  verifier("c'est un PDF", pdf.statut === 200 && pdf.brut.startsWith("%PDF-"), String(pdf.statut));
  verifier("de plusieurs pages, numérotées", pdf.pages > 1
    && pdf.chaines.includes(`page ${pdf.pages}/${pdf.pages}`), `${pdf.pages} pages`);
  const fois = new Map();
  for (const c of pdf.chaines) fois.set(c, (fois.get(c) ?? 0) + 1);
  const mal = mouvements.filter((l) => fois.get(l.reference) !== 1);
  verifier("chaque référence de la période, exactement une fois", mal.length === 0,
    mal.slice(0, 3).map((l) => `${l.reference}×${fois.get(l.reference) ?? 0}`).join(" "));
  verifier("le numéro de la carte, en tranches", pdf.chaines.includes("677 12 34 56"));
  verifier("les entrées imprimées sont celles du CSV",
    pdf.chaines.includes(`${enFrancais(entrees)} FCFA`), `${enFrancais(entrees)} FCFA`);
  verifier("l'ouverture imprimée aussi",
    pdf.chaines.includes(`${enFrancais(Number(avantDe?.solde_apres))} FCFA`));
  verifier("aucun code de confirmation dans le PDF", !pdf.chaines.join(" ").includes("483921"));
  verifier("le bord de la veille n'y est pas", !pdf.chaines.includes("BORD-VEILLE"));
  verifier("le pied dit d'où viennent les chiffres",
    pdf.chaines.some((c) => c.startsWith("Établi d’après les SMS")));
  const pdfLong = await pdfDe(`carte=${MTN_A}&de=${de}&a=${decaler(aujourdhui, -30)}`, patron);
  verifier("le PDF coupé le dit aussi",
    pdfLong.chaines.some((c) => c.startsWith("RELEVÉ INCOMPLET")));

  // --- 5 bis. LA CARTE SANS NUMÉRO NI SOLDE -------------------------------------
  const orange = await pdfDe(`carte=${SANS_NUMERO}&de=${de}&a=${a}`, patron);
  verifier("la carte sans numéro : l'en-tête le DIT", orange.chaines.includes("numéro non renseigné"));
  const apres = (etiquette) => orange.chaines[orange.chaines.indexOf(etiquette) + 1];
  verifier("ses soldes : « non connu », jamais 0",
    apres("Solde d’ouverture") === "non connu" && apres("Solde de clôture") === "non connu",
    `${apres("Solde d’ouverture")} / ${apres("Solde de clôture")}`);

  // --- TOUTES LES CARTES -----------------------------------------------------------
  const toutes = lireCsv((await csvDe(`carte=tout&de=${de}&a=${a}`, patron)).texte);
  const numeros = toutes.filter((r) => r[0] === "numero").map((r) => r[1]);
  verifier("« toutes mes cartes » : une section par carte, chacune par son NUMÉRO",
    numeros.includes("677 12 34 56") && numeros.includes("677 00 09 99")
      && numeros.includes("numéro non renseigné"), numeros.join(" | "));
  const deB = lignesDe(toutes).filter((r) => r[4] === MTN_B).length;
  const veriteB = (await (await fetch(`${N}/rest/v1/paiements?select=*&carte=eq.${MTN_B}`)).json())
    .filter((l) => jourDe(l) >= de && jourDe(l) <= a && l.montant != null).length;
  verifier("la seconde carte MTN garde ses propres lignes", deB === veriteB, `${deB} / ${veriteB}`);
  const recap = await pdfDe(`carte=tout&de=${de}&a=${a}`, patron);
  verifier("et le PDF finit sur le récapitulatif par numéro",
    recap.chaines.includes("Récapitulatif par numéro"));

  // --- 3. LA PORTÉE ---------------------------------------------------------------
  console.log("\n3. CHACUN NE RELÈVE QUE SES CARTES");
  verifier("sans session : 401", (await releve(`${periode}&format=csv`)).status === 401);
  await poste("/api/comptes", { geste: "creer", prenom: "Awa", nom: "Releve",
    courriel: "vendeur@releve.cm", motdepasse: MDP_VENDEUR }, patron);
  const vendeur = (await (await poste("/api/session",
    { courriel: "vendeur@releve.cm", motdepasse: MDP_VENDEUR })).json()).jeton;
  const idVendeur = (await (await lire("/api/comptes", patron)).json()).comptes
    .find((c) => c.courriel === "vendeur@releve.cm")?.id;
  await poste("/api/comptes", { geste: "attribuer", id: idVendeur, iccid: ORANGE }, patron);
  verifier("le vendeur ne relève pas la carte MTN (404)",
    (await csvDe(periode, vendeur)).statut === 404);
  const sien = await csvDe(`carte=tout&de=${decaler(aujourdhui, -30)}&a=${aujourdhui}`, vendeur);
  verifier("son « tout » ne rend que la carte Orange",
    sien.statut === 200 && sien.texte.includes(ORANGE) && !sien.texte.includes(MTN_A)
      && !sien.texte.includes(MTN_B), String(sien.statut));
  verifier("pas de lien pour une carte qui n'est pas la sienne",
    (await lire(`/api/releve/lien?langue=fr&${periode}&format=pdf`, vendeur)).status === 404);
  const { url } = await (await lire(
    `/api/releve/lien?langue=fr&carte=tout&de=${decaler(aujourdhui, -30)}&a=${aujourdhui}&format=csv`,
    vendeur)).json();
  const parLien = await fetch(url);
  const texteLien = await parLien.text();
  verifier("son lien signé s'ouvre sans session", parLien.status === 200, String(parLien.status));
  verifier("… et ne porte que sa carte", texteLien.includes(ORANGE) && !texteLien.includes(MTN_A));
  const reecrit = (champ, valeur) => {
    const u = new URL(url);
    u.searchParams.set(champ, valeur);
    return fetch(u).then((r) => r.status);
  };
  verifier("réécrit pour la carte MTN : refusé", await reecrit("carte", MTN_A) === 401);
  verifier("réécrit pour une autre période : refusé", await reecrit("de", de) === 401);
  verifier("réécrit en PDF : refusé", await reecrit("format", "pdf") === 401);
  verifier("réécrit pour « tout le monde » : refusé", await reecrit("q", "tout") === 401);
  {
    const passe = Date.now() - 1000;
    const u = new URL(url);
    const id = `tout.${u.searchParams.get("de")}.${u.searchParams.get("a")}.csv.${u.searchParams.get("q")}`;
    u.searchParams.set("e", String(passe));
    u.searchParams.set("s", signer(id, passe));
    verifier("périmé (bien signé, échéance passée) : refusé", (await fetch(u)).status === 401);
  }
  // LA PORTÉE SE RELIT QUAND LE LIEN SERT : la carte reprise, le lien d'il y
  // a une minute ne rend plus rien.
  await poste("/api/comptes", { geste: "retirer", id: idVendeur, iccid: ORANGE }, patron);
  const repris = await fetch(url);
  const texteRepris = repris.ok ? await repris.text() : "";
  verifier("la carte reprise, le même lien ne rend plus rien",
    !texteRepris.includes(ORANGE), String(repris.status));
  const lienPatron = await (await lire(`/api/releve/lien?langue=fr&${periode}&format=pdf`,
    patron)).json();
  const pdfPatron = await fetch(lienPatron.url);
  verifier("le lien du propriétaire, lui, rend le PDF de la carte",
    pdfPatron.ok && new TextDecoder("latin1").decode(
      new Uint8Array(await pdfPatron.arrayBuffer())).startsWith("%PDF-"));

  console.log("\n   La vitrine de démonstration");
  const demo = (await (await poste("/api/session",
    { courriel: "examen@totemlabs.app", motdepasse: "TOTEM-Examen-2026" })).json()).jeton;
  const vitrine = await csvDe(`carte=tout&de=${decaler(aujourdhui, -10)}&a=${aujourdhui}`, demo);
  verifier("la vitrine relève SON jeu",
    vitrine.statut === 200 && vitrine.texte.includes("DÉMO"), String(vitrine.statut));
  verifier("… et rien de la base",
    !/8901|9999|4432|7777|CLIENT A|NKENGAFAC/.test(vitrine.texte));
  const lienVitrine = await (await lire(
    `/api/releve/lien?langue=fr&carte=tout&de=${decaler(aujourdhui, -10)}&a=${aujourdhui}&format=csv`,
    demo)).json();
  const parLienVitrine = await (await fetch(lienVitrine.url)).text();
  verifier("son lien signé aussi : le jeu inventé, rien de la base",
    parLienVitrine.includes("DÉMO") && !/8901|NKENGAFAC|CLIENT A/.test(parLienVitrine));

  console.log("\n   Les demandes mal formées");
  verifier("plus d'une année : refusé",
    (await lire(`/api/releve/lien?carte=tout&de=${decaler(aujourdhui, -400)}&a=${aujourdhui}&format=pdf`,
      patron)).status === 400);
  verifier("un format inconnu : refusé",
    (await releve(`${periode}&format=xls`, patron)).status === 400);
  verifier("une date qui n'existe pas : refusée",
    (await releve(`carte=tout&de=2026-02-30&a=2026-03-01&format=pdf`, patron)).status === 400);
} finally {
  try { process.kill(-serveur.pid, "SIGKILL"); } catch { /* déjà parti */ }
  nuage.kill("SIGKILL");
}

console.log(echecs === 0
  ? "\n✓ Le relevé porte toute la période, rien qu'elle, et à qui elle appartient.\n"
  : `\n✗ ${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
