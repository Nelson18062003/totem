// Le frein aux essais de mot de passe.
//
// Il vit ici, et non dans une route, parce qu'il y a MAINTENANT deux portes
// d'entrée : l'écran de connexion du navigateur (`/api/connexion`) et celle
// de l'application du téléphone (`/api/session`). Deux compteurs séparés ne
// freineraient personne : il suffirait d'alterner les deux portes pour
// doubler la cadence des essais. Un seul seau, partagé, ferme cette porte.
//
// Ce n'est pas un verrou distribué — chaque instance du serveur a le sien —
// mais il suffit à casser la cadence d'une attaque par force brute. Le
// propriétaire, qui se trompe une fois ou deux, ne le sent pas.

import { compterUnEssai } from "@/lib/serveur";

// LE SEAU DE SECOURS, en mémoire. Le vrai compteur est dans la BASE, partagé
// par toutes les instances (voir `compter_un_essai` dans sql/schema.sql) ;
// celui-ci prend le relais quand elle ne répond pas.
//
// Il ne compte alors que pour CETTE instance — c'est moins bien, et c'est
// tout de même mieux que rien : une base injoignable ne doit pas ouvrir la
// porte en grand, ni la fermer au propriétaire.
const essais = new Map<string, { n: number; vu: number }>();

const FENETRE_MS = 15 * 60 * 1000;
const FENETRE_S = FENETRE_MS / 1000;
const LIBRES = 5;               // essais sans délai
const PALIER_MS = 500;          // délai ajouté par essai au-delà
const PLAFOND_MS = 8000;

// LE MUR, au-delà du délai. Passé ce nombre d'essais depuis une MÊME adresse
// dans la fenêtre, on refuse tout de suite, sans même regarder le mot de
// passe. Deux raisons, et la seconde compte autant que la première :
//
//   1. un délai plafonné à huit secondes ne borne rien quand les essais
//      arrivent ensemble — ils attendent tous les huit secondes EN MÊME
//      TEMPS, puis passent tous ;
//   2. vérifier un mot de passe coûte au SERVEUR 210 000 tours de PBKDF2,
//      volontairement. C'est cher pour qui essaie, mais c'est cher pour nous
//      aussi : mille essais lancés ensemble, c'est mille calculs lancés
//      ensemble. Le refus arrive AVANT le calcul.
//
// Le mur est par ADRESSE, jamais global : sans quoi il suffirait d'attaquer
// pour enfermer le propriétaire dehors.
const MUR = 60;

/** Le nombre d'essais comptés pour cette clé dans la fenêtre. */
function compte(cle: string): number {
  const e = essais.get(cle);
  if (!e || Date.now() - e.vu > FENETRE_MS) return 0;
  return e.n;
}

/** Le délai à observer, d'après un nombre d'essais déjà comptés. */
function delaiPour(n: number, libres: number): number {
  return Math.min(Math.max(0, n - libres) * PALIER_MS, PLAFOND_MS);
}

/** Le délai que vaut cette clé en l'état — sans rien compter. */
export function freinPour(cle: string): number {
  return delaiPour(compte(cle), LIBRES);
}

/**
 * COMPTER L'ESSAI AVANT DE LE JUGER, et c'est tout le sujet.
 *
 * Le frein lisait le compteur, attendait, vérifiait le mot de passe, PUIS
 * notait l'échec. Soixante essais lancés ENSEMBLE lisaient donc tous un
 * compteur à zéro : aucun n'était ralenti. Mesuré contre un vrai serveur —
 * 999 ms par essai en file, 86 ms par essai en rafale. Douze fois plus vite,
 * pour la seule peine de ne pas faire la queue. Or personne n'attaque un mot
 * de passe en faisant la queue.
 *
 * C'est la même faute que celle du propriétaire unique : une lecture faite
 * avant une écriture ne garantit rien, parce que quelqu'un écrit entre les
 * deux. Ici, la réservation et le comptage sont le MÊME geste.
 */
function reserverUnEssai(cle: string): void {
  const maintenant = Date.now();
  for (const k of [cle, SEAU_COMMUN]) {
    const e = essais.get(k);
    essais.set(k, e && maintenant - e.vu <= FENETRE_MS
      ? { n: e.n + 1, vu: maintenant } : { n: 1, vu: maintenant });
  }
  // Ménage opportuniste : on ne garde pas les vieilles entrées en mémoire.
  if (essais.size > 5000) {
    for (const [k, v] of essais) if (maintenant - v.vu > FENETRE_MS) essais.delete(k);
  }
}

/**
 * L'échec est DÉJÀ compté — l'essai l'a été au moment de la réservation.
 *
 * Gardée comme point d'accroche : c'est ici qu'irait un journal des échecs
 * ou une alerte. Compter une seconde fois ferait payer double au propriétaire
 * qui se trompe une fois.
 */
export function noterEchec(_cle: string): void {
  /* rien : voir `reserverUnEssai` */
}

/** Une réussite efface l'ardoise. */
export function oublierEchecs(cle: string): void {
  // On efface l'ardoise de CETTE adresse seulement : une connexion réussie
  // parmi mille essais ne doit pas remettre le seau commun à zéro — c'est
  // même la signature d'une attaque qui a fini par trouver.
  essais.delete(cle);
}

