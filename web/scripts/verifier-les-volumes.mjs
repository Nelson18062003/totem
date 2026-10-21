// LES VOLUMES, MIS À L'ÉPREUVE SUR SIX MOIS DE CAISSE — sans se fier à TOTEM.
//
//     node scripts/verifier-les-volumes.mjs [dossier-des-captures]
//
// Le propriétaire : « juste au franc près, sur toute période choisie ». Un
// écran de chiffres faux se lit avec la même confiance qu'un écran juste ;
// rien, à l'œil, ne les distingue. Ce banc RECOMPTE donc tout de son côté, à
// partir des lignes brutes de la base (le faux nuage, lu page par page),
// avec ses propres règles réécrites ici — sans importer une ligne du noyau —,
// et exige que la plateforme tombe sur le même chiffre, au centime.
//
// CE QU'IL EXIGE :
//
//   1. LA BASE NE REND QU'UNE PAGE : le faux nuage plafonne chaque réponse à
//      mille lignes, comme Supabase par défaut. Six mois de caisse en portent
//      des milliers : une lecture d'un seul coup s'arrête à mille (témoin).
//   2. POUR CHAQUE PÉRIODE (le mois en cours, le mois dernier, six mois, la
//      semaine, hier, des dates choisies, une seule carte) : entrées,
//      sorties, frais, reste, nombre d'opérations, commissions, carte par
//      carte, transferts entre les cartes — au centime ; et la courbe
//      redonne le total.
//   3. LES PIÈGES de la vraie base : l'avis en double MTN, le virement des
//      commissions (deux SMS du compte des commissions, tels que la base les
//      porte AVANT la mise à jour du boîtier), un transfert entre deux
//      cartes, un sens inconnu, un échec, un SMS relevé trois jours après son
//      émission, une opération perdue que le contrôle des soldes doit situer.
//   4. LE RELEVÉ et LE BILAN donnent les mêmes chiffres : le relevé CSV d'une
//      carte, ses entrées, sorties et frais ; le bilan de 90 jours, TOUTES
//      ses lignes (il s'arrêtait à mille).
//   5. LE TÉMOIN : l'ancienne Analyse (l'argent reçu, rien d'autre, sur les
//      mille derniers SMS) doit se tromper sur la même caisse.
//   6. L'ÉCRAN : la page dit les mêmes chiffres, sur un téléphone, une
//      tablette et un ordinateur, sans déborder — et les captures restent
//      pour qu'on les regarde.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const PORT = 3171;
const NUAGE = 4971;
const B = `http://127.0.0.1:${PORT}`;
const N = `http://127.0.0.1:${NUAGE}`;
const SECRET = "secret-d-essai-des-volumes";
const MDP = "le-mot-de-passe-des-volumes";
const FUSEAU = "Africa/Douala";
const CAPTURES = process.argv[2] || null;
const CARTES = [
  { iccid: "89237010000000008901", numero: "677123456", compte: "MTN ·8901", terminal: "douala-faux", exp: "MobileMoney" },
  { iccid: "89237010000000009999", numero: "677000999", compte: "MTN ·9999", terminal: "akwa-faux", exp: "MobileMoney" },
  { iccid: "89237020000000004432", numero: "699001122", compte: "Orange ·4432", terminal: "douala-faux", exp: "OrangeMoney" },
];
const [A, B9, O] = CARTES;

