// LES CARTES, EN PUCES — une seule rangée, pour les trois écrans qui
// choisissent une carte : l'accueil, Opérations et le cadran USSD.
//
// Chacun avait la sienne. L'accueil, une rangée qui défile et ramène la
// carte choisie en vue ; Opérations et le cadran, des puces qui passaient à
// la ligne, sans logo, sous une étiquette en capitales (« CARTE DES
// OPÉRATIONS ») qui se lisait comme un réglage technique. Trois dessins pour
// une seule question — « depuis quelle carte ? » —, et un choix fait sur le
// cadran qui ne se retrouvait pas sur l'accueil. La rangée de l'accueil,
// éprouvée à cinq cartes par `verifier-l-affichage`, vit maintenant ici ; le
// choix, lui, vit dans `carte-choisie.ts`, une fois pour les trois.

import { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Defilement, Texte } from "@/ui";
import { Animated, useAppui } from "@/animations";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { choisirCarte } from "@/carte-choisie";
import { toucherChoix } from "@/toucher";
import { ECART_PUCES, HAUTEUR_PUCE } from "@/mesures-accueil";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { formaterNumero } from "@noyau/numero";
import type { Sim } from "@noyau/types";
import { textesAccueil } from "@noyau/textes/accueil";
import { textesGuichet } from "@noyau/textes/guichet";

type Langue = "fr" | "en";

/**
 * LES CARTES, EN PUCES, SUR UNE LIGNE. Elles passaient sur deux lignes avec
 * quatre cartes ; un logo et les quatre chiffres suffisent à les distinguer
 * — le nom long est sur la carte elle-même. Au-delà de la largeur, la
 * rangée défile, et ramène la carte choisie en vue : sinon la carte
 * affichée n'aurait aucune puce allumée visible.
 *
 * `marge` : la marge de l'écran — la rangée défile jusqu'au bord, et la
 * première puce s'aligne sur le contenu. `pleine` (deux colonnes) : la
 * rangée vit dans sa colonne, sans déborder dans la marge.
 */
export function PucesCartes({ cartes, active, marge, langue, pleine = false,
                              bas = espaces.md }: {
  cartes: Sim[]; active: string; marge: number; langue: Langue;
  pleine?: boolean; bas?: number;
}) {
  const rangee = useRef<ScrollView>(null);
  // TROIS MESURES, DANS N'IMPORTE QUEL ORDRE : la largeur de la rangée, la
  // place de chaque puce, et le choix — qui, retenu d'une ouverture à
  // l'autre, arrive avec les données, APRÈS une rangée déjà mesurée. La
  // première version ne regardait qu'au changement de choix ou de largeur :
  // la puce choisie venait d'apparaître, pas encore mesurée, et plus rien ne
  // la ramenait — elle restait hors de l'écran, selon l'ordre d'arrivée.
  // Chacune des trois mesures redemande donc, et seule la dernière agit.
  const places = useRef(new Map<string, { x: number; w: number }>());
  const largeur = useRef(0);
  const decalage = useRef(0);
  const bord = pleine ? 0 : marge;
  const amener = useRef(() => {});
  amener.current = () => {
    const p = places.current.get(active);
    const l = largeur.current;
    if (!p || !l) return;
    const gauche = p.x - decalage.current;
    // Déjà en vue : on ne bouge rien sous le doigt.
    if (gauche >= bord - 1 && gauche + p.w <= l - bord + 1) return;
    const x = gauche + p.w > l - bord ? p.x + p.w - l + bord : p.x - bord;
    rangee.current?.scrollTo({ x: Math.max(0, x), animated: true });
  };
  useEffect(() => amener.current(), [active, bord]);

  return (
    <Defilement
      ref={rangee}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      onLayout={(e) => { largeur.current = e.nativeEvent.layout.width; amener.current(); }}
      onScroll={(e) => { decalage.current = e.nativeEvent.contentOffset.x; }}
      scrollEventThrottle={32}
      style={{ marginHorizontal: pleine ? 0 : -marge, flexGrow: 0, marginBottom: bas }}
      contentContainerStyle={{ paddingHorizontal: pleine ? 0 : marge, gap: ECART_PUCES,
                               alignItems: "center" }}
    >
      {cartes.map((c) => (
        <View key={c.iccid}
              onLayout={(e) => {
                places.current.set(c.iccid,
                  { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width });
                if (c.iccid === active) amener.current();
              }}>
          <PuceCarte carte={c} actif={c.iccid === active} langue={langue} />
        </View>
      ))}
    </Defilement>
  );
}

