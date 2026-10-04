// Le guichet : tout ce que l'application demande au monde extérieur passe ici.
//
// UNE seule adresse, UN seul jeton. L'application ne connaît pas Supabase et
// n'a aucune clé : elle parle à la plateforme (Vercel), qui parle à la base.
// Cette ignorance est volontaire — une application installée se démonte, un
// serveur non. Voir `docs/MOBILE.md`.

import * as Coffre from "./coffre";
import type { Donnees } from "@noyau/types";
import { LANGUE_DEFAUT, langueDe, type Langue } from "@noyau/langue";
import type { ReponseEssai } from "@noyau/essai";
import { textesConnexion } from "@noyau/textes/connexion";

// L'adresse de la plateforme. Elle vient de la configuration d'Expo pour
// qu'une compilation d'essai puisse viser un déploiement de préversion sans
// toucher au code.
import Constants from "expo-constants";

// UNE ÉCHÉANCE SUR TOUT L'ÉCHANGE — LES EN-TÊTES ET LE CORPS.
//
// À Douala, une connexion à demi ouverte (le TCP tient, plus rien ne revient)
// laisse une demande en suspens POUR TOUJOURS : ni succès, ni échec. Le
// bouton reste sur « Vérification… », la roue tourne sans fin, et le message
// honnête « réseau en panne » ne s'affiche jamais — car il vit dans le
// `catch` d'une promesse qui ne rejette pas.
//
// Il y avait un délai de quinze secondes, et il ne protégeait de rien. Il
// s'arrêtait dès que `fetch` rendait la main — or le `fetch` du téléphone
// (celui d'Expo 57, qui remplace celui de React Native) rend la main dès les
// EN-TÊTES, avant le corps. Ce qui se passait ensuite n'était gardé par
// personne :
//
//   — sur iPhone, une coupure APRÈS les en-têtes laisse la lecture du corps
//     en suspens pour toujours (elle n'attend que « corps complet », et la
//     coupure pose « erreur reçue ») ; même une annulation ne la réveille
//     pas. La roue restait plantée en haut des quatre onglets, sur des
//     chiffres pourtant à jour, jusqu'au redémarrage de l'application ;
//   — sur Android, une coupure rend le MORCEAU reçu comme si c'était tout,
//     et le `{}` de secours le faisait passer pour une boutique vide :
//     « Aucune carte », recopié dans le cahier du téléphone.
//
// D'où trois règles, et elles tiennent ensemble :
//
//   1. L'échéance est une course EN JAVASCRIPT contre tout l'échange, pas
//      une annulation confiée au module natif : c'est la seule chose qui
//      rende la main à coup sûr, quel que soit l'état où le natif s'est
//      coincé. L'annulation suit, mais seulement pour libérer la connexion.
//   2. Le corps se lit en TEXTE, puis se déchiffre ici. Un corps illisible,
//      coupé, ou une page web à la place de la plateforme est une PANNE,
//      jamais `{}` — et jamais un jeton absent rangé dans le coffre.
//   3. Toute erreur sort du guichet en PHRASE du dictionnaire, dans la
//      langue de l'écran (`versErreurGuichet`). Plus jamais « fetch failed:
//      … » ni « Network request failed » sous les yeux du propriétaire.
//
// Quinze secondes pour les en-têtes : large pour un réseau lent, assez court
// pour qu'une coupure se dise plutôt que de se taire. Trente au total : le
// corps de l'Analyse (mille SMS) doit pouvoir descendre sur un réseau lent.
// `verifier-le-guichet` met ce code devant le fetch d'Expo tel qu'il se
// comporte vraiment, et exige qu'il rende la main avant l'échéance.
const ECHEANCE_EN_TETES_MS = 15_000;
const ECHEANCE_TOTALE_MS = 30_000;

/** Ce qui a manqué, en un mot — pour que les écrans puissent choisir sans
 *  lire la phrase. */
export type NaturePanne =
  | "reseau"       // rien n'est revenu à temps : réseau coupé, plateforme muette
  | "incomplete"   // une réponse est arrivée, mais coupée ou illisible
  | "interceptee"  // une page web à la place de la plateforme (wifi d'hôtel…)
  | "plateforme"   // la plateforme dit avoir un problème (5xx)
  | "refus"        // la plateforme a répondu non (4xx)
  | "session"      // la session est terminée (401)
  | "abandon";     // l'écran a renoncé, ou la réponse vise une session passée

/** Ce que le guichet rend quand une demande n'aboutit pas.
 *
 *  `message` est TOUJOURS une phrase pour le propriétaire, dans la langue de
 *  l'écran : la raison donnée par la plateforme, ou une phrase du
 *  dictionnaire. `statut` vaut 0 quand aucune réponse utilisable n'est
 *  revenue. */