let echecs = 0;
const verifier = (quoi, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(70)} ${detail}`);
};

async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}
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
    new Error("la compilation a échoué — les volumes ne peuvent rien prouver"))));
});

// Le plafond de la vraie base : MILLE lignes par réponse (le réglage d'origine
// de Supabase), posé explicitement — ce banc n'a de sens qu'avec lui.
const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  env: { ...process.env, PORT: String(NUAGE), FAUX_FLOTTE: "1", PLAFOND_LIGNES: "1000" },
  stdio: "ignore", detached: true,
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, SUPABASE_URL: N, SUPABASE_CLE: "peu-importe", SESSION_SECRET: SECRET, FUSEAU },
  stdio: "ignore", detached: true,
});
const arreter = () => {
  for (const p of [serveur, nuage]) { try { process.kill(-p.pid, "SIGTERM"); } catch { /* déjà parti */ } }
};

// --- Les outils, réécrits ici (aucun import du noyau) -------------------------

const formateur = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU });
const jourLocal = (t) => formateur.format(new Date(t));
const decaler = (cle, n) => {
  const [a, m, j] = cle.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j) + n * 86400000).toISOString().slice(0, 10);
};
const moisAvant = (cle, n) => {
  const [a, m] = cle.split("-").map(Number);
  const t = a * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};
const finDuMois = (cle) => {
  const [a, m] = cle.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
const lundi = (cle) => {
  const [a, m, j] = cle.split("-").map(Number);
  return decaler(cle, -((new Date(Date.UTC(a, m - 1, j)).getUTCDay() + 6) % 7));
};
const cts = (v) => (v == null ? 0 : Math.round(Number(v) * 100));
const neuf = (n) => { const c = String(n ?? "").replace(/\D/g, ""); return c.length >= 8 ? c.slice(-9) : null; };
const aDouala = (cle, hhmm) => new Date(`${cle}T${hhmm}:00+01:00`).toISOString();
/** « 12 486 500 F » — comme l'écran l'écrit. */
const ecrit = (n) => `${Math.abs(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[  ]/g, " ")} F`;

// --- La caisse ------------------------------------------------------------------

function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Six mois, trois cartes, les soldes tenus dans l'ordre du temps. */
function caisse(aujourdhui) {
  const r = hasard(2026);
  const lignes = [];
  const solde = { [A.iccid]: 400000, [B9.iccid]: 1500000, [O.iccid]: 250000 };
  const clients = Array.from({ length: 60 }, (_, i) => ({
    nom: `CLIENT ESSAI ${String.fromCharCode(65 + (i % 26))}${i}`,
    numero: `6${String(55000000 + i * 4111).padStart(8, "0")}`,
  }));
  let ref = 500000, perdue = null;
  const pousser = (carte, quand, champs, emisPlusTot = 0) => {
    for (const k of Object.keys(solde)) solde[k] = Math.round(solde[k] * 100) / 100;
    const emis = new Date(Date.parse(quand) - emisPlusTot).toISOString();
    lignes.push({
      terminal: carte.terminal, compte: carte.compte, carte: carte.iccid, expediteur: carte.exp,
      categorie: "message", sens: null, montant: null, frais: null, commission: null, tiers: null,
      numero: null, reference: null, solde_apres: null, nature: null, texte: "essai", lu_le: quand,
      emis_le: emis, recu_le: quand, ...champs,
    });
  };
  const debut = decaler(aujourdhui, -183);
  for (let jour = debut; jour <= aujourdhui; jour = decaler(jour, 1)) {
    const dimanche = new Date(`${jour}T12:00:00Z`).getUTCDay() === 0;
    const n = dimanche ? 8 : 30;
    const minutes = Array.from({ length: n }, () => 5 * 60 + Math.floor(r() * 18.5 * 60)).sort((x, y) => x - y);
    for (let k = 0; k < n; k++) {
      const quand = new Date(Date.parse(aDouala(jour, "00:00")) + minutes[k] * 60000).toISOString();
      if (Date.parse(quand) > Date.now() - 60000) continue;
      const carte = CARTES[Math.floor(r() * 3)];
      const orange = carte === O;
      const c = clients[Math.floor(r() * clients.length)];
      const m = Math.round((500 + r() * 300000) / 500) * 500 + (orange ? 0.6 : 0);
      const tirage = r();
      ref++;
      if (tirage < 0.3) {
        solde[carte.iccid] += m;
        pousser(carte, quand, { categorie: "encaissement", sens: "entree", montant: m, tiers: c.nom, numero: c.numero,
                                reference: `V${ref}`, solde_apres: solde[carte.iccid] });
        if (!orange && r() < 0.35) {
          pousser(carte, quand, { categorie: "doublon", sens: "entree", montant: m, reference: `V${ref}`,
                                  texte: `You have received ${m} FCFA from - ${c.numero}` });
        }
      } else if (tirage < 0.45) {
        const frais = Math.round(m * 0.01);
        solde[carte.iccid] -= m + frais;
        pousser(carte, quand, { categorie: "envoi", sens: "sortie", montant: m, frais, tiers: c.nom, numero: c.numero,
                                reference: `V${ref}`, solde_apres: solde[carte.iccid] });
      } else if (tirage < 0.6) {
        solde[carte.iccid] -= m;
        pousser(carte, quand, { categorie: "depot", sens: "sortie", montant: m, commission: Math.round(m * 0.004),
                                tiers: c.nom, numero: c.numero, reference: `V${ref}`, solde_apres: solde[carte.iccid] });
      } else if (tirage < 0.72) {
        const frais = r() < 0.5 ? Math.round(m * 0.008) : 0;
        solde[carte.iccid] += m;
        pousser(carte, quand, { categorie: "retrait", sens: "entree", montant: m, frais, commission: Math.round(m * 0.003),
                                tiers: c.nom, numero: c.numero, reference: `V${ref}`, solde_apres: solde[carte.iccid] });
      } else if (tirage < 0.76 && !orange) {
        // Un transfert entre les deux cartes MTN : deux SMS, un numéro.
        const autre = carte === A ? B9 : A;
        solde[carte.iccid] -= m;
        solde[autre.iccid] += m;
        pousser(carte, quand, { categorie: "transfert", sens: "sortie", montant: m, frais: 0, numero: autre.numero,
                                tiers: "MOI", reference: `T${ref}`, solde_apres: solde[carte.iccid] });
        pousser(autre, quand, { categorie: "encaissement", sens: "entree", montant: m, numero: carte.numero,
                                tiers: "MOI", reference: `T${ref}`, solde_apres: solde[autre.iccid] });
      } else if (tirage < 0.79 && !orange) {
        // Le virement des commissions, tel que la base le porte AVANT la mise
        // à jour du boîtier : deux « envois » du compte des commissions.
        const v = Math.round(1000 + r() * 20000);
        solde[carte.iccid] += v;
        pousser(carte, quand, { categorie: "encaissement", sens: "entree", montant: v, numero: `237${carte.numero}`,
                                tiers: "ESSAI SERVICES", reference: `C${ref}`, solde_apres: solde[carte.iccid] });
        pousser(carte, quand, { categorie: "envoi", sens: "sortie", montant: v, reference: `C${ref}`, solde_apres: 120,
                                texte: `You have successfully transferred ${v}FCFA commisions to your main account 237${carte.numero}. New Account balance: 120FCFA` });
        pousser(carte, quand, { categorie: "envoi", sens: "sortie", montant: v, numero: `237${carte.numero}`,
                                tiers: "ESSAI SERVICES", reference: `C${ref}`, solde_apres: 120,
                                texte: `You have transferred ${v} XAF to ESSAI SERVICES (237${carte.numero}) from your mobile money account 51234567` });
      } else if (tirage < 0.83) {
        pousser(carte, quand, { categorie: "echec", sens: "sortie", montant: m, reference: `E${ref}`, solde_apres: solde[carte.iccid] });
      } else if (tirage < 0.88) {
        pousser(carte, quand, { categorie: "solde", solde_apres: solde[carte.iccid] });
      } else if (tirage < 0.91) {
        pousser(carte, quand, { categorie: "publicite", texte: "Gagnez 1000 FCFA de bonus !" });
      } else if (tirage < 0.94 && orange) {
        pousser(carte, quand, { categorie: "commission", commission: 150, texte: "Vous avez recu commission de 150F" });
      } else if (tirage < 0.955) {
        pousser(carte, quand, { categorie: "transfert", sens: null, montant: m, reference: `Q${ref}` });
      } else if (tirage < 0.965) {
        pousser(carte, quand, { categorie: "illisible", texte: "Transaction 999 success FCFA" });
      } else if (tirage < 0.975) {
        // Relevé trois jours APRÈS son émission (un boîtier hors ligne) :
        // il compte au jour de l'opérateur.
        solde[carte.iccid] += m;
        const releve = new Date(Math.min(Date.now() - 60000, Date.parse(quand) + 3 * 86400000)).toISOString();
        lignes.push({
          terminal: carte.terminal, compte: carte.compte, carte: carte.iccid, expediteur: carte.exp,
          categorie: "encaissement", sens: "entree", montant: m, frais: null, commission: null, tiers: c.nom,
          numero: c.numero, reference: `L${ref}`, solde_apres: solde[carte.iccid], nature: null,
          texte: "essai", lu_le: releve, emis_le: quand, recu_le: releve,
        });
      }
      if (!perdue && jour === decaler(aujourdhui, -45) && k === Math.floor(n / 2)) {
        solde[B9.iccid] -= 7000;
        perdue = { carte: B9.iccid, jour, montant: 7000 };
      }
    }
  }
  return { lignes, perdue };
}

// --- La vérité, recomptée sans TOTEM --------------------------------------------

const ARGENT = ["encaissement", "envoi", "transfert", "depot", "retrait"];
const moment = (l) => l.emis_le || l.recu_le;
const jourDe = (l) => jourLocal(moment(l));

/** Les règles du dictionnaire, réécrites : ce qui compte, une fois, sans le
 *  compte des commissions, avec les transferts entre les cartes. */
function verite(lignes, de, a, cartes) {
  const numeros = new Map(cartes.map((c) => [c.iccid, neuf(c.numero)]));
  const carteDuNumero = new Map(cartes.map((c) => [neuf(c.numero), c.iccid]));
  const commissions = (l) => /commis+ions?\s+to\s+your\s+main\s+account/i.test(l.texte ?? "")
    || (l.sens === "sortie" && neuf(l.numero) != null && neuf(l.numero) === numeros.get(l.carte));
  const dansLaPeriode = lignes.filter((l) => numeros.has(l.carte) && jourDe(l) >= de && jourDe(l) <= a);
  const argent = dansLaPeriode.filter((l) => !commissions(l) && l.montant != null
    && ARGENT.includes(l.nature ?? l.categorie));
  argent.sort((x, y) => Date.parse(moment(x)) - Date.parse(moment(y)) || x.id - y.id);
  const vus = new Set();
  const uniques = argent.filter((l) => {
    if (!l.reference || l.reference.length < 4) return true;
    const k = `${l.carte}|${l.reference}|${l.sens}|${cts(l.montant)}`;
    if (vus.has(k)) return false;
    vus.add(k);
    return true;
  });
  const connus = uniques.filter((l) => l.sens === "entree" || l.sens === "sortie");
  const internes = new Set();
  for (const s of connus.filter((l) => l.sens === "sortie" && l.reference)) {
    const e = connus.find((x) => x.sens === "entree" && x.reference === s.reference && x.carte !== s.carte
      && cts(x.montant) === cts(s.montant) && !internes.has(x));
    if (e) { internes.add(s); internes.add(e); }
  }
  for (const l of connus) {
    const autre = carteDuNumero.get(neuf(l.numero));
    if (autre && autre !== l.carte) internes.add(l);
  }
  const somme = (ls) => ls.reduce((x, l) => x + cts(l.montant), 0);
  const ext = connus.filter((l) => !internes.has(l));
  const entrees = ext.filter((l) => l.sens === "entree");
  const sorties = ext.filter((l) => l.sens === "sortie");
  // Les frais payés par la carte : ceux de ses SORTIES (le client paie les
  // « charges » d'un retrait).
  const frais = connus.filter((l) => l.sens === "sortie").reduce((x, l) => x + cts(l.frais), 0);
  const parCarte = Object.fromEntries(cartes.map((c) => {
    const siens = connus.filter((l) => l.carte === c.iccid);
    return [c.iccid, {
      e: somme(siens.filter((l) => l.sens === "entree")), s: somme(siens.filter((l) => l.sens === "sortie")),
      f: siens.filter((l) => l.sens === "sortie").reduce((x, l) => x + cts(l.frais), 0),
    }];
  }));
  let com = connus.reduce((x, l) => x + cts(l.commission), 0);
  com += dansLaPeriode.filter((l) => l.categorie === "commission" && l.montant == null)
    .reduce((x, l) => x + cts(l.commission), 0);
  return {
    e: somme(entrees), s: somme(sorties), f: frais, n: ext.length, nE: entrees.length, nS: sorties.length,
    interne: somme(connus.filter((l) => internes.has(l) && l.sens === "sortie")), com: com, parCarte,
    sms: dansLaPeriode.length,
  };
}

// --- L'essai ------------------------------------------------------------------------

let nav = null;
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${B}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }
  const inscrit = await (await fetch(`${B}/api/inscription`, {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.71.0.1" },
    body: JSON.stringify({ courriel: "patron@volumes.cm", motdepasse: MDP }),
  })).json();
  const jeton = inscrit.jeton;
  verifier("le propriétaire entre", Boolean(jeton));
  if (!jeton) throw new Error("sans session, les volumes ne prouvent rien");
  const lire = async (chemin) => {
    const r = await fetch(B + chemin, { headers: { authorization: `Bearer ${jeton}` } });
    return { statut: r.status, json: r.ok ? await r.json() : null, r };
  };

  const aujourdhui = jourLocal(Date.now());
  const { lignes: semees, perdue } = caisse(aujourdhui);
  for (let i = 0; i < semees.length; i += 2000) {
    await fetch(`${N}/rest/v1/paiements`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(semees.slice(i, i + 2000)),
    });
  }
  // LA VÉRITÉ, lue page par page dans la base — c'est elle qui fait foi.
  let base = [];
  for (let off = 0; ; off += 1000) {
    const page = await (await fetch(`${N}/rest/v1/paiements?select=*&order=id.asc&limit=1000&offset=${off}`)).json();
    base = base.concat(page);
    if (page.length < 1000) break;
  }
  verifier("la base porte six mois de caisse", base.length > 5000, `${base.length} SMS`);

  // 1. Le plafond de la base, et ce qu'il fait à une lecture d'un coup.
  const dUnCoup = await (await fetch(`${N}/rest/v1/paiements?select=*&order=recu_le.desc&limit=20000`)).json();
  verifier("TÉMOIN : « vingt mille d'un coup » n'en rend que mille", dUnCoup.length === 1000, `${dUnCoup.length} lignes`);

  // 2. Chaque période, au centime.
  const hier = decaler(aujourdhui, -1);
  const moisDernier = moisAvant(aujourdhui, 1);
  const periodes = [
    { nom: "le mois en cours", q: `periode=mois&jour=${aujourdhui}`, de: `${aujourdhui.slice(0, 8)}01`, a: aujourdhui },
    { nom: "le mois dernier", q: `periode=mois&jour=${moisDernier}`, de: moisDernier, a: finDuMois(moisDernier) },
    { nom: "six mois", q: `periode=6mois&jour=${aujourdhui}`, de: moisAvant(aujourdhui, 5), a: aujourdhui },
    { nom: "la semaine", q: `periode=semaine&jour=${aujourdhui}`, de: lundi(aujourdhui), a: aujourdhui },
    { nom: "hier", q: `periode=jour&jour=${hier}`, de: hier, a: hier },
    { nom: "des dates choisies", q: `periode=dates&de=${decaler(aujourdhui, -100)}&a=${decaler(aujourdhui, -40)}`,
      de: decaler(aujourdhui, -100), a: decaler(aujourdhui, -40) },
    { nom: "une seule carte (MTN ·8901), le mois dernier", q: `periode=mois&jour=${moisDernier}&carte=${A.iccid}`,
      de: moisDernier, a: finDuMois(moisDernier), cartes: [A] },
  ];
  let volumesDuMoisDernier = null;
  for (const p of periodes) {
    console.log(`\n— ${p.nom} (${p.de} → ${p.a})`);
    const cartes = p.cartes ?? CARTES;
    const v = verite(base, p.de, p.a, cartes);
    const debut = Date.now();
    const { statut, json } = await lire(`/api/volumes?langue=fr&${p.q}`);
    const duree = Date.now() - debut;
    verifier("la plateforme répond", statut === 200, `${statut} · ${duree} ms`);
    if (p.nom === "six mois") verifier("six mois se comptent en moins de 8 secondes", duree < 8000, `${duree} ms`);
    if (!json) continue;
    const t = json.volumes.totaux;
    verifier("les entrées, au centime", cts(t.entrees) === v.e, `${t.entrees} / ${v.e / 100}`);
    verifier("les sorties, au centime", cts(t.sorties) === v.s, `${t.sorties} / ${v.s / 100}`);
    verifier("les frais, au centime", cts(t.frais) === v.f, `${t.frais} / ${v.f / 100}`);
    verifier("le reste = entrées − sorties − frais", cts(t.net) === v.e - v.s - v.f, `${t.net}`);
    verifier("le nombre d'opérations", t.n === v.n && t.nEntrees === v.nE && t.nSorties === v.nS, `${t.n} / ${v.n}`);
    verifier("les commissions gagnées, à part", cts(json.volumes.cles.commissions) === v.com,
      `${json.volumes.cles.commissions} / ${v.com / 100}`);
    verifier("les transferts entre les cartes, à part", cts(json.volumes.interne.montant) === v.interne,
      `${json.volumes.interne.montant} / ${v.interne / 100}`);
    for (const c of cartes) {
      const d = json.volumes.parCarte.find((x) => x.iccid === c.iccid);
      const w = v.parCarte[c.iccid];
      verifier(`${c.compte} : entrées, sorties, frais`,
        d && cts(d.totaux.entrees) === w.e && cts(d.totaux.sorties) === w.s && cts(d.totaux.frais) === w.f,
        d ? `${d.totaux.entrees}/${w.e / 100} · ${d.totaux.sorties}/${w.s / 100}` : "absente");
    }
    const serie = json.volumes.serie;
    verifier("la courbe redonne le total",
      serie.reduce((x, c) => x + cts(c.entrees), 0) === v.e && serie.reduce((x, c) => x + cts(c.sorties), 0) === v.s,
      `${serie.length} colonnes`);
    verifier("aucune coupe annoncée", json.tronque === false);
    if (p.nom === "le mois dernier") volumesDuMoisDernier = json;
  }

  // 3. Le contrôle des soldes : l'opération perdue, à sa place.
  console.log("\n— le contrôle des soldes");
  const moisPerdue = await lire(`/api/volumes?langue=fr&periode=mois&jour=${perdue.jour}`);
  for (const c of moisPerdue.json.volumes.parCarte.filter((x) => CARTES.some((k) => k.iccid === x.iccid))) {
    if (c.iccid === perdue.carte) {
      verifier(`${c.libelle} : l'écart de l'opération perdue`, cts(c.soldes.ecart) === -cts(perdue.montant), `${c.soldes.ecart}`);
      verifier(`${c.libelle} : l'écart est situé`, c.ruptures.some((x) => cts(x.montant) === -cts(perdue.montant)));
    } else {
      verifier(`${c.libelle} : rien ne manque`, c.soldes.ecart === 0, `${c.soldes.ecart}`);
    }
  }

  // 4. Le relevé et le bilan.
  console.log("\n— le relevé et le bilan");
  const csv = await (await fetch(`${B}/api/releve?langue=fr&carte=${A.iccid}&de=${moisDernier}&a=${finDuMois(moisDernier)}&format=csv`,
    { headers: { authorization: `Bearer ${jeton}` } })).text();
  const cle = (nom) => Number(csv.split(/\r?\n/).map((l) => l.split(";")).find((r) => r[0] === nom)?.[1]);
  const deA = volumesDuMoisDernier?.volumes.parCarte.find((x) => x.iccid === A.iccid);
  verifier("le relevé de MTN ·8901 : mêmes entrées, sorties, frais",
    deA && cts(cle("entrees")) === cts(deA.totaux.entrees) && cts(cle("sorties")) === cts(deA.totaux.sorties)
      && cts(cle("frais")) === cts(deA.totaux.frais),
    `${cle("entrees")} / ${deA?.totaux.entrees}`);
  verifier("le relevé n'est pas coupé", !/INCOMPLET/.test(csv));
  const bilan = await (await fetch(`${B}/api/bilan?jours=90`, { headers: { authorization: `Bearer ${jeton}` } })).text();
  const lignesDuBilan = bilan.split(/\r?\n/).filter((l) => /^"?\d{4}-\d{2}-\d{2}/.test(l)).length;
  const depuis = Date.parse(aDouala(decaler(aujourdhui, -89), "00:00"));
  const attendues = base.filter((l) => Date.parse(moment(l)) >= depuis && Date.parse(moment(l)) <= Date.now()).length;
  verifier("le bilan de 90 jours porte TOUTES ses lignes (plus de mille)", lignesDuBilan === attendues && attendues > 1000,
    `${lignesDuBilan} / ${attendues}`);
  verifier("le bilan n'est pas déclaré incomplet", !/INCOMPLET/.test(bilan));

  // 5. Le témoin : l'ancienne Analyse sur la même caisse.
  console.log("\n— le témoin");
  const septJours = verite(base, decaler(aujourdhui, -6), aujourdhui, CARTES);
  const ancienne = dUnCoup.filter((l) => l.sens === "entree" && l.montant != null
    && jourDe(l) >= decaler(aujourdhui, -6)).reduce((x, l) => x + cts(l.montant), 0);
  verifier("TÉMOIN : l'ancienne Analyse se trompe sur sept jours", ancienne !== septJours.e,
    `${ancienne / 100} au lieu de ${septJours.e / 100}`);
  const sixMois = verite(base, moisAvant(aujourdhui, 5), aujourdhui, CARTES);
  const ancienneSix = dUnCoup.filter((l) => l.sens === "entree" && l.montant != null).reduce((x, l) => x + cts(l.montant), 0);
  verifier("TÉMOIN : sur six mois, mille SMS ne suffisent pas", ancienneSix < sixMois.e,
    `${ancienneSix / 100} au lieu de ${sixMois.e / 100}`);

  // 6. L'écran, sur un téléphone, une tablette, un ordinateur.
  console.log("\n— l'écran");
  if (CAPTURES) mkdirSync(CAPTURES, { recursive: true });
  nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const vMois = verite(base, `${aujourdhui.slice(0, 8)}01`, aujourdhui, CARTES);
  for (const [nom, largeur, hauteur] of [["telephone", 390, 844], ["petit", 320, 640], ["tablette", 820, 1180], ["ordinateur", 1440, 900]]) {
    const ctx = await nav.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: "totem_session", value: jeton, domain: "127.0.0.1", path: "/" },
                          { name: "totem_langue", value: "fr", domain: "127.0.0.1", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${B}/volumes?periode=mois&jour=${aujourdhui}`, { waitUntil: "networkidle" });
    // On mesure avec la police de la page, pas avec celle de secours.
    await page.evaluate(() => document.fonts.ready);
    const texte = await page.locator("body").innerText();
    verifier(`${nom} : les entrées du mois, au franc`, texte.includes(ecrit(vMois.e / 100)), ecrit(vMois.e / 100));
    verifier(`${nom} : les sorties du mois, au franc`, texte.includes(ecrit(vMois.s / 100)), ecrit(vMois.s / 100));
    const reste = (vMois.e - vMois.s - vMois.f) / 100;
    verifier(`${nom} : le reste`, texte.includes(`${reste >= 0 ? "+" : "−"}${ecrit(reste)}`));
    // Un débordement se NOMME : « 15 px » ne dit pas où chercher. Et le
    // coupable n'est pas ce qui dépasse (un titre poussé par sa colonne),
    // c'est ce qui ne sait pas se faire plus étroit : partant du conteneur
    // dont les enfants dépassent, on descend vers l'enfant le plus large à sa
    // largeur MINIMALE, et on nomme les trois premiers étages.
    const { deborde, fautifs } = await page.evaluate(() => {
      const minimale = (e) => { const w = e.style.width; e.style.width = "min-content"; const l = e.offsetWidth; e.style.width = w; return l; };
      const nom = (e) => `<${e.tagName.toLowerCase()}> « ${(e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32)} » ${minimale(e)} px`;
      const trop = [...document.querySelectorAll("main *")].find((e) => e.parentElement && e.offsetWidth > e.parentElement.clientWidth + 0.5);
      const fautifs = [];
      for (let e = trop?.parentElement, n = 0; e && n < 8; n++) {
        const enfants = [...e.children].filter((c) => getComputedStyle(c).position !== "absolute");
        if (!enfants.length) break;
        e = enfants.reduce((a, b) => (minimale(b) > minimale(a) ? b : a));
        fautifs.push(nom(e));
      }
      return { deborde: document.documentElement.scrollWidth - innerWidth, fautifs: fautifs.slice(0, 3) };
    });
    verifier(`${nom} : rien ne déborde sur le côté`, deborde <= 0, `${deborde} px${deborde > 0 ? ` — ${fautifs.join(", ")}` : ""}`);
    // « Rien ne déborde » ne voit pas un nom qui sort de SA pastille : à
    // 320 points, « Semaine » passait sous « Mois », « 6 mois » sur deux
    // lignes, et la page ne débordait pas d'un point.
    const pastilles = await page.evaluate(() => [...document.querySelectorAll('nav a[href*="periode="]')]
      .filter((a) => a.scrollWidth > a.clientWidth + 0.5 || a.getClientRects().length !== 1 || a.offsetHeight > 48)
      .map((a) => a.textContent.trim()));
    verifier(`${nom} : chaque période tient dans sa pastille, sur une ligne`, pastilles.length === 0, pastilles.join(", "));
    if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/volumes-${nom}.png`, fullPage: true });
    if (nom === "telephone" && CAPTURES) {
      await page.goto(`${B}/volumes?periode=mois&jour=${perdue.jour}&carte=${perdue.carte}`, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${CAPTURES}/volumes-une-carte.png`, fullPage: true });
      const premier = moisPerdue.json.volumes.correspondants[0];
      await page.goto(`${B}/volumes?periode=6mois&jour=${aujourdhui}&qui=${encodeURIComponent(premier.cle)}`, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${CAPTURES}/volumes-correspondant.png`, fullPage: true });
    }
    await ctx.close();
  }
} catch (e) {
  echecs++;
  console.error(`\n✗ ${e.stack || e}`);
} finally {
  if (nav) await nav.close();
  arreter();
}

console.log(echecs ? `\n✗ ${echecs} échec(s)\n` : "\n✓ Les volumes tombent juste, au centime, sur six mois.\n");
process.exit(echecs ? 1 : 0);
