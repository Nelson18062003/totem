// LE BOÎTIER DE LA BOUTIQUE — ce qu'on peut dire de lui, et de ses cartes,
// quand on ne le voit pas.
//
// Le boîtier (le Raspberry Pi de Douala, avec ses modems) donne signe de vie
// à peu près toutes les minutes. La plateforme ne le voit jamais : elle lit
// ce qu'il a écrit dans la base, et en déduit trois choses — est-il là, ses
// cartes sont-elles là, leur signal veut-il dire quelque chose. Ces trois
// déductions vivent ICI, une seule fois, pour la plateforme ET le téléphone :
// une règle recopiée deux fois finit par dire deux choses.
//
// LA FAUTE QU'ON NE REFAIT PAS. Une carte était « en place » si le boîtier
// l'avait vue il y a moins de dix minutes. Une coupure de courant de dix
// minutes à la boutique la déclarait donc RETIRÉE — toutes les cartes à la
// fois — et l'accueil faisait disparaître les gestes. Or c'est le boîtier qui
// voit les puces : quand il se tait, on ne sait plus rien d'elles, ni
// qu'elles sont là, ni qu'elles sont parties. « Je ne sais pas » est un état
// à part entière, et c'est le seul honnête.
//
// LA MÊME FAUTE, AU RETOUR. Le boîtier qui revient d'une coupure redonne
// signe de vie AVANT d'avoir republié ses cartes (deux fils séparés, jusqu'à
// une minute d'écart) : pendant ce temps, la base porte un signe de vie neuf
// et des cartes vues pour la dernière fois avant la coupure. Comparer les
// deux les déclarait toutes retirées — exactement la panne d'origine, à
// l'autre bout du silence. « Il ne la voit plus » ne se conclut donc que
// d'un boîtier qui a RELU ses cartes depuis qu'il est revenu.

/**
 * Au-delà de cet âge (en SECONDES), le boîtier « ne donne plus de
 * nouvelles ».
 *
 * Trois minutes, c'était trop serré : le signe de vie part en tête de tour,
 * un SMS qui réveille le robot repousse le suivant jusqu'à deux minutes, et
 * un tour raté coûte encore quarante-cinq secondes. Un simple hoquet
 * d'Internet suffisait à allumer l'alerte sur un boîtier bien vivant. Cinq
 * minutes, c'est au moins quatre battements manqués — une vraie panne se
 * signale deux minutes plus tard, et c'est le prix assumé.
 *
 * Le téléphone fait vieillir l'âge lui-même entre deux lectures : il lit ce
 * seuil-ci, pas un chiffre à lui.
 */
export const SANS_NOUVELLES_S = 5 * 60;

/**
 * Le boîtier parle, mais ne voit plus la carte depuis plus que cela (en
 * SECONDES) : elle est retirée.
 *
 * DEUX DATES, DEUX TRAJETS — ET L'ÉCART ENTRE ELLES. On compare la dernière
 * vue de la carte au dernier signe de vie, toutes deux écrites par le
 * boîtier. Le poste de chaque carte relit sa puce environ toutes les
 * minutes (jusqu'à 70 s quand une session USSD la retient) ; la date n'en
 * part que plus tard, avec un envoi de cartes. Le seuil doit donc couvrir
 * une relecture PLUS le temps que la date met à arriver.
 *
 * Ce temps-là a changé, et c'est ce que ce seuil avait oublié. Le signe de
 * vie a pris un fil à lui, à heure fixe ; les cartes sont restées dans le
 * tour des transmissions, à leur rythme. Sans incident, l'écart montait
 * déjà à deux minutes (une relecture, plus un tour de décalage) ; un seul
 * tour raté — Internet capricieux, le petit signe de vie passe, la poussée
 * échoue — le portait à 3 min 10 s, et une carte bien en place était dite
 * RETIRÉE : l'accueil faisait disparaître ses gestes.
 *
 * Le robot d'aujourd'hui renvoie ses cartes dans la foulée de chaque signe
 * de vie (totem/nuage.py, `_battre`) : l'écart retombe à une relecture.
 * Mais les boîtiers déjà installés gardent l'ancien pas jusqu'à leur mise à
 * jour. Cinq minutes couvrent une relecture et près de trois tours ratés
 * d'un robot d'hier — comme `SANS_NOUVELLES_S`, une vraie absence se dit
 * deux minutes plus tard, et c'est le prix assumé.
 */
