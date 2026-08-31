// Le frein aux essais de mot de passe.
//
// Il vit ici, et non dans une route, parce qu'il y a MAINTENANT deux portes
// d'entrée : l'écran de connexion du navigateur (`/api/connexion`) et celle
// de l'application du téléphone (`/api/session`). Deux compteurs séparés ne
// freineraient personne : il suffirait d'alterner les deux portes pour
// doubler la cadence des essais. Un seul seau, partagé, ferme cette porte.
//
// DEUX MÉMOIRES, ET LA SECONDE EST PARTAGÉE.
//
// Le seau en mémoire suffit à casser la cadence sur une instance chaude — et
// pas du tout sur Vercel, où chaque instance froide repart à zéro : il
// suffisait d'insister pour tomber sur une neuve et retrouver ses essais
// libres. Une ardoise commune, en base, compte donc les échecs de TOUTES les
// instances (voir `serveur.noterEchecPartage`).
//
// ELLE NE FERME JAMAIS LA PORTE À ELLE SEULE. Si la base ne répond pas, elle
// rend « je ne sais pas » et l'on retombe sur la mémoire locale. Faire
// dépendre la connexion d'une base joignable serait exactement ce que la clé
// de secours existe pour éviter : une base en panne ne doit pas être un
// verrou sur sa propre maison.
//
// Le propriétaire, qui se trompe une fois ou deux, ne sent ni l'une ni
// l'autre.
//
// DEUX SEAUX, ET LE SECOND EST NÉ D'UN CONTOURNEMENT MESURÉ.
//
// Le frein comptait par adresse, et cette adresse, il la lisait dans
// « X-Forwarded-For » — un en-tête que le CLIENT écrit lui-même. Il suffisait
// donc d'en changer à chaque essai pour obtenir un compteur neuf à chaque
// fois. Mesuré : vingt essais sous vingt adresses inventées, et le
// vingt-et-unième repartait en 6 ms là où un essai vraiment freiné en prend
// 2000. Le frein comptait jusqu'à un, indéfiniment, pendant qu'on essayait
// les mots de passe à pleine cadence.
//
// D'où deux seaux qui travaillent ensemble :
//
//   · LE SEAU PAR ADRESSE, précis, qui punit celui qui insiste sans gêner
//     les autres — mais qui ne vaut que si l'adresse est digne de foi ;
//   · LE SEAU COMMUN, qu'aucun en-tête ne remet à zéro, parce qu'il ne
//     dépend d'AUCUNE valeur fournie par le visiteur. Il est large — vingt
//     essais libres — pour qu'un propriétaire distrait ne le sente jamais.
//     Celui qui change d'adresse à chaque coup, lui, le remplit quand même.
//
// Le délai retenu est le PLUS SÉVÈRE des deux. On ne peut donc plus se
// dérober en changeant de nom : on peut seulement changer de seau.

import {
  compterEchecsPartages, noterEchecPartage, oublierVieuxFreins,
} from "@/lib/serveur";

const essais = new Map<string, { n: number; vu: number }>();

const FENETRE_MS = 15 * 60 * 1000;
const LIBRES = 5;               // essais sans délai, pour une adresse donnée
const PALIER_MS = 500;          // délai ajouté par échec au-delà
const PLAFOND_MS = 8000;

// Le seau commun est plus large : il ne doit mordre que sur une cadence
// qu'aucun humain n'atteint. Vingt essais ratés en un quart d'heure, ce
// n'est plus quelqu'un qui cherche son mot de passe.
const LIBRES_COMMUN = 20;
const COMMUN = " commun";  // un nom qu'aucune adresse ne peut porter

function delai(cle: string, libres: number, maintenant: number): number {
  const e = essais.get(cle);
  if (!e || maintenant - e.vu > FENETRE_MS) return 0;
  return Math.min(Math.max(0, e.n - libres) * PALIER_MS, PLAFOND_MS);
}

/** Le délai dû d'après la MÉMOIRE de cette instance.
 *
 *  Le plus sévère des deux seaux : celui de l'adresse, et le commun. */
export function freinPour(cle: string): number {
  const maintenant = Date.now();
  return Math.max(
    delai(cle, LIBRES, maintenant),
    delai(COMMUN, LIBRES_COMMUN, maintenant),
  );
}

/** Le délai que produit un nombre d'échecs, au-delà des essais libres. */
const delaiPour = (n: number, libres: number): number =>
  Math.min(Math.max(0, n - libres) * PALIER_MS, PLAFOND_MS);

