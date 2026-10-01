// Les bénéficiaires : à qui l'on envoie, sous quel nom.
//
// D'OÙ VIENNENT LES NOMS. Deux sources, et seulement deux — rien n'est
// deviné, rien ne vient d'ailleurs que de la carte elle-même :
//
//   1. LES SMS DE LA CARTE. Quand l'opérateur écrit « Vous avez recu 5 000
//      FCFA de JEAN DUPONT (677998877) » ou « Transfert de 5 000 FCFA vers
//      JEAN DUPONT 677998877 effectue », le lecteur de SMS du robot en tire
//      le nom et le numéro. Ce sont les « récents » : ils se tiennent à jour
//      tout seuls, à chaque SMS.
//   2. LE CARNET. Ce que la personne a ENREGISTRÉ — à la fin d'un transfert
//      (l'application le propose), ou à la main. Le nom qu'elle choisit
//      passe devant celui de l'opérateur : « Maman » plutôt que « NKENGAFAC
//      MBOUNGOU JEANNE-CLAIRE EPSE TCHOUMI ».

import type { Beneficiaire } from "./types";
import { clientsRecents, type ClientRecent } from "./recents";
import type { Paiement } from "./types";

/** Un nom tel qu'on le range : espaces resserrées, bornées. */
export function nomPropre(nom: string): string {
  return nom.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Un numéro tel qu'on le range : des chiffres. Le « 237 » du Cameroun, posé
 *  devant un numéro à neuf chiffres, s'en va — le même bénéficiaire ne doit
 *  pas exister deux fois selon la façon dont l'opérateur l'a écrit. */
export function numeroPropre(numero: string): string {
  const c = numero.replace(/\D/g, "");
  return c.length === 12 && c.startsWith("237") ? c.slice(3) : c;
}

// Ce qui s'écrit en capitales dans un message d'opérateur sans être un nom.
const PAS_UN_NOM = new Set([
  "FCFA", "XAF", "CFA", "F", "MTN", "MOMO", "ORANGE", "MONEY", "OM", "PIN",
  "NIP", "ID", "REF", "TXN", "OK", "SMS", "USSD", "MOBILE", "CODE",
]);

/**
 * Le nom que l'opérateur donne au bénéficiaire, sur son écran de
 * confirmation — « Transfert de 5000 FCFA a JEAN DUPONT (677998877) » —
 * ou `null` s'il n'y en a pas.
 *
 * On cherche le NUMÉRO dans le texte, puis les mots en capitales qui le
 * touchent, juste après ou juste avant. Un nom qui n'est pas collé au numéro
 * n'est pas pris : dans le doute, rien — la personne tapera le nom.
 */
export function nomDuBeneficiaire(texte: string, numero: string): string | null {
  const n = numeroPropre(numero);
  if (n.length < 8 || !texte) return null;
  // Le numéro, éventuellement précédé de 237 et coupé d'espaces.
  const motif = n.split("").join("[ .]?");
  const re = new RegExp(`(?:\\+?237[ .]?)?${motif}`);
  const m = re.exec(texte);
  if (!m) return null;
  const avant = texte.slice(0, m.index);
  const apres = texte.slice(m.index + m[0].length);
  const MOT = "[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'.\\-]*";
  const suite = new RegExp(`^[\\s)(\\],:;-]*((?:${MOT}[ ]?){1,6})`);
  const fin = new RegExp(`((?:${MOT}[ ]?){1,6})[\\s(\\[,:;-]*$`);
  const garder = (brut: string | undefined) => {
    if (!brut) return null;
    const mots = brut.trim().split(/\s+/).filter((w) => {
      const nu = w.replace(/[.'\-]/g, "");
      return nu.length >= 2 && !PAS_UN_NOM.has(nu);
    });
    return mots.length ? nomPropre(mots.join(" ")) : null;
  };
  return garder(suite.exec(apres)?.[1]) ?? garder(fin.exec(avant)?.[1]);
}

/** Ce que l'écran « À qui ? » propose : le carnet de la carte d'abord, puis
 *  les récents des SMS qui n'y sont pas déjà. */
export function aQui(
  enregistres: readonly Beneficiaire[] | undefined,
  recents: readonly ClientRecent[] | undefined,
  carte: string | undefined,
  max = 12,
): (ClientRecent & { enregistre: boolean })[] {
  const carnet = (enregistres ?? [])
    .filter((b) => !carte || b.carte === carte)
    .map((b) => ({ numero: b.numero, nom: b.nom, enregistre: true }));
  const vus = new Set(carnet.map((b) => b.numero));
  const autres = (recents ?? [])
    .map((r) => ({ ...r, numero: numeroPropre(r.numero) }))
    .filter((r) => !vus.has(r.numero) && (vus.add(r.numero), true))
    .map((r) => ({ ...r, enregistre: false }));
  return [...carnet, ...autres].slice(0, max);
}

/** `aQui` pour chaque carte d'une liste — ce que le serveur prépare pour
 *  les écrans du site, qui ouvrent leurs opérations sans recharger. */
export function aQuiParCarte(
  enregistres: readonly Beneficiaire[] | undefined,
  paiements: readonly Paiement[],
  cartes: readonly string[],
): Record<string, (ClientRecent & { enregistre: boolean })[]> {
  return Object.fromEntries(cartes.map((c) =>
    [c, aQui(enregistres, clientsRecents(paiements, c), c)]));
}
