// QUEL MONDE : la maison réelle, ou la démo vivante (docs/DEMO-VIVANTE.md).
//
// Un compte de démo ouvre une session « d:<numéro> » ; un vrai compte,
// « c:<numéro> ». Ce module dit, pour la requête en cours, dans quel monde
// on se trouve — et `cheminDansLeMonde` récrit chaque chemin vers la base :
// dans la démo, « paiements » devient « demo_paiements ».
//
// POURQUOI ICI, ET UNE SEULE FOIS. Les écrans lisent « cartes », « paiements »,
// « commandes » sans savoir qu'un monde de démo existe. C'est voulu : un
// filtre posé écran par écran finirait oublié dans l'un d'eux, et ce jour-là
// le bilan de la maison porterait de faux millions — ou un testeur lirait
// les SMS du propriétaire. Ici, il n'y a pas de filtre : il y a deux jeux de
// tables, et le monde choisit lequel.
//
// LE MONDE SE DÉDUIT DU JETON, VÉRIFIÉ. Jamais d'un en-tête, d'un paramètre,
// d'un cookie à part : seule la signature de la session dit qui parle. Le
// jeton lu ici est celui que lisent `porteeDe`, `compteConnecte`, `garder` —
// le même cookie d'abord, le même en-tête ensuite — si bien que le compte
// qu'ils relisent et la table où ils le relisent viennent du MÊME jeton.
//
// FERMÉ PAR DÉFAUT. Dans la démo, une table qui n'a pas de double est
// REFUSÉE, pas lue dans la maison : une table ajoutée demain sans son double
// ne fuit pas, elle rend une erreur. Et la maison ne touche jamais une table
// « demo_… » : le seul passage est `dansLaDemoVivante`, que n'emprunte que ce
// qui crée la démo (l'administrateur, la connexion).

import { AsyncLocalStorage } from "node:async_hooks";
import { cookies, headers } from "next/headers";
import { COOKIE_SESSION, compteDuSujet, estSujetDeDemo, sujetDeSession } from "@/lib/session";

export type Monde = "maison" | "demo";

/** La démo vivante est-elle ouverte ? « DEMO_VIVANTE=non » la ferme : plus
 *  personne n'y entre, et le middleware fait tomber ses jetons. */
export function demoVivanteOuverte(): boolean {
  return (process.env.DEMO_VIVANTE || "").trim().toLowerCase() !== "non";
}

// Le monde IMPOSÉ à un appel — par la connexion (qui cherche le compte dans
// les deux mondes) et par l'administration de la démo. Il passe avant le
// jeton, et ne vit que le temps de l'appel.
const mondeImpose = new AsyncLocalStorage<Monde>();

/** Joue `faire` dans la démo vivante, quelle que soit la session. */
export function dansLaDemoVivante<T>(faire: () => Promise<T>): Promise<T> {
  return mondeImpose.run("demo", faire);
}

/** Joue `faire` dans la maison, quelle que soit la session. */
export function dansLaMaison<T>(faire: () => Promise<T>): Promise<T> {
  return mondeImpose.run("maison", faire);
}

// Une requête pose plusieurs questions à la base ; la signature ne se
// revérifie pas à chacune. La clé est l'objet des en-têtes de LA requête :
// une autre requête a les siens, et rien ne se mélange.
const memoire = new WeakMap<object, Promise<Monde>>();

async function mondeDuJeton(): Promise<Monde> {
  let entetes: Awaited<ReturnType<typeof headers>>;
  let boite: Awaited<ReturnType<typeof cookies>>;
  try {
    entetes = await headers();
    boite = await cookies();
  } catch {
    // Hors d'une requête (un essai, une tâche de fond) : personne ne parle,
    // c'est la maison — et une maison sans session n'a rien à lire.
    return "maison";
  }
  const deja = memoire.get(entetes);
  if (deja) return deja;
  const calcul = (async (): Promise<Monde> => {
    const secret = process.env.SESSION_SECRET || "";
    if (!secret) return "maison";
    const porte = entetes.get("authorization");
    const [schema, valeur] = porte?.split(" ") ?? [];
    const jeton = boite.get(COOKIE_SESSION)?.value ??
      (schema?.toLowerCase() === "bearer" && valeur ? valeur : undefined);
    return estSujetDeDemo(await sujetDeSession(secret, jeton)) ? "demo" : "maison";
  })();
  memoire.set(entetes, calcul);
  return calcul;
}

