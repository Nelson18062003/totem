// LE JUGEMENT D'UN ÉCRAN — ce que le noyau en décide, sous une forme que le
// boîtier peut comparer à la sienne.
//
// Le boîtier enchaîne maintenant lui-même les écrans prévus d'une opération
// (le menu, « 5 », « 1 », le numéro, le montant) sans repasser par Internet
// entre deux. Il décide donc à la place de l'écran — et il doit décider
// EXACTEMENT comme lui : sa lecture (totem/ecran.py) traduit ussd.ts et
// deroule.ts règle pour règle. `ecrans-partages.json` porte des milliers
// d'écrans et ce que le noyau en juge ; `ecrans-partages.test.ts` vérifie
// que le noyau d'aujourd'hui juge encore pareil, tests/test_ecran.py que le
// boîtier aussi. Qui change une règle d'un côté fait échouer l'autre.
//
// Après une modification VOULUE du noyau :
//
//     cd web && node --import ./noyau/tests/resolveur.mjs noyau/tests/ecrans-partages.regenerer.ts
//
// puis faire suivre totem/ecran.py jusqu'à ce que tests/test_ecran.py passe.

import { champAServir, estUneConfirmation, etapePeutPartir, porteLaValeur } from "../deroule";
import { champPourQuestion, demandeUnCode, lireEcran, type EtatDuReseau, type TypeChamp } from "../ussd";

/** Les étapes d'un trajet appris qu'on essaie sur chaque écran. */
export const GABARITS = ["0", "1", "2", "3", "5", "00", "98", "{numero}", "{montant}"];
/** Ce que l'écran aurait à servir : un numéro, un montant. */
export const PROPRES: Record<string, string> = { numero: "677998877", montant: "5000" };
const NUMERO = { cle: "numero", type: "numero" as TypeChamp };
const MONTANT = { cle: "montant", type: "montant" as TypeChamp };
const RESTANTS = [[NUMERO, MONTANT], [NUMERO], [MONTANT]];

type Lecture = [string, string[], boolean, string | null, string];

function lecture(texte: string, reseau?: EtatDuReseau): Lecture {
  const lu = lireEcran(texte, reseau);
  return [lu.attend, lu.choix.map((c) => `${c.numero}|${c.libelle}`), lu.parleDuCode, lu.issue, lu.texte];
}

export type Jugement = {
  t: string;
  /** lireEcran sans état du réseau, « attend », « fini ». */
  lu: [Lecture, Lecture, Lecture];
  code: boolean;
  confirmation: boolean;
  /** champPourQuestion avec un numéro et un montant à servir. */
  question: string | null;
  /** Les gabarits qu'etapePeutPartir laisse partir, le réseau attendant. */
  etapes: string[];
  /** champAServir (réseau « attend ») : numéro + montant, numéro seul, montant seul. */
  servir: (string | null)[];
  /** porteLaValeur : le numéro, le montant. */
  porte: [boolean, boolean];
};

export function juger(t: string): Jugement {
  const ecran = { texte: t, reseau: "attend" as EtatDuReseau };
  return {
    t,
    lu: [lecture(t), lecture(t, "attend"), lecture(t, "fini")],
    code: demandeUnCode(t),
    confirmation: estUneConfirmation(t),
    question: champPourQuestion(t, [NUMERO, MONTANT])?.cle ?? null,
    etapes: GABARITS.filter((g) => etapePeutPartir(g, ecran)),
    servir: RESTANTS.map((r) => champAServir(ecran, r, PROPRES)?.cle ?? null),
    porte: [porteLaValeur(t, "numero", PROPRES.numero), porteLaValeur(t, "montant", PROPRES.montant)],
  };
}
