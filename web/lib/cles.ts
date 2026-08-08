// Entrer avec le verrouillage de son propre téléphone.
//
// C'est le chemin de tous les jours. Le code par courriel reste, mais pour la
// première fois et les jours d'exception : voir `code-entree.ts` et
// `docs/COMMENT-ON-ENTRE.md`.
//
// CE QUI SE PASSE VRAIMENT, EN UNE PHRASE
// TOTEM invente une phrase, le téléphone la signe avec un secret qui ne le
// quitte jamais, TOTEM vérifie la signature avec la moitié publique qu'il
// garde en base. Rien de secret ne traverse le réseau, et il n'y a rien à
// voler chez nous.
//
// POURQUOI C'EST LA SEULE PROTECTION QUI TIENNE CONTRE UN FAUX SITE
// Le téléphone refuse de signer pour une autre adresse que la nôtre. Une
// personne qui tombe sur une imitation parfaite de TOTEM ne peut PAS se faire
// avoir : son téléphone ne répondra pas. Aucun code, aucun mot de passe,
// aucune vigilance humaine n'offre cela — parce que c'est la personne qu'on
// hameçonne, pas la machine.
//
// LA LIMITE, ET ELLE COMMANDE TOUT LE RESTE
// Une clé reconnaît un APPAREIL, pas une personne. Sur un combiné de comptoir
// que trois personnes se passent, elle ne prouve rien. `proposerUneCle()`
// refuse donc sur un appareil déclaré partagé, et ce refus n'est pas une
// option de réglage.
//
// POURQUOI UNE BIBLIOTHÈQUE ICI, ALORS QUE LE DÉPÔT N'EN A AUCUNE
// Vérifier une signature de ce type demande de décoder du CBOR, de lire une
// clé au format COSE et de vérifier de l'ECDSA. Écrire cela à la main, c'est
// écrire à la main la seule partie du dépôt où une erreur ne se voit jamais :
// tout marcherait, y compris pour un attaquant. « @simplewebauthn/server » est
// la référence du domaine ; on lui confie exactement ce calcul, et rien
// d'autre — toutes les décisions restent dans ce fichier.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { effacer, inserer, lire, lireUne, modifier, relie } from "./base";

/** Cinq minutes. La fenêtre du navigateur s'ouvre tout de suite ; passé ce
 *  délai, la personne a fermé l'onglet et recommencera. */
export const VIE_DEFI_MS = 5 * 60 * 1000;

export type Usage = "enregistrer" | "entrer";

export type LigneCle = {
  id: number;
  personne: number;
  identifiant: string;
  cle_publique: string;
  compteur: number;
  genre: "appareil" | "objet";
  sauvegardee: boolean;
  appareil: string | null;
  lieu: string | null;
  cree_le: string;
  vue_le: string | null;
  retiree_le: string | null;
};

// --- L'adresse pour laquelle le téléphone accepte de signer -----------------
//
// Le téléphone lie sa clé à UN nom de domaine et refuse de s'en servir
// ailleurs. C'est toute la protection contre les faux sites, donc ce nom ne se
// devine pas au hasard : on le prend de l'adresse réellement servie.
//
// `TOTEM_ORIGINE` permet de le figer — « https://totem.example ». C'est plus
// sûr, et c'est ce qu'il faut faire en production : sans elle, on fait
// confiance à l'en-tête « Host » de la requête. Le risque reste théorique — le
// navigateur, lui, écrit la VRAIE adresse visitée dans ce qu'il signe, et la
// vérification la compare — mais figer coûte une ligne.

export type Lieu = { origine: string; domaine: string };

export function lieuDepuis(hote: string | null, protocole?: string | null): Lieu | null {
  const fixe = process.env.TOTEM_ORIGINE;
  const brut = fixe || (hote ? `${protocole || (hote.startsWith("localhost") ? "http" : "https")}://${hote}` : "");
  if (!brut) return null;
  try {
    const u = new URL(brut);
    return { origine: u.origin, domaine: u.hostname };
  } catch {
    return null;
  }
}

// --- Les défis : une phrase neuve, à usage unique --------------------------

type LigneDefi = {
  id: number;
  valeur: string;
  usage: Usage;
  personne: number | null;
  expire_le: string;
  utilise_le: string | null;
};

