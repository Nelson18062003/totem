// LA CAISSE — la grande carte sombre de l'accueil.
//
// Le pendant mobile de `CarteSim` dans `web/app/accueil-client.tsx`, et elle
// en garde chaque parti pris :
//
//   — le fond est plus noir que l'encre des autres cartes (#141414) : c'est
//     LA caisse, elle ne se confond avec rien ;
//   — le CADRE ENTIER porte la couleur de l'opérateur, comme une pierre
//     sertie dans son chaton. Un opérateur inconnu reste sans cadre ;
//   — La Tresse est en filigrane sur la tranche droite : la carte est signée
//     TOTEM comme une carte bancaire est frappée de sa banque ;
//   — LE chiffre prend toute la largeur, sur UNE ligne, jamais cassée. Le
//     corps rétrécit à mesure que le solde grandit.
//
// Le solde est masqué par défaut : un écran ouvert devant quelqu'un ne dit
// pas ce que contient la caisse. Et il ne doit jamais APPARAÎTRE puis se
// cacher — dans ce sens-là, il est trop tard.

import { useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";

import { Texte } from "@/ui";
import { Icone } from "@/icones";
import { Symbole } from "@/marque";
import { LogoOperateur, couleurOperateur } from "@/logos-operateurs";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { formaterNumero } from "@noyau/numero";
import { nombre, type Sim } from "@noyau/types";
import { textesAccueil } from "@noyau/textes/accueil";
import type { Langue } from "@noyau/langue";

/** Le signal en quatre barres — rempli au niveau, lisible sans chiffres. */
function BarresSignal({ niveau }: { niveau: number }) {
  const pleines = Math.max(0, Math.min(4, Math.round((niveau / 31) * 4)));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, paddingBottom: 4 }}
          accessibilityLabel={`Signal ${niveau}/31`}>
      {[5, 8, 11, 14].map((h, i) => (
        <View key={h} style={{
          width: 3, height: h, borderRadius: rayons.rond,
          backgroundColor: i < pleines ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
        }} />
      ))}
    </View>
  );
}

/** Un bouton rond de la carte — cercle au trait clair, sur le fond sombre. */
function Rond({ onPress, children, libelle }: {
  onPress: () => void; children: React.ReactNode; libelle: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={libelle}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 36, height: 36, borderRadius: rayons.rond,
        borderWidth: 1,
        borderColor: pressed ? "#ffffff" : "rgba(255,255,255,0.4)",
        alignItems: "center", justifyContent: "center",
        backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "transparent",
      })}
    >
      {children}
    </Pressable>
  );
}

export type CarteCaisse = Pick<
  Sim,
  "libelle" | "operateur" | "numero" | "nom" | "solde" | "soldeMaj" | "signal"
  | "iccid" | "enPlace" | "derniereVue"
>;

