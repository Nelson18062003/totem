// LES FILTRES D'UNE LISTE : un bouton par critère, une feuille pour choisir.
//
// Ils tenaient en trois rangées de pastilles qui défilaient de côté — un
// écran touffu, sans ordre, que le propriétaire a trouvé illisible. Chaque
// bouton dit maintenant CE qu'il filtre, ou ce qui est choisi ; le choix se
// fait dans une liste, une seule chose à la fois. Les SMS et les Paiements
// filtrent de la même façon : le même geste partout.

import { Pressable, View } from "react-native";

import { Carte, Filet, Texte, avecAppui } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { Feuille } from "@/feuille";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useLangue } from "@/langue";
import { textesSms } from "@noyau/textes/sms";

/** Un bouton de filtre : ce qu'il filtre (« Date »), ou ce qui est choisi
 *  (« Hier ») — rempli de sombre dès qu'il filtre quelque chose, pour qu'on
 *  voie d'un coup d'œil que la liste n'est pas entière. */
export function BoutonFiltre({ libelle, etiquette, actif, icone, onPress }: {
  libelle: string; etiquette: string; actif: boolean; icone: NomIcone; onPress: () => void;
}) {
  const teinte = actif ? couleurs.surfaceHaute : couleurs.encreDouce;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${etiquette} : ${libelle}`}
      onPress={onPress}
      style={avecAppui({
        flexDirection: "row", alignItems: "center", gap: espaces.xs,
        minHeight: 40, paddingLeft: espaces.md, paddingRight: espaces.sm,
        borderRadius: rayons.rond,
        borderWidth: 1, borderColor: actif ? couleurs.accent : couleurs.trait,
        backgroundColor: actif ? couleurs.accent : couleurs.surfaceHaute,
      })}
    >
      <Icone nom={icone} taille={15} couleur={teinte} />
      <Texte taille={textes.petit} poids="moyen" style={{ color: actif ? teinte : couleurs.encre }}>
        {libelle}
      </Texte>
      {/* Le chevron tourné vers le bas : « ça s'ouvre ». */}
      <View style={{ transform: [{ rotate: "90deg" }] }}>
        <Icone nom="Chevron" taille={13} couleur={teinte} />
      </View>
    </Pressable>
  );
}

/** La liste d'un filtre : une option par ligne, une coche sur la choisie. */
export function FeuilleChoix({ titre, options, choisie, onChoisir, onFermer }: {
  titre: string;
  options: { cle: string; libelle: string; icone?: NomIcone }[];
  choisie: string;
  onChoisir: (cle: string) => void;
  onFermer: () => void;
}) {
  const langue = useLangue();
  return (
    <Feuille visible libelleFermer={textesSms[langue].fermer} onFermer={onFermer}
             entete={<Texte taille={textes.intertitre} poids="demi">{titre}</Texte>}>
      <Carte>
        {options.map((o, i) => {
          const elle = o.cle === choisie;
          return (
            <View key={o.cle || "tout"}>
              {i > 0 ? <Filet /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: elle }}
                accessibilityLabel={o.libelle}
                onPress={() => onChoisir(o.cle)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: espaces.md,
                  minHeight: 52, paddingHorizontal: espaces.lg,
                  backgroundColor: pressed ? couleurs.surface2 : "transparent",
                })}
              >
                {o.icone ? <Icone nom={o.icone} taille={18} couleur={couleurs.encreDouce} /> : null}
                <Texte poids={elle ? "demi" : "normal"} style={{ flex: 1 }}>{o.libelle}</Texte>
                {elle ? <Icone nom="Check" taille={18} couleur={couleurs.encre} /> : null}
              </Pressable>
            </View>
          );
        })}
      </Carte>
    </Feuille>
  );
}