export class ErreurGuichet extends Error {
  constructor(
    message: string,
    readonly statut: number,
    readonly nature: NaturePanne = statut >= 500 ? "plateforme" : "refus",
    /** Le mot de la plateforme, quand elle en donne un (« boitier_muet »,
     *  « carte_absente ») : les écrans s'en servent pour se remettre à jour
     *  — la phrase, elle, est pour le propriétaire. */
    readonly raison?: string,
  ) {
    super(message);
    this.name = "ErreurGuichet";
  }
}

/** Une panne reconnue mais pas encore DITE. Elle ne sort jamais du guichet :
 *  `versErreurGuichet` en fait une phrase, dans la langue de l'écran. */
class Panne {
  constructor(readonly nature: NaturePanne, readonly statut = 0) {}
}

/** Ce qui est revenu du réseau : un statut, et le corps en texte — `null`
 *  quand on n'a pas eu besoin de le lire. */
type Echange = { statut: number; texte: string | null };

/**
 * UN ÉCHANGE avec la plateforme, borné de bout en bout.
 *
 * `renoncer` : le signal de l'appelant (le cahier qui se ferme avec la
 * session). Il rend la main TOUT DE SUITE, par la même course.
 *
 * `corpsInutile` : un statut pour lequel le corps ne servira pas (le 401
 * d'une demande signée). On n'attend pas un corps qu'on ne lira pas — il
 * pourrait ne jamais arriver.
 */
function echanger(
  url: string,
  init: RequestInit,
  reglages: { renoncer?: AbortSignal; corpsInutile?: (statut: number) => boolean } = {},
): Promise<Echange> {
  const { renoncer, corpsInutile } = reglages;
  if (renoncer?.aborted) return Promise.reject(new Panne("abandon"));

  const prise = new AbortController();
  let arreter: (p: Panne) => void = () => {};
  const coupure = new Promise<never>((_, rejeter) => { arreter = rejeter; });
  // La course est déjà jouée quand cette promesse rejette tard : personne
  // ne l'écoute plus, et elle ne doit pas le crier.
  coupure.catch(() => {});

  // D'abord rendre la main, PUIS libérer la connexion. Dans cet ordre : sur
  // iPhone, l'annulation ne réveille rien — c'est la course qui tranche.
  const couper = (nature: NaturePanne) => {
    arreter(new Panne(nature));
    prise.abort();
  };
  const auTotal = setTimeout(() => couper("reseau"), ECHEANCE_TOTALE_MS);
  let auxEnTetes: ReturnType<typeof setTimeout> | null =
    setTimeout(() => couper("reseau"), ECHEANCE_EN_TETES_MS);
  const auRenoncement = () => couper("abandon");
  renoncer?.addEventListener("abort", auRenoncement);

  const travail = (async (): Promise<Echange> => {
    const r = await fetch(url, { ...init, signal: prise.signal });
    if (auxEnTetes !== null) { clearTimeout(auxEnTetes); auxEnTetes = null; }
    if (corpsInutile?.(r.status)) {
      prise.abort();
      return { statut: r.status, texte: null };
    }
    // Le corps, sous la MÊME échéance : c'est ici que tout se jouait.
    return { statut: r.status, texte: await r.text() };
  })();
  // Perdante, la lecture peut rejeter bien plus tard (ou jamais) : on la
  // laisse finir dans son coin.
  travail.catch(() => {});

  return Promise.race([travail, coupure]).finally(() => {
    clearTimeout(auTotal);
    if (auxEnTetes !== null) clearTimeout(auxEnTetes);
    renoncer?.removeEventListener("abort", auRenoncement);
  });
}

