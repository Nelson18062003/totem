// Le frein aux essais de mot de passe.
//
// Il vit ici, et non dans une route, parce qu'il y a MAINTENANT deux portes
// d'entrée : l'écran de connexion du navigateur (`/api/connexion`) et celle
// de l'application du téléphone (`/api/session`). Deux compteurs séparés ne
// freineraient personne : il suffirait d'alterner les deux portes pour
// doubler la cadence des essais. Un seul compteur, partagé, ferme cette porte.
//
// TROIS SEAUX PAR ESSAI DE MOT DE PASSE, comptés dans cet ordre, et l'on
// s'arrête au premier mur :
//
//   · l'ADRESSE — un plafond haut (mille), sans délai, qui ne protège que le
//     serveur : chaque essai lui coûte 210 000 tours de PBKDF2. Un essai que
//     le couple refuse ne lui coûte rien : il n'y compte pas ;
//   · le COUPLE adresse + compte visé — le vrai mur (soixante) : une adresse
//     qui attaque un compte se ferme CE compte, jamais celui des voisins ;
//   · le COMPTE, de partout — une attaque répartie sur mille adresses. Il
//     ralentit, il ne ferme jamais.
//
// Le délai retenu est le plus grand des trois.
//
// CE QUI COMPTE, CE SONT LES ÉCHECS. Un essai est compté AVANT d'être jugé —
// sans quoi soixante essais lancés ensemble liraient tous zéro — puis une
// connexion réussie REND le sien (`rendreLEssai`). Le propriétaire, qui se
// trompe une fois ou deux, ne le sent pas ; cent personnes qui se connectent
// avec le bon mot de passe non plus.

import { compterLesEssais, compterUnEssaiALAncienne, rendreLesEssais } from "@/lib/serveur";

// LE SEAU DE SECOURS, en mémoire. Le vrai compteur est dans la BASE, partagé
// par toutes les instances (`frein_essai`,
// migrations/20261022_frein_fenetre_fixe.sql) ; celui-ci prend le relais
// quand elle ne répond pas — ou qu'elle n'a pas encore reçu cette migration.
//
// Il ne compte alors que pour CETTE instance — c'est moins bien, et c'est
// tout de même mieux que rien : une base injoignable ne doit pas ouvrir la
// porte en grand, ni la fermer au propriétaire. Il suit les MÊMES règles que
// la base : fenêtre fixe, trois seaux dans le même ordre, échecs seulement.
const essais = new Map<string, { n: number; debut: number }>();

const FENETRE_MS = 15 * 60 * 1000;
const FENETRE_S = FENETRE_MS / 1000;
const PALIER_MS = 500;          // délai ajouté par échec au-delà des gratuits
const PLAFOND_MS = 8000;

// LE MUR, au-delà du délai. Passé ce nombre d'essais dans la fenêtre, on
// refuse tout de suite, sans même regarder le mot de passe. Deux raisons, et
// la seconde compte autant que la première :
//
//   1. un délai plafonné à huit secondes ne borne rien quand les essais
//      arrivent ensemble — ils attendent tous les huit secondes EN MÊME
//      TEMPS, puis passent tous ;
//   2. vérifier un mot de passe coûte au SERVEUR 210 000 tours de PBKDF2,
//      volontairement. C'est cher pour qui essaie, mais c'est cher pour nous
//      aussi : mille essais lancés ensemble, c'est mille calculs lancés
//      ensemble. Le refus arrive AVANT le calcul.
//
// LE MUR PORTE SUR LE COUPLE, PAS SUR L'ADRESSE SEULE. MTN et Orange mettent
// des centaines de téléphones derrière une même adresse publique : un mur
// par adresse laissait un voisin qui se trompe soixante fois fermer la porte
// à tous les autres — propriétaire compris — pour un quart d'heure, et
// recommencer. Ni par compte, ni global non plus : il suffirait d'attaquer
// pour enfermer le propriétaire dehors.
const MUR = 60;                 // par couple adresse + compte visé
const LIBRES = 5;
// Haut, SANS DÉLAI, et compté sur les seuls essais VRAIMENT jugés : derrière
// une adresse d'opérateur, les échecs de centaines de téléphones
// s'additionnent, et un voisin qui s'acharne ne doit pas pouvoir faire
// attendre les autres. À trois cents, avec les refus du couple comptés en
// plus, il y suffisait d'un voisin et de quelques minutes ; et un délai par
// adresse ne gênait qu'un attaquant assez naïf pour essayer en file — les
// voisins, eux, attendaient tous. Les délais vivent dans le couple et dans
// le compte.
const MUR_ADRESSE = 1000;       // par adresse : la protection du serveur
const LIBRES_COMPTE = 10;       // par compte, de partout : jamais de mur