/** Une puce : le logo de l'opérateur, et la fin du libellé (« 8901 »). */
function PuceCarte({ carte, actif, langue }: { carte: Sim; actif: boolean; langue: Langue }) {
  const appui = useAppui();
  const reconnu = operateurReconnu(carte.operateur);
  const fin = /·\s*(\S+)$/.exec(carte.libelle)?.[1];
  return (
    <Animated.View style={appui.style}>
      {/* Toucher la puce DÉJÀ allumée retient aussi le choix : sans cela,
          la carte montrée par défaut n'était jamais retenue, et changeait
          avec l'ordre de la plateforme. */}
      <Pressable onPress={() => { choisirCarte(carte.iccid); if (!actif) toucherChoix(); }}
                 {...appui}
                 accessibilityRole="button"
                 // `aria-selected` EN PLUS : react-native-web ignore
                 // `accessibilityState`, et la puce choisie ne se disait
                 // « choisie » à personne dans l'aperçu web.
                 accessibilityState={{ selected: actif }} aria-selected={actif}
                 accessibilityLabel={textesAccueil[langue].choisirCarte(carte.libelle)}
                 hitSlop={{ top: 4, bottom: 4 }}
                 style={{
                   height: HAUTEUR_PUCE,
                   flexDirection: "row", alignItems: "center", gap: espaces.xs,
                   paddingHorizontal: espaces.sm + 2,
                   borderRadius: rayons.bouton,
                   // Le trait dans les DEUX états : sans lui d'un côté, la
                   // puce choisie changeait de taille de deux points.
                   borderWidth: 1, borderColor: actif ? couleurs.accent : couleurs.trait,
                   backgroundColor: actif ? couleurs.accent : couleurs.surfaceHaute,
                 }}>
        {reconnu ? <LogoOperateur operateur={carte.operateur} taille={14} /> : null}
        <Texte taille={textes.petit} poids={actif ? "demi" : "moyen"} chiffresAlignes
               ton={actif ? "normal" : "doux"}
               style={actif ? { color: couleurs.surfaceHaute } : undefined}>
          {reconnu && fin ? fin : carte.libelle}
        </Texte>
      </Pressable>
    </Animated.View>
  );
}

/**
 * « DEPUIS LA CARTE » — la question posée avant tout geste d'argent.
 *
 * Avec deux cartes ou plus : les puces. Avec UNE seule : une rangée fixe,
 * qui ne se touche pas — il n'y a rien à choisir, mais il faut voir d'où
 * partira l'argent (le logo, le nom de la carte, son numéro).
 */
export function ChoixDeLaCarte({ cartes, active, langue, marge }: {
  cartes: Sim[]; active: Sim; langue: Langue; marge: number;
}) {
  const tg = textesGuichet[langue];
  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.petit} ton="doux">{tg.depuisLaCarte}</Texte>
      {cartes.length > 1 ? (
        <PucesCartes cartes={cartes} active={active.iccid} marge={marge}
                     langue={langue} bas={0} />
      ) : (
        <View accessible accessibilityLabel={tg.operationsDepuis(active.libelle)}
              style={{ height: HAUTEUR_PUCE, flexDirection: "row", alignItems: "center",
                       gap: espaces.sm }}>
          {operateurReconnu(active.operateur)
            ? <LogoOperateur operateur={active.operateur} taille={18} /> : null}
          <Texte poids="demi" numberOfLines={1} style={{ flexShrink: 1 }}>
            {active.libelle}
          </Texte>
          <View style={{ flex: 1 }} />
          {active.numero ? (
            <Texte taille={textes.petit} ton="doux" chiffresAlignes numberOfLines={1}>
              {formaterNumero(active.numero)}
            </Texte>
          ) : null}
        </View>
      )}
    </View>
  );
}
