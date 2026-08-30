// Le guichet : tout ce que l'application demande au monde extérieur passe ici.
//
// UNE seule adresse, UN seul jeton. L'application ne connaît pas Supabase et
// n'a aucune clé : elle parle à la plateforme (Vercel), qui parle à la base.
// Cette ignorance est volontaire — une application installée se démonte, un
// serveur non. Voir `docs/MOBILE.md`.

import * as Coffre from "./coffre";
// L'adresse n'est pas un secret : elle a son rangement à elle. Voir
// `reglage.ts` — le coffre refuse d'écrire hors du téléphone, ce qui
// est juste pour un jeton et absurde pour une adresse.
import * as Reglage from "./reglage";
import type { Donnees } from "@noyau/types";
import type { Langue } from "@noyau/langue";

// L'adresse de la plateforme. Elle vient de la configuration d'Expo pour
// qu'une compilation d'essai puisse viser un déploiement de préversion sans
// toucher au code.
import Constants from "expo-constants";

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
// L'ordre : ce que le propriétaire a réglé, sinon `EXPO_PUBLIC_ADRESSE`
// (pratique pour viser une préversion ou un serveur local sans toucher au
// code), sinon `app.json`. Rien de secret ne passe par là : une adresse
// n'est pas un secret, et tout ce qui porte `EXPO_PUBLIC_` entre dans le
// paquet, donc devient public.
const CLE_ADRESSE = "totem.adresse";

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

/** L'adresse en service : celle du propriétaire, sinon celle livrée. */
export async function adressePlateforme(): Promise<string> {
  if (adresseEnMemoire !== null) return adresseEnMemoire;
  const rangee = await Reglage.lire(CLE_ADRESSE);
  adresseEnMemoire = rangee && adresseValable(rangee)
    ? normaliserAdresse(rangee) : ADRESSE_LIVREE;
  return adresseEnMemoire;
}

/** Le propriétaire corrige l'adresse. Rend `false` si elle ne tient pas
 *  debout — mieux vaut refuser que de ranger une adresse qui ne marchera
 *  jamais. */
export async function definirAdresse(brute: string): Promise<boolean> {
  if (!adresseValable(brute)) return false;
  const a = normaliserAdresse(brute);
  await Reglage.ecrire(CLE_ADRESSE, a);
  adresseEnMemoire = a;
  return true;
}

/** Ce qu'on a trouvé au bout de l'adresse. */
export type EtatPlateforme =
  | "trouvee"           // un TOTEM, prêt à recevoir une connexion
  | "non-configuree"    // un TOTEM, mais sans mot de passe posé côté serveur
  | "absente"           // quelque chose répond, mais ce n'est pas un TOTEM
  | "injoignable";      // rien ne répond : réseau coupé, ou adresse morte

/** Peut-on encore créer un compte sur cette plateforme ?
 *
 *  Non dès qu'il y en a un : l'inscription ne sert qu'à poser le tout premier
 *  compte, celui du propriétaire. L'écran s'en sert pour ne pas proposer un
 *  bouton qui ne mènerait qu'à un refus. */
let inscriptionOuverte = false;
export const peutSInscrire = (): boolean => inscriptionOuverte;

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
    const r = await fetch(`${base}/api/plateforme`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!r.ok) return "absente";
    const corps = await r.json().catch(() => null);
    // Le drapeau doit être là. Un serveur quelconque qui rendrait 200 sur
    // n'importe quel chemin ne passe pas cette porte.
    if (corps?.totem !== true) return "absente";
    inscriptionOuverte = corps.inscription === true;
    return corps.configuree === true ? "trouvee" : "non-configuree";
  } catch {
    return "injoignable";
  }
}

// Le jeton vit dans le coffre du système — celui qu'ouvre le doigt ou le
// visage — et jamais dans un fichier ordinaire.
const CLE_JETON = "totem.jeton";
const CLE_ECHEANCE = "totem.jeton.echeance";