// LE SEAU DU COMPTE. Il était COMMUN À TOUTE LA PLATEFORME, et c'était juste
// pour une maison — le propriétaire et ses vendeurs. Pour une application
// grand public, mesuré contre un vrai serveur : après soixante-dix
// connexions RÉUSSIES, chacune de chez soi, CHAQUE connexion de la
// plateforme attendait huit secondes (66 ms au repos) ; et une seule adresse,
// avec cinquante-cinq mauvais essais — sous son propre mur —, imposait les
// mêmes huit secondes à tout le monde. Le frein était devenu l'arme qu'il
// devait parer. Il ne se voyait pas : sa clé commençait par un caractère nul,
// que PostgreSQL refuse, et il ne comptait que dans la mémoire de chaque
// instance — assez pour ralentir une instance chargée, jamais assez pour
// qu'un banc le remarque.
//
// LA CLÉ N'EST PAS LE COURRIEL. Une table d'adresses ne doit pas devenir une
// liste de qui essaie d'entrer où : la clé est une empreinte du courriel,
// scellée par le secret de session (« @ » puis 32 chiffres hexadécimaux). Un
// courriel qui n'a pas de compte a la sienne, comme les autres : le frein ne
// dit pas qui est inscrit ici. Sans courriel — la clé de secours —, le seau
// est « @secours ». Le couple s'écrit « adresse|@… ».

/** Où l'essai a été compté — pour qu'une réussite le rende au même endroit. */
export type Ticket = { cles: string[]; base: boolean };

/** Les seaux d'un essai, et leurs murs. `null` : seau absent. */
type Seaux = { adresse: string; couple: string | null; compte: string | null };

/** Le délai à observer, d'après un nombre d'échecs déjà comptés. */
function delaiPour(n: number, libres: number): number {
  return Math.min(Math.max(0, n - libres) * PALIER_MS, PLAFOND_MS);
}

// Le ménage de la mémoire : jamais plus d'une fois par minute — il parcourt
// toute la table —, et un plafond dur. Sous une rafale de courriels inventés,
// la table se remplissait plus vite que la fenêtre ne la vidait, et chaque
// essai la reparcourait en entier.
const PLAFOND_MEMOIRE = 50_000;
let dernierMenage = 0;

/** Compte un seau en mémoire, dans une fenêtre FIXE, et rend le total. */
function compterEnMemoire(cle: string): number {
  const maintenant = Date.now();
  if (essais.size > 5000 && maintenant - dernierMenage > 60_000) {
    dernierMenage = maintenant;
    for (const [k, v] of essais) if (maintenant - v.debut > FENETRE_MS) essais.delete(k);
  }
  // Au-delà du plafond, les plus anciennes entrées partent d'abord (une Map
  // garde l'ordre d'arrivée) : un cran de moins pour elles, jamais une
  // instance à genoux.
  for (const k of essais.keys()) {
    if (essais.size < PLAFOND_MEMOIRE) break;
    essais.delete(k);
  }
  const e = essais.get(cle);
  const suite = e !== undefined && maintenant - e.debut <= FENETRE_MS;
  const n = suite ? e.n + 1 : 1;
  essais.set(cle, { n, debut: suite ? e.debut : maintenant });
  return n;
}

