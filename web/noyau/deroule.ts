// LE DÉROULÉ D'UNE SESSION — ce que l'écran a le droit d'envoyer, et quand.
//
// `ussd.ts` LIT un écran de l'opérateur. Ce fichier décide de ce qu'on en
// FAIT : répondre tout seul, rejouer l'étape suivante d'un bouton appris, ou
// rendre la main. Il vit dans le noyau pour la même raison que la lecture :
// le site et le téléphone doivent trancher pareil, et une règle écrite deux
// fois finit par se contredire. Chaque fonction est pure, testée, avec le
// comportement d'avant pour témoin (`tests/deroule.test.ts`).
//
// LA RÈGLE DE TOUT LE FICHIER : dans le doute, on rend la main. Une réponse
// envoyée toute seule sur un écran mal compris peut ouvrir une autre branche,
// confirmer ce qu'on n'a pas lu, ou faire partir un numéro là où l'opérateur
// attendait le code secret. Un écran rendu au propriétaire, avec le message
// INTACT et la zone de réponse, ne coûte qu'un geste.

import {
  RECONNAISSANCE, champPourQuestion, demandeUnCode, lireEcran,
  type EtatDuReseau, type TypeChamp,
} from "./ussd";
import { montantSaisi, numeroSaisi } from "./saisie";

/** Ce qu'un champ de réponse attend — le type ne choisit que le clavier. */
export type TypeReponse = TypeChamp | "texte";

/** Un écran reçu du boîtier : le texte de l'opérateur, et ce que le réseau
 *  a dit de la session (« attend » / « fini » ; absent d'un vieux boîtier). */
export type EcranRecu = { texte: string; reseau?: EtatDuReseau | null };

// ---------------------------------------------------------------------------
// 1. UNE RÉPONSE TAPÉE PART TOUJOURS.
//
// Un écran lu comme « numéro » (« Confirmez le numéro 677998877 ? 1=Oui
// 2=Non ») ou « montant » (« Entrez le montant / 0. Retour ») n'acceptait
// plus que huit chiffres, ou un montant non nul : « 1 », « 0 », « 00 », « # »
// laissaient le bouton Envoyer éteint. Le propriétaire ne pouvait ni
// confirmer, ni revenir, ni annuler — seulement raccrocher. C'est exactement
// ce qu'il a demandé de ne jamais faire : « si on n'est pas d'accord avec la
// réponse que l'application propose, on peut taper une autre réponse ».
//
// Le type ne fait donc plus que PROPOSER : le bon clavier, les visages
// connus, et l'écho « Partira : … » quand un collage se nettoie. Il ne
// refuse jamais. Ce qui se tape comme sur le clavier d'un téléphone — des
// chiffres courts, « * », « # » — part tel quel ; un numéro collé avec
// « +237 » et des espaces part propre ; ce qu'on ne sait pas nettoyer part
// tel qu'on l'a écrit. Le réseau reste juge.
// ---------------------------------------------------------------------------

/** Ce qui partira pour une réponse tapée pendant la session. Vide seulement
 *  si rien n'a été tapé. */