/** Le corps déchiffré : un OBJET JSON, ou rien. Jamais `{}` inventé. */
function objetJson(texte: string | null): Record<string, unknown> | null {
  if (!texte) return null;
  try {
    const v: unknown = JSON.parse(texte);
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Une page web (« <!doctype html>… ») là où la plateforme parle JSON. */
function pageWeb(texte: string | null): boolean {
  return Boolean(texte && texte.trimStart().startsWith("<"));
}

/** La raison que la plateforme donne elle-même, si elle en donne une : elle
 *  est dans la langue que la demande a DITE (`avecLangue`) — pour les routes
 *  qui la lisent dans l'adresse (`langueDemandee`). */
function raisonDonnee(corps: Record<string, unknown> | null): string | null {
  const e = corps?.erreur;
  return typeof e === "string" && e.trim() ? e : null;
}

/**
 * Ce que dit une réponse : l'objet attendu, ou une erreur.
 *
 * Un 2xx dont le corps ne se déchiffre pas est une PANNE. C'était `{}`,
 * et `{}` ressemblait à une boutique vide.
 */
function lireReponse(e: Echange): Record<string, unknown> {
  const corps = objetJson(e.texte);
  if (e.statut >= 200 && e.statut < 300) {
    if (corps) return corps;
    throw new Panne(pageWeb(e.texte) ? "interceptee" : "incomplete");
  }
  const raison = raisonDonnee(corps);
  const nature: NaturePanne = e.statut >= 500 ? "plateforme" : "refus";
  const mot = typeof corps?.raison === "string" ? corps.raison : undefined;
  if (raison) throw new ErreurGuichet(raison, e.statut, nature, mot);
  // 511 : « identifiez-vous d'abord » — c'est le réseau qui parle.
  if (e.statut === 511) throw new Panne("interceptee", e.statut);
  throw new Panne(nature, e.statut);
}

const PHRASES: Record<NaturePanne, keyof typeof textesConnexion.fr> = {
  reseau: "reseauEnPanne",
  incomplete: "reponseIncomplete",
  interceptee: "reseauIntercepte",
  plateforme: "plateformeEnPanne",
  refus: "demandeRefusee",
  session: "sessionExpiree",
  abandon: "demandeAbandonnee",
};

/**
 * TOUTE ERREUR, EN UNE PHRASE QUE LE PROPRIÉTAIRE PEUT LIRE.
 *
 * La seule porte de sortie des erreurs du guichet — et les écrans peuvent
 * s'en servir pour ce qui ne vient pas de lui. Une erreur du réseau
 * (« Network request failed », « fetch failed: … »), un statut sans raison,
 * un corps illisible, un abandon : chacun reçoit sa phrase du dictionnaire.
 * Une raison donnée par la plateforme elle-même passe telle quelle.
 */
export function versErreurGuichet(e: unknown, langue: Langue): ErreurGuichet {
  if (e instanceof ErreurGuichet) return e;
  const t = textesConnexion[langue] ?? textesConnexion[LANGUE_DEFAUT];
  if (e instanceof Panne) {
    return new ErreurGuichet(t[PHRASES[e.nature]] as string, e.statut, e.nature);
  }
  return new ErreurGuichet(t.reseauEnPanne, 0, "reseau");
}

/** La langue de l'écran, pour une demande qui ne l'a pas dite : celle que
 *  `langue.tsx` range dans le coffre à chaque changement, sous ce nom. */
const CLE_LANGUE = "totem.langue";
export async function langueDeLEcran(): Promise<Langue> {
  try {
    return langueDe(await Coffre.lire(CLE_LANGUE));
  } catch {
    return LANGUE_DEFAUT;
  }
}

// L'ADRESSE DE LA PLATEFORME — et pourquoi elle n'est plus une constante.
//
// Elle l'était, et cela s'est mal passé : l'adresse écrite ici était un
// EXEMPLE repris d'une documentation, et ce sous-domaine appartenait à
// quelqu'un d'autre. L'application envoyait donc le mot de passe du
// propriétaire à un serveur inconnu, et n'affichait qu'un « connexion
// impossible » incompréhensible. On cherchait du côté du mot de passe ; le
// problème était l'adresse.
//
// Trois lecons, et elles sont toutes les trois dans ce fichier :
//
//   1. Le propriétaire doit pouvoir CORRIGER l'adresse depuis l'application,
//      sans attendre une nouvelle compilation. D'où le coffre.
//   2. L'application doit VÉRIFIER qu'un TOTEM habite là AVANT d'envoyer quoi
//      que ce soit de sensible. D'où `verifierPlateforme`.
//   3. Une valeur par défaut reste commode, mais elle n'est qu'une
//      proposition — jamais une garantie.
//
// L'ordre : `EXPO_PUBLIC_ADRESSE` (pratique pour viser une préversion ou un
// serveur local sans toucher au code), sinon `app.json`. L'écran qui
// permettait de la changer a disparu : voir `adressePlateforme`. Rien de
// secret ne passe par là : une adresse n'est pas un secret, et tout ce qui
// porte `EXPO_PUBLIC_` entre dans le paquet, donc devient public.

const ADRESSE_LIVREE: string =
  process.env.EXPO_PUBLIC_ADRESSE ||
  (Constants.expoConfig?.extra?.adressePlateforme as string) ||
  "";

// Lue une fois au démarrage puis gardée sous la main : chaque appel du
// guichet en a besoin, et une lecture de coffre par requête serait du gâchis.
let adresseEnMemoire: string | null = null;

/** Enlève le « / » final : « https://x.app/ » et « https://x.app » sont la
 *  même adresse, et les chemins qu'on y colle commencent tous par « / ». */
function normaliserAdresse(brute: string): string {
  return brute.trim().replace(/\/+$/, "");
}

/** Vrai si le texte ressemble à une adresse web utilisable.
 *
 *  On EXIGE « https ». Ce n'est pas de la pudeur : le mot de passe du
 *  propriétaire passe par là. En « http », il voyagerait en clair sur le
 *  réseau du cybercafé ou de l'hôtel.
 *
 *  UNE seule exception, et c'est celle que les navigateurs eux-mêmes font :
 *  la machine locale. Un « http://127.0.0.1:3120 » ne quitte pas l'appareil,
 *  il n'y a donc aucun réseau où l'écouter. Sans cette exception, on ne
 *  pourrait plus essayer l'application contre un serveur d'essai — et un
 *  garde-fou qu'on doit désactiver pour travailler finit toujours par être
 *  désactivé pour de bon. */
const LOCALES = ["127.0.0.1", "localhost", "::1", "10.0.2.2"];

export function adresseValable(brute: string): boolean {
  const a = normaliserAdresse(brute);
  try {
    const u = new URL(a);
    if (!u.hostname) return false;
    if (u.protocol === "https:") return true;
    // « 10.0.2.2 » est l'adresse par laquelle un émulateur Android atteint la
    // machine qui l'héberge : c'est la même boucle locale, vue de l'intérieur.
    return u.protocol === "http:" && LOCALES.includes(u.hostname);
  } catch {
    return false;
  }
}

/** L'adresse en service : celle livrée avec l'application, et elle seule.
 *
 *  Elle se changeait depuis l'écran de connexion. Ce réglage ne se montre
 *  plus — il mettait une URL sous les yeux de personnes qui n'en ont que
 *  faire, et une porte pour envoyer son mot de passe ailleurs. Une adresse
 *  rangée par une ancienne version est donc IGNORÉE : sans l'écran qui la
 *  corrigeait, une adresse fausse rendrait le téléphone muet pour toujours. */
export async function adressePlateforme(): Promise<string> {
  if (adresseEnMemoire !== null) return adresseEnMemoire;
  adresseEnMemoire = ADRESSE_LIVREE;
  return adresseEnMemoire;
}

/** Ce qu'on a trouvé au bout de l'adresse. */
export type EtatPlateforme =
  | "trouvee"           // un TOTEM, prêt à recevoir une connexion
  | "non-configuree"    // un TOTEM, mais sans mot de passe posé côté serveur
  | "absente"           // quelque chose répond, mais ce n'est pas un TOTEM
  | "injoignable";      // rien ne répond : réseau coupé, ou adresse morte

/**
 * « Y a-t-il un TOTEM au bout de cette adresse ? »
 *
 * À appeler AVANT de proposer de taper un mot de passe. Rien de sensible ne
 * part dans cet appel : c'est une simple question, et la réponse ne contient
 * ni nom, ni chiffre, ni adresse de base.
 */
export async function verifierPlateforme(adresse?: string): Promise<EtatPlateforme> {
  const base = normaliserAdresse(adresse ?? (await adressePlateforme()));
  if (!adresseValable(base)) return "absente";
  try {
    const e = await echanger(`${base}/api/plateforme`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    // « Identifiez-vous d'abord » : c'est le réseau qui répond, pas une
    // adresse habitée par autre chose qu'un TOTEM.
    if (e.statut === 511) return "injoignable";
    // UNE PANNE PASSAGÈRE N'EST PAS « PAS UN TOTEM ». Un 502 ou un 504 de
    // l'hébergeur (une fonction qui démarre trop lentement), un 429 (trop
    // de demandes), un 408 : c'est la bonne maison, qui ne répond pas CETTE
    // fois. « Absente » fermait les champs et disait au propriétaire de
    // « contacter la personne qui gère votre TOTEM » — c'est lui.
    // « Injoignable » propose de réessayer.
    if (e.statut >= 500 || e.statut === 408 || e.statut === 429) return "injoignable";
    if (e.statut < 200 || e.statut >= 300) return "absente";
    const corps = objetJson(e.texte);
    // Une PAGE WEB complète, c'est quelqu'un d'autre qui habite là : le mot
    // de passe n'y part pas. Un corps COUPÉ, c'est le réseau qui a lâché —
    // le prendre pour « pas un TOTEM » fermait la porte sur une simple
    // coupure, et faisait chercher du mauvais côté.
    if (!corps) return pageWeb(e.texte) ? "absente" : "injoignable";
    // Le drapeau doit être là. Un serveur quelconque qui rendrait 200 sur
    // n'importe quel chemin ne passe pas cette porte.
    if (corps.totem !== true) return "absente";
    return corps.configuree === true ? "trouvee" : "non-configuree";
  } catch {
    // Rien à temps, ou rien du tout : l'écran le dit au lieu de rester sur
    // « Vérification… » pour toujours.
    return "injoignable";
  }
}

// Le jeton vit dans le coffre du système — celui qu'ouvre le doigt ou le
// visage — et jamais dans un fichier ordinaire.
const CLE_JETON = "totem.jeton";
const CLE_ECHEANCE = "totem.jeton.echeance";

/** Vrai si la session est encore valable dans plus d'une journée. */
export async function sessionVivante(): Promise<boolean> {
  const [jeton, echeance] = await Promise.all([
    Coffre.lire(CLE_JETON),
    Coffre.lire(CLE_ECHEANCE),
  ]);
  if (!jeton || !echeance) return false;
  // Une marge d'un jour : on se reconnecte AVANT d'être refusé, plutôt
  // qu'après un écran vide au mauvais moment.
  return Number(echeance) - Date.now() > 24 * 3600 * 1000;
}

/**
 * Ouvre une session avec un COMPTE — un courriel et un mot de passe.
 *
 * Sans courriel, la plateforme comprend qu'on présente la clé de secours :
 * le mot de passe unique posé sur l'hébergement. Il existe pour le jour où
 * la base des comptes ne répond plus, et le propriétaire doit tout de même
 * pouvoir entrer, ne serait-ce que pour constater la panne.
 *
 * Ni le courriel ni le mot de passe ne survivent à cet appel : ce qui se
 * range dans le coffre, c'est le JETON rendu par la plateforme.
 */
export async function ouvrirSession(
  courriel: string, motdepasse: string, langue: Langue,
): Promise<void> {
  try {
    const base = await adressePlateforme();
    const e = await echanger(`${base}/api/session?langue=${langue}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        courriel ? { courriel, motdepasse } : { motdepasse }),
    });
    // Un refus sans raison lisible, à CETTE porte, c'est le mot de passe.
    if (e.statut === 401 && !raisonDonnee(objetJson(e.texte))) {
      throw new ErreurGuichet(textesConnexion[langue].motDePasseIncorrect, 401, "refus");
    }
    await rangerLeJeton(lireReponse(e));
  } catch (e) {
    throw versErreurGuichet(e, langue);
  }
}

/**
 * Range le jeton qu'une réponse apporte — celle de la connexion comme celle
 * de l'inscription : les deux portes ouvrent la même session, elles la
 * rangent donc de la même façon.
 *
 * JAMAIS UN JETON ABSENT DANS LE COFFRE. Une réponse coupée qui aurait
 * perdu le jeton rangeait « undefined » comme une session ouverte : l'écran
 * passait le verrou, puis chaque demande revenait refusée.
 */
async function rangerLeJeton(corps: Record<string, unknown>): Promise<void> {
  const jeton = corps.jeton;
  const expire = Number(corps.expire);
  if (typeof jeton !== "string" || !jeton || !Number.isFinite(expire) || expire <= 0) {
    throw new Panne("incomplete");
  }
  await Coffre.ecrire(CLE_JETON, jeton);
  await Coffre.ecrire(CLE_ECHEANCE, String(expire));
}

/** Ce qu'on donne pour créer son compte — et rien de plus. */
export type FicheInscription = {
  prenom: string; nom: string; adresse: string;
  telephone: string; courriel: string; motdepasse: string;
};

/**
 * CRÉER SON COMPTE, depuis le téléphone.
 *
 * TOTEM est ouvert à tous : n'importe qui télécharge l'application et crée
 * son compte. Le compte est actif tout de suite — il entre, et voit « Ajouter
 * ma carte » tant qu'aucune carte ne lui est attribuée. Ouvrir la porte à
 * tous ne donne accès à rien : un compte neuf ne voit QUE les cartes qu'on
 * lui attribue, et il n'en a aucune.
 *
 * Mêmes garanties que la connexion, parce que c'est la même porte : une
 * échéance sur tout l'échange, une réponse coupée qui est une PANNE, et
 * jamais un jeton absent rangé dans le coffre. Le mot de passe ne survit
 * pas à cet appel.
 *
 * Un refus porte la phrase de la plateforme, dans la langue demandée. Elle
 * ne dit jamais « ce courriel a déjà un compte » : on ne fait pas savoir à
 * un inconnu qui est inscrit ici.
 */
export async function inscrire(fiche: FicheInscription, langue: Langue): Promise<void> {
  try {
    const base = await adressePlateforme();
    const e = await echanger(`${base}/api/inscription?langue=${langue}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fiche),
    });
    await rangerLeJeton(lireReponse(e));
  } catch (e) {
    throw versErreurGuichet(e, langue);
  }
}

/**
 * SUPPRIMER SON COMPTE, depuis l'application — Apple l'exige dès qu'on peut
 * en créer un, et c'est juste : on doit pouvoir partir aussi simplement
 * qu'on est venu.
 *
 * Le mot de passe est redemandé : un téléphone prêté, déverrouillé, ne doit
 * pas suffire à effacer le compte de quelqu'un. La plateforme refuse le
 * propriétaire de la plateforme et la vitrine, avec une phrase que l'écran
 * montre telle quelle.
 *
 * Ne ferme PAS la session lui-même : c'est l'écran qui le fait, par la même
 * porte que la déconnexion — pour que le cahier se ferme avec.
 */
export function supprimerMonCompte(motdepasse: string, langue: Langue): Promise<{ ok: true }> {
  return demander("/api/moi/suppression", {
    method: "POST", body: JSON.stringify({ motdepasse }),
  }, { langue, motDePasseRedemande: true });
}

/**
 * OÙ ÉCRIRE À TOTEM. L'adresse n'est PAS écrite dans l'application : elle
 * vit sur la plateforme (`CONTACT_COURRIEL`), que le propriétaire change sans
 * nous — une adresse inventée ici promettrait une boîte qui n'existe pas.
 *
 * Si la plateforme la donne (`contact` dans `/api/plateforme`), on rend un
 * lien `mailto:` ; sinon, la page de la plateforme qui l'affiche
 * (`/confidentialite`), qui elle renvoie à défaut vers la fiche du magasin.
 */
export async function ouContacterTotem(): Promise<string> {
  const base = await adressePlateforme();
  try {
    const e = await echanger(`${base}/api/plateforme`, {
      method: "GET", headers: { accept: "application/json" },
    });
    const c = objetJson(e.texte)?.contact;
    if (typeof c === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) {
      return `mailto:${c}`;
    }
  } catch {
    // Le réseau a toussé : la page fera aussi bien.
  }
  return `${base}/confidentialite`;
}

export async function fermerSession(): Promise<void> {
  await Coffre.effacer(CLE_JETON);
  await Coffre.effacer(CLE_ECHEANCE);
}

/**
 * LE CHEMIN, AVEC LA LANGUE DE L'ÉCRAN — une fois, et une seule.
 *
 * Le téléphone n'a pas de cookie : la plateforme ne connaît sa langue que
 * si l'adresse la DIT (`?langue=fr`), et sans elle répond en anglais. Seules
 * trois demandes la disaient. Les autres revenaient avec une raison en
 * anglais sur un écran français — « The owner already sees every card. » —
 * et l'écran la montrait telle quelle, puisqu'une raison donnée par la
 * plateforme passe sans traduction.
 */
function avecLangue(chemin: string, langue: Langue): string {
  if (/[?&]langue=/.test(chemin)) return chemin;
  return `${chemin}${chemin.includes("?") ? "&" : "?"}langue=${langue}`;
}

/**
 * Une demande signée par le jeton du coffre.
 *
 * `langue` : celle de l'écran qui demande. Absente, c'est celle que le
 * coffre a retenue — la même, puisque l'écran l'y range à chaque changement.
 * Elle se décide AVANT l'envoi : elle part avec la demande (`avecLangue`),
 * et c'est elle que parlent les phrases du dictionnaire au retour.
 * `renoncer` : pour qu'un écran (ou le cahier, à la déconnexion) puisse
 * abandonner une demande en route.
 */
async function demander<T>(
  chemin: string,
  options: RequestInit = {},
  reglages: {
    langue?: Langue; renoncer?: AbortSignal;
    /** Cette porte REVÉRIFIE le mot de passe (supprimer son compte) : un
     *  401 qui donne sa raison y veut dire « mot de passe refusé », pas
     *  « session terminée ». Sans ce drapeau, un mot de passe mal tapé
     *  fermait la session — et l'écran disait « reconnectez-vous » à
     *  quelqu'un qui s'était seulement trompé d'une lettre. */
    motDePasseRedemande?: boolean;
  } = {},
): Promise<T> {
  // `langueDeLEcran` ne rejette jamais : au pire, la langue par défaut.
  const langue = reglages.langue ?? (await langueDeLEcran());
  try {
    const jeton = await Coffre.lire(CLE_JETON);
    if (!jeton) throw new Panne("session", 401);

    const base = await adressePlateforme();
    const e = await echanger(`${base}${avecLangue(chemin, langue)}`, {
      ...options,
      headers: {
        ...options.headers,
        authorization: `Bearer ${jeton}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
    }, {
      renoncer: reglages.renoncer,
      corpsInutile: (s) => s === 401 && !reglages.motDePasseRedemande,
    });

    // LES DEUX 401 SE SÉPARENT PAR LE CONTRAT, pas par la présence d'une
    // phrase. Le verrou de la plateforme répond lui aussi 401 AVEC une
    // phrase quand le jeton ne vaut plus rien (compte supprimé ailleurs,
    // fermé par TOTEM, périmé) — mais il ajoute `raison: "session"`. Celui-là
    // ferme la session, plus bas ; seul l'autre veut dire « mot de passe
    // refusé ». Avant, un compte déjà supprimé lisait « sign-in required »
    // sous le champ, recommençait sans fin, et le coffre gardait le jeton.
    if (e.statut === 401 && reglages.motDePasseRedemande) {
      const corps = objetJson(e.texte);
      const raison = raisonDonnee(corps);
      if (raison && corps?.raison !== "session") throw new ErreurGuichet(raison, 401, "refus");
    }

    // Session périmée ou révoquée : on efface le coffre pour que l'écran
    // suivant présente la connexion au lieu de boucler sur des refus.
    //
    // MAIS SEULEMENT LA SESSION QUI A ÉTÉ REFUSÉE. Une demande partie avant
    // une déconnexion peut revenir refusée APRÈS qu'une autre personne s'est
    // connectée sur le même téléphone — le vendeur à qui l'on passe
    // l'appareil. Fermer alors le coffre le déconnectait, lui, pour un refus
    // qui ne le concernait pas.
    if (e.statut === 401) {
      const actuel = await Coffre.lire(CLE_JETON).catch(() => null);
      if (actuel && actuel !== jeton) throw new Panne("abandon");
      if (actuel) await fermerSession();
      throw new Panne("session", 401);
    }
    return lireReponse(e) as T;
  } catch (e) {
    throw versErreurGuichet(e, langue);
  }
}

/** La forme MINIMALE d'une lecture de la plateforme : sans ses deux listes,
 *  ce n'est pas une caisse, c'est une réponse abîmée. La prendre quand même
 *  affichait « Aucune carte » — et le cahier du téléphone la gardait pour
 *  le lendemain matin. Le cahier s'en sert aussi, avant de relire une page. */
export function donneesValables(d: unknown): d is Donnees {
  const x = d as { sims?: unknown; paiements?: unknown } | null;
  return Boolean(x) && typeof x === "object"
    && Array.isArray(x!.sims) && Array.isArray(x!.paiements);
}

/** Les caisses, les SMS, le terminal — la même lecture que les pages web. */
export async function chargerDonnees(
  langue: Langue,
  // `lignes` : COMPTER LOIN, RAPPORTER PEU. L'écran des cartes veut des
  // compteurs calculés sur mille SMS, pas les mille SMS. Sans cette borne il
  // téléchargeait 264 Ko de textes qu'il ne regarde jamais — sur le réseau
  // mobile de Douala, des secondes d'attente pour rien.
  //
  // Un NOMBRE et non un drapeau : les onglets partagent une seule demande, et
  // « le plus grand besoin » de zéro ligne et de trente lignes n'est ni l'un
  // ni l'autre. Absent, il vaut « autant que `sms` ».
  //
  // `depuis` : les SMS relevés à partir de cet instant (ISO) — le filtre par
  // date de l'écran des SMS. Le découpage se fait dans la BASE : filtrer
  // les deux cents derniers SMS sur le téléphone aurait rendu « ce mois »
  // vide au-delà de quelques jours, sans le dire.
  bornes?: { sms?: number; recus?: number; lignes?: number; depuis?: string },
  // `renoncer` : le cahier abandonne ce qui est en route quand la session
  // se ferme — la réponse d'avant ne doit rien écrire pour la suivante.
  renoncer?: AbortSignal,
): Promise<Donnees> {
  const q = new URLSearchParams({ langue });
  if (bornes?.sms != null) q.set("sms", String(bornes.sms));
  if (bornes?.recus != null) q.set("recus", String(bornes.recus));
  if (bornes?.lignes != null) q.set("lignes", String(bornes.lignes));
  if (bornes?.depuis) q.set("depuis", bornes.depuis);
  const d = await demander<unknown>(`/api/donnees?${q}`, {}, { langue, renoncer });
  if (!donneesValables(d)) throw versErreurGuichet(new Panne("incomplete"), langue);
  return d;
}

/** Dépose une demande pour le terminal de Douala (solde, USSD, reçu…). */
export function deposerCommande(
  genre: string,
  parametres: Record<string, unknown>,
  terminal?: string | null,
  // LA CLÉ D'INTENTION — un geste, une clé. Un code USSD complet porte le
  // bénéficiaire ET le montant : le composer deux fois, c'est transférer deux
  // fois. Deux envois de la même clé sont le même geste, et la plateforme ne
  // crée alors qu'UNE demande. Facultative : sans elle, rien ne change.
  cle?: string,
): Promise<{ id: number }> {
  return demander<{ id: number }>("/api/commande", {
    method: "POST",
    body: JSON.stringify({ type: genre, parametres, terminal, cle }),
  });
}

/** L'état d'une demande déposée : le terminal a-t-il répondu ? */
export function lireCommande(
  id: number, renoncer?: AbortSignal,
): Promise<{ etat: string; resultat: string | null }> {
  return demander(`/api/commande/${id}`, {}, { renoncer });
}

/** RETIRE une demande que l'écran abandonne — si le boîtier ne l'a pas
 *  encore prise. `annulee: false` veut dire qu'il l'a en main (ou l'a
 *  finie) : l'écran ne doit SURTOUT PAS dire « rien n'est parti ».
 *
 *  Une réponse qui ne dit pas clairement oui ou non n'est pas un non : c'est
 *  une panne, et l'écran dit alors qu'il ne sait pas. */
export async function annulerCommande(
  id: number,
): Promise<{ annulee: boolean; etat?: string }> {
  const r = await demander<{ annulee?: unknown; etat?: unknown }>(
    `/api/commande/${id}/annuler`, { method: "POST" });
  if (typeof r.annulee !== "boolean") {
    throw versErreurGuichet(new Panne("incomplete"), await langueDeLEcran());
  }
  return { annulee: r.annulee, etat: typeof r.etat === "string" ? r.etat : undefined };
}

/** Classe un SMS : le propriétaire décide sa nature, pour l'affichage et le
 *  reçu. `null` le remet à « non classé ».
 *
 *  L'identifiant est celui de la LIGNE en base (`p.id`), pas `sourceId` :
 *  c'est une métadonnée d'affichage, posée sur la ligne, et le robot ne
 *  réécrit jamais une ligne déjà transmise. */
export function definirNature(id: number, nature: string | null): Promise<{ ok: true }> {
  return demander("/api/nature", {
    method: "POST", body: JSON.stringify({ id, nature }),
  });
}

/** Le propriétaire vient d'ouvrir la fiche d'un SMS : il est lu. */
export function marquerLu(id: number): Promise<{ ok: true }> {
  return demander("/api/lu", { method: "POST", body: JSON.stringify({ id }) });
}

/** Inscrit ce téléphone pour les notifications.
 *
 *  Le jeton d'Expo n'est pas un secret : il ne dit rien du propriétaire et
 *  n'ouvre l'accès à rien — il autorise seulement à faire sonner CET
 *  appareil. Il part quand même par la porte verrouillée, pour que seul un
 *  téléphone connecté puisse s'inscrire. */
export function enregistrerAppareil(
  jeton: string, plateforme: string, nom: string,
): Promise<{ ok: true }> {
  return demander("/api/appareil", {
    method: "POST",
    body: JSON.stringify({ jeton, plateforme, nom }),
  });
}

/** Un lien de reçu SIGNÉ, que le navigateur du téléphone peut ouvrir.
 *
 *  Le navigateur du système n'a ni cookie ni jeton : le PDF lui était
 *  interdit. L'application, elle, est authentifiée — elle demande ce
 *  laissez-passer de dix minutes, pour CE reçu, et l'ouvre aussitôt. */
export function lienRecu(numero: string): Promise<{ url: string }> {
  return demander(`/api/recu/${encodeURIComponent(numero)}/lien`);
}

/** « Est-ce que mon téléphone sonne ? »
 *
 *  Fait envoyer une notification d'essai aux appareils inscrits. Rend
 *  combien ont été servis, et combien ont été retirés parce que le service
 *  de notification les déclare éteints. */
export function essaiNotification(langue: Langue): Promise<ReponseEssai> {
  return demander(`/api/essai-notification?langue=${langue}`, { method: "POST" }, { langue });
}

/** Un compte de la plateforme, tel que la liste du propriétaire le montre :
 *  avec les cartes qu'il voit — ou `null` pour le propriétaire, qui voit
 *  tout. */
export type CompteInscrit = {
  id: number; courriel: string; prenom?: string; nom?: string;
  role: string; approuve: boolean;
  creeLe: string | null; vuLe: string | null; cartes: string[] | null;
  /** Compte de l'inscription publique : une puce ne lui est attribuée
   *  qu'avec le CODE DE COMPTE joint à la puce (la plateforme refuse sans). */
  codeExige?: boolean;
};

/** Une carte de la maison, qu'on peut confier à quelqu'un. */
export type CarteAConfier = {
  iccid: string; libelle: string; operateur: string; numero: string;
  nom: string; enPlace: boolean;
};

/** La liste des comptes et des cartes — réservée au propriétaire : 403 pour
 *  les autres, et l'écran se tait alors de lui-même, comme sur le web. */
export function listerComptes(): Promise<{ comptes: CompteInscrit[]; cartes?: CarteAConfier[] }> {
  return demander("/api/comptes");
}

/** Un geste du propriétaire sur un compte : laisser entrer, bloquer,
 *  supprimer, en créer un pour quelqu'un — et attribuer ou reprendre une
 *  carte. C'est ainsi qu'une puce reçue par TOTEM arrive dans le compte de
 *  la personne qui l'a envoyée. */
export function agirSurCompte(
  corps:
    | { id: number; geste: "approuver" | "fermer" | "supprimer" }
    | { geste: "creer"; prenom: string; nom: string; courriel: string; motdepasse: string }
    | { id: number; iccid: string; geste: "attribuer" | "retirer"; code?: string },
): Promise<unknown> {
  return demander("/api/comptes", { method: "POST", body: JSON.stringify(corps) });
}

/** Un lien signé vers la fiche PDF des coordonnées d'une carte — même
 *  mécanique que le lien de reçu : dix minutes, cette carte, ce genre-là. */
export function lienCoordonnees(iccid: string): Promise<{ url: string }> {
  return demander(`/api/coordonnees/${encodeURIComponent(iccid)}/lien`);
}

/** Un lien signé vers le bilan CSV (7, 30 ou 90 jours) — le navigateur du
 *  système sait télécharger un fichier, l'application ne sait que
 *  l'afficher. La signature couvre le nombre de jours. */
export function lienBilan(jours: number): Promise<{ url: string }> {
  return demander(`/api/bilan/lien?jours=${jours}`);
}

/** Le carnet des bénéficiaires d'une carte : enregistrer (ou renommer celui
 *  que la carte connaît déjà sous ce numéro), renommer, retirer. La lecture
 *  voyage avec les données, dans le cahier. */
export function agirSurBeneficiaire(
  corps:
    | { geste: "enregistrer"; carte: string; numero: string; nom: string }
    | { geste: "renommer"; id: number; nom: string }
    | { geste: "supprimer"; id: number },
): Promise<unknown> {
  return demander("/api/beneficiaires", { method: "POST", body: JSON.stringify(corps) });
}
