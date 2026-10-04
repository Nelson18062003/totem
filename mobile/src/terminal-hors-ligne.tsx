// LE TERMINAL EST HORS LIGNE — ce que cela veut dire, et quoi faire.
//
// L'accueil disait « Terminal muet » dans une pastille rouge qui menait aux
// Réglages, où l'on lisait… « Terminal muet · il y a 3 min ». Le propriétaire :
// « je ne comprends pas le terminal muet. Comment passer ? » Rien ne disait
// ce que c'est, si les clients pouvaient encore payer, ni quoi faire.
//
// Ce que c'est : le boîtier posé à la boutique, avec les cartes SIM dedans,
// qui lit les SMS et compose les opérations. Il donne des nouvelles chaque
// minute ; quand il se tait plusieurs minutes (courant, Internet, boîtier
// planté), les SMS n'arrivent plus sur le téléphone — mais l'ARGENT, lui,
// arrive toujours chez l'opérateur. C'est la première chose à dire, parce
// que c'est la première question qu'on se pose.
//
// Ce n'est PAS une carte qui capte mal : ça, ce sont les barres de signal
// sur la carte. Ici, c'est tout le boîtier qui ne parle plus.

import { Pressable, View } from "react-native";
import { Feuille } from "@/feuille";
import { Carte, Texte } from "@/ui";
import { Icone } from "@/icones";
import { textesAccueil } from "@noyau/textes/accueil";
import { jourCourt, jourDuReleve } from "@noyau/periodes";
import type { Donnees, EtatTerminal } from "@noyau/types";
import type { Langue } from "@noyau/langue";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";

/** Le boîtier se tait-il ? D'après la plateforme, au moment de sa réponse —
 *  jamais d'après l'horloge du téléphone, qui peut avoir des minutes
 *  d'écart. Des chiffres relus du téléphone n'en disent rien : le bandeau
 *  « Pas de réseau » parle alors à sa place. */
export function boitierSeTait(donnees: Donnees | null, duCahier = false): boolean {
  return Boolean(donnees?.terminal && !donnees.terminal.enLigne && !duCahier);
}

function heureDans(iso: string, fuseau: string, langue: Langue): string {
  return new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: fuseau,
  }).format(new Date(iso));
}

/** « 14:05 », « hier à 14:05 », « le 28 sept. à 14:05 » — ou `null` si la
 *  plateforme n'envoie pas encore l'instant du dernier signe de vie. */
export function depuisQuand(
  terminal: EtatTerminal, maintenant: number, fuseau: string, langue: Langue,
): string | null {
  if (!terminal.vuLe || !Number.isFinite(Date.parse(terminal.vuLe))) return null;
  const t = textesAccueil[langue];
  const h = heureDans(terminal.vuLe, fuseau, langue);
  const jour = jourDuReleve(terminal.vuLe, maintenant, fuseau);
  if (jour?.genre === "hier") return t.horsLigneHier(h);
  if (jour?.genre === "avant") return t.horsLigneLe(jourCourt(jour.cle, langue), h);
  return h;
}

/** L'explication, en feuille : ce qui se passe, l'argent, ce qui ne marche
 *  plus, et ce qu'on fait sur place. */
export function FicheTerminalHorsLigne({ terminal, maintenant, fuseau, langue, onFermer }: {
  terminal: EtatTerminal; maintenant: number; fuseau: string; langue: Langue;
  onFermer: () => void;
}) {
  const t = textesAccueil[langue];
  const depuis = depuisQuand(terminal, maintenant, fuseau, langue);
  return (
    <Feuille
      visible
      libelleFermer={t.horsLigneCompris}
      onFermer={onFermer}
      entete={
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <View style={{ width: 10, height: 10, borderRadius: 5,
                         backgroundColor: couleurs.alerte }} />
          <Texte taille={textes.intertitre} poids="demi" style={{ flex: 1 }}>
            {t.horsLigneTitre}
          </Texte>
        </View>
      }
      pied={
        <Pressable
          accessibilityRole="button"
          onPress={onFermer}
          style={({ pressed }) => ({
            alignItems: "center", paddingVertical: espaces.md,
            borderRadius: rayons.bouton,
            backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
          })}
        >
          <Texte poids="demi" style={{ color: couleurs.surfaceHaute }}>
            {t.horsLigneCompris}
          </Texte>
        </Pressable>
      }
    >
      <View style={{ gap: espaces.md }}>
        <Texte style={{ lineHeight: 22 }}>
          {depuis ? t.horsLigneDepuis(depuis) : t.horsLigneSansHeure}
        </Texte>
        <Carte style={{ padding: espaces.lg, flexDirection: "row", gap: espaces.md }}>
          <Icone nom="Check" taille={18} couleur={couleurs.positif} />
          <Texte taille={textes.petit} style={{ flex: 1, lineHeight: 20 }}>
            {t.horsLigneArgent}
          </Texte>
        </Carte>
        <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>
          {t.horsLigneEnAttendant}
        </Texte>
        <View style={{ gap: espaces.xs }}>
          <Texte taille={textes.legende} ton="pale"
                 style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            {t.horsLigneSurPlace}
          </Texte>
          <Texte taille={textes.petit} style={{ lineHeight: 20 }}>
            {t.horsLigneQuoiFaire}
          </Texte>
        </View>
        <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
          {t.horsLigneFin}
        </Texte>
      </View>
    </Feuille>
  );
}