/**
 * L'identité freinée : l'adresse vue par le SERVEUR, jamais celle annoncée
 * par le client.
 *
 * LE FREIN ÉTAIT DÉSARMÉ PAR UN EN-TÊTE QUE L'ATTAQUANT ÉCRIT LUI-MÊME. On
 * prenait le PREMIER élément de « x-forwarded-for » — c'est-à-dire le bout
 * que le client fournit. Il suffisait d'en changer à chaque essai pour
 * repartir d'un seau neuf : mesuré, douze essais depuis la même adresse
 * coûtaient onze secondes, douze essais avec un en-tête différent à chaque
 * fois en coûtaient un demi. Le frein n'existait plus.
 *
 * Trois sources, de la plus sûre à la moins sûre :
 *
 *   1. « x-vercel-forwarded-for » — posé par la plateforme, qui écrase ce que
 *      le client aurait mis ;
 *   2. « x-real-ip » — posé par un proxy de confiance, pour la même raison ;
 *   3. le DERNIER élément de « x-forwarded-for ». Chaque relais AJOUTE
 *      l'adresse qu'il a vue : le dernier est donc celui qu'a écrit le relais
 *      le plus proche de nous, le seul dont on réponde. Le premier, lui,
 *      reste ce que le client a bien voulu raconter.
 */
export function cleDeFrein(req: Request): string {
  const dernier = (v: string | null) => {
    const morceaux = (v ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    return morceaux.length ? morceaux[morceaux.length - 1] : "";
  };
  return dernier(req.headers.get("x-vercel-forwarded-for"))
    || (req.headers.get("x-real-ip") ?? "").trim()
    || dernier(req.headers.get("x-forwarded-for"))
    || "global";
}

// LE SEAU COMMUN, en plus du seau par adresse.
//
// Une attaque sérieuse ne vient pas d'une seule adresse : elle en loue mille.
// Un frein par adresse ne la voit alors jamais. Ce second seau compte TOUS
// les échecs, quelle que soit leur provenance, et le délai retenu est le plus
// grand des deux.
//
// Il ne verrouille rien : au pire, huit secondes d'attente. Le propriétaire
// qui se trompe pendant qu'on l'attaque patiente donc un peu — c'est le prix,
// et il est petit devant une porte qui ne freine personne. On lui laisse
// aussi plus de marge qu'à une adresse seule.
const SEAU_COMMUN = "\u0000tous";
const LIBRES_COMMUN = 40;

/** Le délai du seau commun — plus tolérant, mais il ne se contourne pas. */
function freinCommun(): number {
  const e = essais.get(SEAU_COMMUN);
  if (!e || Date.now() - e.vu > FENETRE_MS) return 0;
  return Math.min(Math.max(0, e.n - LIBRES_COMMUN) * PALIER_MS, PLAFOND_MS);
}

/**
 * Compte cet essai, puis attend ce qu'il coûte.
 *
 * Rend `false` quand l'adresse a dépassé le mur : l'appelant doit alors
 * refuser TOUT DE SUITE, sans vérifier le mot de passe — c'est ce refus
 * précoce qui empêche une rafale de faire calculer le serveur.
 */
export async function attendreLeFrein(cle: string): Promise<boolean> {
  // LE COMPTEUR EST DANS LA BASE — une instruction, sous le verrou de la
  // ligne. En mémoire, il ne comptait que pour l'instance qui l'hébergeait :
  // un hébergement qui en met plusieurs en parallèle donnait à une attaque
  // répartie l'allocation autant de fois qu'il y avait d'instances, et
  // personne ne pouvait le voir depuis l'extérieur.
  //
  // Les deux seaux sont comptés du même geste : celui de l'adresse et le
  // commun. On les demande ensemble, pour ne pas payer deux allers-retours.
  const [nAdresse, nCommun] = await Promise.all([
    compterUnEssai(cle, FENETRE_S),
    compterUnEssai(SEAU_COMMUN, FENETRE_S),
  ]);

  // La base n'a pas répondu : on retombe sur la mémoire de cette instance.
  // Un frein muet vaut mieux qu'une porte fermée au propriétaire.
  if (nAdresse === null || nCommun === null) {
    reserverUnEssai(cle);
    if (compte(cle) > MUR) return false;
    const attenteLocale = Math.max(freinPour(cle), freinCommun());
    if (attenteLocale) await new Promise((r) => setTimeout(r, attenteLocale));
    return true;
  }

  if (nAdresse > MUR) return false;
  const attente = Math.max(delaiPour(nAdresse, LIBRES),
                           delaiPour(nCommun, LIBRES_COMMUN));
  if (attente) await new Promise((r) => setTimeout(r, attente));
  return true;
}

// CE QUE CE FREIN FAIT, ET CE QU'IL NE FAIT PAS.
//
// Il compte dans la BASE : toutes les instances partagent le même seau, et
// une attaque répartie sur plusieurs instances ne gagne plus rien. Elle
// gagnait autrefois l'allocation entière par instance, sans que rien ne le
// signale.
//
// Il ne remplace pas une protection de bordure : il ajoute du temps et un
// mur, il n'empêche pas les requêtes d'arriver. Et si la base se tait, il
// retombe sur la mémoire d'une seule instance — moins bon, jamais fermé.
//
// Ce qui tient de toute façon, frein ou pas : le mot de passe fait douze
// caractères au minimum, son empreinte coûte 210 000 tours, et un compte non
// approuvé n'ouvre rien. Le frein n'est pas la seule chose entre un inconnu
// et la caisse.