/** Les trois seaux, en mémoire, dans le même ordre que `frein_essai`. */
function compterLesEssaisEnMemoire(s: Seaux, murAdresse: number): [number, number, number] {
  const a = compterEnMemoire(s.adresse);
  if (a > murAdresse || s.couple === null) return [a, 0, 0];
  const c = compterEnMemoire(s.couple);
  if (c > MUR) {
    // Refusé avant tout calcul : il ne compte pas pour l'adresse.
    const e = essais.get(s.adresse);
    if (e) e.n = Math.max(0, e.n - 1);
    return [a - 1, c, 0];
  }
  if (s.compte === null) return [a, c, 0];
  return [a, c, compterEnMemoire(s.compte)];
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
 * Rend `false` quand un mur est passé : l'appelant doit alors refuser TOUT DE
 * SUITE, sans vérifier le mot de passe — c'est ce refus précoce qui empêche
 * une rafale de faire calculer le serveur. Sinon, un TICKET : à rendre par
 * `rendreLEssai` si le mot de passe était bon.
 */
export async function attendreLeFrein(
  cle: string,
  {
    // Le courriel VISÉ (vide : la clé de secours). Absent pour l'inscription,
    // qui ne vise aucun compte : un seul seau, l'adresse, avec `mur`.
    compte,
    // L'INSCRIPTION A SON MUR À ELLE, et une clé préfixée : un passant qui
    // crée son compte ne ralentit pas le propriétaire qui se connecte.
    mur = MUR,
    // UN COMPTE DONT LE MOT DE PASSE EST PUBLIC — la vitrine des magasins —
    // n'a pas de seau de compte : il ne protégerait rien, et n'importe qui
    // pourrait faire attendre l'examinateur huit secondes. Le couple reste.
    motDePassePublic = false,
  }: { compte?: string; mur?: number; motDePassePublic?: boolean } = {},
): Promise<false | Ticket> {
  const connexion = compte !== undefined;
  const k = connexion ? await seauDuCompte(compte) : null;
  const seaux: Seaux = {
    adresse: cle,
    couple: k ? `${cle}|${k}` : null,
    compte: k && !motDePassePublic ? k : null,
  };
  const murAdresse = connexion ? MUR_ADRESSE : mur;

  // LE COMPTEUR EST DANS LA BASE — une fonction, trois seaux, sous le verrou
  // de chaque ligne. En mémoire, il ne comptait que pour l'instance qui
  // l'hébergeait : un hébergement qui en met plusieurs en parallèle donnait à
  // une attaque répartie l'allocation autant de fois qu'il y avait
  // d'instances, et personne ne pouvait le voir depuis l'extérieur.
  let n = await compterLesEssais(seaux, FENETRE_S, murAdresse, MUR);
  let base = n !== null;
  // Une base pas encore migrée : l'inscription garde la règle d'hier, qui
  // comptait déjà dans la base (elle compte les réussites — c'est voulu pour
  // l'inscription ; sa fenêtre glisse, défaut d'hier qui part avec la
  // migration) ; la connexion, elle, ne retournera pas à huit secondes.
  if (n === null && !connexion) {
    const hier = await compterUnEssaiALAncienne(cle, FENETRE_S);
    if (hier !== null) n = [hier, 0, 0];
  }
  // La base n'a pas répondu : on retombe sur la mémoire de cette instance.
  // Un frein muet vaut mieux qu'une porte fermée au propriétaire.
  if (n === null) {
    n = compterLesEssaisEnMemoire(seaux, murAdresse);
    base = false;
  }
  const [nAdresse, nCouple, nCompte] = n;

  if (nAdresse > murAdresse || nCouple > MUR) return false;
  const attente = Math.max(
    connexion ? 0 : delaiPour(nAdresse, LIBRES),
    seaux.couple ? delaiPour(nCouple, LIBRES) : 0,
    seaux.compte ? delaiPour(nCompte, LIBRES_COMPTE) : 0,
  );
  if (attente) await new Promise((r) => setTimeout(r, attente));
  const cles = [seaux.adresse, seaux.couple, seaux.compte].filter((x): x is string => x !== null);
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
    await rendreLesEssais(ticket.cles);
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
  const adresse = dernier(req.headers.get("x-vercel-forwarded-for"))
    || (req.headers.get("x-real-ip") ?? "").trim()
    || dernier(req.headers.get("x-forwarded-for"));
  return adresse ? blocDeLAdresse(adresse) : "global";
}

/**
 * UNE ADRESSE IPv6 SE COMPTE PAR SON BLOC DE 64 BITS. Une ligne, un téléphone,
 * une machine reçoivent un bloc entier, et y choisissent leur adresse à
 * volonté : comptée telle quelle, chaque essai pouvait venir d'une adresse
 * neuve, et le mur du couple ne voyait jamais deux fois la même. Une adresse
 * IPv4 écrite à la mode IPv6 (« ::ffff:1.2.3.4 ») est une adresse IPv4. Ce
 * qu'on ne sait pas lire reste tel quel : un seau de plus, jamais un de moins.
 */
export function blocDeLAdresse(brute: string): string {
  const a = brute.trim().replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!a.includes(":")) return a;
  const v4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
  if (v4) return v4[1];
  // Une adresse IPv4 en queue compte pour deux groupes.
  const groupes = (texte: string) => (texte ? texte.split(":") : [])
    .flatMap((g) => (g.includes(".") ? ["0", "0"] : [g]));
  const moities = a.split("::");
  if (moities.length > 2) return a;
  const gauche = groupes(moities[0]);
  const droite = moities.length === 2 ? groupes(moities[1]) : [];
  const manque = 8 - gauche.length - droite.length;
  if (moities.length === 2 ? manque < 1 : manque !== 0) return a;
  const tout = [...gauche, ...Array<string>(moities.length === 2 ? manque : 0).fill("0"), ...droite];
  if (!tout.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return a;
  return `${tout.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

// CE QUE CE FREIN FAIT, ET CE QU'IL NE FAIT PAS.
//
// Il compte dans la BASE : toutes les instances partagent les mêmes seaux, et
// une attaque répartie sur plusieurs instances ne gagne plus rien. Elle
// gagnait autrefois l'allocation entière par instance, sans que rien ne le
// signale. Une adresse murée n'y écrit plus rien de neuf, et la base fait son
// propre ménage.
//
// Il ne remplace pas une protection de bordure : il ajoute du temps et des
// murs, il n'empêche pas les requêtes d'arriver. Et si la base se tait, il
// retombe sur la mémoire d'une seule instance — moins bon, jamais fermé.
//
// Il ne freine guère une attaque qui essaie UN mot de passe sur MILLE comptes
// depuis mille adresses : chaque couple, chaque compte n'en voit qu'un. Ce
// qui tient alors, frein ou pas : le mot de passe fait douze caractères au
// minimum, et son empreinte coûte 210 000 tours. Le frein n'est pas la seule
// chose entre un inconnu et la caisse.
//
// Et derrière une MÊME adresse d'opérateur, il ne distingue pas deux
// téléphones : un voisin qui vise le compte du propriétaire depuis cette
// adresse-là ferme ce compte, à cette adresse, pour le quart d'heure — pas
// ailleurs (le Wi-Fi, une autre carte), et jamais une session déjà ouverte.
// Les distinguer demanderait de reconnaître l'appareil d'une connexion
// réussie à l'autre ; c'est une autre construction, pas un réglage. De même,
// mille essais vraiment jugés depuis une adresse la ferment pour le quart
// d'heure, voisins compris : c'est le prix de la protection du serveur, et
// il coûte mille calculs à qui veut le faire payer.