/** Le monde de l'appel en cours. */
export async function mondeEnCours(): Promise<Monde> {
  return mondeImpose.getStore() ?? mondeDuJeton();
}

/**
 * Le numéro de compte que ce sujet désigne DANS LE MONDE DE L'APPEL — ou
 * `null` s'il n'en désigne pas, ou s'il appartient à l'autre monde.
 *
 * « d:12 » et « c:12 » portent le même numéro : relu dans la mauvaise table,
 * le testeur numéro 12 deviendrait le vrai compte numéro 12. Le monde se
 * déduit du même jeton, si bien que les deux concordent toujours — SAUF dans
 * un appel au monde imposé (`dansLaMaison`, `dansLaDemoVivante`). Qui lit un
 * sujet passe donc par ici, et un sujet de l'autre monde ne désigne personne.
 */
export async function compteDuSujetIci(sujet: string | null): Promise<number | null> {
  const id = compteDuSujet(sujet);
  if (id === null) return null;
  return estSujetDeDemo(sujet) === ((await mondeEnCours()) === "demo") ? id : null;
}

// Les tables qui ont leur double, de la même forme
// (migrations/20261019_demo_vivante.sql).
const DOUBLES: Record<string, string> = {
  utilisateurs: "demo_utilisateurs",
  attributions: "demo_attributions",
  appareils: "demo_appareils",
  comptes: "demo_comptes",
  paiements: "demo_paiements",
  recus: "demo_recus",
  commandes: "demo_commandes",
  raccourcis: "demo_raccourcis",
  beneficiaires: "demo_beneficiaires",
  // Deux vues : une carte de démo n'est jamais « retirée », son boîtier
  // jamais muet — c'est la base qui répond, et elle ne se tait pas.
  cartes: "demo_cartes",
  terminaux: "demo_terminaux",
};

// Ce que les deux mondes partagent : le frein des mots de passe. Un seau
// commun ne montre rien de personne, et une rafale ne gagne rien à changer
// de monde.
const COMMUNES = new Set([
  "freins", "rpc/compter_un_essai", "rpc/frein_essai", "rpc/frein_rendre",
]);

// Ce que seule la démo touche : le faux réseau, la trace des francs
// fabriqués, les floats de test de Glisil et leur file.
const RPC_DE_DEMO = new Set([
  "rpc/demo_jouer", "rpc/demo_fabriquer", "rpc/demo_virer",
  "demo_emissions", "demo_floats_xafe", "demo_file_xafe",
]);

/** La table (ou « rpc/nom ») qu'un chemin PostgREST désigne. */
function tableDuChemin(chemin: string): string {
  const fin = chemin.search(/[?]/);
  return fin === -1 ? chemin : chemin.slice(0, fin);
}

/**
 * Le chemin à interroger dans ce monde — ou `null` : refusé.
 *
 * Dans la maison, tout passe sauf ce qui appartient à la démo. Dans la démo,
 * seuls les doubles, le frein et le faux réseau passent.
 */
export function cheminSelon(monde: Monde, chemin: string): string | null {
  const table = tableDuChemin(chemin);
  const reste = chemin.slice(table.length);
  const deDemo = table.startsWith("demo_") || table.startsWith("rpc/demo_");
  if (monde === "maison") return deDemo ? null : chemin;
  if (DOUBLES[table]) return DOUBLES[table] + reste;
  if (COMMUNES.has(table) || RPC_DE_DEMO.has(table)) return chemin;
  return null;
}

/** Le chemin à interroger pour l'appel en cours — ou `null` : refusé. */
export async function cheminDansLeMonde(chemin: string): Promise<string | null> {
  return cheminSelon(await mondeEnCours(), chemin);
}
