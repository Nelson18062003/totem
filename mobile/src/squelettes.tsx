// LES FORMES D'ATTENTE — ce que chaque écran montre avant ses chiffres.
//
// Elles imitent la MISE EN PAGE réelle, pas un chargeur générique. C'est
// toute la différence : une roue qui tourne dit « attends » ; une forme à la
// bonne place dit « attends, et voilà où ça va se poser ». L'œil a déjà
// commencé à lire l'écran quand les chiffres arrivent.
//
// Elles ne remplacent pas le message de panne : quand le réseau tombe,
// l'écran le DIT (voir `verifier-les-ecrans`). Une forme d'attente qui
// resterait indéfiniment serait un mensonge de plus.

import { View, useWindowDimensions } from "react-native";

import { Carte } from "@/ui";
import { Squelette } from "@/animations";
import { RAPPORT_CARTE } from "@/caisse";
import { useEcran } from "@/ecran";
import { espaces, rayons } from "@/theme/jetons";
import {
  ECART_PUCES, ECART_ROND, HAUTEUR_DEMI, HAUTEUR_ETAT, HAUTEUR_PUCE, HAUTEUR_TUILE,
  HAUTEUR_TUILE_COLONNE, NOM_ROND, ROND, tuilesEnColonne,
} from "@/mesures-accueil";

/** La hauteur qu'occupera la VRAIE carte, calculée comme elle la calcule.
 *
 *  Un nombre écrit à la main marcherait sur un téléphone et sauterait sur
 *  tous les autres : `caisse.tsx` déduit sa hauteur de la largeur disponible
 *  et du rapport d'une carte bancaire réelle (ISO 7810). La forme d'attente
 *  emprunte la même formule — rien ne bouge au moment où l'une remplace
 *  l'autre. */
function useHauteurCarte(): number {
  const ecran = useEcran();
  return Math.round(Math.min(ecran.largeurContenu, 420) / RAPPORT_CARTE);
}

/** Le bloc de la carte : les puces (s'il y a plusieurs cartes), la carte,
 *  et la ligne de l'âge du solde — aux MÊMES mesures que l'accueil
 *  (`mesures-accueil.ts`). Rien ne doit bouger au moment où le vrai bloc
 *  prend sa place : l'écran qui saute sous le doigt est pire que l'écran
 *  qui attend (`verifier-l-attente`). */
export function SqueletteCaisse({ puces = true }: { puces?: boolean }) {
  const hauteur = useHauteurCarte();
  return (
    <View>
      {/* Les puces : la seule partie dont la hauteur dépend des données. Un
          propriétaire à une carte n'en a pas — l'accueil retient combien il
          y en avait, et la forme le suit. */}
      {puces ? (
        <View style={{ flexDirection: "row", gap: ECART_PUCES, height: HAUTEUR_PUCE,
                       marginBottom: espaces.md }}>
          <Squelette largeur={82} hauteur={HAUTEUR_PUCE} rayon={rayons.bouton} />
          <Squelette largeur={70} hauteur={HAUTEUR_PUCE} rayon={rayons.bouton} />
        </View>
      ) : null}
      {/* La carte elle-même, à la hauteur qu'elle aura vraiment — et avec le
          MÊME coin : `caisse.tsx` calcule son rayon à 8,8 % de sa hauteur,
          la proportion d'une carte bancaire réelle. */}
      <Squelette largeur="100%" hauteur={hauteur}
                 rayon={Math.round(hauteur * 0.088)} />
      {/* « Solde relevé à 21:54 » et « Actualiser ». */}
      <View style={{ marginTop: espaces.sm, minHeight: HAUTEUR_ETAT, flexDirection: "row",
                     alignItems: "center", justifyContent: "space-between",
                     paddingHorizontal: espaces.xs }}>
        <Squelette largeur={150} hauteur={12} rayon={4} />
        <Squelette largeur={100} hauteur={HAUTEUR_ETAT} rayon={rayons.bouton} />
      </View>
    </View>
  );
}

