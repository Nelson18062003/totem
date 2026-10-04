// LE CALENDRIER — choisir un jour, ou une période, pour filtrer les SMS.
//
// Dessiné ici, avec les pièces de l'application, et non avec le sélecteur de
// date du système : celui-là est une brique native, qu'une application déjà
// installée n'a pas. Ce calendrier arrive donc par une simple mise à jour à
// distance, sur tous les téléphones à la fois.
//
// UN APPUI, UN JOUR ; UN SECOND APPUI, UNE PÉRIODE. C'est le geste des
// applications de réservation, que tout le monde a déjà fait. Un troisième
// appui recommence. Les jours à venir ne se touchent pas : aucun SMS n'y
// est encore arrivé.
//
// LA GRILLE SE PRÊTE. Le relevé de compte choisit lui aussi deux jours ; il
// vit DÉJÀ dans une feuille, et une feuille ouverte par-dessus une autre se
// perd sur iPhone (une fenêtre qui se présente pendant qu'une autre se
// retire ne s'affiche pas). Il pose donc la grille seule, dans sa propre
// feuille — `GrilleCalendrier` —, et le geste reste le même partout.

import { useState } from "react";
import { Pressable, View } from "react-native";

import { Texte, BoutonIcone } from "@/ui";
import { Feuille } from "@/feuille";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { semainesDuMois, nomDesJours, type Bornes } from "@noyau/periodes";
import { textesSms } from "@noyau/textes/sms";
import type { Langue } from "@noyau/langue";

/** Un choix en cours : un premier jour, puis peut-être le dernier. */
export type ChoixDeJours = { de: string; a: string | null } | null;

/** Un appui sur un jour : le premier, puis le second (dans l'ordre), puis on
 *  recommence. */
export function toucherLeJour(choix: ChoixDeJours, jour: string): ChoixDeJours {
  if (!choix || choix.a !== null) return { de: jour, a: null };
  return jour < choix.de ? { de: jour, a: choix.de } : { de: choix.de, a: jour };
}

/** La période que dessine un choix en cours. */
export const bornesDuChoixDeJours = (choix: ChoixDeJours): Bornes | null =>
  choix ? { de: choix.de, a: choix.a ?? choix.de } : null;

export function Calendrier({ langue, aujourdhui, depart, onChoisir, onFermer }: {
  langue: Langue;
  /** « 2026-10-03 » — le jour de la caisse. */
  aujourdhui: string;
  /** La période déjà choisie, s'il y en a une. */
  depart: Bornes | null;
  onChoisir: (b: Bornes) => void;
  onFermer: () => void;
}) {
  const t = textesSms[langue];
  const [choix, setChoix] = useState<ChoixDeJours>(
    depart ? { de: depart.de, a: depart.a } : null);
  const bornes = bornesDuChoixDeJours(choix);

  return (
    <Feuille
      visible
      libelleFermer={t.fermer}
      onFermer={onFermer}
      entete={
        <>
          <Texte taille={textes.intertitre} poids="demi">{t.calendrierTitre}</Texte>
          <Texte taille={textes.petit} ton="pale" style={{ marginTop: espaces.xs }}>
            {t.calendrierAide}
          </Texte>
        </>
      }
      pied={
        <Pressable
          accessibilityRole="button"
          disabled={!bornes}
          onPress={() => { if (bornes) onChoisir(bornes); }}
          style={({ pressed }) => ({
            alignItems: "center", paddingVertical: espaces.md,
            borderRadius: rayons.bouton,
            backgroundColor: !bornes ? couleurs.surface3
              : pressed ? couleurs.accentAppui : couleurs.accent,
          })}
        >
          <Texte poids="demi" taille={textes.petit} style={{ color: couleurs.surfaceHaute,
                                                            textAlign: "center" }}>
            {bornes ? `${t.calendrierVoir} · ${nomDesJours(bornes, langue)}` : t.calendrierVoir}
          </Texte>
        </Pressable>
      }
    >
      <GrilleCalendrier langue={langue} aujourdhui={aujourdhui} bornes={bornes}
                        onToucher={(jour) => setChoix((c) => toucherLeJour(c, jour))} />
    </Feuille>
  );
}

