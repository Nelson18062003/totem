// LES VOLUMES — le calcul que le site et le téléphone reçoivent tel quel.
//
// Ce qui se garde ici, et pourquoi chaque règle a son essai :
//   — le DICTIONNAIRE validé par le propriétaire (ce qui compte, ce qui reste
//     dehors, les frais à part, les commissions jamais dans les entrées) ;
//   — la COHÉRENCE, sans se fier au calcul lui-même : la somme des colonnes
//     redonne le total, une période coupée en deux redonne la même chose,
//     minuit tombe à l'heure de Douala ;
//   — l'ACCORD avec le relevé de compte, carte par carte, au centime ;
//   — le TÉMOIN : l'ancien calcul de l'Analyse, lancé sur la même caisse,
//     doit se tromper — sinon l'essai ne prouverait rien.
//
// La caisse d'essai est DURE à dessein : six mois, trois cartes, des dépôts
// et des retraits d'agent, des transferts entre les cartes, des avis en
// double, des virements de commissions, des montants décimaux d'Orange, des
// sens inconnus, des SMS illisibles. Une caisse trop sage cache le défaut.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculerVolumes, colonnesDe, creneauLePlusCharge, decalerMois, famillesDe, lundiDe,
  nomDeLaPeriode, numeroNormal, periodePrecedente, periodeVoisine, periodeVolumes, variation,
  type CarteVolumes, type PeriodeVolumes,
} from "../volumes";
import { sectionDuReleve, totauxDuReleve, lignesDuReleve, dernierSoldeAvant } from "../releve";
import { resumeSemaine } from "../analyse";
import { decalerJour } from "../periodes";
import { jourLocal, type Paiement } from "../types";

const DOUALA = "Africa/Douala";
const MTN_A = "89237010000000001111";
const MTN_B = "89237010000000002222";
const ORANGE = "89237020000000003333";
const CARTES: CarteVolumes[] = [
  { iccid: MTN_A, numero: "650112233", operateur: "MTN", libelle: "MTN ·1111" },
  { iccid: MTN_B, numero: "670445566", operateur: "MTN", libelle: "MTN ·2222" },
  { iccid: ORANGE, numero: "690778899", operateur: "Orange", libelle: "Orange ·3333" },
];

let suivant = 1;
function sms(p: Partial<Paiement> & { quand: string }): Paiement {
  const id = suivant++;
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: DOUALA, hour: "2-digit", minute: "2-digit" })
    .format(new Date(p.quand));
  return {
    id: String(id), sim: "MTN ·1111", carte: MTN_A, sens: "in", nom: "MobileMoney",
    tiers: "", numero: "", montant: 1000, heure, date: "",
    jour: jourLocal(new Date(p.quand), DOUALA), recuLe: p.quand,
    categorie: "encaissement", nature: null, reference: `REF${id}`, soldeApres: null,
    smsBrut: "", recu: null, sourceId: id, terminal: "douala", nonLu: false, ...p,
  };
}

const periode = (genre: PeriodeVolumes["genre"], repere: string, aujourdhui = "2026-10-21",
                 de?: string, a?: string) => {
  const p = periodeVolumes(genre, repere, aujourdhui, de, a);
  assert.ok(p, `période ${genre} ${repere} refusée`);
  return p;
};
const volumes = (p: PeriodeVolumes, lignes: Paiement[], cartes = CARTES) =>
  calculerVolumes({ periode: p, lignes, cartes, fuseau: DOUALA });

// --- La caisse de six mois ---------------------------------------------------

