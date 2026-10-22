// Le frein aux essais de mot de passe.
//
// Il vit ici, et non dans une route, parce qu'il y a MAINTENANT deux portes
// d'entrée : l'écran de connexion du navigateur (`/api/connexion`) et celle
// de l'application du téléphone (`/api/session`). Deux compteurs séparés ne
// freineraient personne : il suffirait d'alterner les deux portes pour
// doubler la cadence des essais. Un seul seau, partagé, ferme cette porte.
//
// DEUX SEAUX PAR ESSAI : celui de l'ADRESSE d'où il vient, et celui du
// COMPTE qu'il vise. Le délai retenu est le plus grand des deux ; le mur
// n'est que sur l'adresse.
//
// CE QUI COMPTE, CE SONT LES ÉCHECS. Un essai est compté AVANT d'être jugé —
// sans quoi soixante essais lancés ensemble liraient tous zéro — puis une
// connexion réussie REND le sien (`rendreLEssai`). Le propriétaire, qui se
// trompe une fois ou deux, ne le sent pas ; cent personnes qui se connectent
// avec le bon mot de passe non plus.

import { compterUnEssai, rendreUnEssai } from "@/lib/serveur";

// LE SEAU DE SECOURS, en mémoire. Le vrai compteur est dans la BASE, partagé
// par toutes les instances (voir `frein_compter`,
// migrations/20261022_frein_fenetre_fixe.sql) ; celui-ci prend le relais
// quand elle ne répond pas — ou qu'elle n'a pas encore reçu cette migration.
//
// Il ne compte alors que pour CETTE instance — c'est moins bien, et c'est
// tout de même mieux que rien : une base injoignable ne doit pas ouvrir la
// porte en grand, ni la fermer au propriétaire. Il suit les MÊMES règles que
// la base : fenêtre fixe, échecs seulement.
const essais = new Map<string, { n: number; debut: number }>();

const FENETRE_MS = 15 * 60 * 1000;
const FENETRE_S = FENETRE_MS / 1000;
const LIBRES = 5;               // échecs sans délai, par adresse
const PALIER_MS = 500;          // délai ajouté par échec au-delà
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
// Le mur est par ADRESSE, jamais par compte ni global : sans quoi il
// suffirait d'attaquer pour enfermer le propriétaire dehors.
const MUR = 60;

// LE SEAU DU COMPTE, en plus du seau par adresse.
//
// Une attaque sérieuse ne vient pas d'une seule adresse : elle en loue mille.
// Un frein par adresse ne la voit alors jamais. Ce second seau compte les
// essais sur UN COMPTE — le courriel visé —, quelle que soit leur provenance.
// Il ne verrouille rien : au pire, huit secondes d'attente pour CE compte.
//
// IL ÉTAIT COMMUN À TOUTE LA PLATEFORME, et c'était juste pour une maison —
// le propriétaire et ses vendeurs. Pour une application grand public, mesuré
// contre un vrai serveur : après soixante-dix connexions RÉUSSIES, chacune de
// chez soi, CHAQUE connexion de la plateforme attendait huit secondes (66 ms
// au repos) ; et une seule adresse, avec cinquante-cinq mauvais essais — sous
// son propre mur —, imposait les mêmes huit secondes à tout le monde. Le
// frein était devenu l'arme qu'il devait parer. Il ne se voyait pas : sa clé
// commençait par un caractère nul, que PostgreSQL refuse, et il ne comptait
// que dans la mémoire de chaque instance — assez pour ralentir une instance
// chargée, jamais assez pour qu'un banc le remarque.
//
// LA CLÉ N'EST PAS LE COURRIEL. Une table d'adresses ne doit pas devenir une
// liste de qui essaie d'entrer où : la clé est une empreinte du courriel,
// scellée par le secret de session (« @ » puis 32 chiffres hexadécimaux). Un
// courriel qui n'a pas de compte a la sienne, comme les autres : le frein ne
// dit pas qui est inscrit ici. Sans courriel — la clé de secours —, le seau
// est « @secours ».
const LIBRES_COMPTE = 10;

/** Où l'essai a été compté — pour qu'une réussite le rende au même endroit. */
export type Ticket = { cles: string[]; base: boolean };

/** Le délai à observer, d'après un nombre d'échecs déjà comptés. */
function delaiPour(n: number, libres: number): number {
  return Math.min(Math.max(0, n - libres) * PALIER_MS, PLAFOND_MS);
}

/** Compte un essai en mémoire, dans une fenêtre FIXE, et rend le total. */
function compterEnMemoire(cle: string): number {
  const maintenant = Date.now();
  const e = essais.get(cle);
  const suite = e !== undefined && maintenant - e.debut <= FENETRE_MS;
  const n = suite ? e.n + 1 : 1;
  essais.set(cle, { n, debut: suite ? e.debut : maintenant });
  // Ménage opportuniste : on ne garde pas les vieilles entrées en mémoire.
  if (essais.size > 5000) {
    for (const [k, v] of essais) if (maintenant - v.debut > FENETRE_MS) essais.delete(k);
  }
  return n;
}

let sceau: { secret: string; cle: Promise<CryptoKey> } | null = null;

