// UNE CARTE SANS SERVICE — le dire, et dire ce que ça change.
//
// « Check balance » répondait « no network service » pendant que la carte
// montrait ses barres : la force du signal mesure l'antenne, pas
// l'inscription. Le boîtier lit maintenant l'inscription de chaque carte
// (noyau/service.ts) ; ici, l'écran le DIT — à la place d'« Actualiser », qui
// composerait une demande qui ne peut pas passer — et l'appui explique : ce
// que c'est, ce que devient l'argent (il arrive quand même chez l'opérateur),
// et quoi faire.
//
// Le boîtier avant la carte : quand le boîtier se tait, c'est lui qu'on
// signale (`PastilleHorsLigne`) — une alarme par écran.

import { Pressable, View } from "react-native";
import { Feuille } from "@/feuille";
import { Carte, Pastille, Texte } from "@/ui";
import { HAUTEUR_ETAT } from "@/mesures-accueil";
import { Icone } from "@/icones";
import { depuisQuand } from "@/terminal-hors-ligne";
import { carteSansService } from "@noyau/service";
import { textesService } from "@noyau/textes/service";
import type { Sim } from "@noyau/types";
import type { Langue } from "@noyau/langue";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";

/** Ce que la pastille dit : l'état sans service, ou « Réseau instable »
 *  pour une carte revenue qui se coupe souvent. */
export function nomDuService(carte: Sim, langue: Langue): string {
  const t = textesService[langue];
  return carteSansService(carte) && carte.service ? t.etiquette[carte.service.etat] : t.instable;
}

export function PastilleSansService({ carte, langue, onPress }: {
  carte: Sim; langue: Langue; onPress: () => void;
}) {
  const grave = carteSansService(carte);
  const ton = grave ? couleurs.alerte : couleurs.encreDouce;
  return (
    <Pressable onPress={onPress}
               accessibilityRole="button"
               accessibilityLabel={nomDuService(carte, langue)}
               hitSlop={{ top: 6, bottom: 6 }}
               style={({ pressed }) => ({
                 height: HAUTEUR_ETAT, flexDirection: "row", alignItems: "center",
                 gap: espaces.xs + 2, paddingHorizontal: espaces.md,
                 borderRadius: rayons.bouton, borderWidth: 1, borderColor: ton,
                 backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
               })}>
      <Pastille couleur={ton} />
      <Texte taille={textes.petit} poids="moyen" numberOfLines={1} style={{ color: ton }}>
        {nomDuService(carte, langue)}
      </Texte>
      <Icone nom="Chevron" taille={12} couleur={ton} />
    </Pressable>
  );
}

export function FicheSansService({ carte, maintenant, fuseau, langue, onFermer, chezTotem = false }: {
  carte: Sim; maintenant: number; fuseau: string; langue: Langue;
  onFermer: () => void;
  /** La carte est dans un boîtier de TOTEM, pas chez la personne : on ne
   *  lui demande pas de visser une antenne qu'elle n'a pas. */
  chezTotem?: boolean;
}) {
  const t = textesService[langue];
  const s = carte.service;
  if (!s) return null;
  const grave = carteSansService(carte);
  const depuis = grave ? depuisQuand(s.depuisLe, maintenant, fuseau, langue) : null;
  const lignes: string[] = grave
    ? [t.explication[s.etat], t.argent(carte.operateur), t.reconnexion, chezTotem ? t.chezTotem : t.surPlace]
    : [t.instableDetail(s.coupures24h, t.duree(s.sansService24hS)), chezTotem ? t.chezTotem : t.surPlace];
  return (
    <Feuille
      visible
      libelleFermer={t.fermer}
      onFermer={onFermer}
      entete={
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5,
                           backgroundColor: grave ? couleurs.alerte : couleurs.encreDouce }} />
            <Texte taille={textes.intertitre} poids="demi" style={{ flex: 1 }}>
              {t.titre[grave ? s.etat : "inscrite"]}
            </Texte>
          </View>
          <Texte taille={textes.petit} ton="doux">
            {carte.libelle}{depuis ? ` · ${t.depuis(depuis)}` : ""}
          </Texte>
        </View>
      }
    >
      <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
        {lignes.map((l, i) => (
          <Texte key={i} taille={textes.petit} ton={i === 0 ? undefined : "doux"}
                 poids={i === 0 ? "moyen" : undefined}>
            {l}
          </Texte>
        ))}
        {grave && s.coupures24h > 1 ? (
          <Texte taille={textes.legende} ton="pale">
            {t.coupures(s.coupures24h, t.duree(s.sansService24hS))}
          </Texte>
        ) : null}
        {s.fige ? <Texte taille={textes.legende} ton="pale">{t.fige}</Texte> : null}
      </Carte>
    </Feuille>
  );
}
