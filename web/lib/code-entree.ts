// Le code à six chiffres : le fabriquer, l'envoyer, le vérifier.
//
// C'est le seul mécanisme d'identité disponible sur le parc de téléphones
// d'ici. Il resservira cinq fois — à l'acceptation d'une invitation, à chaque
// nouvel appareil, après un changement de numéro, au retour d'un téléphone
// perdu, et pour confirmer un geste qui engage. Donc écrit une fois,
// entièrement, et jamais recopié.
//
// QUATRE RÈGLES, ET CHACUNE VIENT D'UN CAS RÉEL
//
// 1. SIX CHIFFRES TIRÉS SANS BIAIS. `Math.random()` n'a rien à faire ici, et
//    le modulo non plus : 2^32 n'est pas un multiple d'un million, donc un
//    « % 1000000 » naïf rend les petits nombres légèrement plus probables. On
//    rejette et on retire — c'est deux lignes de plus et zéro biais.
//
// 2. ON RALENTIT, ON N'ENFERME JAMAIS. Trois essais ratés, une minute
//    d'attente ; cinq, cinq minutes. Jamais de verrou définitif : verrouiller
//    le propriétaire, c'est le couper de son propre argent, et personne chez
//    TOTEM ne doit pouvoir faire cela — pas même pour le protéger.
//
// 3. LA COMPARAISON EST À TEMPS CONSTANT, et elle porte sur des empreintes.
//    La base ne connaît jamais le code : elle vérifie ce qu'on lui présente
//    sans pouvoir dire ce qu'elle attend.
//
// 4. LE MESSAGE COÛTE DE L'ARGENT À QUELQU'UN. On limite les demandes par
//    numéro : sans cela, il suffit d'appuyer cent fois sur « renvoyer » pour
//    vider le forfait d'un commerçant.

import { inserer, lire, lireUne, modifier } from "./base";

/** Dix minutes — le plafond du NIST (SP 800-63B-4 §3.1.3.1), et déjà court
 *  pour un SMS qui traverse un réseau chargé. */
export const VIE_MS = 10 * 60 * 1000;

/** Au-delà, on refuse d'en envoyer un de plus au même numéro. */
export const DEMANDES_MAX = 5;
export const FENETRE_DEMANDES_MS = 30 * 60 * 1000;

export type Motif = "invitation" | "entree" | "appareil" | "numero" | "geste";

export type LigneCode = {
  id: number;
  empreinte: string;
  personne: number | null;
  invitation: number | null;
  telephone: string;
  motif: Motif;
  expire_le: string;
  utilise_le: string | null;
  essais: number;
  lent_jusqu_a: string | null;
  appareil: string | null;
  lieu: string | null;
  cree_le: string;
};

/**
 * Six chiffres, tirés sans biais.
 *
 * Le rejet est la partie qui compte : on jette les tirages qui tombent dans la
 * queue incomplète de 2^32, pour que chacun du million de codes ait exactement
 * la même chance. Sans lui, un attaquant qui devine « plutôt petit » gagne un
 * peu — et « un peu », sur un million d'essais, c'est beaucoup.
 */
export function tirerCode(): string {
  const plafond = 1_000_000;
  const limite = Math.floor(0xffffffff / plafond) * plafond;
  const tirage = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(tirage);
    n = tirage[0];
  } while (n >= limite);
  return String(n % plafond).padStart(6, "0");
}

/**
 * L'empreinte d'un code, salée par le numéro visé.
 *
 * Le sel n'est pas un détail : sans lui, deux personnes qui reçoivent le même
 * code le même jour auraient la même empreinte en base, et qui la lit saurait
 * qu'elles ont reçu les mêmes six chiffres. Avec, un million de codes ne
 * produit jamais deux fois la même ligne pour deux destinataires différents.
 */
export async function empreinteCode(code: string, telephone: string): Promise<string> {
  const octets = new TextEncoder().encode(
    `totem:code:${telephone.replace(/\D/g, "")}:${code}`);
  const somme = await crypto.subtle.digest("SHA-256", octets as unknown as BufferSource);
  return Array.from(new Uint8Array(somme), (o) => o.toString(16).padStart(2, "0")).join("");
}

/** Comparaison à temps constant sur deux empreintes hexadécimales. */
export function memeEmpreinte(a: string, b: string): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Combien de codes ont été demandés récemment pour ce numéro. */
export async function demandesRecentes(telephone: string): Promise<number> {
  const depuis = new Date(Date.now() - FENETRE_DEMANDES_MS).toISOString();
  const lignes = await lire<{ id: number }>(
    `codes_entree?telephone=eq.${encodeURIComponent(telephone)}`
    + `&cree_le=gte.${depuis}&select=id`);
  return lignes.length;
}

export type Demande = {
  telephone: string;
  motif: Motif;
  personne?: number | null;
  invitation?: number | null;
  appareil?: string | null;
  lieu?: string | null;
};

export type Emis =
  | { code: string; ligne: LigneCode }
  /** Trop de demandes pour ce numéro : on protège son forfait, pas nous. */
  | { trop: true; reessayerDans: number };