/** Le seau d'un compte : une empreinte du courriel, jamais le courriel. */
async function seauDuCompte(courriel: string): Promise<string> {
  if (!courriel) return "@secours";
  const secret = process.env.SESSION_SECRET || "frein";
  if (!sceau || sceau.secret !== secret) {
    sceau = {
      secret,
      cle: crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    };
  }
  const brut = await crypto.subtle.sign("HMAC", await sceau.cle,
    new TextEncoder().encode(`frein|${courriel}`));
  return "@" + [...new Uint8Array(brut).slice(0, 16)]
    .map((o) => o.toString(16).padStart(2, "0")).join("");
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
 *
 * Rend `false` quand l'adresse a dépassé le mur : l'appelant doit alors
 * refuser TOUT DE SUITE, sans vérifier le mot de passe — c'est ce refus
 * précoce qui empêche une rafale de faire calculer le serveur. Sinon, un
 * TICKET : à rendre par `rendreLEssai` si le mot de passe était bon.
 */
export async function attendreLeFrein(
  cle: string,
  {
    // Le courriel VISÉ : son seau s'ajoute à celui de l'adresse. Absent pour
    // l'inscription, qui ne vise aucun compte existant.
    compte,
    // L'INSCRIPTION A SON MUR À ELLE, plus bas, et une clé préfixée : un
    // passant qui crée son compte ne ralentit pas le propriétaire qui se
    // connecte, et personne ne crée vingt comptes en un quart d'heure.
    mur = MUR,
  }: { compte?: string; mur?: number } = {},
): Promise<false | Ticket> {
  const cles = compte === undefined ? [cle] : [cle, await seauDuCompte(compte)];

  // LE COMPTEUR EST DANS LA BASE — une instruction, sous le verrou de la
  // ligne. En mémoire, il ne comptait que pour l'instance qui l'hébergeait :
  // un hébergement qui en met plusieurs en parallèle donnait à une attaque
  // répartie l'allocation autant de fois qu'il y avait d'instances, et
  // personne ne pouvait le voir depuis l'extérieur. Les deux seaux sont
  // demandés ensemble, pour ne pas payer deux allers-retours.
  const enBase = await Promise.all(cles.map((k) => compterUnEssai(k, FENETRE_S)));
  const base = enBase.every((n) => n !== null);
  // La base n'a pas répondu : on retombe sur la mémoire de cette instance.
  // Un frein muet vaut mieux qu'une porte fermée au propriétaire. (Un seau
  // compté en base pendant que l'autre échouait y reste : un cran de trop,
  // jamais un cran de moins.)
  const [nAdresse, nCompte] = base ? (enBase as number[]) : cles.map(compterEnMemoire);

  if (nAdresse > mur) return false;
  const attente = Math.max(delaiPour(nAdresse, LIBRES),
                           nCompte === undefined ? 0 : delaiPour(nCompte, LIBRES_COMPTE));
  if (attente) await new Promise((r) => setTimeout(r, attente));
  return { cles, base };
}

/**
 * L'échec est DÉJÀ compté — l'essai l'a été au moment de la réservation.
 *
 * Gardée comme point d'accroche : c'est ici qu'irait un journal des échecs
 * ou une alerte. Compter une seconde fois ferait payer double au propriétaire
 * qui se trompe une fois.
 */
export function noterEchec(_ticket: Ticket): void {
  /* rien : voir `attendreLeFrein` */
}

/**
 * Le mot de passe était bon : l'essai est RENDU, dans chacun de ses seaux.
 *
 * Rendu, pas effacé. Effacer l'ardoise de l'adresse à chaque réussite, c'était
 * offrir un contournement du mur : se connecter à son propre compte entre
 * deux salves contre celui d'un autre, et repartir de zéro. Rendre l'essai ne
 * retire que ce que la réussite avait pris ; les échecs restent.
 */
export async function rendreLEssai(ticket: Ticket): Promise<void> {
  if (ticket.base) {
    await Promise.all(ticket.cles.map(rendreUnEssai));
    return;
  }
  for (const k of ticket.cles) {
    const e = essais.get(k);
    if (e) e.n = Math.max(0, e.n - 1);
  }
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

// CE QUE CE FREIN FAIT, ET CE QU'IL NE FAIT PAS.
//
// Il compte dans la BASE : toutes les instances partagent les mêmes seaux, et
// une attaque répartie sur plusieurs instances ne gagne plus rien. Elle
// gagnait autrefois l'allocation entière par instance, sans que rien ne le
// signale.
//
// Il ne remplace pas une protection de bordure : il ajoute du temps et un
// mur, il n'empêche pas les requêtes d'arriver. Et si la base se tait, il
// retombe sur la mémoire d'une seule instance — moins bon, jamais fermé.
//
// Il ne freine pas une attaque qui essaie UN mot de passe sur MILLE comptes,
// depuis mille adresses : aucun de ses seaux ne la voit. Ce qui tient alors,
// frein ou pas : le mot de passe fait douze caractères au minimum, et son
// empreinte coûte 210 000 tours. Le frein n'est pas la seule chose entre un
// inconnu et la caisse.