export const ABSENCE_S = 5 * 60;

/**
 * Le temps (en SECONDES) qu'on laisse à un boîtier REVENU pour republier ses
 * cartes, avant de conclure qu'il n'en voit aucune.
 *
 * Il les republie dans la minute qui suit son retour ; trois minutes
 * laissent passer un premier envoi raté. Ce délai ne sert qu'au boîtier qui
 * ne voit PLUS AUCUNE carte (on a retiré la seule puce, ou toutes) : dès
 * qu'une seule de ses cartes est fraîche, il a relu, et l'absence des autres
 * se conclut tout de suite.
 */
export const RELECTURE_S = 3 * 60;

/** Ce qu'on sait de la présence d'une carte. Voir `Sim.presence`. */
export type Presence = "en_place" | "retiree" | "inconnue";

/**
 * Ce que la plateforme sait du boîtier qui porte une carte.
 *
 * DEUX HORLOGES, ET CHACUNE À SA PLACE :
 *   — celle du BOÎTIER date ce qu'il écrit : `vuLe` (son signe de vie),
 *     `derniereVue` d'une carte, `carteLaPlusRecente`. On ne compare ces
 *     instants qu'ENTRE EUX : un Pi peut retarder d'une heure après une
 *     coupure de courant, et l'écart entre deux de ses dates reste juste ;
 *   — celle de la PLATEFORME (et de la base) mesure les âges : `vuIlYa`,
 *     `revenuIlYa`. Un âge ne se calcule jamais sur une date du Pi quand la
 *     base en donne une à elle.
 */
export type Boitier = {
  /** Son dernier signe de vie, tel qu'IL l'a daté (horloge du boîtier). */
  vuLe: string | null | undefined;
  /** L'âge de son dernier signe de vie, en secondes, mesuré par la
   *  plateforme — depuis l'heure où la base l'a ENTENDU, quand elle la
   *  connaît. */
  vuIlYa: number | null | undefined;
  /** La plus récente « dernière vue » parmi TOUTES les cartes de ce boîtier
   *  (horloge du boîtier). Une seule fraîche suffit à dire qu'il a relu ses
   *  puces depuis son retour. Obligatoire, à dessein : un appelant qui
   *  l'oublierait jugerait sans elle — et c'est la panne du retour. */
  carteLaPlusRecente: string | null | undefined;
  /** Depuis combien de secondes il parle SANS INTERRUPTION, mesuré par la
   *  base (`terminaux.revenu_le`). Absent : la base ne le dit pas (pas
   *  encore migrée) — on ne conclut alors une absence que d'un boîtier dont
   *  une autre carte est fraîche. */
  revenuIlYa?: number | null;
  /** Sorti de la flotte (`terminaux.retire_le`) : le propriétaire a dit
   *  lui-même qu'il ne reviendrait pas. */
  retireLe?: string | null;
};

/** L'âge d'un instant, en secondes, mesuré à `maintenant` (millisecondes) —
 *  `null` si l'instant manque ou ne se lit pas. Jamais négatif : une horloge
 *  un peu en avance ne fait pas un âge « dans le futur ». */
export function ageEnSecondes(
  instant: string | null | undefined, maintenant: number,
): number | null {
  if (!instant) return null;
  const t = Date.parse(instant);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((maintenant - t) / 1000));
}

