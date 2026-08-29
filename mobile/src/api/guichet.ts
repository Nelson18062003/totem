// Le guichet : tout ce que l'application demande au monde extérieur passe ici.
//
// UNE seule adresse, UN seul jeton. L'application ne connaît pas Supabase et
// n'a aucune clé : elle parle à la plateforme (Vercel), qui parle à la base.
// Cette ignorance est volontaire — une application installée se démonte, un
// serveur non. Voir `docs/MOBILE.md`.

import * as Coffre from "expo-secure-store";
import type { Donnees } from "@noyau/types";
import type { Langue } from "@noyau/langue";

// L'adresse de la plateforme. Elle vient de la configuration d'Expo pour
// qu'une compilation d'essai puisse viser un déploiement de préversion sans
// toucher au code.
import Constants from "expo-constants";

const ADRESSE: string =
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
    Coffre.getItemAsync(CLE_JETON),
    Coffre.getItemAsync(CLE_ECHEANCE),
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
  await Coffre.setItemAsync(CLE_JETON, corps.jeton);
  await Coffre.setItemAsync(CLE_ECHEANCE, String(corps.expire));
}

export async function fermerSession(): Promise<void> {
  await Coffre.deleteItemAsync(CLE_JETON);
  await Coffre.deleteItemAsync(CLE_ECHEANCE);
}

/** Une demande signée par le jeton du coffre. */
async function demander<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const jeton = await Coffre.getItemAsync(CLE_JETON);
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

/** Le pouls : le dernier SMS connu, et le nombre de non-lus. */
export function actualite(): Promise<{ dernier: number; nonLus: number }> {
  return demander("/api/actualite");
}
