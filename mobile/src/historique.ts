// LA SUITE DE L'HISTORIQUE, DEMANDÉE À LA PLATEFORME — page après page.
//
// TOTEM tourne déjà : des mois de caisse en base. L'onglet Paiements
// s'arrêtait aux deux cents derniers SMS, et « toutes les dates » mentait
// par omission — un paiement de mars n'existait ni à l'écran ni dans la
// recherche. La règle (recoller, où reprendre, quand se taire) vit dans le
// noyau (`historique.ts`) ; ce crochet ne fait que demander les pages.
//
// LE SOCLE, PRIS UNE FOIS. La suite que la plateforme a rendue vaut pour
// les lignes qu'elle a rendues AVEC elle (le « socle ») : tout ce qu'elle
// n'a pas rapporté est relevé avant. Le cahier, lui, se relit à chaque
// notification — et une relecture fait glisser sa fenêtre : les SMS les
// plus anciens qu'il portait en sortent. Si l'on ne gardait que le cahier
// du moment, ces lignes-là tomberaient ENTRE la fenêtre et la première page
// plus ancienne, sans un mot. Le socle est donc copié au moment où l'on
// demande la première page, et recollé avec le reste.
//
// UNE PÉRIODE NE SE MÉLANGE PAS À UNE AUTRE. Tout ce qui a été recollé
// appartient à la période (et à la langue) pour laquelle on l'a demandé ;
// changer de période repart du cahier, ou de la période neuve.

import { useCallback, useEffect, useRef, useState } from "react";

import { chargerDonnees, ErreurGuichet } from "@/api/guichet";
import { useLangue } from "@/langue";
import { useSession } from "@/session";
import { apresUnePage, recoller, type Historique, type Suite } from "@noyau/historique";
import type { Paiement } from "@noyau/types";

// Une page : de quoi remplir quelques écrans, sans faire attendre le réseau
// mobile de Douala (environ 70 Ko).
export const PAGE_HISTORIQUE = 250;

type Etat = Historique & { cle: string; enCours: boolean; refus: boolean };

/**
 * `cle` — la vue que l'historique prolonge (période, langue) ; `null` : pas
 * encore de quoi prolonger (la période est en route).
 * `montres` — ce que l'écran affiche aujourd'hui (le cahier, la période).
 * `socle` et `suiteDuSocle` — les lignes que la plateforme a rendues avec
 * leur suite : c'est d'elles que la première page repart.
 * `depuis` — la borne de début d'une période (la suite ne la dépasse pas).
 */
export function useHistorique(cle: string | null, montres: Paiement[], socle: Paiement[],
                              suiteDuSocle: Suite, depuis?: string) {
  const langue = useLangue();
  const { perdue } = useSession();
  const [etat, setEtat] = useState<Etat | null>(null);
  const actif = etat && cle != null && etat.cle === cle ? etat : null;
  const cleCourante = useRef(cle);
  cleCourante.current = cle;
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => { monte.current = false; };
  }, []);
  // UNE DEMANDE À LA FOIS, verrouillée sur l'instant : deux appels
  // rapprochés (le bas de la liste atteint, puis le bouton) lisent le même
  // état React, et partiraient tous les deux.
  const enVol = useRef(false);

  const suite: Suite = actif ? actif.suite : suiteDuSocle;

  const plus = useCallback(() => {
    if (cle == null || enVol.current) return;
    const curseur = actif ? actif.suite : suiteDuSocle;
    if (typeof curseur !== "string") return;
    enVol.current = true;
    const depart: Historique = actif ?? { lignes: socle.slice(), suite: curseur };
    setEtat({ ...depart, cle, enCours: true, refus: false });
    chargerDonnees(langue, { sms: PAGE_HISTORIQUE, recus: 0, avant: curseur, depuis })
      .then((d) => {
        if (!monte.current || cleCourante.current !== cle) return;
        setEtat((e) => (e && e.cle === cle
          ? { ...apresUnePage(e, { paiements: Array.isArray(d.paiements) ? d.paiements : [],
                                   suite: d.suite }, curseur),
              cle, enCours: false, refus: false }
          : e));
      })
      .catch((e: unknown) => {
        // Une session expirée n'est pas un historique impossible : c'est
        // un retour au verrou, comme partout ailleurs.
        if (e instanceof ErreurGuichet && e.statut === 401) { perdue(); return; }
        if (!monte.current || cleCourante.current !== cle) return;
        setEtat((x) => (x && x.cle === cle ? { ...x, enCours: false, refus: true } : x));
      })
      .finally(() => { enVol.current = false; });
  }, [cle, actif, suiteDuSocle, socle, langue, depuis, perdue]);

  // Ce qu'une fiche vient de changer (lu, nature, reçu), reporté sur les
  // lignes recollées — celles du cahier, la fiche les corrige elle-même.
  const retoucher = useCallback((id: string, champs: Partial<Paiement>) => {
    setEtat((e) => (e && e.lignes.some((x) => x.id === id)
      ? { ...e, lignes: e.lignes.map((x) => (x.id === id ? { ...x, ...champs } : x)) }
      : e));
  }, []);

  const paiements = actif ? recoller(montres, actif.lignes) : montres;
  return {
    paiements, suite,
    enCours: actif?.enCours ?? false,
    refus: actif?.refus ?? false,
    // A-t-on demandé au moins une page ? (Le socle seul ne dit rien de plus
    // que l'écran.)
    prolonge: actif != null,
    plus, retoucher,
  };
}
