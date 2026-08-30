// L'accueil — trois écrans qu'on ne voit qu'une fois, avant la connexion.
//
// CE QU'IL EST : une présentation, pas un péage. Une idée par écran, presque
// pas de mots, des points de progression, et « Passer » toujours offert —
// personne n'est retenu devant une porte qu'il veut juste ouvrir.
//
// CE QU'IL N'EST PAS : un endroit où demander quoi que ce soit. Ni
// permission, ni adresse, ni compte. On montre d'abord, on demande après —
// c'est l'ordre qui fait les accueils réussis.
//
// Il se souvient d'avoir été vu (réglage ordinaire, pas le coffre : « j'ai
// vu l'accueil » n'est pas un secret) et ne revient jamais.

import { useRef, useState } from "react";
import {
  Dimensions, FlatList, Pressable, View, type ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MotTotem, Texte, couleurs, espaces, rayons, textes } from "@/ui";
import { Symbole } from "@/marque";
import { Entree } from "@/animations";
import { Icone, type NomIcone } from "@/icones";
import { useLangue } from "@/langue";
import { textesBienvenue } from "@noyau/textes/bienvenue";
import * as Reglage from "@/api/reglage";

const CLE_VUE = "totem.accueil.vu";

export async function accueilDejaVu(): Promise<boolean> {
  // EN MODE APERÇU (les harnais, les captures d'écran), l'accueil s'écarte :
  // les huit formats et les captures de la boutique se connectent tout
  // seuls, et trois écrans de présentation devant la porte les rendraient
  // aveugles — un harnais qui échoue sur l'accueil ne mesure plus rien.
  // Le mot-dièse « #accueil » le fait revenir, pour le photographier.
  if (process.env.EXPO_PUBLIC_APERCU === "1"
      && typeof location !== "undefined"
      && !location.hash.includes("accueil")) {
    return true;
  }
  return (await Reglage.lire(CLE_VUE)) === "oui";
}

/** L'illustration de chaque écran : le symbole d'abord (la marque se
 *  présente), puis une icône du jeu dans un grand disque. */
const ILLUSTRATIONS: (NomIcone | "symbole")[] = ["symbole", "ArrowDown", "Hash"];

export function Bienvenue({ onFini }: { onFini: () => void }) {
  const langue = useLangue();
  const t = textesBienvenue[langue];
  const [page, setPage] = useState(0);
  const liste = useRef<FlatList>(null);
  const largeur = Dimensions.get("window").width;

  const finir = () => {
    void Reglage.ecrire(CLE_VUE, "oui");
    onFini();
  };

  const suivant = () => {
    if (page >= t.ecrans.length - 1) { finir(); return; }
    liste.current?.scrollToIndex({ index: page + 1, animated: true });
  };

  // La page « vue » est celle qui occupe l'écran, pas celle qu'on a demandée :
  // un glissement du doigt doit compter autant qu'un appui sur « Suivant ».
  const surPage = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const i = viewableItems[0]?.index;
    if (typeof i === "number") setPage(i);
  });

  const derniere = page === t.ecrans.length - 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.surface }}>
      {/* « Passer » — toujours là, jamais suppliant. */}
      <View style={{ alignItems: "flex-end", padding: espaces.lg }}>
        <Pressable onPress={finir} hitSlop={12}>
          <Texte taille={textes.petit} ton="doux" poids="moyen">{t.passer}</Texte>
        </Pressable>
      </View>

      <FlatList
        ref={liste}
        data={t.ecrans}
        keyExtractor={(e) => e.titre}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={surPage.current}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        getItemLayout={(_, i) => ({ length: largeur, offset: largeur * i, index: i })}
        renderItem={({ item, index }) => (
          <View style={{
            width: largeur, alignItems: "center", justifyContent: "center",
            paddingHorizontal: espaces.xl * 1.5, gap: espaces.xl,
          }}>
            {/* L'illustration respire dans un grand disque. */}
            <View style={{
              width: 160, height: 160, borderRadius: 80,
              backgroundColor: couleurs.surfaceHaute,
              alignItems: "center", justifyContent: "center",
              borderWidth: 1, borderColor: couleurs.surface2,
            }}>
              {ILLUSTRATIONS[index] === "symbole"
                ? <Symbole taille={84} couleur={couleurs.encre} />
                : <Icone nom={ILLUSTRATIONS[index] as NomIcone} taille={64}
                         couleur={couleurs.encre} />}
            </View>
            <View style={{ alignItems: "center", gap: espaces.md }}>
              {index === 0 ? <MotTotem taille={18} couleur={couleurs.encre} /> : null}
              <Texte taille={30} poids="demi"
                     style={{ textAlign: "center", lineHeight: 38 }}>
                {item.titre}
              </Texte>
              <Texte ton="doux" style={{ textAlign: "center", lineHeight: 24 }}>
                {item.texte}
              </Texte>
            </View>
          </View>
        )}
      />

      <Entree delai={80} style={{ padding: espaces.xl, gap: espaces.xl }}>
        {/* Les points : où l'on est, combien il reste. */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: espaces.sm }}>
          {t.ecrans.map((_, i) => (
            <View key={i} style={{
              width: i === page ? 24 : 8, height: 8, borderRadius: 4,
              backgroundColor: i === page ? couleurs.encre : couleurs.surface3,
            }} />
          ))}
        </View>

        <Pressable
          onPress={suivant}
          style={({ pressed }) => ({
            backgroundColor: pressed ? couleurs.encreDouce : couleurs.encre,
            borderRadius: rayons.bouton, paddingVertical: espaces.md + 2,
            alignItems: "center",
          })}
        >
          <Texte poids="demi" style={{ color: couleurs.surfaceHaute }}>
            {derniere ? t.commencer : t.suivant}
          </Texte>
        </Pressable>
      </Entree>
    </SafeAreaView>
  );
}