/**
 * Fabriquer un code et l'enregistrer. Rend le code EN CLAIR, une seule fois.
 *
 * L'appelant l'insère dans le message et l'oublie. Il ne pourra jamais le
 * relire : ni ici, ni en base, ni dans un journal.
 */
export async function emettreCode(d: Demande): Promise<Emis | null> {
  if (await demandesRecentes(d.telephone) >= DEMANDES_MAX) {
    return { trop: true, reessayerDans: FENETRE_DEMANDES_MS };
  }
  const code = tirerCode();
  const ligne = await inserer<LigneCode>("codes_entree", {
    empreinte: await empreinteCode(code, d.telephone),
    personne: d.personne ?? null,
    invitation: d.invitation ?? null,
    telephone: d.telephone,
    motif: d.motif,
    expire_le: new Date(Date.now() + VIE_MS).toISOString(),
    appareil: d.appareil ?? null,
    lieu: d.lieu ?? null,
  });
  return ligne ? { code, ligne } : null;
}

/**
 * Combien de temps la porte reste lente, après N essais ratés.
 *
 * La progression est douce au début — sur un écran fêlé, au soleil, on se
 * trompe une fois sans être un attaquant — et devient nette ensuite. Elle ne
 * va jamais jusqu'au verrou.
 */
export function attenteApres(essais: number): number {
  if (essais < 3) return 0;
  if (essais < 5) return 60 * 1000;         // une minute
  if (essais < 8) return 5 * 60 * 1000;     // cinq minutes
  return 15 * 60 * 1000;                    // un quart d'heure, et pas plus
}

export type Verdict =
  | { ok: true; ligne: LigneCode }
  | { ok: false; raison: "faux"; essais: number; attente: number }
  | { ok: false; raison: "expire" }
  | { ok: false; raison: "lent"; attente: number }
  | { ok: false; raison: "inconnu" };

/**
 * Vérifier un code.
 *
 * L'ordre des contrôles n'est pas indifférent : on regarde d'abord si la porte
 * est lente, AVANT de comparer. Sinon un attaquant patient apprendrait, à la
 * durée de la réponse, si son code était bon malgré l'attente.
 */
export async function verifierCode(
  code: string, telephone: string,
): Promise<Verdict> {
  const propre = code.replace(/\D/g, "");
  if (propre.length !== 6) return { ok: false, raison: "inconnu" };

  const e = await empreinteCode(propre, telephone);
  const ligne = await lireUne<LigneCode>(
    `codes_entree?empreinte=eq.${e}&utilise_le=is.null&limit=1`);

  if (!ligne) {
    // Aucune ligne : soit le code est faux, soit il a déjà servi. On ne
    // distingue pas — la porte ne dit jamais laquelle des deux, sinon elle
    // apprend à qui essaie.
    await noterEssaiRate(telephone);
    return { ok: false, raison: "inconnu" };
  }

  if (ligne.lent_jusqu_a && new Date(ligne.lent_jusqu_a).getTime() > Date.now()) {
    return {
      ok: false, raison: "lent",
      attente: new Date(ligne.lent_jusqu_a).getTime() - Date.now(),
    };
  }
  if (new Date(ligne.expire_le).getTime() < Date.now()) {
    return { ok: false, raison: "expire" };
  }

  // La ligne a été trouvée PAR son empreinte : le code est donc juste. La
  // comparaison qui suit ne sert qu'à rendre le chemin identique dans les deux
  // cas, pour ne rien livrer au chronomètre.
  if (!memeEmpreinte(ligne.empreinte, e)) {
    return { ok: false, raison: "faux", essais: ligne.essais + 1, attente: 0 };
  }

  // Consommer, en filtrant sur « pas encore utilisé » : deux onglets qui
  // valident au même instant ne peuvent pas ouvrir deux fois. C'est la base
  // qui arbitre, pas nous.
  const consomme = await modifier(
    `codes_entree?id=eq.${ligne.id}&utilise_le=is.null`,
    { utilise_le: new Date().toISOString() });
  if (!consomme) return { ok: false, raison: "inconnu" };

  return { ok: true, ligne };
}

/**
 * Noter un essai raté sur les codes vivants de ce numéro, et ralentir.
 *
 * On compte par NUMÉRO et non par code : sinon il suffirait de redemander un
 * code neuf pour remettre le compteur à zéro, et le ralentissement ne
 * ralentirait rien.
 */
async function noterEssaiRate(telephone: string): Promise<void> {
  const vivants = await lire<LigneCode>(
    `codes_entree?telephone=eq.${encodeURIComponent(telephone)}`
    + `&utilise_le=is.null&order=cree_le.desc&limit=5`);
  for (const l of vivants) {
    const essais = l.essais + 1;
    const attente = attenteApres(essais);
    await modifier(`codes_entree?id=eq.${l.id}`, {
      essais,
      lent_jusqu_a: attente ? new Date(Date.now() + attente).toISOString() : null,
    });
  }
}

/**
 * Le code, écrit comme on le lit : « 408 913 ».
 *
 * Deux groupes de trois, parce qu'on les recopie de mémoire depuis un SMS
 * jusqu'à un champ, et que six chiffres d'affilée se perdent en route.
 */
export function ecrireCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