/** Un hasard qui se rejoue : la même graine donne la même caisse. */
function hasard(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Six mois de caisse, avec les soldes annoncés TENUS : chaque SMS d'argent
 * porte le solde exact après l'opération. Une seule opération « perdue » (le
 * solde bouge, le SMS n'existe pas) : le contrôle doit la trouver, et
 * seulement elle.
 */
function caisse(graine = 7) {
  const r = hasard(graine);
  const lignes: Paiement[] = [];
  const solde: Record<string, number> = { [MTN_A]: 500_000, [MTN_B]: 2_000_000, [ORANGE]: 300_000 };
  const sim: Record<string, string> = { [MTN_A]: "MTN ·1111", [MTN_B]: "MTN ·2222", [ORANGE]: "Orange ·3333" };
  const clients = Array.from({ length: 40 }, (_, i) => ({
    nom: `CLIENT ESSAI ${String.fromCharCode(65 + (i % 26))}${i}`, numero: `6${String(70000000 + i * 1337).padStart(8, "0")}`,
  }));
  let perdue = null as { carte: string; jour: string; montant: number } | null;
  let ref = 100000;
  const pousser = (carte: string, quand: string, p: Partial<Paiement>) => {
    for (const c of Object.keys(solde)) solde[c] = Math.round(solde[c] * 100) / 100;
    const q = p.soldeApres != null && p.soldeApres !== 248 ? { ...p, soldeApres: solde[carte] } : p;
    lignes.push(sms({ carte, sim: sim[carte], quand, ...q }));
  };
  const montantRond = () => Math.round((1000 + r() * 400_000) / 500) * 500;
  for (let jour = "2026-04-01"; jour <= "2026-10-21"; jour = decalerJour(jour, 1)) {
    const dimanche = new Date(`${jour}T12:00:00Z`).getUTCDay() === 0;
    const n = dimanche ? 3 : 14;
    // Les heures du jour, dans l'ordre : chaque solde annoncé suit le
    // précédent. De 5 h à 23 h 59, heure de Douala (UTC+1) — minuit compris.
    const heures = Array.from({ length: n }, () => 4 * 60 + Math.floor(r() * 20 * 60)).sort((x, y) => x - y);
    for (let k = 0; k < n; k++) {
      const carte = [MTN_A, MTN_B, ORANGE][Math.floor(r() * 3)];
      const minutes = heures[k];
      const quand = new Date(Date.parse(`${jour}T00:00:00Z`) + minutes * 60_000).toISOString();
      const c = clients[Math.floor(r() * clients.length)];
      const tirage = r();
      ref++;
      const orange = carte === ORANGE;
      const m = orange ? montantRond() + 0.6 : montantRond();
      if (tirage < 0.30) {
        solde[carte] += m;
        pousser(carte, quand, { categorie: "encaissement", sens: "in", montant: m, tiers: c.nom, numero: c.numero,
                                reference: `R${ref}`, soldeApres: solde[carte] });
        // L'avis en double de MTN : même opération, rangé « doublon ».
        if (!orange && r() < 0.3) {
          pousser(carte, quand, { categorie: "doublon", sens: "in", montant: m, reference: `R${ref}`,
                                  soldeApres: solde[carte] });
        }
      } else if (tirage < 0.45) {
        const frais = Math.round(m * 0.01);
        solde[carte] -= m + frais;
        pousser(carte, quand, { categorie: "envoi", sens: "out", montant: m, frais, tiers: c.nom,
                                numero: c.numero, reference: `R${ref}`, soldeApres: solde[carte] });
      } else if (tirage < 0.60) {
        // Dépôt d'un client chez l'agent : le solde électronique BAISSE.
        solde[carte] -= m;
        pousser(carte, quand, { categorie: "depot", sens: "out", montant: m, commission: Math.round(m * 0.004),
                                tiers: c.nom, numero: c.numero, reference: `R${ref}`, soldeApres: solde[carte] });
      } else if (tirage < 0.72) {
        // Retrait d'un client : le solde MONTE.
        solde[carte] += m;
        pousser(carte, quand, { categorie: "retrait", sens: "in", montant: m, commission: Math.round(m * 0.003),
                                tiers: c.nom, numero: c.numero, reference: `R${ref}`, soldeApres: solde[carte] });
      } else if (tirage < 0.76 && !orange) {
        // Un transfert ENTRE les deux cartes MTN : deux SMS, un numéro.
        const autre = carte === MTN_A ? MTN_B : MTN_A;
        const numAutre = CARTES.find((x) => x.iccid === autre)!.numero;
        const numSien = CARTES.find((x) => x.iccid === carte)!.numero;
        solde[carte] -= m;
        solde[autre] += m;
        pousser(carte, quand, { categorie: "transfert", sens: "out", montant: m, frais: 0, numero: numAutre,
                                tiers: "MOI", reference: `T${ref}`, soldeApres: solde[carte] });
        pousser(autre, quand, { categorie: "transfert", sens: "in", montant: m, numero: numSien,
                                tiers: "MOI", reference: `T${ref}`, soldeApres: solde[autre] });
      } else if (tirage < 0.79 && !orange) {
        // Le virement des commissions MTN : « reçu de » la carte elle-même.
        const v = Math.round(1000 + r() * 20000);
        solde[carte] += v;
        const num = CARTES.find((x) => x.iccid === carte)!.numero;
        pousser(carte, quand, { categorie: "encaissement", sens: "in", montant: v, numero: num, tiers: "MOI",
                                reference: `C${ref}`, soldeApres: solde[carte] });
        // Les deux SMS du compte des commissions : rangés « doublon », et
        // leur solde est celui des commissions — il ne doit servir à rien.
        pousser(carte, quand, { categorie: "doublon", sens: "out", montant: v, reference: `C${ref}`, soldeApres: 248 });
      } else if (tirage < 0.83) {
        pousser(carte, quand, { categorie: "echec", sens: "out", montant: m, reference: `E${ref}`, soldeApres: solde[carte] });
      } else if (tirage < 0.88) {
        pousser(carte, quand, { categorie: "solde", sens: "?", montant: null, reference: "", soldeApres: solde[carte] });
      } else if (tirage < 0.92) {
        pousser(carte, quand, { categorie: "publicite", sens: "?", montant: null, reference: "" });
      } else if (tirage < 0.94 && orange) {
        pousser(carte, quand, { categorie: "commission", sens: "?", montant: null, commission: 150, reference: "" });
      } else if (tirage < 0.955) {
        // Un sens que le SMS ne permet pas de trancher : montré, pas compté.
        // Le solde ne bouge pas (l'opérateur ne l'a pas fait passer) — c'est
        // un SMS d'information sur un transfert d'une tierce partie.
        pousser(carte, quand, { categorie: "transfert", sens: "?", montant: m, reference: `Q${ref}` });
      } else if (tirage < 0.965) {
        pousser(carte, quand, { categorie: "illisible", sens: "?", montant: null, reference: "",
                                smsBrut: "Transaction ID 999 success FCFA" });
      }
      // L'opération PERDUE, à midi le 12 septembre : le solde bouge, aucun SMS.
      if (!perdue && jour === "2026-09-12" && k === Math.floor(n / 2)) {
        solde[MTN_B] -= 5000;
        perdue = { carte: MTN_B, jour, montant: 5000 };
      }
    }
  }
  return { lignes, perdue };
}

const LA_CAISSE = caisse();

// --- Les périodes ------------------------------------------------------------

test("chaque genre de période tombe sur ses jours, et le futur est refusé", () => {
  assert.deepEqual(pick(periode("jour", "2026-10-21")), { de: "2026-10-21", a: "2026-10-21", pas: "heure" });
  // Le 21 octobre 2026 est un mercredi : la semaine part du lundi 19.
  assert.deepEqual(pick(periode("semaine", "2026-10-21")), { de: "2026-10-19", a: "2026-10-25", pas: "jour" });
  assert.deepEqual(pick(periode("mois", "2026-10-21")), { de: "2026-10-01", a: "2026-10-31", pas: "jour" });
  assert.deepEqual(pick(periode("6mois", "2026-10-21")), { de: "2026-05-01", a: "2026-10-31", pas: "semaine" });
  assert.deepEqual(pick(periode("dates", "", "2026-10-21", "2026-10-09", "2026-10-03")),
                   { de: "2026-10-03", a: "2026-10-09", pas: "jour" });
  assert.equal(periode("dates", "", "2026-10-21", "2026-01-01", "2026-10-01").pas, "mois");
  assert.equal(periode("dates", "", "2026-10-21", "2026-06-01", "2026-10-01").pas, "semaine");
  assert.equal(periodeVolumes("jour", "2026-10-22", "2026-10-21"), null, "demain n'a rien à montrer");
  assert.equal(periodeVolumes("dates", null, "2026-10-21", "2025-01-01", "2026-10-01"), null, "plus de 366 jours");
  assert.equal(periodeVolumes("dates", null, "2026-10-21", "2026-02-30", "2026-03-01"), null, "le 30 février n'existe pas");
  const mois = periode("mois", "2026-10-21");
  assert.equal(mois.enCours, true);
  assert.equal(mois.jusqua, "2026-10-21");
  assert.equal(periode("mois", "2026-09-10").enCours, false);
});

function pick(p: PeriodeVolumes) {
  return { de: p.de, a: p.a, pas: p.pas };
}

test("les flèches mènent à la période voisine, jamais dans le futur", () => {
  const oct = periode("mois", "2026-10-21");
  assert.equal(periodeVoisine(oct, -1, "2026-10-21")?.de, "2026-09-01");
  assert.equal(periodeVoisine(oct, 1, "2026-10-21"), null);
  assert.equal(periodeVoisine(periode("semaine", "2026-10-21"), -1, "2026-10-21")?.de, "2026-10-12");
  assert.equal(periodeVoisine(periode("6mois", "2026-10-21"), -1, "2026-10-21")?.de, "2025-11-01");
  const d = periode("dates", "", "2026-10-21", "2026-10-03", "2026-10-09");
  assert.deepEqual(pick(periodeVoisine(d, -1, "2026-10-21")!), { de: "2026-09-26", a: "2026-10-02", pas: "jour" });
  // Le 31 mars moins un mois tombe le 28 février, pas le 3 mars.
  assert.equal(decalerMois("2026-03-31", -1), "2026-02-28");
  assert.equal(lundiDe("2026-10-04"), "2026-09-28");
});

test("la comparaison se fait sur les MÊMES jours de la période d'avant", () => {
  // Un mois en cours : le 1er–21 octobre contre le 1er–21 septembre.
  assert.deepEqual(periodePrecedente(periode("mois", "2026-10-21")), { de: "2026-09-01", a: "2026-09-21" });
  // Un mois fini : le mois d'avant, entier.
  assert.deepEqual(periodePrecedente(periode("mois", "2026-10-21", "2026-11-05")), { de: "2026-09-01", a: "2026-09-30" });
  assert.deepEqual(periodePrecedente(periode("mois", "2026-03-15", "2026-10-21")), { de: "2026-02-01", a: "2026-02-28" });
  // Une semaine en cours (lundi–mercredi) contre lundi–mercredi d'avant.
  assert.deepEqual(periodePrecedente(periode("semaine", "2026-10-21")), { de: "2026-10-12", a: "2026-10-14" });
  assert.deepEqual(periodePrecedente(periode("jour", "2026-10-21")), { de: "2026-10-20", a: "2026-10-20" });
  assert.deepEqual(periodePrecedente(periode("dates", "", "2026-10-21", "2026-10-01", "2026-10-10")),
                   { de: "2026-09-21", a: "2026-09-30" });
  assert.equal(variation(110, 100), 10);
  assert.equal(variation(5, 0), null, "rien avant : pas de pourcentage inventé");
});

// --- Le dictionnaire ---------------------------------------------------------

test("le dictionnaire : ce qui compte, ce qui reste dehors, les frais à part", () => {
  const p = periode("jour", "2026-03-02", "2026-10-21");
  const lignes = [
    sms({ quand: "2026-03-02T09:00:00Z", categorie: "encaissement", sens: "in", montant: 10_000 }),
    sms({ quand: "2026-03-02T09:01:00Z", categorie: "envoi", sens: "out", montant: 4_000, frais: 100 }),
    sms({ quand: "2026-03-02T09:02:00Z", categorie: "depot", sens: "out", montant: 3_000, commission: 12 }),
    sms({ quand: "2026-03-02T09:03:00Z", categorie: "retrait", sens: "in", montant: 2_000, commission: 9 }),
    sms({ quand: "2026-03-02T09:04:00Z", categorie: "echec", sens: "out", montant: 99_999 }),
    sms({ quand: "2026-03-02T09:05:00Z", categorie: "publicite", sens: "?", montant: null }),
    sms({ quand: "2026-03-02T09:06:00Z", categorie: "code", sens: "?", montant: null }),
    sms({ quand: "2026-03-02T09:07:00Z", categorie: "solde", sens: "?", montant: null, soldeApres: 1 }),
    sms({ quand: "2026-03-02T09:08:00Z", categorie: "doublon", sens: "in", montant: 10_000 }),
    sms({ quand: "2026-03-02T09:09:00Z", categorie: "transfert", sens: "?", montant: 7_777 }),
    sms({ quand: "2026-03-02T09:10:00Z", categorie: "illisible", sens: "?", montant: null }),
    sms({ quand: "2026-03-02T09:11:00Z", categorie: "commission", sens: "?", montant: null, commission: 150 }),
    // Choisi à la main : ce « message » est un retrait.
    sms({ quand: "2026-03-02T09:12:00Z", categorie: "message", nature: "retrait", sens: "in", montant: 500 }),
  ];
  const v = volumes(p, lignes, [CARTES[0]]);
  assert.deepEqual(
    { e: v.totaux.entrees, s: v.totaux.sorties, f: v.totaux.frais, net: v.totaux.net, n: v.totaux.n },
    { e: 12_500, s: 7_000, f: 100, net: 5_400, n: 5 });
  assert.equal(v.cles.commissions, 171, "12 + 9 + 150 : à part, jamais dans les entrées");
  assert.equal(v.avertissements.aVerifier, 1, "le sens inconnu est dénombré");
  assert.equal(v.avertissements.illisibles, 1);
  assert.deepEqual(v.parType.map((t) => `${t.type}:${t.montant}`),
                   ["argent_recu:10000", "retrait_client:2500", "argent_envoye:4000", "depot_client:3000"]);
  assert.equal(v.cles.moyenne, Math.round(19_500 / 5));
});

test("une opération annoncée deux fois se compte une fois ; deux cartes, c'est un transfert entre elles", () => {
  const p = periode("jour", "2026-03-02", "2026-10-21");
  const lignes = [
    sms({ quand: "2026-03-02T09:00:00Z", carte: MTN_A, sens: "in", montant: 9_000, reference: "18490853656" }),
    // Même carte, même numéro, même sens, même montant : le même avis.
    sms({ quand: "2026-03-02T09:00:01Z", carte: MTN_A, sens: "in", montant: 9_000, reference: "18490853656" }),
    // Un transfert de la carte A vers la carte B.
    sms({ quand: "2026-03-02T10:00:00Z", carte: MTN_A, categorie: "transfert", sens: "out", montant: 10_150_000,
          reference: "TX777", frais: 0 }),
    sms({ quand: "2026-03-02T10:00:02Z", carte: MTN_B, sim: "MTN ·2222", categorie: "encaissement", sens: "in",
          montant: 10_150_000, reference: "TX777" }),
  ];
  const v = volumes(p, lignes);
  assert.equal(v.totaux.entrees, 9_000, "l'avis en double ne compte pas, le transfert interne non plus");
  assert.equal(v.totaux.sorties, 0);
  assert.deepEqual(v.interne, { montant: 10_150_000, n: 1 });
  const a = v.parCarte.find((c) => c.iccid === MTN_A)!;
  const b = v.parCarte.find((c) => c.iccid === MTN_B)!;
  assert.equal(a.totaux.sorties, 10_150_000, "sur la carte, le transfert compte : ses soldes en dépendent");
  assert.equal(b.totaux.entrees, 10_150_000);
  assert.equal(a.interneEnvoye, 10_150_000);
  // La somme des NETS des cartes redonne le net d'ensemble.
  assert.equal(v.parCarte.reduce((x, c) => x + c.totaux.net, 0), v.totaux.net);
  // Une seule carte choisie : l'autre n'est pas dans la sélection, le
  // transfert est une vraie sortie.
  const seule = volumes(p, lignes, [CARTES[0]]);
  assert.equal(seule.totaux.sorties, 10_150_000);
});

test("le virement des commissions sur la carte est UNE entrée ; le compte des commissions ne sert pas de solde", () => {
  const p = periode("jour", "2026-08-25", "2026-10-21");
  const lignes = [
    sms({ quand: "2026-08-24T18:00:00Z", categorie: "solde", sens: "?", montant: null, soldeApres: 100 }),
    sms({ quand: "2026-08-25T05:04:19Z", categorie: "encaissement", sens: "in", montant: 9_000,
          numero: "+237 650 11 22 33", reference: "18490853656", soldeApres: 9_100 }),
    sms({ quand: "2026-08-25T05:04:20Z", categorie: "doublon", sens: "out", montant: 9_000,
          reference: "18490853656", soldeApres: 248 }),
  ];
  const v = volumes(p, lignes, [CARTES[0]]);
  assert.equal(v.totaux.entrees, 9_000);
  assert.equal(v.totaux.sorties, 0);
  assert.deepEqual(v.parType.map((t) => t.type), ["commissions_versees"]);
  assert.equal(v.nbCorrespondants, 0, "la carte n'est pas son propre correspondant");
  const c = v.parCarte[0];
  assert.deepEqual(c.soldes, { ouverture: 100, cloture: 9_100, attendu: 9_100, ecart: 0 });
});

test("les SMS du compte des commissions d'avant la mise à jour du boîtier sont écartés", () => {
  // Tels que la base les porte avant que le boîtier ne les relise : deux
  // « envois » et leur solde des commissions.
  const p = periode("jour", "2026-08-25", "2026-10-21");
  const lignes = [
    sms({ quand: "2026-08-24T18:00:00Z", categorie: "solde", sens: "?", montant: null, soldeApres: 12_000 }),
    sms({ quand: "2026-08-25T05:04:19Z", categorie: "encaissement", sens: "in", montant: 7_300,
          numero: "237650112233", reference: "41000000001", soldeApres: 19_300 }),
    sms({ quand: "2026-08-25T05:04:20Z", categorie: "envoi", sens: "out", montant: 7_300, reference: "41000000001",
          soldeApres: 120, smsBrut: "You have successfully transferred 7300FCFA commisions to your main account 237650112233." }),
    sms({ quand: "2026-08-25T05:04:23Z", categorie: "envoi", sens: "out", montant: 7_300, numero: "237650112233",
          reference: "41000000001", soldeApres: 120, smsBrut: "You have transferred 7300 XAF to ESSAI (237650112233)" }),
  ];
  const v = volumes(p, lignes, [CARTES[0]]);
  assert.deepEqual({ e: v.totaux.entrees, s: v.totaux.sorties }, { e: 7_300, s: 0 });
  assert.deepEqual(v.parCarte[0].soldes, { ouverture: 12_000, cloture: 19_300, attendu: 19_300, ecart: 0 });
  const section = sectionDuReleve(
    { iccid: MTN_A, numero: "650112233", operateur: "MTN", service: "", nom: "", libelle: "" },
    lignes, { de: p.de, a: p.a }, null, false);
  assert.deepEqual({ e: section.totaux.entrees, s: section.totaux.sorties, ecart: section.soldes.ecart },
                   { e: 7_300, s: 0, ecart: 0 });
  // LE TÉMOIN : sans le numéro de la carte, le second « envoi » reste une
  // sortie, et la clôture tombe sur le solde des commissions.
  const sansNumero = volumes(p, lignes, [{ ...CARTES[0], numero: "" }]);
  assert.equal(sansNumero.totaux.sorties, 7_300);
  assert.equal(sansNumero.parCarte[0].soldes.cloture, 120);
});

// --- La cohérence ------------------------------------------------------------

test("la somme des colonnes redonne le total, pour chaque pas", () => {
  for (const p of [periode("jour", "2026-10-20"), periode("semaine", "2026-10-14"), periode("mois", "2026-09-10"),
                   periode("6mois", "2026-10-21"), periode("dates", "", "2026-10-21", "2026-04-01", "2026-10-21")]) {
    const v = volumes(p, LA_CAISSE.lignes);
    const e = v.serie.reduce((x, c) => x + Math.round(c.entrees * 100), 0);
    const s = v.serie.reduce((x, c) => x + Math.round(c.sorties * 100), 0);
    const n = v.serie.reduce((x, c) => x + c.n, 0);
    assert.equal(e, Math.round(v.totaux.entrees * 100), `${p.genre} : entrées`);
    assert.equal(s, Math.round(v.totaux.sorties * 100), `${p.genre} : sorties`);
    assert.equal(n, v.totaux.n, `${p.genre} : nombre`);
    assert.equal(v.serie.length, colonnesDe(p).length);
    assert.ok(v.totaux.n > 0, `${p.genre} : la caisse n'est pas vide`);
    // Les heures de pointe comptent les mêmes opérations.
    assert.equal(v.heures.flat().reduce((x, k) => x + k, 0), v.totaux.n);
    // Par type, par carte : la même somme.
    assert.equal(v.parType.filter((t) => t.sens === "in").reduce((x, t) => x + Math.round(t.montant * 100), 0),
                 Math.round(v.totaux.entrees * 100));
    assert.equal(Math.round(v.parCarte.reduce((x, c) => x + c.totaux.entrees - c.interneRecu, 0) * 100),
                 Math.round(v.totaux.entrees * 100));
  }
});

test("une période coupée en deux redonne le même total", () => {
  const tout = volumes(periode("dates", "", "2026-10-21", "2026-06-01", "2026-08-31"), LA_CAISSE.lignes);
  const debut = volumes(periode("dates", "", "2026-10-21", "2026-06-01", "2026-07-14"), LA_CAISSE.lignes);
  const fin = volumes(periode("dates", "", "2026-10-21", "2026-07-15", "2026-08-31"), LA_CAISSE.lignes);
  for (const k of ["entrees", "sorties", "frais", "n", "nEntrees", "nSorties"] as const) {
    assert.equal(Math.round((debut.totaux[k] + fin.totaux[k]) * 100), Math.round(tout.totaux[k] * 100), k);
  }
  assert.equal(Math.round((debut.cles.commissions + fin.cles.commissions) * 100), Math.round(tout.cles.commissions * 100));
});

test("minuit tombe à l'heure de Douala, pas à celle du serveur", () => {
  // 23 h 30 UTC le 3 octobre = 0 h 30 le 4 octobre à Douala.
  const l = [sms({ quand: "2026-10-03T23:30:00Z", montant: 1_000 }),
             sms({ quand: "2026-10-03T22:59:00Z", montant: 20 })];
  assert.equal(l[0].jour, "2026-10-04");
  const le3 = volumes(periode("jour", "2026-10-03"), l, [CARTES[0]]);
  const le4 = volumes(periode("jour", "2026-10-04"), l, [CARTES[0]]);
  assert.equal(le3.totaux.entrees, 20);
  assert.equal(le4.totaux.entrees, 1_000);
  // Et dans la colonne de minuit.
  assert.equal(le4.serie.find((c) => c.cle === "00")?.entrees, 1_000);
  assert.equal(le3.serie.find((c) => c.cle === "23")?.entrees, 20);
  // Un dimanche à 0 h 30 : la case du dimanche, à 0 h.
  assert.equal(le4.heures[6][0], 1);
});

test("les mêmes chiffres que le relevé de compte, carte par carte, au centime", () => {
  const p = periode("dates", "", "2026-10-21", "2026-05-01", "2026-09-30");
  const v = volumes(p, LA_CAISSE.lignes);
  for (const c of CARTES) {
    const section = sectionDuReleve(
      { iccid: c.iccid, numero: c.numero, operateur: c.operateur, service: "", nom: "", libelle: c.libelle },
      LA_CAISSE.lignes, { de: p.de, a: p.a }, null, false);
    const d = v.parCarte.find((x) => x.iccid === c.iccid)!;
    assert.equal(d.totaux.entrees, section.totaux.entrees, `${c.libelle} : entrées`);
    assert.equal(d.totaux.sorties, section.totaux.sorties, `${c.libelle} : sorties`);
    assert.equal(d.totaux.frais, section.totaux.frais, `${c.libelle} : frais`);
    assert.equal(d.soldes.ouverture, section.soldes.ouverture, `${c.libelle} : ouverture`);
    assert.equal(d.soldes.cloture, section.soldes.cloture, `${c.libelle} : clôture`);
    assert.equal(d.soldes.ecart, section.soldes.ecart, `${c.libelle} : écart`);
    assert.equal(d.aVerifier, section.totaux.inconnus, `${c.libelle} : sens inconnus`);
  }
});

test("le contrôle des soldes trouve l'opération perdue, et elle seule", () => {
  const perdue = LA_CAISSE.perdue!;
  assert.ok(perdue, "la caisse d'essai doit porter son opération perdue");
  const sept = volumes(periode("mois", perdue.jour), LA_CAISSE.lignes);
  for (const c of sept.parCarte) {
    if (c.iccid === perdue.carte) {
      assert.equal(c.soldes.ecart, -perdue.montant);
      assert.ok(c.ruptures.some((x) => x.montant === -perdue.montant), "l'écart est situé");
    } else {
      assert.equal(c.soldes.ecart, 0, `${c.libelle} : rien ne manque`);
      assert.equal(c.ruptures.length, 0);
    }
  }
  assert.equal(sept.avertissements.ecarts, 1);
  // Le mois d'après tombe juste : l'écart ne se reporte pas.
  const oct = volumes(periode("mois", "2026-10-01"), LA_CAISSE.lignes);
  assert.ok(oct.parCarte.every((c) => c.soldes.ecart === 0), "octobre tombe juste");
  // La clôture est le DERNIER solde annoncé de la carte au 21 octobre à
  // minuit, heure de Douala — relu ici sans passer par le calcul.
  for (const c of oct.parCarte) {
    const annonces = LA_CAISSE.lignes.filter((x) => x.carte === c.iccid && x.jour <= "2026-10-21"
      && x.soldeApres != null && x.soldeApres !== 248 && x.categorie !== "publicite");
    assert.equal(c.soldes.cloture, annonces.at(-1)!.soldeApres);
  }
});

test("un solde jamais annoncé reste « non connu », jamais 0", () => {
  const v = volumes(periode("jour", "2026-03-02", "2026-10-21"),
                    [sms({ quand: "2026-03-02T09:00:00Z", montant: 5_000 })], [CARTES[0]]);
  assert.deepEqual(v.parCarte[0].soldes, { ouverture: null, cloture: null, attendu: null, ecart: null });
  assert.equal(v.avertissements.ecarts, 0);
});

test("les correspondants : un numéro, quelle que soit son écriture ; la fiche par carte", () => {
  const p = periode("jour", "2026-03-02", "2026-10-21");
  const lignes = [
    sms({ quand: "2026-03-02T09:00:00Z", carte: MTN_A, sens: "in", montant: 1_000, tiers: "NJOYA AMINATOU", numero: "+237 677 80 31 22" }),
    sms({ quand: "2026-03-02T10:00:00Z", carte: MTN_B, sim: "MTN ·2222", sens: "in", montant: 2_000, tiers: "NJOYA A.", numero: "237677803122" }),
    sms({ quand: "2026-03-02T11:00:00Z", carte: MTN_A, categorie: "envoi", sens: "out", montant: 500, tiers: "NJOYA AMINATOU", numero: "677803122" }),
    sms({ quand: "2026-03-02T12:00:00Z", carte: MTN_A, sens: "in", montant: 9_000, tiers: "BOUTIQUE LA GRACE", numero: "" }),
  ];
  const v = calculerVolumes({ periode: p, lignes, cartes: CARTES, fuseau: DOUALA, correspondant: "677803122" });
  assert.equal(v.nbCorrespondants, 2);
  const njoya = v.correspondants.find((q) => q.cle === "677803122")!;
  assert.deepEqual({ r: njoya.recu, e: njoya.envoye, nr: njoya.nRecu, ne: njoya.nEnvoye, nom: njoya.nom },
                   { r: 3_000, e: 500, nr: 2, ne: 1, nom: "NJOYA AMINATOU" });
  assert.ok(v.correspondants.some((q) => q.cle === "nom:BOUTIQUE LA GRACE"), "sans numéro : par le nom");
  assert.deepEqual(v.fiche?.parCarte.map((c) => [c.iccid, c.recu, c.envoye, c.n]),
                   [[MTN_A, 1_000, 500, 2], [MTN_B, 2_000, 0, 1]]);
  assert.equal(numeroNormal("+237 6 77 80 31 22"), "677803122");
  assert.equal(numeroNormal("12"), null);
});

test("les heures de pointe et les familles des anneaux", () => {
  const v = volumes(periode("6mois", "2026-10-21"), LA_CAISSE.lignes);
  const c = creneauLePlusCharge(v.heures);
  assert.ok(c && c.n > 0);
  // Le dimanche (case 6) est le plus calme de la caisse d'essai.
  const parJour = v.heures.map((h) => h.reduce((x, k) => x + k, 0));
  assert.equal(Math.min(...parJour), parJour[6]);
  const entrees = famillesDe(v, "in");
  assert.deepEqual(entrees.map((f) => f.famille), ["argent", "especes", "commissions"],
                   "un ordre FIXE : la couleur suit la famille, pas le rang");
  assert.equal(Math.round(entrees.reduce((x, f) => x + f.montant, 0) * 100), Math.round(v.totaux.entrees * 100));
});

test("les noms des périodes", () => {
  assert.equal(nomDeLaPeriode(periode("mois", "2026-10-21"), "fr"), "Octobre 2026");
  assert.equal(nomDeLaPeriode(periode("mois", "2026-10-21"), "en"), "October 2026");
  assert.equal(nomDeLaPeriode(periode("jour", "2026-10-21"), "fr"), "Mercredi 21 octobre");
  assert.equal(nomDeLaPeriode(periode("6mois", "2026-10-21"), "fr"), "Mai – oct. 2026");
  assert.equal(nomDeLaPeriode(periode("semaine", "2026-10-21"), "fr"), "19 oct. – 25 oct.");
});

// --- Le témoin ---------------------------------------------------------------

test("TÉMOIN : l'ancienne Analyse se trompe sur la même caisse", () => {
  // Une semaine finie : du lundi 12 au dimanche 18 octobre, vue le 18 au soir.
  const p = periode("dates", "", "2026-10-21", "2026-10-12", "2026-10-18");
  const v = volumes(p, LA_CAISSE.lignes);
  const ancienne = resumeSemaine(LA_CAISSE.lignes, "fr", DOUALA, Date.parse("2026-10-18T22:59:00Z"));
  // L'ancienne ne voyait que l'argent REÇU — et elle y mettait les avis en
  // double et les transferts entre les cartes.
  assert.notEqual(ancienne.total, v.totaux.entrees, "l'ancien calcul doit différer");
  const naifs = LA_CAISSE.lignes.filter((x) => x.jour >= p.de && x.jour <= p.a && x.sens === "in" && x.montant != null);
  assert.equal(ancienne.total, naifs.reduce((s, x) => s + (x.montant ?? 0), 0));
  assert.ok(naifs.some((x) => x.categorie === "doublon"), "la caisse porte des avis en double dans la semaine");
  // Et pas une sortie.
  assert.ok(v.totaux.sorties > 0);
});

test("TÉMOIN : sans l'écart des doublons, le relevé compterait deux fois", () => {
  const b = { de: "2026-03-02", a: "2026-03-02" };
  const deux = [
    sms({ quand: "2026-03-02T09:00:00Z", sens: "in", montant: 9_000, reference: "18490853656" }),
    sms({ quand: "2026-03-02T09:00:01Z", sens: "in", montant: 9_000, reference: "18490853656" }),
  ];
  assert.equal(totauxDuReleve(lignesDuReleve(deux, b)).entrees, 9_000);
  assert.equal(totauxDuReleve(deux).entrees, 18_000, "sans le filtre, 18 000");
  // Le solde des commissions (248) ne doit pas ouvrir le relevé.
  const avant = [
    sms({ quand: "2026-03-01T09:00:00Z", sens: "in", montant: 5_000, soldeApres: 2_000_000 }),
    sms({ quand: "2026-03-01T09:00:01Z", categorie: "doublon", sens: "out", montant: 5_000, soldeApres: 248 }),
  ];
  assert.equal(dernierSoldeAvant(avant, "2026-03-02"), 2_000_000);
});