/** Les ronds d'action sous la carte : le cercle, et la place de son nom. */
export function SqueletteRonds() {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center",
                   width: "100%", maxWidth: 460, alignSelf: "center" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ width: "20%", alignItems: "center", gap: ECART_ROND }}>
          <Squelette largeur={ROND} hauteur={ROND} rayon={999} />
          <View style={{ height: NOM_ROND, alignItems: "center", paddingTop: 2 }}>
            <Squelette largeur={44} hauteur={11} rayon={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Une liste de SMS : l'icône, deux lignes de texte, le montant. */
export function SqueletteListe({ lignes = 4 }: { lignes?: number }) {
  return (
    <Carte>
      {Array.from({ length: lignes }, (_, i) => (
        <View key={i} style={{
          flexDirection: "row", alignItems: "center", gap: espaces.md,
          padding: espaces.lg,
          // Le filet entre les lignes, comme dans la vraie liste.
          borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#ececec",
        }}>
          <Squelette largeur={34} hauteur={34} rayon={10} />
          <View style={{ flex: 1, gap: 7 }}>
            {/* Des largeurs INÉGALES : quatre barres identiques font une
                grille, pas une liste. L'œil reconnaît des noms. */}
            <Squelette largeur={`${62 - i * 7}%`} hauteur={13} />
            <Squelette largeur={`${38 - i * 4}%`} hauteur={10} />
          </View>
          <Squelette largeur={76} hauteur={13} />
        </View>
      ))}
    </Carte>
  );
}

/** Les cartes SIM : une vignette par carte. */
export function SqueletteCartes({ combien = 2 }: { combien?: number }) {
  return (
    <View style={{ gap: espaces.md }}>
      {Array.from({ length: combien }, (_, i) => (
        <Squelette key={i} largeur="100%" hauteur={132}
                   rayon={Math.round(132 * 0.088)} />
      ))}
    </View>
  );
}

/** L'analyse : les deux totaux, le graphe, les clients. */
export function SqueletteAnalyse() {
  return (
    <View style={{ gap: espaces.xl }}>
      <Squelette largeur="100%" hauteur={96} rayon={8} />
      <View style={{ gap: espaces.sm }}>
        <Squelette largeur={148} hauteur={15} />
        {/* Le graphe : sept barres, de hauteurs inégales. Sept barres égales
            ne ressemblent à rien qu'on ait déjà vu. */}
        <View style={{ flexDirection: "row", alignItems: "flex-end",
                       justifyContent: "space-between", height: 160,
                       gap: espaces.sm }}>
          {[54, 96, 38, 132, 78, 118, 62].map((h, i) => (
            <Squelette key={i} largeur="100%" hauteur={h} rayon={4}
                       style={{ flex: 1 }} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** Combien de formes montre l'onglet Opérations à froid — le nombre des
 *  composants ci-dessous, que `verifier-l-attente` peut exiger. */
export const FORMES_OPERATIONS = 9;

/**
 * L'ONGLET OPÉRATIONS, À FROID : la carte, les trois gestes, « Consulter »,
 * « Outils » — à leur place et à leur hauteur. Il ne sert que si l'on ouvre
 * Opérations AVANT que l'accueil ait rempli le cahier (une notification qui
 * y mène, par exemple) ; l'écran rendait alors… rien, un blanc.
 */
export function SqueletteOperations() {
  const { width, fontScale } = useWindowDimensions();
  const colonne = tuilesEnColonne(width, fontScale);
  return (
    <View style={{ gap: espaces.lg }}>
      <View style={{ gap: espaces.sm }}>
        {/* « Depuis la carte » : sa ligne, sans forme — un mot se devine. */}
        <View style={{ height: 17 }} />
        <Squelette largeur={96} hauteur={HAUTEUR_PUCE} rayon={rayons.bouton} />
      </View>
      <View style={{ flexDirection: colonne ? "column" : "row", gap: espaces.sm }}>
        {[0, 1, 2].map((i) => (
          <Squelette key={i} largeur={colonne ? "100%" : 0}
                     hauteur={colonne ? HAUTEUR_TUILE_COLONNE : HAUTEUR_TUILE}
                     rayon={rayons.bouton} style={colonne ? undefined : { flex: 1 }} />
        ))}
      </View>
      <View style={{ gap: espaces.sm }}>
        <View style={{ height: 24 }} />
        <View style={{ flexDirection: colonne ? "column" : "row", gap: espaces.sm }}>
          {[0, 1].map((i) => (
            <Squelette key={i} largeur={colonne ? "100%" : 0} hauteur={HAUTEUR_DEMI}
                       rayon={rayons.bouton} style={colonne ? undefined : { flex: 1 }} />
          ))}
        </View>
      </View>
      <View style={{ gap: espaces.sm }}>
        <View style={{ height: 24 }} />
        <Carte>
          {[58, 44, 36].map((l, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: espaces.md,
                                   paddingHorizontal: espaces.lg, height: 50,
                                   borderTopWidth: i === 0 ? 0 : 1,
                                   borderTopColor: "#ececec" }}>
              <View style={{ width: 18 }} />
              <Squelette largeur={`${l}%`} hauteur={16} />
            </View>
          ))}
        </Carte>
      </View>
    </View>
  );
}