export function Caisse({
  carte, langue, soldeCache, basculerSolde, onSolde, onCoordonnees,
}: {
  carte: CarteCaisse;
  langue: Langue;
  soldeCache: boolean;
  basculerSolde: () => void;
  onSolde: () => void;
  onCoordonnees: () => void;
}) {
  const t = textesAccueil[langue];
  const cadre = couleurOperateur(carte.operateur);

  // Le corps du chiffre se calcule sur la largeur RÉELLE de la carte : le web
  // le fait avec des unités de conteneur (cqw), qui n'existent pas ici. On
  // mesure donc la carte, et on applique la même règle — cinq millions
  // s'affiche immense, un milliard reste grand, et la ligne ne casse jamais.
  const [largeur, setLargeur] = useState(0);
  const mesurer = (e: LayoutChangeEvent) => setLargeur(e.nativeEvent.layout.width);

  const montantTexte = carte.solde == null ? "—" : nombre(carte.solde, langue);
  const separateur = langue === "en" ? "." : ",";
  const [entier, decimales] = (() => {
    if (carte.solde == null || soldeCache) {
      return [carte.solde == null ? "—" : "••••••", null] as const;
    }
    const i = montantTexte.lastIndexOf(separateur);
    return i === -1
      ? ([montantTexte, null] as const)
      : ([montantTexte.slice(0, i), montantTexte.slice(i + 1)] as const);
  })();

  // Largeur estimée, en em : chiffre tabulaire ≈ 0,62 ; séparateur ≈ 0,26 ;
  // décimales à 55 % ; 7 % de marge. La devise vit sur la ligne d'info :
  // toute la largeur de la carte appartient au nombre.
  const largeurEm = (() => {
    const chiffres = entier.replace(/[^0-9•—]/g, "").length;
    const seps = entier.length - chiffres;
    let em = chiffres * 0.62 + seps * 0.26;
    if (decimales) em += (decimales.length + 1) * 0.62 * 0.55;
    if (carte.solde != null) em += 1.35;
    return em * 1.07;
  })();
  // 5,5 rem = 88 pt, le plafond du web. Sans mesure encore, on part petit :
  // mieux vaut grandir que déborder une fraction de seconde.
  const interieur = Math.max(0, largeur - espaces.xl * 2);
  const corps = largeur ? Math.min(88, interieur / largeurEm) : 32;

  return (
    <View
      onLayout={mesurer}
      style={{
        backgroundColor: "#141414",
        borderRadius: rayons.carte,
        borderWidth: 2,
        borderColor: cadre ?? "rgba(255,255,255,0.3)",
        padding: espaces.xl,
        overflow: "hidden",
      }}
    >
      {/* La Tresse en filigrane sur la tranche droite. */}
      <View style={{ position: "absolute", right: -40, top: -32 }} pointerEvents="none">
        <Symbole taille={210} couleur={couleurs.lateriteClair} opacite={0.2} />
      </View>

      {/* Le signal et les commandes — hors du chemin du chiffre. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
        {carte.signal != null ? <BarresSignal niveau={carte.signal} /> : null}
        {carte.solde != null ? (
          <Rond onPress={basculerSolde} libelle={soldeCache ? t.montrerSolde : t.masquerSolde}>
            <Icone nom={soldeCache ? "Eye" : "EyeOff"} taille={16} couleur="#ffffff" />
          </Rond>
        ) : null}
        <Rond onPress={onSolde} libelle={t.actualiserAria}>
          <Icone nom="Refresh" taille={16} couleur="#ffffff" />
        </Rond>
        <Rond onPress={onCoordonnees} libelle={t.coordonneesAria}>
          <Icone nom="Identite" taille={16} couleur="#ffffff" />
        </Rond>
      </View>

      {/* LE chiffre. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: espaces.xl }}>
        <Texte
          poids="demi"
          chiffresAlignes
          numberOfLines={1}
          style={{ fontSize: corps, lineHeight: corps * 1.02, color: "#ffffff",
                   letterSpacing: -corps * 0.02 }}
        >
          {entier}
        </Texte>
        {decimales != null ? (
          <Texte poids="demi" chiffresAlignes
                 style={{ fontSize: corps * 0.55, color: "rgba(255,255,255,0.8)" }}>
            {separateur}{decimales}
          </Texte>
        ) : null}
        {carte.solde != null ? (
          <Texte poids="moyen" style={{
            fontSize: corps * 0.34, color: "rgba(255,255,255,0.8)",
            marginLeft: corps * 0.3 * 0.34,
          }}>
            FCFA
          </Texte>
        ) : null}
      </View>

      <Texte taille={textes.petit} style={{ marginTop: espaces.sm, color: "rgba(255,255,255,0.75)" }}>
        {!carte.enPlace
          ? t.carteMuette(carte.derniereVue)
          : carte.solde == null
            ? t.aucunSoldeConnu
            : carte.soldeMaj
              ? t.soldeMaj(carte.soldeMaj)
              : t.soldeSansHeure}
      </Texte>

      {/* La puce SIM au trait — la carte à l'écran EST la carte posée dans le
          berceau, à Douala — puis le numéro. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                     marginTop: espaces.md }}>
        <Icone nom="PuceSim" taille={18} couleur="rgba(255,255,255,0.6)" />
        <Texte taille={textes.petit} chiffresAlignes numberOfLines={1}
               style={{ flex: 1, color: "rgba(255,255,255,0.85)" }}>
          {carte.numero ? formaterNumero(carte.numero) : t.carteAnonyme(carte.iccid.slice(-8))}
        </Texte>
      </View>

      {/* Le libellé et la marque partagent le pied, côte à côte : chacune
          tient sa place, même à mi-largeur. */}
      <View style={{ flexDirection: "row", alignItems: "flex-end",
                     justifyContent: "space-between", gap: espaces.md,
                     marginTop: espaces.sm }}>
        <Texte taille={textes.legende} numberOfLines={1}
               style={{ flex: 1, color: "rgba(255,255,255,0.55)" }}>
          {carte.libelle}
        </Texte>
        <LogoOperateur operateur={carte.operateur} taille={30} />
      </View>
    </View>
  );
}
