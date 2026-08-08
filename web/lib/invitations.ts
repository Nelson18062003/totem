// Les invitations : rien n'existe avant qu'une invitation soit acceptée.
//
// C'est le seul chemin par lequel un compte client naît. Personne ne s'inscrit
// tout seul sur TOTEM : une propriétaire donne une clé de SA boutique, à une
// personne qu'elle nomme, pour un rôle qu'elle choisit.
//
// TROIS DÉCISIONS PORTÉES PAR CE FICHIER
//
// 1. LE LIEN NE SUFFIT JAMAIS. Il circule par WhatsApp — c'est là que se fait
//    le commerce ici — donc il se fait suivre, et il finit dans un groupe de
//    quarante personnes. Un code part en parallèle sur LE numéro que la
//    propriétaire a saisi, pas sur celui qu'on tape à l'ouverture. Le lien
//    sans le code n'ouvre rien.
//
// 2. LA BASE NE GARDE QUE L'EMPREINTE. Le jeton n'existe en clair que dans le
//    message envoyé. Une copie de la base — une sauvegarde qui traîne, un
//    accès de trop — ne permet d'ouvrir aucune invitation.
//
// 3. PLUSIEURS JOURS, PAS QUINZE MINUTES. Un délestage de douze heures à
//    Douala, un forfait épuisé le 28 : le lien s'ouvrira parfois le
//    surlendemain. Une invitation qui expire avant d'être lue ne protège de
//    rien, elle fait seulement recommencer la propriétaire.

import { inserer, lire, lireUne, modifier } from "./base";
import type { Role } from "./session";

/** Sept jours. Le temps qu'un lien traverse WhatsApp, une coupure, un week-end. */
export const VALIDITE_MS = 7 * 24 * 3600 * 1000;

export type LigneInvitation = {
  id: number;
  jeton_empreinte: string;
  commerce: string;
  role: Role;
  nom: string;
  telephone: string;
  langue: "fr" | "en";
  creee_par: number | null;
  creee_le: string;
  expire_le: string;
  consommee_le: string | null;
  consommee_par: number | null;
  annulee_le: string | null;
  premiere_vue_le: string | null;
};

/**
 * Pourquoi une invitation n'ouvre pas.
 *
 * « deja_ouverte » est le cas qui compte : quelqu'un d'autre a ouvert le lien
 * avant vous. L'écran ne dit jamais « lien invalide » — cette phrase pousse à
 * réessayer, alors qu'il faut prévenir la propriétaire.
 */
export type Echec = "inconnue" | "expiree" | "deja_ouverte" | "annulee";

/**
 * Un jeton d'invitation : 160 bits, en base 36 pour tenir dans un lien court.
 *
 * Court parce qu'il se recopie parfois à la main, depuis un écran fêlé, avec
 * une connexion qui coupe.
 */
export function nouveauJeton(): string {
  const octets = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(octets, (o) => o.toString(36).padStart(2, "0")).join("");
}

/** L'empreinte du jeton — la seule chose qui touche la base. */
export async function empreinte(jeton: string): Promise<string> {
  const octets = new TextEncoder().encode(`totem:invitation:${jeton}`);
  const somme = await crypto.subtle.digest("SHA-256", octets as unknown as BufferSource);
  return Array.from(new Uint8Array(somme), (o) => o.toString(16).padStart(2, "0")).join("");
}

export type Creation = {
  commerce: string;
  role: Role;
  nom: string;
  telephone: string;
  langue: "fr" | "en";
  creeePar: number;
};

/**
 * Créer une invitation, et rendre le jeton EN CLAIR — une seule fois.
 *
 * L'appelant l'insère dans le message et l'oublie. Il ne pourra jamais le
 * relire : ni ici, ni dans la base, ni dans un journal.
 */
export async function creerInvitation(
  c: Creation,
): Promise<{ jeton: string; ligne: LigneInvitation } | null> {
  const jeton = nouveauJeton();
  const ligne = await inserer<LigneInvitation>("invitations", {
    jeton_empreinte: await empreinte(jeton),
    commerce: c.commerce,
    role: c.role,
    nom: c.nom,
    telephone: c.telephone,
    langue: c.langue,
    creee_par: c.creeePar,
    expire_le: new Date(Date.now() + VALIDITE_MS).toISOString(),
  });
  return ligne ? { jeton, ligne } : null;
}

/**
 * Lire une invitation sans la consommer — pour l'AFFICHER.
 *
 * Ouvrir le lien ne crée rien : la page montre qui invite, quel commerce, quel
 * rôle, et attend. Le compte ne naîtra qu'après le code. Quelqu'un qui ouvre
 * le lien par curiosité, ou par erreur, ne doit rien déclencher.
 *
 * On note tout de même la PREMIÈRE ouverture : c'est ce qui permettra de dire
 * à la propriétaire « ce lien a été ouvert avant que votre opérateur ne le
 * reçoive ».
 */
export async function ouvrirInvitation(
  jeton: string,
): Promise<LigneInvitation | Echec> {
  const e = await empreinte(jeton);
  const ligne = await lireUne<LigneInvitation>(
    `invitations?jeton_empreinte=eq.${e}&limit=1`);
  if (!ligne) return "inconnue";
  if (ligne.annulee_le) return "annulee";
  if (ligne.consommee_le) return "deja_ouverte";
  if (new Date(ligne.expire_le).getTime() < Date.now()) return "expiree";

  if (!ligne.premiere_vue_le) {
    await modifier(`invitations?id=eq.${ligne.id}&premiere_vue_le=is.null`,
                   { premiere_vue_le: new Date().toISOString() });
  }
  return ligne;
}

/**
 * Consommer l'invitation : elle ne servira plus.
 *
 * Le filtre porte sur « consommee_le is null » : deux navigateurs qui
 * valident au même instant ne peuvent pas créer deux comptes, c'est la base
 * qui arbitre et non nous.
 */
export async function consommerInvitation(
  id: number, personne: number,
): Promise<boolean> {
  return modifier(`invitations?id=eq.${id}&consommee_le=is.null`,
                  { consommee_le: new Date().toISOString(), consommee_par: personne });
}

/** Annuler. La propriétaire s'est trompée de numéro, ou le lien a circulé. */
export async function annulerInvitation(id: number, commerce: string): Promise<boolean> {
  return modifier(
    `invitations?id=eq.${id}&commerce=eq.${commerce}&consommee_le=is.null&annulee_le=is.null`,
    { annulee_le: new Date().toISOString() });
}

/** Celles qui attendent encore une réponse, pour la liste de la propriétaire. */
export async function invitationsEnAttente(commerce: string): Promise<LigneInvitation[]> {
  return lire<LigneInvitation>(
    `invitations?commerce=eq.${commerce}&consommee_le=is.null&annulee_le=is.null`
    + `&order=creee_le.desc`);
}

/**
 * Le numéro tel qu'on l'affiche : les quatre derniers chiffres, le reste
 * masqué.
 *
 * La page de l'invitation le montre pour que la personne vérifie que c'est
 * bien son numéro — et il est masqué parce que cette page s'ouvre parfois
 * dans un groupe où quarante personnes voient l'écran.
 */
export function numeroMasque(numero: string): string {
  const chiffres = numero.replace(/\D/g, "");
  if (chiffres.length < 4) return "··";
  return `·· ${chiffres.slice(-4, -2)} ${chiffres.slice(-2)}`;
}
