// La plateforme : qui a le droit d'y entrer, et ce que sa porte exige de plus.
//
// CE QUE CE FICHIER DÉCIDE
// Un administrateur de plateforme voit TOUS les commerces. Une porte forcée
// ici ne coûte pas une boutique, elle coûte la flotte entière. Ce fichier
// porte les trois exigences qui distinguent cette porte de celle du client, et
// il ne les laisse à aucun écran :
//
//   1. LE VERROUILLAGE DU TÉLÉPHONE EST LA RÈGLE, pas une option. Le courriel
//      reste — il faut bien un chemin le jour du téléphone noyé — mais comme
//      SECOURS : il s'annonce par une lettre, et il attend (voir
//      `ATTENTE_SECOURS_MS`). Le NIST est sans nuance là-dessus (SP 800-63B-4
//      §3.1.3.1, « Email SHALL NOT be used for out-of-band authentication ») :
//      une boîte aux lettres ne prouve la possession d'aucun appareil. On ne
//      la supprime pas, on cesse d'en faire la porte principale.
//
//   2. DEUX APPAREILS AU MINIMUM. Un administrateur avec une seule clé est un
//      administrateur à un accident de sa flotte : le téléphone tombe dans un
//      seau, et il ne reste que le courriel — c'est-à-dire le facteur que la
//      règle 1 vient de déclasser. L'écran d'ajout RÉCLAME le second, il ne se
//      contente pas de le permettre.
//
//   3. CHAQUE ENTRÉE EST NOTIFIÉE, à l'intéressé lui-même et le jour même. Une
//      entrée qu'il n'a pas faite doit lui sauter aux yeux avant le soir.
//
// CE QUE CE FICHIER NE FAIT PAS, ET NE FERA JAMAIS
// Il n'ajoute aucun pouvoir au rôle « admin ». La liste vit dans
// `lib/roles.ts`, « sortir_argent » n'y est pas, et rien ici ne l'y remet —
// c'est vérifié par `tests/test_garde_partout.py` et par
// `tests/test_porte_admin.py`.
//
// POURQUOI UNE TABLE À PART POUR LE DROIT D'ÊTRE ADMINISTRATEUR
// `acces.commerce` est « not null », et c'est juste : un rôle sans commerce ne
// veut rien dire pour une propriétaire. Un administrateur de plateforme, lui,
// n'a pas de commerce. Voir `sql/migration-plateforme.sql` pour le raisonnement
// complet.

import { inserer, lire, lireUne, modifier } from "./base";
import { adresseNormalisee } from "./code-entree";
import { clesDe, type LigneCle } from "./cles";
import { envoyerCourriel } from "./courrier";
import { PAR_SERIE } from "./papier";
import { DUREE_MS, type Role } from "./session";
import type { Langue } from "./langue";
import { lettreDuneEntree, lettreDunSecours } from "./textes/admin-porte";

/** Le nom de la console, tel qu'il s'écrit dans une lettre et sur un écran. */
export const NOM_CONSOLE = "TOTEM ADMIN";

/**
 * Deux appareils. Pas « au moins un, et deux c'est mieux ».
 *
 * Le premier est celui de tous les jours. Le second est celui qui existe pour
 * le jour où le premier n'existe plus — et il ne sert à rien s'il est posé le
 * même soir, sur le même téléphone : l'écran d'ajout dit donc aussi qu'il faut
 * un AUTRE objet.
 */
export const MINIMUM_APPAREILS = 2;

/**
 * Le nombre de codes du papier de secours — dix, et le même partout.
 *
 * Il n'est pas réécrit ici : il vient de `lib/papier.ts`, qui les fabrique. Un
 * chiffre recopié à la main sur un écran finit par dire « huit » là où la
 * feuille en imprime dix, et c'est la personne qui compte ses codes restants
 * qui découvre l'écart, un soir où elle n'a plus que ça.
 */
export const CODES_DE_SECOURS = PAR_SERIE;

/**
 * Une minute entre l'envoi d'un code de secours et le moment où il ouvre.
 *
 * C'est le « délai » de l'arbitrage 1 (voir `maquettes/ARBITRAGES-PORTE.md`).
 * Il ne rend pas le courriel sûr — rien ne le rendra sûr — il rend la LETTRE
 * D'AVERTISSEMENT utile : elle part en même temps que le code, et cette minute
 * est celle pendant laquelle l'intéressé peut la lire et couper avant que le
 * code ne serve à quelqu'un d'autre. Sans elle, la lettre arrive après la
 * porte ouverte, et ne prévient plus de rien.
 *
 * Une minute, pas cinq : au-delà, la personne qui a réellement noyé son
 * téléphone abandonne et téléphone à quelqu'un.
 */
