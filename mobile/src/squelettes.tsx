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

import { View } from "react-native";

import { Carte } from "@/ui";
import { Squelette } from "@/animations";
import { RAPPORT_CARTE } from "@/caisse";
import { useEcran } from "@/ecran";
import { espaces } from "@/theme/jetons";

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

/** La carte du solde : le grand chiffre, le numéro, le nom. */
export function SqueletteCaisse() {
  const hauteur = useHauteurCarte();
  return (
    <View style={{ gap: espaces.md }}>
      {/* Les pastilles d'opérateur, au-dessus */}
      <View style={{ flexDirection: "row", gap: espaces.sm, justifyContent: "center" }}>
        {/* 35 points : la hauteur MESURÉE d'une pastille d'opérateur, pas
            une approximation. Trois points d'écart par pastille suffisent à
            décaler tout ce qui suit. */}
        <Squelette largeur={132} hauteur={35} rayon={999} />
        <Squelette largeur={132} hauteur={35} rayon={999} />
      </View>
      {/* La carte elle-même, à la hauteur qu'elle aura vraiment — et avec le
          MÊME coin : `caisse.tsx` calcule son rayon à 8,8 % de sa hauteur,
          la proportion d'une carte bancaire réelle. Une forme d'attente aux
          coins d'interface, là où la vraie carte a des coins de carte, se
          voit au moment de la substitution. */}
      <Squelette largeur="100%" hauteur={hauteur}
                 rayon={Math.round(hauteur * 0.088)} />
      {/* « Relevé sur le réseau à 17:42 » — une ligne de texte, pas un trait. */}
      <View style={{ alignItems: "center" }}>
        <Squelette largeur={168} hauteur={16} />
      </View>
      {/* LES TROIS COMMANDES RONDES — masquer le solde, actualiser, partager
          les coordonnées. Elles manquaient à cette forme, et la page SAUTAIT
          de 72 points au moment où les vrais boutons prenaient leur place :
          mesuré, pas supposé. Un écran qui bouge sous le doigt au moment où
          l'on va appuyer est pire qu'un écran qui attend. */}
      <View style={{ flexDirection: "row", justifyContent: "center",
                     gap: espaces.lg }}>
        {[0, 1, 2].map((i) => (
          <Squelette key={i} largeur={46} hauteur={46} rayon={999} />
        ))}
      </View>
    </View>
  );
}

/** Les quatre gestes, en deux rangées de deux. */
export function SqueletteGestes() {
  return (
    <View style={{ gap: espaces.sm }}>
      {[0, 1].map((r) => (
        <View key={r} style={{ flexDirection: "row", gap: espaces.sm }}>
          <Squelette largeur="100%" hauteur={74} rayon={14} style={{ flex: 1 }} />
          <Squelette largeur="100%" hauteur={74} rayon={14} style={{ flex: 1 }} />
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
