// UNE PÉRIODE QUE LE CAHIER NE COUVRE PAS, DEMANDÉE À LA PLATEFORME.
//
// Le cahier ne porte que les deux cents derniers SMS ; « Ce mois » ou des
// jours choisis au calendrier remontent souvent plus loin. Filtrer sur ce
// que l'écran a déjà aurait rendu une période à moitié vide, sans le dire —
// sur une caisse à quarante SMS par jour, deux cents s'arrêtent au
// cinquième jour. On ne s'en contente que s'ils remontent AVANT le premier
// jour demandé (ou s'ils sont toute la caisse) ; sinon, on demande la
// période à la plateforme, qui la découpe dans la base.
//
// Cette logique vivait dans la boîte de réception ; les Paiements en ont
// besoin à l'identique. Elle vit ici, une fois, avec ses leçons :
//
// RIEN NE PEUT PLUS RESTER COINCÉ. « En recherche » et « impossible »
// étaient deux drapeaux posés à la main : choisir « Ce mois » puis
// « Aujourd'hui » avant la réponse annulait la première demande… et son
// `finally`, qui seul baissait « en recherche ». Le total n'apparaissait
// plus jamais, ou les formes grises battaient sans fin. Ils sont maintenant
// CALCULÉS, à partir de ce qu'on a reçu et de ce qui a échoué, pour LA
// période affichée : n'étant rangés nulle part, ils ne peuvent pas rester
// vrais tout seuls.
//
// ET LA PÉRIODE SUIT LE CAHIER. Elle n'était demandée qu'au choix : un
// encaissement arrivé ensuite n'y entrait jamais, et tirer pour rafraîchir
// faisait tourner la roue sur une liste qui ne bougeait pas. Chaque
// relecture réussie du cahier (`quand`) — la notification, le retour devant
// l'application, le doigt qui tire — la redemande, EN SILENCE : la liste
// d'avant reste à l'écran pendant ce temps.
//
// MAIS SEULEMENT DEVANT. Les onglets restent montés : « Ce mois » posé ici,
// puis l'Accueil, et chaque passage du cahier redemandait jusqu'à mille SMS
// (264 Ko, mesurés pour l'écran des cartes) pour un écran que personne ne
// regardait. Caché, l'écran ne demande rien ; revenu devant, il redemande
// la période si le cahier a bougé entre-temps — et seulement alors.

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "expo-router";

import { chargerDonnees, ErreurGuichet } from "@/api/guichet";
import { useLangue } from "@/langue";
import { useSession } from "@/session";
import { depuisPourLaBase, type Bornes } from "@noyau/periodes";
import type { Paiement } from "@noyau/types";
import type { Suite } from "@noyau/historique";

// Ce que la plateforme rapporte au plus pour une période (voir `MAX_SMS`).
export const SMS_PAR_PERIODE = 1000;

const AUCUN: Paiement[] = [];