export const ATTENTE_SECOURS_MS = 60 * 1000;

/**
 * Combien de temps la console reste ouverte : douze heures, comme le reste.
 *
 * Repris de `lib/session.ts` et non redéfini — le NIST demande une nouvelle
 * preuve au moins toutes les douze heures au niveau AAL2 (SP 800-63B-4 §5.2),
 * et deux durées écrites à deux endroits divergent toujours. La maquette A6
 * annonçait « 30 jours » : périmé.
 */
export const DUREE_CONSOLE_MS = DUREE_MS;

// --- Le droit d'être administrateur ----------------------------------------

export type LigneAccesPlateforme = {
  id: number;
  personne: number;
  demande_le: string;
  demande_motif: string | null;
  accorde_le: string | null;
  accorde_par: number | null;
  refuse_le: string | null;
  refuse_par: number | null;
  retire_le: string | null;
  retire_par: number | null;
  retire_motif: string | null;
};

export type LignePersonne = {
  id: number;
  nom: string;
  courriel: string | null;
  etat: string;
  langue: Langue;
};

const CHAMPS_PERSONNE = "id,nom,courriel,etat,langue";

/** La personne qui porte cette adresse, ou rien. */
export async function personneParAdresse(courriel: string): Promise<LignePersonne | null> {
  const propre = adresseNormalisee(courriel);
  if (!propre) return null;
  return lireUne<LignePersonne>(
    `personnes?courriel=eq.${encodeURIComponent(propre)}`
    + `&select=${CHAMPS_PERSONNE}&limit=1`);
}

/** Le dossier vivant de cette personne : demandé, accordé, ou rien. */
export async function dossierDe(personne: number): Promise<LigneAccesPlateforme | null> {
  return lireUne<LigneAccesPlateforme>(
    `acces_plateforme?personne=eq.${personne}&retire_le=is.null&refuse_le=is.null&limit=1`);
}

/**
 * L'adresse du fondateur, s'il y en a une.
 *
 * Personne ne peut accorder le premier droit, puisqu'il n'y a encore personne
 * pour l'accorder. `TOTEM_ADMIN` tranche cet œuf-là, exactement comme
 * `TOTEM_PROPRIETAIRE` pour le commerçant fondateur — et il cessera de servir
 * le jour où un second administrateur existera.
 */
function adresseDuFondateur(): string | null {
  const brut = process.env.TOTEM_ADMIN;
  return brut ? adresseNormalisee(brut) : null;
}

/**
 * Cette personne est-elle administratrice de la plateforme, en ce moment ?
 *
 * On relit EN BASE à chaque fois, jamais depuis le jeton : un droit repris ce
 * matin doit valoir cet après-midi, sans attendre que la personne se
 * reconnecte. C'est la même règle que `lib/garde.ts` applique au rôle.
 *
 * Le fondateur passe par une ligne écrite à la volée : ainsi son droit est
 * visible dans la liste comme celui des autres, au lieu de rester une
 * exception invisible dans le code.
 */
export async function estAdministrateur(p: LignePersonne): Promise<boolean> {
  if (p.etat !== "actif") return false;

  const dossier = await dossierDe(p.id);
  if (dossier?.accorde_le) return true;

  const fondateur = adresseDuFondateur();
  if (!fondateur || !p.courriel) return false;
  if (adresseNormalisee(p.courriel) !== fondateur) return false;

  const maintenant = new Date().toISOString();
  if (dossier) {
    return modifier(`acces_plateforme?id=eq.${dossier.id}&accorde_le=is.null`, {
      accorde_le: maintenant,
    });
  }
  const ligne = await inserer<LigneAccesPlateforme>("acces_plateforme", {
    personne: p.id,
    demande_motif: "Le compte fondateur, désigné par TOTEM_ADMIN.",
    accorde_le: maintenant,
  });
  return Boolean(ligne);
}

/**
 * Le rôle et le commerce d'une personne, PLATEFORME COMPRISE.
 *
 * C'est le raccord d'une ligne pour les trois portes déjà écrites
 * (`/api/cle/entrer`, `/api/entrer/papier`, `/api/code/verifier`) : elles
 * appellent aujourd'hui `accesDe`, qui ne connaît que les commerces et rend
 * donc `null` pour un administrateur de plateforme — lequel ne peut alors pas
 * entrer du tout. Remplacer l'appel par celui-ci suffit.
 *
 * L'ORDRE COMPTE, ET IL EST DÉLIBÉRÉ : le commerce d'abord. Quelqu'un qui
 * tient une boutique ET administre la plateforme entre dans SA boutique par la
 * porte de tous les jours, et passe à la console par un geste explicite. Le
 * contraire ferait atterrir une propriétaire sur un écran de flotte le matin.
 */
