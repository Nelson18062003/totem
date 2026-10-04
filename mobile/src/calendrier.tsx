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

import { useState } from "react";
import { Pressable, View } from "react-native";

import { Texte, BoutonIcone } from "@/ui";
import { Feuille } from "@/feuille";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { semainesDuMois, nomDesJours, type Bornes } from "@noyau/periodes";
import { textesSms } from "@noyau/textes/sms";
import type { Langue } from "@noyau/langue";

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
  const [choix, setChoix] = useState<{ de: string; a: string | null } | null>(
    depart ? { de: depart.de, a: depart.a } : null);
  // Le mois montré : celui du choix en cours, sinon le mois de la caisse.
  const repere = (choix?.de ?? aujourdhui).slice(0, 7);
  const [mois, setMois] = useState({ a: Number(repere.slice(0, 4)), m: Number(repere.slice(5, 7)) });

  const decaler = (n: number) => setMois(({ a, m }) => {
    const total = a * 12 + (m - 1) + n;
    return { a: Math.floor(total / 12), m: (total % 12) + 1 };
  });
  const moisCourant = `${mois.a}-${String(mois.m).padStart(2, "0")}` >= aujourdhui.slice(0, 7);

  const toucher = (jour: string) => {
    if (!choix || choix.a !== null) setChoix({ de: jour, a: null });
    else setChoix(jour < choix.de ? { de: jour, a: choix.de } : { de: choix.de, a: jour });
  };
  const bornes: Bornes | null = choix ? { de: choix.de, a: choix.a ?? choix.de } : null;

  const titreMois = new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(mois.a, mois.m - 1, 1)));
  // Lundi d'abord, en lettres courtes de la langue de l'ÉCRAN.
  const initiales = langue === "en"
    ? ["M", "T", "W", "T", "F", "S", "S"] : ["L", "M", "M", "J", "V", "S", "D"];

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
    </Feuille>
  );
}