/** Le mois, ses flèches et ses jours — sans feuille autour. */
export function GrilleCalendrier({ langue, aujourdhui, bornes, onToucher }: {
  langue: Langue;
  aujourdhui: string;
  /** La période à dessiner (le choix en cours). */
  bornes: Bornes | null;
  onToucher: (jour: string) => void;
}) {
  const t = textesSms[langue];
  // Le mois montré : celui du choix en cours, sinon le mois de la caisse.
  const repere = (bornes?.de ?? aujourdhui).slice(0, 7);
  const [mois, setMois] = useState({ a: Number(repere.slice(0, 4)), m: Number(repere.slice(5, 7)) });

  const decaler = (n: number) => setMois(({ a, m }) => {
    const total = a * 12 + (m - 1) + n;
    return { a: Math.floor(total / 12), m: (total % 12) + 1 };
  });
  const moisCourant = `${mois.a}-${String(mois.m).padStart(2, "0")}` >= aujourdhui.slice(0, 7);
  const toucher = onToucher;

  const titreMois = new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(mois.a, mois.m - 1, 1)));
  // Lundi d'abord, en lettres courtes de la langue de l'ÉCRAN.
  const initiales = langue === "en"
    ? ["M", "T", "W", "T", "F", "S", "S"] : ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: espaces.md }}>
        <BoutonIcone nom="Chevron" etiquette={t.moisPrecedent} onPress={() => decaler(-1)}
                     style={{ transform: [{ rotate: "180deg" }] }} />
        <Texte poids="demi" style={{ flex: 1, textAlign: "center", textTransform: "capitalize" }}>
          {titreMois}
        </Texte>
        <BoutonIcone nom="Chevron" etiquette={t.moisSuivant}
                     onPress={() => { if (!moisCourant) decaler(1); }}
                     style={{ opacity: moisCourant ? 0.25 : 1 }} />
      </View>

      <View style={{ flexDirection: "row", marginBottom: espaces.xs }}>
        {initiales.map((l, i) => (
          <Texte key={i} taille={textes.legende} ton="pale"
                 style={{ flex: 1, textAlign: "center" }}>{l}</Texte>
        ))}
      </View>

      <View style={{ gap: 2 }}>
        {semainesDuMois(mois.a, mois.m).map((semaine, s) => (
          <View key={s} style={{ flexDirection: "row" }}>
            {semaine.map((jour, i) => {
              if (!jour) return <View key={i} style={{ flex: 1, height: 44 }} />;
              const futur = jour > aujourdhui;
              const bout = bornes && (jour === bornes.de || jour === bornes.a);
              const dedans = bornes && jour > bornes.de && jour < bornes.a;
              return (
                <Pressable
                  key={jour}
                  disabled={futur}
                  onPress={() => toucher(jour)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: Boolean(bout || dedans), disabled: futur }}
                  accessibilityLabel={nomDesJours({ de: jour, a: jour }, langue)}
                  style={({ pressed }) => ({
                    flex: 1, height: 44, alignItems: "center", justifyContent: "center",
                    borderRadius: bout ? rayons.rond : 0,
                    backgroundColor: bout ? couleurs.accent
                      : dedans ? couleurs.surface2
                      : pressed ? couleurs.surface2 : "transparent",
                  })}
                >
                  <Texte poids={jour === aujourdhui ? "demi" : "normal"}
                         style={{
                           color: bout ? couleurs.surfaceHaute
                             : futur ? couleurs.trait : couleurs.encre,
                           textDecorationLine: jour === aujourdhui && !bout ? "underline" : "none",
                         }}>
                    {Number(jour.slice(8))}
                  </Texte>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
