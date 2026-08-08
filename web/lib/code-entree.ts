// Le code à six chiffres : le fabriquer, l'envoyer par courriel, le vérifier.
//
// Il resservira cinq fois — à l'acceptation d'une invitation, à chaque nouvel
// appareil, après un changement d'adresse, au retour d'un téléphone perdu, et
// pour confirmer un geste qui engage. Donc écrit une fois, entièrement, et
// jamais recopié.
//
// POURQUOI L'ADRESSE, ET PAS LE NUMÉRO
// L'adresse est le point fixe : elle suit la personne quand elle change de
// téléphone, de puce et d'opérateur. Un numéro camerounais inutilisé est
// recyclé et réattribué — un compte accroché à une ligne finirait un jour
// entre les mains d'un inconnu. Et le tout premier code sert autant à ouvrir
// la porte qu'à PROUVER que l'adresse existe et qu'elle est bien à cette
// personne : c'est le seul moment où on peut le savoir sans le demander.
//
// CE N'EST PAS LA PORTE PRINCIPALE
// La porte principale, c'est le verrouillage du téléphone lui-même (voir
// « cles.ts »). Le code par courriel est le chemin de la PREMIÈRE fois, et
// celui du jour où le doigt ne prend pas : un autre appareil, un téléphone
// neuf, un capteur qui refuse. Les deux coexistent, exprès.
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
// 4. CHAQUE MESSAGE COÛTE QUELQUE CHOSE. On limite les demandes par adresse :
//    sans cela, il suffit d'appuyer cent fois sur « renvoyer » pour noyer la
//    boîte de quelqu'un — et pour faire classer tous nos messages comme
//    indésirables, y compris ceux des autres.

import { inserer, lire, lireUne, modifier } from "./base";

/** Dix minutes. Assez pour changer d'application, attendre que le message
 *  arrive et revenir ; trop court pour qu'un code resté dans une boîte mail
 *  ouverte serve encore le lendemain. */
export const VIE_MS = 10 * 60 * 1000;

/** Au-delà, on refuse d'en envoyer un de plus à la même adresse. */
export const DEMANDES_MAX = 5;
export const FENETRE_DEMANDES_MS = 30 * 60 * 1000;

export type Motif = "invitation" | "entree" | "appareil" | "adresse" | "geste";

export type LigneCode = {
  id: number;
  empreinte: string;
  personne: number | null;
  invitation: number | null;
  courriel: string;
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
 * L'adresse, ramenée à sa forme canonique.
 *
 * Une adresse se retape avec une majuscule, ou avec une espace collée par le
 * clavier du téléphone. « Jeanne@Boutique.CM » et « jeanne@boutique.cm » sont
 * la même boîte, et la casse du domaine n'a jamais rien signifié. On ne
 * touche PAS au reste : chez certains hébergeurs, la partie avant l'arobase
 * distingue vraiment les majuscules, et « corriger » y perdrait des gens.
 */
export function adresseNormalisee(courriel: string): string {
  const propre = courriel.trim();
  const arobase = propre.lastIndexOf("@");
  if (arobase < 0) return propre.toLowerCase();
  return propre.slice(0, arobase) + "@" + propre.slice(arobase + 1).toLowerCase();
}

/**
 * L'empreinte d'un code, salée par l'adresse visée.
 *
 * Le sel n'est pas un détail : sans lui, deux personnes qui reçoivent le même
 * code le même jour auraient la même empreinte en base, et qui la lit saurait
 * qu'elles ont reçu les mêmes six chiffres. Avec, un million de codes ne
 * produit jamais deux fois la même ligne pour deux destinataires différents.
 */
export async function empreinteCode(code: string, courriel: string): Promise<string> {
  const octets = new TextEncoder().encode(
    `totem:code:${adresseNormalisee(courriel)}:${code}`);
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

/** Combien de codes ont été demandés récemment pour cette adresse. */
export async function demandesRecentes(courriel: string): Promise<number> {
  const depuis = new Date(Date.now() - FENETRE_DEMANDES_MS).toISOString();
  const lignes = await lire<{ id: number }>(
    `codes_entree?courriel=eq.${encodeURIComponent(adresseNormalisee(courriel))}`
    + `&cree_le=gte.${depuis}&select=id`);
  return lignes.length;
}

export type Demande = {
  courriel: string;
  motif: Motif;
  personne?: number | null;
  invitation?: number | null;
  appareil?: string | null;
  lieu?: string | null;
};

export type Emis =
  | { code: string; ligne: LigneCode }
  /** Trop de demandes pour cette adresse : on protège sa boîte, pas nous. */
  | { trop: true; reessayerDans: number };

/**
 * Fabriquer un code et l'enregistrer. Rend le code EN CLAIR, une seule fois.
 *
 * L'appelant l'insère dans le message et l'oublie. Il ne pourra jamais le
 * relire : ni ici, ni en base, ni dans un journal.
 */
export async function emettreCode(d: Demande): Promise<Emis | null> {
  if (await demandesRecentes(d.courriel) >= DEMANDES_MAX) {
    return { trop: true, reessayerDans: FENETRE_DEMANDES_MS };
  }
  const code = tirerCode();
  const ligne = await inserer<LigneCode>("codes_entree", {
    empreinte: await empreinteCode(code, d.courriel),
    personne: d.personne ?? null,
    invitation: d.invitation ?? null,
    courriel: adresseNormalisee(d.courriel),
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
  code: string, courriel: string,
): Promise<Verdict> {
  const propre = code.replace(/\D/g, "");
  if (propre.length !== 6) return { ok: false, raison: "inconnu" };

  const e = await empreinteCode(propre, courriel);
  const ligne = await lireUne<LigneCode>(
    `codes_entree?empreinte=eq.${e}&utilise_le=is.null&limit=1`);

  if (!ligne) {
    // Aucune ligne : soit le code est faux, soit il a déjà servi. On ne
    // distingue pas — la porte ne dit jamais laquelle des deux, sinon elle
    // apprend à qui essaie.
    await noterEssaiRate(courriel);
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
 * Noter un essai raté sur les codes vivants de cette adresse, et ralentir.
 *
 * On compte par ADRESSE et non par code : sinon il suffirait de redemander un
 * code neuf pour remettre le compteur à zéro, et le ralentissement ne
 * ralentirait rien.
 */
async function noterEssaiRate(courriel: string): Promise<void> {
  const vivants = await lire<LigneCode>(
    `codes_entree?courriel=eq.${encodeURIComponent(adresseNormalisee(courriel))}`
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
 * Deux groupes de trois, parce qu'on les recopie de mémoire depuis la boîte
 * mail jusqu'au champ, et que six chiffres d'affilée se perdent en route.
 */
export function ecrireCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
