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

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Feuille } from "@/feuille";
import { Carte, Pastille, Texte } from "@/ui";
import { HAUTEUR_ETAT } from "@/mesures-accueil";
import { Icone } from "@/icones";
import { textesAccueil } from "@noyau/textes/accueil";
import { textesReglages } from "@noyau/textes/reglages";
import { contacter } from "@/ajouter-ma-carte";
import { jourCourt, jourDuReleve } from "@noyau/periodes";
import type { Donnees, Sim } from "@noyau/types";
import type { Langue } from "@noyau/langue";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";

/** Le boîtier montré en tête se tait-il ? D'après la plateforme, au moment
 *  de sa réponse — jamais d'après l'horloge du téléphone, qui peut avoir des
 *  minutes d'écart. Des chiffres relus du téléphone n'en disent rien : le
 *  bandeau « Pas de réseau » parle alors à sa place. */
export function boitierSeTait(donnees: Donnees | null, duCahier = false): boolean {
  return Boolean(donnees?.terminal && !donnees.terminal.enLigne && !duCahier);
}

/**
 * CETTE CARTE EST-ELLE EN PAUSE ? — la règle, écrite UNE fois.
 *
 * Seulement si SON boîtier se tait. Le premier jet mettait en pause toute
 * carte de présence « inconnue » : or « inconnue » veut dire aussi « son
 * boîtier vient de revenir et n'a pas encore relu ses puces ». L'accueil
 * affichait alors « Terminal hors ligne » sur un boîtier qui parlait — et,
 * avec deux boîtiers, prenait l'état du mauvais. La plateforme dit
 * maintenant, carte par carte, si le boîtier QUI LA PORTE se tait ; une
 * plateforme pas encore à jour ne le dit pas, et l'on retombe sur le boîtier
 * montré en tête. Rien ne se conclut de chiffres relus du téléphone.
 */
export function carteEnPause(
  donnees: Donnees | null, duCahier: boolean, carte?: Sim | null,
): boolean {
  if (duCahier || !donnees) return false;
  if (carte && typeof carte.boitierMuet === "boolean") return carte.boitierMuet;
  return boitierSeTait(donnees);
}

/** L'instant du silence à montrer : celui du boîtier DE LA CARTE — jamais
 *  celui d'un autre boîtier, qui parle peut-être. `null` : on ne le sait pas,
 *  et la fiche le dit sans heure. */
export function silenceDepuis(
  donnees: Donnees | null, duCahier: boolean, carte?: Sim | null,
): string | null {
  if (!carteEnPause(donnees, duCahier, carte)) return null;
  if (carte && typeof carte.boitierMuet === "boolean") return carte.boitierVuLe ?? null;
  return donnees?.terminal?.vuLe ?? null;
}

function heureDans(iso: string, fuseau: string, langue: Langue): string {
  return new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: fuseau,
  }).format(new Date(iso));
}

/** « 14:05 », « hier à 14:05 », « le 28 sept. à 14:05 » — ou `null`. */
export function depuisQuand(
  vuLe: string | null, maintenant: number, fuseau: string, langue: Langue,
): string | null {
  if (!vuLe || !Number.isFinite(Date.parse(vuLe))) return null;
  const t = textesAccueil[langue];
  const h = heureDans(vuLe, fuseau, langue);
  const jour = jourDuReleve(vuLe, maintenant, fuseau);
  if (jour?.genre === "hier") return t.horsLigneHier(h);
  if (jour?.genre === "avant") return t.horsLigneLe(jourCourt(jour.cle, langue), h);
  return h;
}

/**
 * L'explication, en feuille : ce qui se passe, l'argent, ce qui ne marche
 * plus, ce qu'on fait sur place — et « Revérifier ».
 *
 * La première version promettait « cette alerte disparaît d'elle-même » :
 * rien ne relit sans un geste (pas de pouls, à dessein), et le propriétaire
 * qui venait de rebrancher le boîtier voyait l'alerte rester, et
 * recommençait. « Revérifier » pose la question tout de suite ; si le
 * boîtier est revenu, l'écran qui a ouvert la feuille la referme.
 */