export class ErreurGuichet extends Error {
  constructor(message: string, readonly statut: number) {
    super(message);
  }
}

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
  const base = await adressePlateforme();
  const r = await fetch(`${base}/api/session?langue=${langue}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      courriel ? { courriel, motdepasse } : { motdepasse }),
  });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ErreurGuichet(corps?.erreur ?? "connexion refusée", r.status);
  }
  await Coffre.ecrire(CLE_JETON, corps.jeton);
  await Coffre.ecrire(CLE_ECHEANCE, String(corps.expire));
}

/** Ce qu'une inscription peut donner. */
export type Inscription =
  | { entre: true }        // le propriétaire : il entre tout de suite
  | { entre: false };      // un invité : le compte attend une approbation

/**
 * Crée un compte.
 *
 * Le PREMIER compte de la plateforme est celui du propriétaire : il entre
 * immédiatement, et la session est rangée ici même. Tous les suivants sont
 * créés mais n'ouvrent rien tant que le propriétaire ne les a pas approuvés
 * — d'où `entre: false`, qui n'est pas une erreur.
 */
export async function creerCompte(
  courriel: string, motdepasse: string, langue: Langue,
): Promise<Inscription> {
  const base = await adressePlateforme();
  const r = await fetch(`${base}/api/inscription?langue=${langue}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel, motdepasse }),
  });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 202) {
    throw new ErreurGuichet(corps?.erreur ?? "inscription refusée", r.status);
  }
  if (corps?.proprietaire && corps?.jeton) {
    await Coffre.ecrire(CLE_JETON, corps.jeton);
    await Coffre.ecrire(CLE_ECHEANCE, String(corps.expire));
    return { entre: true };
  }
  return { entre: false };
}

export async function fermerSession(): Promise<void> {
  await Coffre.effacer(CLE_JETON);
  await Coffre.effacer(CLE_ECHEANCE);
}

/** Une demande signée par le jeton du coffre. */
async function demander<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const jeton = await Coffre.lire(CLE_JETON);
  if (!jeton) throw new ErreurGuichet("session absente", 401);

  const base = await adressePlateforme();
  const r = await fetch(`${base}${chemin}`, {
    ...options,
    headers: {
      ...options.headers,
      authorization: `Bearer ${jeton}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  });

  // Session périmée ou révoquée : on efface le coffre pour que l'écran
  // suivant présente la connexion au lieu de boucler sur des refus.
  if (r.status === 401) {
    await fermerSession();
    throw new ErreurGuichet("session expirée", 401);
  }
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ErreurGuichet(corps?.erreur ?? `erreur ${r.status}`, r.status);
  }
  return corps as T;
}

/** Les caisses, les SMS, le terminal — la même lecture que les pages web. */
export function chargerDonnees(
  langue: Langue,
  bornes?: { sms?: number; recus?: number },
): Promise<Donnees> {
  const q = new URLSearchParams({ langue });
  if (bornes?.sms != null) q.set("sms", String(bornes.sms));
  if (bornes?.recus != null) q.set("recus", String(bornes.recus));
  return demander<Donnees>(`/api/donnees?${q}`);
}

/** Dépose une demande pour le terminal de Douala (solde, USSD, reçu…). */
export function deposerCommande(
  genre: string,
  parametres: Record<string, unknown>,
  terminal?: string | null,
): Promise<{ id: number }> {
  return demander<{ id: number }>("/api/commande", {
    method: "POST",
    body: JSON.stringify({ type: genre, parametres, terminal }),
  });
}

/** L'état d'une demande déposée : le terminal a-t-il répondu ? */
export function lireCommande(id: number): Promise<{ etat: string; resultat: string | null }> {
  return demander(`/api/commande/${id}`);
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
export function essaiNotification(langue: Langue): Promise<{
  servis: number; oublies: number; aucun?: boolean; soucis?: string[];
}> {
  return demander(`/api/essai-notification?langue=${langue}`, { method: "POST" });
}
