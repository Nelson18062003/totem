// LA CAISSE — une carte, pas un cadre.
//
// Une carte de paiement a une FORME : 85,60 × 53,98 mm, soit un rapport de
// 1,586 (ISO/IEC 7810, format ID-1). C'est la proportion qu'on tient dans la
// main depuis cinquante ans, et l'œil la reconnaît avant de lire quoi que ce
// soit. Un rectangle quelconque, lui, reste une boîte.
//
// D'où le parti pris de cet écran : la caisse EST une carte. Elle en a la
// proportion, le coin large, la matière (un dégradé, pas un aplat), et son
// contenu tient en trois choses — le solde, le numéro, l'opérateur. Tout le
// reste — l'heure du relevé, l'état du terminal, les commandes — vit AUTOUR
// d'elle, pas dessus : une carte bancaire ne porte pas de mode d'emploi.

import { useMemo, useState } from "react";
import { View, type ColorValue, type LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Texte } from "@/ui";
import { Icone } from "@/icones";
import { Symbole } from "@/marque";
import { LogoOperateur, couleurOperateur } from "@/logos-operateurs";
import { useEcran } from "@/ecran";
import { couleurs, espaces, textes } from "@/theme/jetons";
import { formaterNumero } from "@noyau/numero";
import { nombre, type Sim } from "@noyau/types";
import { textesAccueil } from "@noyau/textes/accueil";
import type { Langue } from "@noyau/langue";

/** ISO/IEC 7810 ID-1 : 85,60 / 53,98. La proportion d'une vraie carte. */
export const RAPPORT_CARTE = 85.6 / 53.98;

/** Le signal, en quatre barres — lisible sans chiffre. */
function BarresSignal({ niveau }: { niveau: number }) {
  const pleines = Math.max(0, Math.min(4, Math.round((niveau / 31) * 4)));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}
          accessibilityLabel={`Signal ${niveau}/31`}>
      {[6, 9, 12, 15].map((h, i) => (
        <View key={h} style={{
          width: 3, height: h, borderRadius: 2,
          backgroundColor: i < pleines ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.25)",
        }} />
      ))}
    </View>
  );
}

export type CarteCaisse = Pick<
  Sim,
  "libelle" | "operateur" | "numero" | "nom" | "solde" | "soldeMaj" | "signal"
  | "iccid" | "enPlace" | "derniereVue"
>;