export async function accesDeOuPlateforme(
  personne: number,
): Promise<{ role: Role; commerce: string | null } | null> {
  const commerce = await lireUne<{ role: Role; commerce: string }>(
    `acces?personne=eq.${personne}&retire_le=is.null&select=role,commerce&limit=1`);
  if (commerce) return commerce;

  const p = await lireUne<LignePersonne>(
    `personnes?id=eq.${personne}&select=${CHAMPS_PERSONNE}&limit=1`);
  if (!p || !(await estAdministrateur(p))) return null;
  return { role: "admin", commerce: null };
}

// --- Les demandes : demander, accorder, refuser, reprendre -----------------

/**
 * Demander l'accès à la plateforme.
 *
 * Une demande ne donne RIEN. Elle se pose sur la table de quelqu'un qui décide,
 * et elle porte les mots de celui qui demande — c'est ce qui distingue un
 * registre d'un formulaire.
 *
 * Redemander alors qu'un dossier vit déjà ne crée pas de doublon : l'index
 * unique de la base l'interdit, et c'est la base qui arbitre, pas nous.
 */
export async function demanderLaPlateforme(
  personne: number, motif: string,
): Promise<LigneAccesPlateforme | null> {
  const deja = await dossierDe(personne);
  if (deja) return deja;
  return inserer<LigneAccesPlateforme>("acces_plateforme", {
    personne,
    demande_motif: motif.trim().slice(0, 500) || null,
  });
}

/** Accorder. Le filtre « pas encore accordé » évite deux décisions concurrentes. */
export async function accorderLaPlateforme(id: number, par: number): Promise<boolean> {
  return modifier(
    `acces_plateforme?id=eq.${id}&accorde_le=is.null&refuse_le=is.null&retire_le=is.null`,
    { accorde_le: new Date().toISOString(), accorde_par: par });
}

/** Refuser. La demande reste, datée : celui qui décidera après doit la voir. */
export async function refuserLaPlateforme(id: number, par: number): Promise<boolean> {
  return modifier(
    `acces_plateforme?id=eq.${id}&accorde_le=is.null&refuse_le=is.null&retire_le=is.null`,
    { refuse_le: new Date().toISOString(), refuse_par: par });
}

/**
 * Reprendre un droit accordé. On date, on n'efface pas.
 *
 * Reprendre le droit ne ferme pas les sessions : c'est un geste distinct, et
 * l'écran des appareils le porte. Les fondre en un seul rendrait impossible de
 * retirer un droit sans jeter dehors quelqu'un au milieu de son travail.
 */
export async function retirerLaPlateforme(
  id: number, par: number, motif: string,
): Promise<boolean> {
  return modifier(
    `acces_plateforme?id=eq.${id}&accorde_le=not.is.null&retire_le=is.null`,
    {
      retire_le: new Date().toISOString(),
      retire_par: par,
      retire_motif: motif.trim().slice(0, 500) || null,
    });
}

export type Dossier = {
  ligne: LigneAccesPlateforme;
  personne: LignePersonne | null;
  /** Combien d'appareils cette personne a posés. Zéro se lit tout de suite. */
  appareils: number;
};

/**
 * Tous les dossiers, le plus récent d'abord : accordés, en attente, refusés.
 *
 * On rend TOUT, y compris les refus et les reprises. Une liste qui ne montre
 * que les droits en cours ne répond pas à la question qu'on lui pose vraiment :
 * « qui a eu accès à cette console, et quand ? »
 */
export async function listerLesDossiers(): Promise<Dossier[]> {
  const lignes = await lire<LigneAccesPlateforme>(
    "acces_plateforme?order=demande_le.desc&limit=200");
  return Promise.all(lignes.map(async (ligne) => {
    const personne = await lireUne<LignePersonne>(
      `personnes?id=eq.${ligne.personne}&select=${CHAMPS_PERSONNE}&limit=1`);
    const appareils = ligne.accorde_le && !ligne.retire_le
      ? (await clesDe(ligne.personne)).length
      : 0;
    return { ligne, personne, appareils };
  }));
}

// --- Les deux appareils ----------------------------------------------------

/** Les appareils vivants de cette personne, le plus récemment vu d'abord. */
export async function appareilsDe(personne: number): Promise<LigneCle[]> {
  return clesDe(personne);
}

/**
 * En manque-t-il un ?
 *
 * Séparée de l'écran exprès : la même question se pose à l'ajout (A5), à la
 * liste (A6) et le jour où l'on voudra la poser à l'entrée. Trois `< 2` écrits
 * à trois endroits deviennent un jour trois nombres différents.
 */
