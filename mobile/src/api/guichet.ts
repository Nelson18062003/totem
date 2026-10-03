// Le guichet : tout ce que l'application demande au monde extérieur passe ici.
//
// UNE seule adresse, UN seul jeton. L'application ne connaît pas Supabase et
// n'a aucune clé : elle parle à la plateforme (Vercel), qui parle à la base.
// Cette ignorance est volontaire — une application installée se démonte, un
// serveur non. Voir `docs/MOBILE.md`.

import * as Coffre from "./coffre";
import type { Donnees } from "@noyau/types";
import type { Langue } from "@noyau/langue";
import type { ReponseEssai } from "@noyau/essai";

// L'adresse de la plateforme. Elle vient de la configuration d'Expo pour
// qu'une compilation d'essai puisse viser un déploiement de préversion sans
// toucher au code.
import Constants from "expo-constants";

// UN DÉLAI MAXIMAL SUR CHAQUE REQUÊTE — sinon l'application se fige en
// silence. À Douala, une connexion à demi ouverte (le TCP tient, plus rien ne
// revient) laisse `fetch` en suspens POUR TOUJOURS : ni succès, ni échec. Le
// bouton reste sur « Vérification… », le tourniquet tourne sans fin, et le
// message honnête « réseau en panne » ne s'affiche jamais — car il vit dans
// le `catch` d'une promesse qui ne rejette pas. React Native ne met aucun
// délai par défaut ; on en pose un.
//
// Quinze secondes : large pour un réseau lent, assez court pour qu'une
// coupure se dise plutôt que de se taire. Au-delà, `fetch` rejette comme une
// panne réseau ordinaire, et tout le code d'erreur existant s'applique.
const DELAI_MS = 15000;

async function avecDelai(
  url: string, options: RequestInit = {},
): Promise<Response> {
  const minuteur = new AbortController();
  const stop = setTimeout(() => minuteur.abort(), DELAI_MS);
  try {
    return await fetch(url, { ...options, signal: minuteur.signal });
  } finally {
    clearTimeout(stop);
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
    const r = await avecDelai(`${base}/api/plateforme`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!r.ok) return "absente";
    const corps = await r.json().catch(() => null);
    // Le drapeau doit être là. Un serveur quelconque qui rendrait 200 sur
    // n'importe quel chemin ne passe pas cette porte.
    if (corps?.totem !== true) return "absente";
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
  const r = await avecDelai(`${base}/api/session?langue=${langue}`, {
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

export async function fermerSession(): Promise<void> {
  await Coffre.effacer(CLE_JETON);
  await Coffre.effacer(CLE_ECHEANCE);
}

/** Une demande signée par le jeton du coffre. */
async function demander<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const jeton = await Coffre.lire(CLE_JETON);
  if (!jeton) throw new ErreurGuichet("session absente", 401);

  const base = await adressePlateforme();
  const r = await avecDelai(`${base}${chemin}`, {
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
): Promise<Donnees> {
  const q = new URLSearchParams({ langue });
  if (bornes?.sms != null) q.set("sms", String(bornes.sms));
  if (bornes?.recus != null) q.set("recus", String(bornes.recus));
  if (bornes?.lignes != null) q.set("lignes", String(bornes.lignes));
  if (bornes?.depuis) q.set("depuis", bornes.depuis);
  return demander<Donnees>(`/api/donnees?${q}`);
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
export function essaiNotification(langue: Langue): Promise<ReponseEssai> {
  return demander(`/api/essai-notification?langue=${langue}`, { method: "POST" });
}

/** Un compte de la plateforme, tel que la liste du propriétaire le montre :
 *  avec les cartes qu'il voit — ou `null` pour le propriétaire, qui voit
 *  tout. */
export type CompteInscrit = {
  id: number; courriel: string; prenom?: string; nom?: string;
  role: string; approuve: boolean;
  creeLe: string | null; vuLe: string | null; cartes: string[] | null;
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
 *  supprimer, en créer un (l'inscription libre est fermée) — et confier ou
 *  reprendre une carte. */
export function agirSurCompte(
  corps:
    | { id: number; geste: "approuver" | "fermer" | "supprimer" }
    | { geste: "creer"; prenom: string; nom: string; courriel: string; motdepasse: string }
    | { id: number; iccid: string; geste: "attribuer" | "retirer" },
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
