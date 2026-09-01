// La garde de la console — qui a le droit d'administrer la plateforme.
//
// LA RÈGLE, ET ELLE TIENT EN UNE PHRASE : aujourd'hui, l'administrateur de
// TOTEM est le PROPRIÉTAIRE. La plateforme suit l'argent d'une seule maison ;
// celui qui l'a installée est celui qui surveille ses boîtiers. Le jour où la
// flotte servira plusieurs commerces, ce fichier est l'endroit — le seul — où
// la règle changera.
//
// La clé de SECOURS administre aussi : elle ne vit que dans les variables
// d'environnement de Vercel, et y avoir accès, c'est déjà tenir la maison.
// C'est la même décision que « lib/qui.ts », prise pour la même raison.
//
// DEUX FORMES, PARCE QUE DEUX APPELANTS :
//   — une PAGE appelle « exigerPouvoir » : refusée, elle renvoie vers
//     l'accueil, pas vers l'écran de connexion — celui qui est déjà entré et
//     n'a pas ce pouvoir ne doit pas croire que sa session a expiré ;
//   — une ROUTE appelle « garder » : refusée, elle répond 403 dans la langue
//     de la personne, et c'est le navigateur qui l'affiche.
//
// La garde se place AVANT toute lecture. Une lecture faite d'abord a déjà
// fui : le refus qui suit ne la rattrape pas.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_SESSION, compteDuSujet, sujetDeSession } from "@/lib/session";
import { utilisateurParId } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

/** Le seul pouvoir que la console demande. La liste s'allongera le jour où
 *  un rôle qui n'administre pas devra tout de même y entrer — pas avant. */
export type Pouvoir = "administrer";

export type QuiAdministre = {
  /** Le numéro du compte, ou `null` pour la clé de secours. */
  personne: number | null;
  /** Ce que l'écran peut afficher : le courriel, ou rien pour le secours. */
  nom: string;
};

/**
 * Qui administre — ou `null`.
 *
 * On refait la vérification de signature (jamais confiance à un sujet non
 * vérifié), puis on RELIT le rôle en base : un jeton vit un mois, un rôle
 * peut changer ce matin.
 */
export async function quiAdministre(req?: Request): Promise<QuiAdministre | null> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return null;
  const boite = await cookies();
  const porte = req?.headers.get("authorization");
  const [schema, valeur] = porte?.split(" ") ?? [];
  const jeton = boite.get(COOKIE_SESSION)?.value ??
    (schema?.toLowerCase() === "bearer" && valeur ? valeur : undefined);
  const sujet = await sujetDeSession(secret, jeton);
  if (sujet === "secours") return { personne: null, nom: "" };
  const id = compteDuSujet(sujet);
  if (id === null) return null;
  const compte = await utilisateurParId(id);
  if (!compte || !compte.approuve || compte.role !== "proprietaire") return null;
  return { personne: compte.id, nom: compte.courriel };
}

/**
 * La garde d'une PAGE de console. Rend qui est là, ou redirige.
 *
 * Vers l'accueil, PAS vers la connexion : celui qui arrive ici est déjà
 * entré — le renvoyer à la porte lui ferait croire à une session expirée, et
 * retaper son mot de passe n'y changerait rien. (Celui qui n'est pas entré
 * du tout n'atteint jamais cette fonction : le verrou du middleware l'a déjà
 * renvoyé vers l'écran de connexion.)
 */
export async function exigerPouvoir(_pouvoir: Pouvoir): Promise<QuiAdministre> {
  const qui = await quiAdministre();
  if (!qui) redirect("/");
  return qui;
}

export type Garde = QuiAdministre | { refus: Response };

export function estRefus(g: Garde): g is { refus: Response } {
  return "refus" in g;
}

/** La garde d'une ROUTE de console : un 403 localisé au lieu d'un renvoi. */
export async function garder(_pouvoir: Pouvoir, req?: Request): Promise<Garde> {
  const qui = await quiAdministre(req);
  if (qui) return qui;
  const langue = await langueServeur();
  return {
    refus: Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 }),
  };
}