export function reponseLibre(type: TypeReponse, brut: string): string {
  const v = (brut ?? "").trim();
  if (!v) return "";
  // Un choix de menu, une navigation, un code de service : tels quels.
  if (/^[\d]{1,3}$/.test(v) || /[#*]/.test(v)) return v;
  if (type === "numero") {
    const n = numeroSaisi(v);
    if (n.length >= 8) return n;
  }
  if (type === "montant") {
    const m = montantSaisi(v);
    if (m > 0) return String(m);
  }
  return v;
}

/** Le bouton Envoyer s'allume dès qu'il y a quelque chose à envoyer. */
export const reponsePrete = (type: TypeReponse, brut: string) =>
  reponseLibre(type, brut).length > 0;

// ---------------------------------------------------------------------------
// 2. RÉPONDRE TOUT SEUL : SEULEMENT À UNE VRAIE QUESTION, JAMAIS À UNE
//    CONFIRMATION.
//
// `champPourQuestion` reconnaît le mot (« numéro », « montant »). Ce n'est
// pas assez : « Transfert de 5000 FCFA à JEAN DUPONT. Montant total : 5050.
// Répondez 1 pour confirmer » NOMME le montant sans le demander — et
// l'application y renvoyait « 5000 » toute seule, là où l'opérateur
// attendait « 1 ». De même « Confirm transfer … mobile number 677998877 ? »
// recevait le numéro. On exige donc en plus :
//
//   — que le réseau attende encore (« fini » : plus rien ne part) ;
//   — que ce ne soit pas le code secret ;
//   — que la lecture de l'écran dise qu'il attend CE type-là (une question
//     qui nomme le montant ET le bénéficiaire n'attend ni l'un ni l'autre :
//     à vous) ;
//   — que l'écran ne soit pas une confirmation ;
//   — et qu'il ne porte pas DÉJÀ la valeur : un écran qui répète le montant
//     ou le numéro qu'on a saisi le récapitule, il ne le demande pas.
// ---------------------------------------------------------------------------

const RE_CONFIRMATION = new RegExp([
  String.raw`\bconfirm`,                         // confirm, confirmer, confirmez, confirmation
  String.raw`\bvalid(?:er|ez|ate|ation)\b`,
  String.raw`r[ée]pond(?:ez|re)\s+(?:par\s+)?1\b`,
  String.raw`\breply\s+(?:with\s+)?1\b`,
  String.raw`\bpress\s+1\b`,
  String.raw`\btape[zr]?\s+1\b`,
  String.raw`\b1\s*[=:]\s*(?:oui|yes|ok)\b`,
  String.raw`\boui\s*\/\s*non\b`,
  String.raw`\byes\s*\/\s*no\b`,
].join("|"), "i");

/** L'écran demande-t-il de CONFIRMER plutôt que de saisir ? */
export function estUneConfirmation(texte: string): boolean {
  return RE_CONFIRMATION.test(texte ?? "");
}

/** Les nombres écrits dans le texte, séparateurs retirés (« 5 000 » → 5000). */
function nombresDu(texte: string): string[] {
  return ((texte ?? "").match(/\d(?:[\d   .,]*\d)?/g) ?? [])
    .map((n) => n.replace(/[.,]\d{2}$/, "").replace(/\D/g, ""))
    .filter(Boolean);
}

/** L'écran porte-t-il déjà cette valeur (un récapitulatif) ? */
export function porteLaValeur(texte: string, type: TypeChamp, valeur: string): boolean {
  const v = (valeur ?? "").replace(/\D/g, "");
  if (!v) return false;
  const nombres = nombresDu(texte);
  return type === "numero"
    ? nombres.some((n) => n.length >= v.length && n.endsWith(v))
    : nombres.some((n) => n.replace(/^0+(?=\d)/, "") === v.replace(/^0+(?=\d)/, ""));
}

/**
 * Le champ que l'application peut envoyer TOUTE SEULE à cet écran, ou
 * `undefined` : on rend la main. `propres` : ce qui partirait pour chaque
 * champ (la valeur annoncée par « Partira : … »).
 */
export function champAServir<T extends { cle: string; type: TypeChamp }>(
  ecran: EcranRecu, restants: readonly T[], propres: Record<string, string>,
): T | undefined {
  const { texte, reseau } = ecran;
  if (!texte || reseau === "fini") return undefined;
  if (demandeUnCode(texte)) return undefined;
  const champ = champPourQuestion(texte, restants);
  if (!champ) return undefined;
  if (lireEcran(texte, reseau).attend !== champ.type) return undefined;
  if (estUneConfirmation(texte)) return undefined;
  const valeur = propres[champ.cle] ?? "";
  if (!valeur) return undefined;
  if (porteLaValeur(texte, champ.type, valeur)) return undefined;
  return champ;
}

// ---------------------------------------------------------------------------
// 3. UNE RÉPONSE TAPÉE À LA MAIN « CONSOMME » LA QUESTION.
//
// Les champs pas encore servis ne se réduisaient que quand l'application
// répondait seule. Une question ambiguë (« Montant à envoyer au
// bénéficiaire »), rendue au propriétaire qui tapait 5000, laissait donc le
// montant « à servir » — et l'écran suivant, qui le récapitulait, le
// recevait tout seul. Une réponse tapée à une QUESTION retire les champs que
// cette question nommait, et celui dont elle porte la valeur. Un choix de
// menu ne retire rien : « 1. Vers un numéro MTN » nomme un numéro sans le
// demander, et la vraie question vient après.
// ---------------------------------------------------------------------------

export function restantsApresReponse<T extends { cle: string; type: TypeChamp }>(
  ecran: EcranRecu, restants: readonly T[], propres: Record<string, string>, reponse: string,
): T[] {
  const lu = lireEcran(ecran.texte, ecran.reseau);
  if (lu.choix.some((c) => c.numero === reponse.trim())) return [...restants];
  return restants.filter((c) => {
    if (lu.attend === c.type) return false;
    if ((propres[c.cle] ?? "") && propres[c.cle] === reponse.trim()) return false;
    if (lu.choix.length === 0
        && RECONNAISSANCE.some((r) => r.type === c.type && r.motif.test(ecran.texte))) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// 4. UN TRAJET APPRIS NE SE REJOUE PAS À L'AVEUGLE.
//
// Un bouton du carnet (« *126# », « 1 », « 1 ») rejouait ses étapes sans
// regarder l'écran qui répondait. MTN répondait « Service temporairement
// indisponible » (session fermée) : « 1 » partait quand même, et l'écran
// montrait la phrase du boîtier — « la session n'est pas sur cette carte »
// — à la place de celle de MTN. Le menu avait changé : « 1 » ouvrait une
// autre branche, sans que personne le voie. Et si l'opérateur réclamait le
// code secret plus tôt que prévu, le numéro du bénéficiaire partait comme
// code secret.
//
// Avant chaque étape : le réseau attend encore, ce n'est pas le code secret,
// et — pour un choix de menu — l'écran PROPOSE ce choix ; pour un trou
// (« {montant} »), l'écran pose une question d'un type compatible et n'est
// pas une confirmation. Sinon on s'arrête, et l'écran réel est rendu.
// ---------------------------------------------------------------------------

/** L'étape suivante d'un trajet peut-elle partir sur cet écran ?
 *  `gabarit` : l'étape telle qu'apprise (« 1 », « {montant} »). */
export function etapePeutPartir(gabarit: string, ecran: EcranRecu): boolean {
  const { texte, reseau } = ecran;
  if (!texte || reseau === "fini") return false;
  if (demandeUnCode(texte)) return false;
  const lu = lireEcran(texte, reseau);
  if (lu.attend === "rien" || lu.attend === "secret") return false;
  const g = (gabarit ?? "").trim();
  const trou = /^\{(\w+)\}$/.exec(g);
  if (trou) {
    const type: TypeChamp = trou[1] === "montant" ? "montant" : "numero";
    return lu.choix.length === 0 && !estUneConfirmation(texte)
      && (lu.attend === type || lu.attend === "texte");
  }
  return lu.choix.some((c) => c.numero === g);
}

// ---------------------------------------------------------------------------
// 5. CE QUE LE BOÎTIER REND N'EST PAS TOUJOURS L'OPÉRATEUR.
//
// Une demande « echouee » porte une phrase du BOÎTIER (« Le terminal n'a pas
// pu faire : pas de réponse USSD du réseau », « Le code secret n'a pas pu
// être sécurisé »). Elle était rangée comme un message de l'opérateur, dans
// sa carte, sous son nom, titrée « Réponse de l'opérateur ». Et une réponse
// VIDE du réseau (« +CUSD: 1 » sans texte) s'affichait « (réponse vide) »,
// au nom de MTN. L'opérateur n'écrit que ce qu'il écrit : un refus du
// boîtier est un message de TOTEM, et un écran vide reste vide.
// ---------------------------------------------------------------------------

export type ReponseDuBoitier =
  | { genre: "ecran"; texte: string; reseau?: EtatDuReseau }
  | { genre: "refus"; texte: string };

/** Lit une demande finie. `null` tant qu'elle n'est pas finie. */
export function reponseDuBoitier(
  c: { etat?: string; resultat?: string | null; reseau?: unknown } | null | undefined,
): ReponseDuBoitier | null {
  if (!c) return null;
  if (c.etat === "faite") {
    const reseau = c.reseau === "attend" || c.reseau === "fini" ? c.reseau : undefined;
    return { genre: "ecran", texte: c.resultat ?? "", reseau };
  }
  if (c.etat === "echouee") return { genre: "refus", texte: c.resultat ?? "" };
  return null;
}

// ---------------------------------------------------------------------------
// 6. L'ÉCRAN ATTEND PLUS LONGTEMPS QUE LE BOÎTIER.
//
// L'écran renonçait à 30 s. Le boîtier, lui, relève sa file (jusqu'à 3 s),
// efface le code secret de la base (jusqu'à trois essais), PUIS attend le
// réseau jusqu'à 30 s. Une réponse de MTN à la 28e seconde arrivait donc
// après que l'écran eut annulé : vibration « échec », « La session s'est
// arrêtée », et la session raccrochée par « Terminé » — sur un transfert
// parti. L'écran attend maintenant plus que le boîtier ; et si l'annulation
// trouve la demande « en cours », il continue de relire jusqu'à ce que le
// boîtier ne puisse plus rien en faire (la demande trop vieille ne se
// compose plus, `DEMANDE_PERIMEE_S`). `tests/deroule.test.ts` relit les
// délais du robot pour que ces deux nombres ne se laissent pas distancer.
// ---------------------------------------------------------------------------

/** Ce que l'écran attend la réponse du boîtier avant d'annuler. */
export const ATTENTE_DU_BOITIER_MS = 50_000;
/** Une fois l'annulation refusée (« en cours ») : ce qu'il relit encore. */
export const PROLONGATION_MS = 45_000;

// ---------------------------------------------------------------------------
// 7. CE QUI PART AU BOÎTIER SE REFUSE, IL NE SE COUPE PAS.
//
// La plateforme coupait le code à 32 caractères, en silence. Un raccourci
// que les Réglages déclaraient valide — « #150*4*{point}*{numero}*{montant}# »
// — faisait 34 caractères une fois rempli, et partait en
// « #150*4*699112233*677998877*25000 » : 250 000 F devenus 25 000, le « # »
// final perdu, et rien ne le disait. Couper un montant, c'est en écrire un
// autre. La borne est celle d'un écran USSD (182), et ce qui la dépasse — ou
// n'a pas la forme d'un code — est REFUSÉ, avec sa raison.
// ---------------------------------------------------------------------------

/** Ce que tient un message USSD, dans un sens comme dans l'autre. */
export const LONGUEUR_USSD_MAX = 182;

export type RefusDeDemande = "codeVide" | "codeTropLong" | "codeMalForme" | "reponseTropLongue";

/** Le code à composer, tel qu'il partira — ou la raison du refus. Les
 *  espaces se retirent (un code recopié en porte) ; rien d'autre ne
 *  change : un caractère étranger est un code faux, pas un code à
 *  nettoyer. */
export function codeAComposer(brut: string): { code: string } | { refus: RefusDeDemande } {
  const code = (brut ?? "").replace(/[\s  ]+/g, "");
  if (!code) return { refus: "codeVide" };
  if (code.length > LONGUEUR_USSD_MAX) return { refus: "codeTropLong" };
  if (!/^[*#][\d*#]*#$/.test(code)) return { refus: "codeMalForme" };
  return { code };
}

/** La réponse dans la session, telle qu'elle partira — ou la raison du
 *  refus. Guillemets, retours à la ligne et caractères de contrôle
 *  s'en vont : en mode GSM, un « " » ou un « \r » refermerait la chaîne de
 *  la commande AT et injecterait des ordres au modem. */
export function texteDeReponse(brut: string): { texte: string } | { refus: RefusDeDemande } {
  // eslint-disable-next-line no-control-regex
  const texte = (brut ?? "").replace(/["\r\n\x00-\x1f]/g, "");
  if (texte.length > LONGUEUR_USSD_MAX) return { refus: "reponseTropLongue" };
  return { texte };
}
