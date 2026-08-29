// Le guichet : tout ce que l'application demande au monde extérieur passe ici.
//
// UNE seule adresse, UN seul jeton. L'application ne connaît pas Supabase et
// n'a aucune clé : elle parle à la plateforme (Vercel), qui parle à la base.
// Cette ignorance est volontaire — une application installée se démonte, un
// serveur non. Voir `docs/MOBILE.md`.

import * as Coffre from "./coffre";
import type { Donnees } from "@noyau/types";
import type { Langue } from "@noyau/langue";

// L'adresse de la plateforme. Elle vient de la configuration d'Expo pour
// qu'une compilation d'essai puisse viser un déploiement de préversion sans
// toucher au code.
import Constants from "expo-constants";

// `EXPO_PUBLIC_ADRESSE` prime quand elle est posée : c'est ce qui permet de
// compiler une version d'essai visant une préversion, ou un serveur local,
// sans toucher au code ni à `app.json`. Rien de secret ne passe par là —
// une adresse n'est pas un secret, et tout ce qui porte `EXPO_PUBLIC_` entre
// dans le paquet, donc devient public.
const ADRESSE: string =
  process.env.EXPO_PUBLIC_ADRESSE ||
  (Constants.expoConfig?.extra?.adressePlateforme as string) ||
  "https://totem.vercel.app";

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

/** Ouvre une session. Le mot de passe ne survit pas à cet appel. */
export async function ouvrirSession(motdepasse: string, langue: Langue): Promise<void> {
  const r = await fetch(`${ADRESSE}/api/session?langue=${langue}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motdepasse }),
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

  const r = await fetch(`${ADRESSE}${chemin}`, {
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

/** Le pouls : le dernier SMS connu, et le nombre de non-lus. */
export function actualite(): Promise<{ dernier: number; nonLus: number }> {
  return demander("/api/actualite");
}