function memesLignes(a: Paiement[], b: Paiement[]): boolean {
  if (a.length !== b.length) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/**
 * `bornes` — la période affichée (null : tout ce que le cahier porte) ;
 * `recents` — ce que l'écran a reçu du cahier, au plus `ecran` lignes ;
 * `quand` — la dernière relecture réussie du cahier.
 */
export function usePeriodeDemandee(bornes: Bornes | null, recents: Paiement[], ecran: number,
                                   quand: number | null) {
  const langue = useLangue();
  const { perdue } = useSession();
  const devant = useIsFocused();

  const couverte = bornes == null
    || recents.length < ecran
    || (recents.length > 0 && recents[recents.length - 1].jour < bornes.de);

  const cleP = couverte || !bornes ? null : `${bornes.de}…${bornes.a}`;
  const [lueP, setLueP] = useState<{ cle: string; lignes: Paiement[]; suite: Suite } | null>(null);
  const [rateeP, setRateeP] = useState<string | null>(null);
  const [essaiP, setEssaiP] = useState(0);
  const cleCourante = useRef(cleP);
  cleCourante.current = cleP;
  // LES RÉPONSES SONT NUMÉROTÉES : deux demandes de la même période se
  // croisent (un SMS, puis un retour devant l'application), et la plus
  // ancienne ne doit pas effacer la plus récente. Seule la DERNIÈRE
  // demandée a le droit de dire « impossible ».
  const ordreP = useRef({ dernier: 0, applique: 0 });
  // Ce qui a été demandé en dernier : la période, la langue, le passage du
  // cahier, l'essai. Revenir devant sans que rien de cela ait changé ne
  // redemande rien. (Un AUTRE motif entre deux — une autre période, puis
  // celle-ci de nouveau — redemande : la réponse d'avant a pu être écartée
  // par la plus récente.)
  const demandee = useRef<string | null>(null);
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => { monte.current = false; };
  }, []);
  useEffect(() => {
    if (!cleP || !bornes || !devant) return;
    const motif = [cleP, langue, quand ?? "", essaiP].join("|");
    if (demandee.current === motif) return;
    demandee.current = motif;
    const n = ++ordreP.current.dernier;
    const cle = cleP;
    chargerDonnees(langue, { sms: SMS_PAR_PERIODE, recus: 0,
                             depuis: depuisPourLaBase(bornes) })
      .then((d) => {
        if (!monte.current || cle !== cleCourante.current || n < ordreP.current.applique) return;
        ordreP.current.applique = n;
        // Une réponse sans liste n'est pas une période vide.
        const lignes = Array.isArray(d?.paiements) ? d.paiements : AUCUN;
        // Rien n'a bougé : LE MÊME objet, et aucune des mille lignes ne se
        // redessine — la période se relit à chaque passage du cahier, et la
        // plupart du temps rien n'y a changé.
        setLueP((avant) => (avant && avant.cle === cle && avant.suite === d.suite
                            && memesLignes(avant.lignes, lignes)
          ? avant : { cle, lignes, suite: d.suite }));
        setRateeP((r) => (r === cle ? null : r));
      })
      .catch((e: unknown) => {
        // Une session expirée n'est pas une période impossible : c'est un
        // retour au verrou, comme partout ailleurs.
        if (e instanceof ErreurGuichet && e.statut === 401) { perdue(); return; }
        if (!monte.current || cle !== cleCourante.current || n !== ordreP.current.dernier) return;
        setRateeP(cle);
      });
    // La période se résume à sa clé ; `quand` est la relecture du cahier,
    // `essaiP` le bouton « Réessayer », `devant` le retour sur l'onglet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleP, langue, quand, essaiP, devant]);

  const lignesP = cleP != null && lueP?.cle === cleP ? lueP.lignes : null;
  // Rien encore pour CETTE période, et pas d'échec connu : on cherche.
  const cherche = cleP != null && lignesP == null && rateeP !== cleP;
  // Rien pour cette période, et le dernier essai a échoué : on le dit. Une
  // période déjà affichée dont la relecture échoue reste à l'écran, muette
  // — comme le cahier, qui ne dit la panne qu'à l'écran qui n'a rien.
  const refus = cleP != null && lignesP == null && rateeP === cleP;
  // EN ATTENDANT LA PÉRIODE, CE QUE LE CAHIER EN A DÉJÀ. Une période tenue
  // par le cahier cesse de l'être au premier SMS qui arrive : la liste
  // tombait alors de quarante lignes à zéro, une forme grise à la place, le
  // total effacé — et ramenée en haut si on lisait plus bas. Les lignes que
  // le cahier porte DANS la période restent donc à l'écran ; la réponse
  // ajoute les plus anciennes en dessous.
  const paiements = cleP == null ? recents : (lignesP ?? recents);
  // UN TOTAL NE SE DIT QUE SUR UNE PÉRIODE ENTIÈRE : celle que le cahier
  // couvre, ou celle que la plateforme a rendue. Sur les seules lignes du
  // cahier, il serait faux sans le dire — un total partiel, sur de l'argent.
  const entiere = bornes != null && (cleP == null || lignesP != null);
  // La plateforme a-t-elle coupé ? Elle rend au plus mille lignes, les plus
  // récentes : si la plus ancienne est encore DANS la période, le début de
  // la période manque — et on le dit plutôt que de laisser croire au total.
  const tronquee = lignesP != null && bornes != null && lignesP.length >= SMS_PAR_PERIODE
    && lignesP[lignesP.length - 1].jour >= bornes.de;

  // Ce qu'une fiche vient de changer (lu, nature, reçu), reporté sur la
  // période qu'on tient à part — le cahier, la fiche le corrige elle-même.
  // LA SUITE DE LA PÉRIODE (voir `historique.ts`) : couverte par le cahier,
  // elle est entière — rien avant ; rendue par la plateforme, c'est la
  // sienne ; en route, on ne sait pas encore. Sans période, c'est l'écran
  // qui la tient (celle du cahier).
  const suite: Suite = bornes == null ? undefined
    : cleP == null ? null
    : lueP?.cle === cleP ? lueP.suite
    : undefined;

  const retoucher = useCallback((id: string, champs: Partial<Paiement>) => {
    setLueP((l) => (l && l.lignes.some((x) => x.id === id)
      ? { ...l, lignes: l.lignes.map((x) => (x.id === id ? { ...x, ...champs } : x)) }
      : l));
  }, []);
  const reessayer = useCallback(() => setEssaiP((n) => n + 1), []);

  return { paiements, cherche, refus, entiere, tronquee, suite, retoucher, reessayer };
}
