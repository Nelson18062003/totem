// La garde. Le seul endroit qui ouvre la porte.
//
// POURQUOI ELLE EXISTE, ALORS QU'IL Y A DÉJÀ UN MIDDLEWARE
// Le middleware tourne en « edge » et ne fait aucun appel réseau : il sait
// dire qu'un jeton est authentique, il ne sait pas dire que la session vit
// encore. Or c'est exactement la question qui compte le jour où une
// propriétaire reprend la clé de son opérateur : le jeton de celui-ci reste
// parfaitement signé. `C9` promet « son téléphone se ferme dans la seconde,
// pas à sa prochaine entrée » — tenir cette phrase demande d'interroger la
// base sur le chemin de la requête. C'est ce que fait ce fichier.
//
// Le middleware reste le portail : fermé par défaut, il refoule ce qui est
// manifestement faux. La garde est la serrure.
//
// LE RISQUE CONNU DE CE DÉCOUPAGE
// Une garde qu'il faut penser à appeler est une garde qu'on oubliera. Le
// dépôt ne compte pas là-dessus : `tests/test_garde_partout.py` énumère
// toutes les pages et toutes les routes et vérifie que chacune passe par ici.
// La discipline devient un contrôle.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { COOKIE_SESSION, lireSession, type Role } from "./session";
import { nommerAppareil, sessionVivante, toucherSession, type LigneSession } from "./sessions";
import { MANQUE, peut, type Pouvoir } from "./roles";
import { langueServeur } from "./langue-serveur";
import { lireUne } from "./base";

export type Presence = {
  personne: number;
  nom: string;
  role: Role;
  commerce: string | null;
  session: LigneSession;
};

type LignePersonne = { id: number; nom: string; etat: string };

/**
 * Qui est devant nous, ou `null`.
 *
 * Quatre raisons de renvoyer `null`, et elles se valent toutes du point de
 * vue de l'appelant : pas de jeton, jeton faux ou périmé, session fermée,
 * personne suspendue. On ne dit pas laquelle — une porte qui explique
 * pourquoi elle refuse apprend à qui insiste.
 */
export async function qui(): Promise<Presence | null> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return null;

  const jeton = (await cookies()).get(COOKIE_SESSION)?.value;
  const charge = await lireSession(secret, jeton);
  if (!charge) return null;

  // La question que la signature ne peut pas trancher.
  const session = await sessionVivante(charge.session);
  if (!session) return null;

  // Le rôle fait foi tel qu'il est EN BASE, jamais tel qu'il est dans le
  // jeton : un rôle changé ce matin doit valoir cet après-midi, sans attendre
  // que la personne se reconnecte.
  const personne = await lireUne<LignePersonne>(
    `personnes?id=eq.${session.personne}&select=id,nom,etat&limit=1`);
  if (!personne || personne.etat !== "actif") return null;

  await toucherSession(session);
  return {
    personne: personne.id,
    nom: personne.nom,
    role: session.role,
    commerce: session.commerce,
    session,
  };
}

/**
 * La même chose, mais on n'entre pas sans. Pour une page.
 *
 * Une page ne renvoie pas d'erreur : elle renvoie la personne à la porte.
 * C'est aussi ce qui rattrape le cas que le middleware laisse passer — un
 * jeton encore signé dont la session a été fermée entre-temps.
 */
export async function exigerPresence(): Promise<Presence> {
  const p = await qui();
  if (!p) redirect("/connexion");
  return p;
}

/**
 * Le pouvoir qu'il faut, sinon rien. Pour une page.
 *
 * Une page n'a pas à savoir ce que le rôle autorise dans le détail : elle dit
 * ce qu'elle exige, et la liste des pouvoirs vit dans `lib/roles.ts`.
 *
 * Quelqu'un de connecté à qui il manque le pouvoir n'est pas renvoyé à la
 * porte — il est déjà entré, et le renvoyer se lirait comme une panne. Il
 * arrive sur l'accueil, où sa page d'accueil correspond à ce qu'il est.
 */
export async function exigerPouvoir(pouvoir: Pouvoir): Promise<Presence> {
  const p = await exigerPresence();
  if (!peut(p.role, pouvoir)) redirect("/");
  return p;
}

// --- Le même contrôle, côté route d'API ------------------------------------
// Une route ne redirige pas : elle répond. Et elle répond dans la langue de la
// personne, parce que le client affiche le message tel quel.

export type Refus = { refus: NextResponse };

function estRefus(x: unknown): x is Refus {
  return typeof x === "object" && x !== null && "refus" in x;
}

export { estRefus };

/**
 * Pour une route : soit la présence, soit une réponse toute prête à renvoyer.
 *
 *     const g = await garder("operer");
 *     if (estRefus(g)) return g.refus;
 *     // ici, g est la personne, et elle a le droit
 */
export async function garder(pouvoir: Pouvoir): Promise<Presence | Refus> {
  const langue = await langueServeur();
  const p = await qui();
  if (!p) {
    const erreur = langue === "en" ? "sign-in required" : "connexion requise";
    return { refus: NextResponse.json({ erreur }, { status: 401 }) };
  }
  if (!peut(p.role, pouvoir)) {
    // 403, et le refus est journalisé : c'est en relisant ces lignes qu'on
    // découvre qu'un lecteur essaie des routes d'écriture à la main.
    console.warn(
      `refus : ${p.nom} (${p.role}) a demandé « ${pouvoir} » sur ${p.commerce ?? "—"}`);
    return { refus: NextResponse.json({ erreur: MANQUE[pouvoir][langue] }, { status: 403 }) };
  }
  return p;
}

/**
 * L'appareil et l'endroit, tels qu'on peut les nommer.
 *
 * Approximatifs par construction, et c'est assumé : ils servent à ce qu'une
 * personne reconnaisse une ligne dans sa liste, pas à faire une preuve.
 */
export async function contexteAppareil(): Promise<{ appareil: string; lieu: string | null }> {
  const h = await headers();
  const pays = h.get("x-vercel-ip-country");
  const ville = h.get("x-vercel-ip-city");
  const lieu = ville && pays ? `${decodeURIComponent(ville)}, ${pays}`
    : pays ? pays : null;
  return { appareil: nommerAppareil(h.get("user-agent")), lieu };
}