/**
 * L'âge du dernier signe de vie, mesuré par la plateforme à `maintenant` —
 * depuis l'heure où la BASE l'a entendu (`entenduLe`, son horloge à elle).
 *
 * Seulement à défaut, depuis la date que le boîtier a écrite lui-même
 * (`vuLe`) : une base pas encore migrée n'a que celle-là. Mais un Pi dont
 * l'horloge retarde de cinq minutes — il lui en faut parfois davantage pour
 * se remettre à l'heure après une coupure de courant — y paraît alors muet,
 * et tout ce qu'on lui demande est refusé. Mesurer un âge sur l'horloge de
 * celui dont on mesure l'âge, c'est le laisser répondre à sa propre place.
 */
export function ageDuSigneDeVie(
  entenduLe: string | null | undefined, vuLe: string | null | undefined,
  maintenant: number,
): number | null {
  return ageEnSecondes(entenduLe, maintenant) ?? ageEnSecondes(vuLe, maintenant);
}

/** Le boîtier se tait-il ? `null` (jamais vu, ou instant illisible) : oui —
 *  on ne prétend pas qu'il parle. */
export function boitierSansNouvelles(vuIlYa: number | null | undefined): boolean {
  return vuIlYa == null || !Number.isFinite(vuIlYa) || vuIlYa > SANS_NOUVELLES_S;
}

/** L'écart, en secondes, entre deux instants du MÊME boîtier — `null` si
 *  l'un des deux ne se lit pas. */
function ecart(plusTard: string | null | undefined, plusTot: string | null | undefined) {
  const a = plusTard ? Date.parse(plusTard) : NaN;
  const b = plusTot ? Date.parse(plusTot) : NaN;
  return Number.isFinite(a) && Number.isFinite(b) ? (a - b) / 1000 : null;
}

/**
 * La présence d'une carte, jugée d'après SON boîtier.
 *
 * — « retiree » si son boîtier est sorti de la flotte : il ne reviendra pas,
 *   et la carte n'a été revue par aucun autre ;
 * — « inconnue » si ce boîtier se tait (ou n'a jamais parlé) : il est le seul
 *   à voir la puce, et un boîtier muet ne voit plus rien ;
 * — « en_place » s'il parle et l'a vue il y a moins de `ABSENCE_S` (sur SON
 *   horloge, comparée à son dernier signe de vie) ;
 * — « retiree » s'il parle, ne la voit plus, ET a relu ses puces depuis son
 *   retour : une autre de ses cartes est fraîche, ou il parle sans
 *   interruption depuis plus de `RELECTURE_S` ;
 * — « inconnue » sinon : il vient de revenir, ou son horloge vient d'être
 *   remise à l'heure, et ce qu'il a dit de ses cartes date d'avant.
 *
 * Une date de dernière vue absente ou illisible n'est pas une preuve
 * d'absence : « inconnue », là encore.
 */
export function presenceDeLaCarte(
  boitier: Boitier, derniereVue: string | null | undefined,
): Presence {
  if (boitier.retireLe) return "retiree";
  if (boitierSansNouvelles(boitier.vuIlYa)) return "inconnue";
  const sansLaVoir = ecart(boitier.vuLe, derniereVue);
  if (sansLaVoir == null) return "inconnue";
  if (sansLaVoir <= ABSENCE_S) return "en_place";
  return aReluSesCartes(boitier) ? "retiree" : "inconnue";
}

/**
 * Le boîtier a-t-il republié ses cartes depuis qu'il est revenu ?
 *
 * Une carte « fraîche » ne le prouve que si elle a été vue APRÈS son retour.
 * Après une coupure de courant de deux à cinq minutes, les dates d'avant la
 * coupure sont encore à moins de `ABSENCE_S` du premier signe de vie : la
 * plus récente passait pour une relecture, et une carte vue un peu plus tôt
 * que les autres était dite « retirée » — le temps que le boîtier relise
 * ses puces, une minute environ. L'instant du retour, sur SON horloge, est
 * son dernier signe de vie moins le temps qu'il parle depuis
 * (`revenuIlYa − vuIlYa`, mesurés par la base). Une base d'avant ne le dit
 * pas : on garde alors la règle d'avant, faute de mieux.
 */