export function FicheTerminalHorsLigne({
  vuLe, maintenant, fuseau, langue, onFermer, onReverifier, chezTotem = false,
}: {
  vuLe: string | null; maintenant: number; fuseau: string; langue: Langue;
  onFermer: () => void;
  onReverifier: () => Promise<void>;
  /** La personne n'est pas le propriétaire de la plateforme : sa carte est,
   *  le plus souvent, dans un boîtier de TOTEM — pas chez elle. On ne lui
   *  demande pas de débrancher un appareil qu'elle n'a pas : TOTEM est
   *  prévenu, et elle peut nous écrire. */
  chezTotem?: boolean;
}) {
  const t = textesAccueil[langue];
  const depuis = depuisQuand(vuLe, maintenant, fuseau, langue);
  const [verif, setVerif] = useState<"repos" | "en_cours" | number>("repos");
  const vivante = useRef(true);
  useEffect(() => () => { vivante.current = false; }, []);
  const reverifier = () => {
    if (verif === "en_cours") return;
    setVerif("en_cours");
    void onReverifier().finally(() => { if (vivante.current) setVerif(Date.now()); });
  };
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
        <View style={{ flexDirection: "row", gap: espaces.sm }}>
          <Pressable
            accessibilityRole="button"
            onPress={reverifier}
            disabled={verif === "en_cours"}
            style={({ pressed }) => ({
              flex: 1, flexDirection: "row", gap: espaces.sm,
              alignItems: "center", justifyContent: "center", paddingVertical: espaces.md,
              borderRadius: rayons.bouton,
              backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
            })}
          >
            {verif === "en_cours"
              ? <ActivityIndicator size="small" color={couleurs.surfaceHaute} />
              : <Icone nom="Refresh" taille={16} couleur={couleurs.surfaceHaute} />}
            <Texte poids="demi" style={{ color: couleurs.surfaceHaute }}>
              {verif === "en_cours" ? t.horsLigneVerification : t.horsLigneReverifier}
            </Texte>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onFermer}
            style={({ pressed }) => ({
              flex: 1, alignItems: "center", justifyContent: "center",
              paddingVertical: espaces.md, borderRadius: rayons.bouton,
              borderWidth: 1, borderColor: couleurs.trait,
              backgroundColor: pressed ? couleurs.surface2 : "transparent",
            })}
          >
            <Texte poids="moyen" ton="doux">{t.horsLigneCompris}</Texte>
          </Pressable>
        </View>
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
            {chezTotem ? t.horsLigneChezTotemTitre : t.horsLigneSurPlace}
          </Texte>
          <Texte taille={textes.petit} style={{ lineHeight: 20 }}>
            {chezTotem ? t.horsLigneChezTotem : t.horsLigneQuoiFaire}
          </Texte>
          {chezTotem ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void contacter()}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: espaces.sm,
                alignSelf: "flex-start", minHeight: 44, opacity: pressed ? 0.6 : 1,
              })}
            >
              <Icone nom="Mail" taille={16} couleur={couleurs.accent} />
              <Texte taille={textes.petit} poids="moyen" style={{ color: couleurs.accent }}>
                {textesReglages[langue].ecrireATotem}
              </Texte>
            </Pressable>
          ) : null}
        </View>
        {/* Une hauteur réservée : la ligne « toujours hors ligne » vient s'y
            poser sans pousser les boutons sous le doigt. */}
        <Texte taille={textes.legende} ton={typeof verif === "number" ? "alerte" : "pale"}
               style={{ lineHeight: 18, minHeight: 36 }}>
          {typeof verif === "number"
            ? t.horsLigneToujours(heureDans(new Date(verif).toISOString(), fuseau, langue))
            : chezTotem ? t.horsLigneChezTotemFin : t.horsLigneFin}
        </Texte>
      </View>
    </Feuille>
  );
}

/** « Terminal hors ligne › » — d'une ligne, à hauteur fixe : elle prend la
 *  place d'« Actualiser » sur l'accueil, et se pose dans la rangée du titre
 *  d'Opérations, sans jamais rien pousser sous le doigt. */
export function PastilleHorsLigne({ langue, onPress }: { langue: Langue; onPress: () => void }) {
  const t = textesAccueil[langue];
  return (
    <Pressable onPress={onPress}
               accessibilityRole="button"
               accessibilityLabel={t.horsLigneTitre}
               hitSlop={{ top: 6, bottom: 6 }}
               style={({ pressed }) => ({
                 height: HAUTEUR_ETAT, flexDirection: "row", alignItems: "center",
                 gap: espaces.xs + 2, paddingHorizontal: espaces.md,
                 borderRadius: rayons.bouton, borderWidth: 1, borderColor: couleurs.alerte,
                 backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
               })}>
      <Pastille couleur={couleurs.alerte} />
      <Texte taille={textes.petit} poids="moyen" ton="alerte" numberOfLines={1}>
        {t.terminalMuetCourt}
      </Texte>
      <Icone nom="Chevron" taille={12} couleur={couleurs.alerte} />
    </Pressable>
  );
}