export function manqueUnAppareil(combien: number): boolean {
  return combien < MINIMUM_APPAREILS;
}

/** Combien il en manque encore. Zéro quand le compte y est. */
export function appareilsManquants(combien: number): number {
  return Math.max(0, MINIMUM_APPAREILS - combien);
}

// --- Prévenir l'intéressé --------------------------------------------------

export type Contexte = {
  personne: number;
  courriel: string | null;
  langue: Langue;
  appareil: string | null;
  lieu: string | null;
};

/**
 * Écrire à l'intéressé qu'on vient d'entrer chez lui. À CHAQUE entrée.
 *
 * Pas seulement depuis un appareil inconnu : c'est ici que la porte du
 * super-administrateur diffère de celle du client. Une entrée depuis
 * l'appareil habituel, à une heure où il dormait, est exactement le message
 * qu'il doit recevoir — et le seul moyen de la lui signaler est de tout lui
 * signaler.
 *
 * Silencieuse en cas d'échec : un avis qui empêcherait quelqu'un d'entrer
 * parce qu'il n'a pas pu partir serait pire que pas d'avis du tout. Ce qui
 * est parti et ce qui n'est pas parti se lit dans le journal des courriels —
 * c'est l'écran A7.
 */
export async function prevenirDuneEntree(
  c: Contexte, moyen: "cle" | "courriel" | "papier",
): Promise<void> {
  if (!c.courriel) return;
  await envoyerCourriel({
    destinataire: c.courriel,
    // Le genre est celui du JOURNAL, pas du texte : « un appareil a fait
    // quelque chose sur votre compte ». La table `courriels` n'en connaît que
    // cinq, et celui-ci est le bon rayon.
    genre: "alerte_appareil",
    message: lettreDuneEntree(c.langue, {
      quand: new Date(),
      appareil: c.appareil,
      lieu: c.lieu,
      moyen,
    }),
    personne: c.personne,
  });
}

/**
 * Écrire à l'intéressé qu'un code de secours vient d'être demandé chez lui.
 *
 * Elle part EN MÊME TEMPS que le code, et c'est tout l'intérêt : pendant la
 * minute où le code n'ouvre pas encore (`ATTENTE_SECOURS_MS`), cette lettre
 * est la seule chose qui puisse arriver avant lui.
 */
export async function prevenirDunSecours(c: Contexte): Promise<void> {
  if (!c.courriel) return;
  await envoyerCourriel({
    destinataire: c.courriel,
    genre: "alerte_appareil",
    message: lettreDunSecours(c.langue, {
      quand: new Date(),
      appareil: c.appareil,
      lieu: c.lieu,
      minutes: Math.round(ATTENTE_SECOURS_MS / 60000),
    }),
    personne: c.personne,
  });
}

/**
 * Le code de secours a-t-il fini d'attendre ?
 *
 * Rend le nombre de millisecondes restantes, zéro le reste du temps. On
 * interroge par ADRESSE et sans jamais toucher au code présenté : la réponse
 * est donc la même pour un code juste et pour un code faux, et le chronomètre
 * n'apprend rien.
 */
export async function attenteDuSecours(courriel: string): Promise<number> {
  const lignes = await lire<{ cree_le: string }>(
    `codes_entree?courriel=eq.${encodeURIComponent(adresseNormalisee(courriel))}`
    + `&utilise_le=is.null&order=cree_le.desc&limit=1&select=cree_le`);
  const ne = lignes[0]?.cree_le;
  if (!ne) return 0;
  return Math.max(0, new Date(ne).getTime() + ATTENTE_SECOURS_MS - Date.now());
}

// --- Le journal de la porte, pour l'écran A7 -------------------------------

export type LigneCourriel = {
  id: number;
  destinataire: string;
  personne: number | null;
  genre: string;
  issue: string;
  detail: string | null;
  reference: string | null;
  cree_le: string;
};

/** Ce qui est parti, et ce qui n'est pas parti, pour cette personne. */
export async function courrielsDe(
  personne: number, combien = 40,
): Promise<LigneCourriel[]> {
  return lire<LigneCourriel>(
    `courriels?personne=eq.${personne}&order=cree_le.desc&limit=${combien}`);
}

export type LigneEntree = {
  id: number;
  personne: number | null;
  issue: string;
  moyen: string | null;
  appareil: string | null;
  lieu: string | null;
  survenu_le: string;
};

/** Ce qui s'est passé à la porte — y compris quand rien ne s'est ouvert. */
export async function entreesDe(
  personne: number, combien = 25,
): Promise<LigneEntree[]> {
  return lire<LigneEntree>(
    `entrees?personne=eq.${personne}&order=survenu_le.desc&limit=${combien}`);
}