/** Le délai dû d'après L'ARDOISE COMMUNE — celle que toutes les instances
 *  partagent. Rend 0 quand la base ne sait pas : voir l'en-tête. */
async function freinPartage(cle: string): Promise<number> {
  const depuis = new Date(Date.now() - FENETRE_MS);
  const [parAdresse, commun] = await Promise.all([
    compterEchecsPartages(cle, depuis),
    compterEchecsPartages(COMMUN, depuis),
  ]);
  return Math.max(
    parAdresse === null ? 0 : delaiPour(parAdresse, LIBRES),
    commun === null ? 0 : delaiPour(commun, LIBRES_COMMUN),
  );
}

function noter(cle: string, maintenant: number): void {
  const e = essais.get(cle);
  essais.set(cle, e && maintenant - e.vu <= FENETRE_MS
    ? { n: e.n + 1, vu: maintenant } : { n: 1, vu: maintenant });
}

export function noterEchec(cle: string): void {
  const maintenant = Date.now();
  noter(cle, maintenant);
  noter(COMMUN, maintenant);
  // Ménage opportuniste : on ne garde pas les vieilles entrées en mémoire.
  if (essais.size > 5000) {
    for (const [k, v] of essais) {
      if (k !== COMMUN && maintenant - v.vu > FENETRE_MS) essais.delete(k);
    }
  }
  // L'ardoise commune, sans attendre : celui qui essaie n'a pas à patienter
  // pendant qu'on note son échec, et un échec noté un instant plus tard ne
  // change rien à ce qu'il pourra faire — c'est la LECTURE, à la tentative
  // suivante, qui décide. Une écriture perdue n'ouvre rien : le seau en
  // mémoire tient toujours l'instance qu'il a sous la main.
  void noterEchecPartage([cle, COMMUN]).catch(() => {});
  // Le ménage de l'ardoise, de loin en loin : une ligne sur cinquante.
  if (Math.random() < 0.02) {
    void oublierVieuxFreins(new Date(maintenant - FENETRE_MS)).catch(() => {});
  }
}

/** Une réussite efface l'ardoise — celle de l'adresse SEULEMENT.
 *
 *  Le seau commun ne s'efface pas sur une réussite : sinon il suffirait
 *  d'une connexion valable, glissée entre deux salves, pour le vider. Il
 *  s'oublie tout seul, avec le temps, comme les autres. */
export function oublierEchecs(cle: string): void {
  essais.delete(cle);
}

/**
 * L'IDENTITÉ FREINÉE.
 *
 * On préfère un en-tête que la PLATEFORME pose elle-même et qu'un client ne
 * peut pas écrire : sur Vercel, « x-vercel-forwarded-for » est réécrit à
 * chaque requête, quoi que le visiteur ait mis dedans. « x-real-ip » joue le
 * même rôle derrière la plupart des relais.
 *
 * « X-Forwarded-For » ne vient qu'ensuite, et on sait ce qu'il vaut : sa
 * valeur la plus à gauche est celle que le client a écrite. On la garde
 * quand même — elle sépare correctement les visiteurs honnêtes, ce qui
 * évite qu'un seul maladroit ralentisse tout le monde — mais on ne s'y fie
 * plus pour arrêter quelqu'un : c'est le seau commun qui s'en charge.
 */
export function cleDeFrein(req: Request): string {
  const atteste = req.headers.get("x-vercel-forwarded-for")
    ?? req.headers.get("x-real-ip");
  if (atteste) return `s:${atteste.split(",")[0].trim()}`;
  const annonce = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return annonce ? `d:${annonce}` : "global";
}

/** Attend le temps dû, s'il y en a un.
 *
 *  Le plus sévère de ce que sait cette instance et de ce que sait l'ardoise
 *  commune. On interroge la base à CHAQUE tentative, et pas seulement quand
 *  la mémoire locale a déjà des soupçons : une instance qui vient de naître
 *  n'a par définition aucun soupçon, et c'est précisément celle que
 *  l'attaquant cherche. */
export async function attendreLeFrein(cle: string): Promise<void> {
  const [local, partage] = await Promise.all([
    Promise.resolve(freinPour(cle)),
    freinPartage(cle).catch(() => 0),
  ]);
  const attente = Math.max(local, partage);
  if (attente) await new Promise((r) => setTimeout(r, attente));
}