function phraseNeuve(): string {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  let brut = "";
  for (const o of octets) brut += String.fromCharCode(o);
  return btoa(brut).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Inventer une phrase et la noter. Elle ne servira qu'une fois.
 *
 * On la garde en base plutôt que dans un biscuit signé, et ce n'est pas un
 * détail : un biscuit, même parfaitement signé, ne sait pas dire qu'il a DÉJÀ
 * servi. Sans cela, quelqu'un qui a entendu une vieille signature la rejoue.
 */
export async function defiNeuf(usage: Usage, personne?: number): Promise<string | null> {
  await menageDefis();
  const valeur = phraseNeuve();
  const ligne = await inserer<LigneDefi>("defis", {
    valeur,
    usage,
    personne: personne ?? null,
    expire_le: new Date(Date.now() + VIE_DEFI_MS).toISOString(),
  });
  return ligne ? valeur : null;
}

/**
 * Consommer la phrase — et le filtre « pas encore utilisée » est la sécurité.
 *
 * C'est la base qui arbitre, pas nous : deux requêtes qui arrivent au même
 * instant avec la même signature ne peuvent pas réussir toutes les deux.
 */
export async function consommerDefi(valeur: string, usage: Usage): Promise<LigneDefi | null> {
  if (!relie) return null;
  const ligne = await lireUne<LigneDefi>(
    `defis?valeur=eq.${encodeURIComponent(valeur)}&usage=eq.${usage}`
    + `&utilise_le=is.null&limit=1`);
  if (!ligne) return null;
  if (new Date(ligne.expire_le).getTime() < Date.now()) return null;
  const pris = await modifier(
    `defis?id=eq.${ligne.id}&utilise_le=is.null`,
    { utilise_le: new Date().toISOString() });
  return pris ? ligne : null;
}

/** Les phrases périmées ne racontent rien : on les efface. */
async function menageDefis(): Promise<void> {
  await effacer(`defis?expire_le=lt.${new Date(Date.now() - VIE_DEFI_MS).toISOString()}`);
}

// --- Enregistrer une clé sur cet appareil ----------------------------------

/**
 * Faut-il proposer d'enregistrer une clé ici ?
 *
 * Non sur un appareil partagé, et ce n'est pas négociable : une clé posée sur
 * le combiné du comptoir ouvrirait le compte de la propriétaire à quiconque
 * tient le combiné — c'est-à-dire à toute personne qui passe derrière la
 * caisse. Le geste paraîtrait pratique le jour où on le fait, et il n'y aurait
 * plus aucun moyen de savoir qui a appuyé.
 */
export function proposerUneCle(partage: boolean): boolean {
  return !partage;
}

/**
 * Ce qu'on donne au navigateur pour qu'il fabrique une clé.
 *
 * `excludeCredentials` porte les clés déjà là : sans elle, la personne qui
 * appuie deux fois se retrouve avec deux clés pour le même téléphone, et sa
 * liste d'appareils devient illisible — donc inutilisable le jour où il faut
 * en retirer une.
 */
export async function optionsEnregistrement(
  personne: number, nom: string, lieu: Lieu,
) {
  const defi = await defiNeuf("enregistrer", personne);
  if (!defi) return null;
  const deja = await clesDe(personne);
  return generateRegistrationOptions({
    rpName: "TOTEM",
    rpID: lieu.domaine,
    userID: new TextEncoder().encode(`totem:${personne}`),
    userName: nom,
    userDisplayName: nom,
    challenge: defi,
    // On ne demande aucune attestation : savoir quelle marque de téléphone
    // c'est ne nous apprend rien d'utile, et le demander ajoute un écran de
    // consentement que personne ne comprend.
    attestationType: "none",
    excludeCredentials: deja.map((c) => ({ id: c.identifiant })),
    authenticatorSelection: {
      residentKey: "required",
      // « required » : le téléphone doit demander le doigt, le visage ou le
      // code de verrouillage. Sans cela, un téléphone déverrouillé posé sur le
      // comptoir ouvre le compte tout seul.
      userVerification: "required",
    },
    timeout: VIE_DEFI_MS,
  });
}

export type Enregistrement =
  | { ok: true; cle: LigneCle }
  | { ok: false; raison: "defi" | "refuse" | "base" };

/**
 * Vérifier ce que le navigateur rapporte, et garder la moitié publique.
 *
 * `requireUserVerification` est à `true` : on n'accepte une clé que si le
 * téléphone confirme avoir vraiment demandé le doigt. Une clé qui ouvre sans
 * rien demander n'est pas une porte, c'est un couloir.
 */
export async function enregistrerCle(
  personne: number,
  reponse: RegistrationResponseJSON,
  lieu: Lieu,
  appareil: string,
  ou: string | null,
): Promise<Enregistrement> {
  const attendu = reponse.response.clientDataJSON ? lireDefi(reponse.response.clientDataJSON) : null;
  if (!attendu) return { ok: false, raison: "defi" };
  const defi = await consommerDefi(attendu, "enregistrer");
  // La phrase doit avoir été inventée POUR cette personne : sans ce contrôle,
  // une phrase obtenue sur son propre compte servirait à poser une clé sur
  // celui de quelqu'un d'autre.
  if (!defi || defi.personne !== personne) return { ok: false, raison: "defi" };

  let verdict;
  try {
    verdict = await verifyRegistrationResponse({
      response: reponse,
      expectedChallenge: attendu,
      expectedOrigin: lieu.origine,
      expectedRPID: lieu.domaine,
      requireUserVerification: true,
    });
  } catch (e) {
    console.error(`clé refusée à l'enregistrement : ${String(e)}`);
    return { ok: false, raison: "refuse" };
  }
  if (!verdict.verified) return { ok: false, raison: "refuse" };

  const info = verdict.registrationInfo;
  const cle = await inserer<LigneCle>("cles", {
    personne,
    identifiant: info.credential.id,
    cle_publique: enBase64Url(info.credential.publicKey),
    compteur: info.credential.counter,
    // « interne » veut dire le téléphone lui-même ; tout le reste (USB, NFC)
    // est un objet qu'on branche. La distinction sert à l'écran : on ne dit
    // pas « ce téléphone » d'une clé qu'on garde dans un tiroir.
    genre: (reponse.response.transports ?? []).includes("internal") ? "appareil" : "objet",
    // Recopiée dans le compte du fabricant : elle survivra au téléphone perdu.
    // La personne doit le voir — cela change entièrement ce qu'il faut faire
    // le jour de la perte.
    sauvegardee: info.credentialBackedUp,
    appareil,
    lieu: ou,
    vue_le: new Date().toISOString(),
  });
  return cle ? { ok: true, cle } : { ok: false, raison: "base" };
}

// --- Entrer avec une clé ---------------------------------------------------

/**
 * Ce qu'on donne au navigateur pour ouvrir la porte.
 *
 * Volontairement SANS liste de clés : le téléphone sait déjà lesquelles il
 * porte. C'est ce qui permet à la personne de n'avoir rien à taper du tout —
 * elle pose son doigt, et c'est fini. Elle n'a même pas à se souvenir de
 * l'adresse mail avec laquelle elle s'est inscrite.
 */
export async function optionsEntree(lieu: Lieu) {
  const defi = await defiNeuf("entrer");
  if (!defi) return null;
  return generateAuthenticationOptions({
    rpID: lieu.domaine,
    challenge: defi,
    userVerification: "required",
    timeout: VIE_DEFI_MS,
  });
}

export type Entree =
  | { ok: true; personne: number; cle: LigneCle }
  | { ok: false; raison: "defi" | "inconnue" | "retiree" | "refuse" | "copiee" };

/**
 * Vérifier une signature, et dire qui vient d'entrer.
 *
 * L'ORDRE COMPTE. On consomme la phrase AVANT de vérifier la signature :
 * sinon, une phrase valable pourrait être réessayée cent fois avec des
 * signatures différentes.
 */
export async function entrerParCle(
  reponse: AuthenticationResponseJSON, lieu: Lieu,
): Promise<Entree> {
  const attendu = lireDefi(reponse.response.clientDataJSON);
  if (!attendu) return { ok: false, raison: "defi" };
  if (!(await consommerDefi(attendu, "entrer"))) return { ok: false, raison: "defi" };

  const cle = await lireUne<LigneCle>(
    `cles?identifiant=eq.${encodeURIComponent(reponse.id)}&limit=1`);
  if (!cle) return { ok: false, raison: "inconnue" };
  // Une clé retirée ne rouvre rien. C'est ce qui donne un sens au bouton
  // « ce téléphone n'est plus à moi ».
  if (cle.retiree_le) return { ok: false, raison: "retiree" };

  let verdict;
  try {
    verdict = await verifyAuthenticationResponse({
      response: reponse,
      expectedChallenge: attendu,
      expectedOrigin: lieu.origine,
      expectedRPID: lieu.domaine,
      credential: {
        id: cle.identifiant,
        publicKey: depuisBase64Url(cle.cle_publique),
        counter: Number(cle.compteur),
      },
      requireUserVerification: true,
    });
  } catch (e) {
    console.error(`entrée refusée : ${String(e)}`);
    return { ok: false, raison: "refuse" };
  }
  if (!verdict.verified) return { ok: false, raison: "refuse" };

  // Le compteur qui recule : deux objets portent la même clé, donc quelqu'un
  // l'a copiée. Beaucoup d'appareils renvoient toujours zéro — on ne s'alarme
  // donc que si le compteur a déjà bougé une fois, sinon on refuserait des
  // téléphones parfaitement honnêtes tous les jours.
  const neuf = verdict.authenticationInfo.newCounter;
  if (cle.compteur > 0 && neuf <= cle.compteur) {
    console.error(
      `clé possiblement copiée : personne ${cle.personne}, compteur ${neuf} `
      + `après ${cle.compteur}`);
    return { ok: false, raison: "copiee" };
  }

  await modifier(`cles?id=eq.${cle.id}`, {
    compteur: neuf,
    sauvegardee: verdict.authenticationInfo.credentialBackedUp,
    vue_le: new Date().toISOString(),
  });
  return { ok: true, personne: cle.personne, cle };
}

// --- La liste, et le retrait ------------------------------------------------

/** Les clés vivantes d'une personne, la plus récemment utilisée d'abord. */
export async function clesDe(personne: number): Promise<LigneCle[]> {
  return lire<LigneCle>(
    `cles?personne=eq.${personne}&retiree_le=is.null&order=vue_le.desc.nullslast`);
}

/**
 * Retirer une clé. On date, on n'efface pas.
 *
 * Le filtre porte la personne : personne ne retire la clé d'un autre par ce
 * chemin, même en devinant un numéro de ligne.
 *
 * Retirer la DERNIÈRE clé est permis, et c'est voulu : le courriel reste
 * toujours ouvert. Une porte qui refuse de se fermer « pour votre bien » est
 * exactement ce qu'on ne veut pas — surtout le jour où le téléphone vient
 * d'être arraché.
 */
export async function retirerCle(
  id: number, personne: number, par: number, motif: string,
): Promise<boolean> {
  return modifier(
    `cles?id=eq.${id}&personne=eq.${personne}&retiree_le=is.null`,
    { retiree_le: new Date().toISOString(), retiree_par: par, retiree_motif: motif });
}

// --- Les petits gestes de format --------------------------------------------

/** La phrase signée, telle que le navigateur l'a recopiée dans sa réponse. */
function lireDefi(clientDataJSON: string): string | null {
  try {
    const texte = new TextDecoder().decode(depuisBase64Url(clientDataJSON));
    const objet = JSON.parse(texte) as { challenge?: unknown };
    return typeof objet.challenge === "string" ? objet.challenge : null;
  } catch {
    return null;
  }
}

export function enBase64Url(octets: Uint8Array): string {
  let brut = "";
  for (const o of octets) brut += String.fromCharCode(o);
  return btoa(brut).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// `new Uint8Array(ArrayBuffer)` explicitement, et pas le raccourci : le type
// de la bibliothèque exige un tampon ordinaire, là où le raccourci laisse
// planer un tampon partagé entre fils d'exécution.
export function depuisBase64Url(texte: string): Uint8Array<ArrayBuffer> {
  const base64 = texte.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (texte.length % 4)) % 4);
  const brut = atob(base64);
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}