export function Caisse({ carte, langue, soldeCache }: {
  carte: CarteCaisse;
  langue: Langue;
  soldeCache: boolean;
}) {
  const t = textesAccueil[langue];
  const ecran = useEcran();
  const teinte = couleurOperateur(carte.operateur);

  // La carte MESURE SON PROPRE EMPLACEMENT plutôt que de déduire sa taille
  // de l'écran. La nuance a coûté un bogue : sur un pliable ouvert, la mise
  // en page passe à deux colonnes, et une carte dimensionnée sur la largeur
  // de l'ÉCRAN débordait de sa colonne de trente-six points. Mesurer là où
  // l'on est reste juste partout — une colonne, un écran partagé, un
  // téléphone tourné.
  const [place, setPlace] = useState(0);
  const mesurer = (e: LayoutChangeEvent) => setPlace(e.nativeEvent.layout.width);

  // Jamais au-delà de ce qu'une carte fait dans une main : sur tablette,
  // elle grandirait jusqu'à l'absurde. La hauteur suit la proportion.
  const largeur = Math.min(place || ecran.largeurContenu, 420);
  const hauteur = Math.round(largeur / RAPPORT_CARTE);
  const rembourrage = Math.round(largeur * 0.062);

  // LE chiffre : le plus grand corps qui tienne sur une ligne, calculé sur la
  // largeur RÉELLE de la carte. Le web le fait avec des unités de conteneur ;
  // ici on mesure. Cinq millions s'affiche immense, un milliard reste grand,
  // et la ligne ne casse jamais.
  const { entier, decimales, corps } = useMemo(() => {
    const texte = carte.solde == null ? "—" : nombre(carte.solde, langue);
    const separateur = langue === "en" ? "." : ",";
    if (carte.solde == null || soldeCache) {
      const e = carte.solde == null ? "—" : "••••";
      return { entier: e, decimales: null, corps: Math.min(hauteur * 0.3, 52) };
    }
    const i = texte.lastIndexOf(separateur);
    const [ent, dec] = i === -1
      ? [texte, null] as const
      : [texte.slice(0, i), texte.slice(i + 1)] as const;
    // Largeur estimée, en em du corps cherché. Inter en chiffres tabulaires :
    // un chiffre ≈ 0,62 em, un séparateur ≈ 0,28.
    //
    // LE PIÈGE, payé une fois : « FCFA » partage la ligne du nombre. L'oublier
    // dans le calcul donne un corps trop grand, et le solde se termine en
    // « 412,5… » — un montant tronqué, c'est-à-dire un montant faux.
    const chiffres = ent.replace(/[^0-9]/g, "").length;
    const seps = ent.length - chiffres;
    let em = chiffres * 0.62 + seps * 0.28;
    if (dec) em += (dec.length + 1) * 0.62 * 0.5;
    em += 0.82;                       // « FCFA » et son écart
    em *= 1.06;                       // et de quoi respirer
    const dispo = largeur - rembourrage * 2;
    return {
      entier: ent, decimales: dec,
      corps: Math.min(hauteur * 0.28, dispo / em),
    };
  }, [carte.solde, langue, soldeCache, largeur, hauteur, rembourrage]);

  // Le dégradé : deux noirs très proches, et une pointe de la couleur de
  // l'opérateur dans l'angle. Assez pour que la surface ait une matière,
  // trop peu pour qu'elle devienne un aplat de marque.
  const nuances: [ColorValue, ColorValue, ColorValue] = [
    teinte ? melange(teinte, 0.14) : "#26262a",
    "#161618",
    "#0d0d0f",
  ];

  return (
    <View onLayout={mesurer} style={{ width: "100%", alignItems: "center" }}>
      <LinearGradient
        colors={nuances}
        locations={[0, 0.45, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          width: largeur,
          height: hauteur,
          // Le coin d'une carte réelle : 3,18 mm sur 53,98 de haut, soit
          // près de 6 % — bien plus généreux qu'un rayon d'interface.
          borderRadius: Math.round(hauteur * 0.088),
          padding: rembourrage,
          justifyContent: "space-between",
          overflow: "hidden",
        }}
      >
        {/* La Tresse, frappée dans la matière comme un hologramme. */}
        <View style={{ position: "absolute", right: -hauteur * 0.26, bottom: -hauteur * 0.34 }}
              pointerEvents="none">
          <Symbole taille={Math.round(hauteur * 0.95)}
                   couleur={teinte ?? couleurs.lateriteClair} opacite={0.10} />
        </View>

        {/* En haut : l'opérateur d'un côté, le signal de l'autre. Aucun mot. */}
        <View style={{ flexDirection: "row", alignItems: "center",
                       justifyContent: "space-between" }}>
          <LogoOperateur operateur={carte.operateur} taille={Math.round(hauteur * 0.115)} />
          {carte.signal != null ? <BarresSignal niveau={carte.signal} /> : null}
        </View>

        {/* Au milieu : le solde. C'est ce qu'on vient voir.
            « allowFontScaling={false} » sur les TROIS morceaux : le corps est
            DÉJÀ calculé pour remplir la largeur de la carte. Le laisser
            grossir avec le réglage « grand texte » d'Android multiplierait
            cette taille calculée, le nombre déborderait sa ligne, et
            « numberOfLines={1} » le tronquerait — « 412,5… ». Un montant
            tronqué est un montant faux, ici déclenché par un réglage
            d'accessibilité. La taille reste donc fixe et lisible ; les autres
            textes de l'application, eux, suivent le réglage. */}
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Texte poids="demi" chiffresAlignes numberOfLines={1} allowFontScaling={false}
                 style={{ fontSize: corps, lineHeight: corps * 1.05,
                          color: "#ffffff", letterSpacing: -corps * 0.025 }}>
            {entier}
          </Texte>
          {decimales != null ? (
            <Texte poids="demi" chiffresAlignes allowFontScaling={false}
                   style={{ fontSize: corps * 0.5, color: "rgba(255,255,255,0.7)" }}>
              {langue === "en" ? "." : ","}{decimales}
            </Texte>
          ) : null}
          <Texte poids="moyen" allowFontScaling={false} style={{
            fontSize: Math.max(11, corps * 0.26), marginLeft: 6,
            color: "rgba(255,255,255,0.6)",
          }}>
            FCFA
          </Texte>
        </View>

        {/* En bas : le numéro, gravé comme sur une vraie carte. Et le nom de
            la caisse, discret, à droite. */}
        <View style={{ flexDirection: "row", alignItems: "flex-end",
                       justifyContent: "space-between", gap: espaces.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texte chiffresAlignes numberOfLines={1} poids="moyen"
                   style={{ fontSize: Math.max(13, hauteur * 0.075),
                            letterSpacing: 1.2, color: "rgba(255,255,255,0.92)" }}>
              {carte.numero ? formaterNumero(carte.numero) : "•••• •• •• ••"}
            </Texte>
          </View>
          {carte.nom ? (
            <Texte numberOfLines={1} style={{
              maxWidth: "45%", fontSize: Math.max(10, hauteur * 0.055),
              textTransform: "uppercase", letterSpacing: 0.6,
              color: "rgba(255,255,255,0.5)",
            }}>
              {carte.nom}
            </Texte>
          ) : null}
        </View>
      </LinearGradient>

      {/* Hors de la carte : l'état, en une ligne. Une carte bancaire ne porte
          pas son mode d'emploi ; on le met dessous, court. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs,
                     marginTop: espaces.sm, paddingHorizontal: espaces.xs }}>
        {!carte.enPlace ? (
          <>
            <Icone nom="Close" taille={13} couleur={couleurs.alerte} />
            <Texte taille={textes.legende} ton="alerte" numberOfLines={1}>
              {carte.derniereVue}
            </Texte>
          </>
        ) : carte.soldeMaj ? (
          <>
            <Icone nom="Refresh" taille={13} couleur={couleurs.encrePale} />
            <Texte taille={textes.legende} ton="pale" chiffresAlignes>
              {carte.soldeMaj}
            </Texte>
          </>
        ) : (
          <Texte taille={textes.legende} ton="pale">{t.aucunSoldeConnu}</Texte>
        )}
      </View>
    </View>
  );
}

/** Une couleur d'opérateur, ramenée vers le noir : la matière de la carte
 *  garde une trace de la marque, sans jamais devenir un aplat. */
function melange(couleur: string, part: number): string {
  const h = couleur.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = Math.round(((n >> 16) & 255) * part + 22);
  const v = Math.round(((n >> 8) & 255) * part + 22);
  const b = Math.round((n & 255) * part + 26);
  return `rgb(${r},${v},${b})`;
}