function aReluSesCartes(boitier: Boitier): boolean {
  const revenu = boitier.revenuIlYa;
  const retourConnu = revenu != null && Number.isFinite(revenu);
  if (retourConnu && revenu > RELECTURE_S) return true;
  const fraiche = ecart(boitier.vuLe, boitier.carteLaPlusRecente);
  if (fraiche == null || fraiche > ABSENCE_S) return false;
  const vu = boitier.vuIlYa;
  if (!retourConnu || vu == null || !Number.isFinite(vu)) return true;
  return fraiche <= Math.max(0, revenu - vu);
}

/** Ce que lisent les applications d'avant `presence` : seule une carte qu'on
 *  SAIT retirée cesse d'être « en place ». */
export function enPlaceSelon(presence: Presence): boolean {
  return presence !== "retiree";
}

/**
 * Le signal d'une carte, sur l'échelle du modem (0 à 31) — ou `null` s'il
 * est INCONNU.
 *
 * Le modem répond « 99 » quand il ne sait pas (pas de réseau, ou pas de
 * réponse à temps), et le robot recopiait ce 99 tel quel : l'écran en
 * tirait quatre barres pleines sur une carte qui ne captait rien. Tout ce
 * qui n'est pas un entier de 0 à 31 devient donc « je ne sais pas » — les
 * robots déjà installés, qui publient 99, sont couverts sans mise à jour.
 */
export function signalLu(brut: unknown): number | null {
  const n = typeof brut === "string" && brut.trim() !== "" ? Number(brut) : brut;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 31 ? n : null;
}

/**
 * Combien de barres, sur quatre, dessinent ce signal — pour le site ET le
 * téléphone. Un signal inconnu (hors de 0 à 31, ou absent) n'en remplit
 * aucune : 99 dessinait quatre barres pleines sur une carte sans réseau.
 *
 * Les barres sont le premier verdict qu'on lit sur le signal, avant même le
 * chiffre : c'est sur elles que se règle `signalFaible`, pas l'inverse.
 */
export function barresDuSignal(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 31) return 0;
  return Math.min(4, Math.round((n / 31) * 4));
}

/**
 * Au plus cette force (échelle du modem, 0 à 31), le signal est FAIBLE :
 * exactement ce que `barresDuSignal` dessine avec AU PLUS UNE BARRE sur
 * quatre (une barre va de 4 à 11 ; zéro, de 0 à 3).
 *
 * Le seuil a d'abord été écrit 7, avec le même commentaire — « au plus une
 * barre » — sans être confronté au dessin : une MTN à 9/31 montrait alors
 * UNE barre sur l'accueil et un point VERT sur l'onglet Comptes, une MTN à
 * 7/31 la même barre et un point orange. Deux verdicts pour une même
 * donnée, entre les barres et la pastille cette fois. Le test du noyau
 * balaie maintenant les 32 forces contre le dessin.
 */
export const SIGNAL_FAIBLE = 11;

/**
 * Ce signal est-il faible ? Pour le site ET le téléphone.
 *
 * Le même changement en avait écrit deux : rouge à 2 et moins sur le site,
 * orange à 7 et moins sur le téléphone. Une MTN qui captait à 5/31 avait
 * donc un point VERT sur l'onglet Comptes du site et un point ORANGE sur
 * celui du téléphone, au même instant — deux verdicts pour une seule
 * donnée. Un seul seuil, ici, réglé sur les barres : une barre (ou aucune)
 * veut toujours dire « faible », et rien d'autre ne le veut dire.
 *
 * Un signal inconnu (`null`, voir `signalLu`) n'est ni faible ni fort :
 * l'écran dit « inconnu », il ne colore rien.
 */
export function signalFaible(n: number | null | undefined): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= SIGNAL_FAIBLE;
}
