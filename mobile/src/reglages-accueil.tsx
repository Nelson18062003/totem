// RÉGLAGES → BOUTONS DE L'ACCUEIL : lesquels, et dans quel ordre.
//
// Une case par bouton, et pour ceux qui sont cochés, « monter » et
// « descendre ». Pas de glisser-déposer : il ne se fait pas à la voix, et il
// se rate d'un doigt qui tremble. Cinq au plus — la rangée tient cinq ronds
// sur une ligne —, un au moins. La règle est dans le noyau (`ronds.ts`) ;
// cet écran ne fait que la montrer.
//
// Visible de TOUS les comptes : le choix vit sur ce téléphone et n'ouvre
// aucun droit. Un rond dont la carte n'a pas de code ne s'affichera pas sur
// l'accueil, coché ou non — c'est l'accueil qui en décide, pas cette liste.

import { Pressable, View } from "react-native";
import { BoutonIcone, Carte, Filet, Texte } from "@/ui";
import { Icone } from "@/icones";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { choisirRonds, descriptionDesRonds, useRonds } from "@/ronds-accueil";
import {
  basculerRond, deplacerRond, RONDS, RONDS_MAX, RONDS_PAR_DEFAUT,
} from "@noyau/ronds";
import { textesReglages } from "@noyau/textes/reglages";

export function SectionAccueil({ langue }: { langue: "en" | "fr" }) {
  const t = textesReglages[langue];
  const choix = useRonds();
  const d = descriptionDesRonds(langue);
  const plein = choix.length >= RONDS_MAX;
  // Les cochés d'abord, dans leur ordre ; puis les autres, dans l'ordre du
  // catalogue — la liste se lit comme l'accueil qu'elle compose.
  const liste = [...choix, ...RONDS.filter((r) => !choix.includes(r))];
  const origine = choix.length === RONDS_PAR_DEFAUT.length
    && choix.every((r, i) => r === RONDS_PAR_DEFAUT[i]);

  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi" accessibilityRole="header">
        {t.accueilTitre}
      </Texte>
      <Carte>
        {liste.map((r, i) => {
          const place = choix.indexOf(r);
          const coche = place >= 0;
          // Cocher un sixième ne fait rien : on le dit, au lieu de laisser
          // une case qui ne répond pas.
          const bloque = !coche && plein;
          const dernierCoche = coche && choix.length === 1;
          return (
            <View key={r}>
              {i > 0 ? <Filet /> : null}
              <View style={{ flexDirection: "row", alignItems: "center",
                             paddingRight: espaces.sm }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: coche, disabled: bloque || dernierCoche }}
                  accessibilityLabel={d[r].libelle}
                  accessibilityHint={bloque ? t.accueilPlein(RONDS_MAX) : d[r].aide}
                  onPress={() => choisirRonds(basculerRond(choix, r))}
                  style={({ pressed }) => ({
                    flex: 1, flexDirection: "row", alignItems: "center", gap: espaces.md,
                    paddingVertical: espaces.md, paddingLeft: espaces.lg,
                    backgroundColor: pressed ? couleurs.surface2 : "transparent",
                    opacity: bloque ? 0.45 : 1,
                  })}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: rayons.petit,
                    borderWidth: coche ? 0 : 1.5, borderColor: couleurs.trait,
                    backgroundColor: coche ? couleurs.encre : "transparent",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {coche ? <Icone nom="Check" taille={14} couleur={couleurs.surface} /> : null}
                  </View>
                  <Icone nom={d[r].icone} taille={18} couleur={couleurs.encreDouce} />
                  <View style={{ flex: 1 }}>
                    <Texte poids={coche ? "demi" : "normal"}>{d[r].libelle}</Texte>
                    {coche ? (
                      <Texte taille={textes.legende} ton="pale">{t.accueilChoisi(place + 1)}</Texte>
                    ) : null}
                  </View>
                </Pressable>
                {coche ? (
                  <View style={{ flexDirection: "row" }}>
                    <BoutonIcone nom="ArrowUp" taille={18} etiquette={t.accueilMonter(d[r].libelle)}
                                 disabled={place === 0}
                                 style={{ padding: espaces.sm, opacity: place === 0 ? 0.3 : 1 }}
                                 onPress={() => choisirRonds(deplacerRond(choix, r, -1))} />
                    <BoutonIcone nom="ArrowDown" taille={18}
                                 etiquette={t.accueilDescendre(d[r].libelle)}
                                 disabled={place === choix.length - 1}
                                 style={{ padding: espaces.sm,
                                          opacity: place === choix.length - 1 ? 0.3 : 1 }}
                                 onPress={() => choisirRonds(deplacerRond(choix, r, 1))} />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </Carte>
      <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
        {plein ? t.accueilPlein(RONDS_MAX) : t.accueilNote(RONDS_MAX)}
      </Texte>
      {origine ? null : (
        <Pressable accessibilityRole="button" onPress={() => choisirRonds([...RONDS_PAR_DEFAUT])}
                   style={({ pressed }) => ({ alignSelf: "flex-start", paddingVertical: espaces.xs,
                                              opacity: pressed ? 0.6 : 1 })}>
          <Texte taille={textes.petit} ton="doux" style={{ textDecorationLine: "underline" }}>
            {t.accueilRetablir}
          </Texte>
        </Pressable>
      )}
    </View>
  );
}
