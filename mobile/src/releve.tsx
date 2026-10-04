// LE RELEVÉ DE COMPTE, côté téléphone — choisir la carte, la période, le
// format, et recevoir le FICHIER.
//
// Le propriétaire : « télécharger toutes les transactions sur une période
// choisie librement, bien organisé, comme un relevé bancaire ». Le document
// lui-même se fabrique sur la plateforme (`/api/releve`, un seul générateur
// pour le site et le téléphone) ; ici, on le DEMANDE : un lien signé de dix
// minutes, téléchargé puis remis à la feuille de partage du téléphone
// (`partage.ts`) — WhatsApp, courriel, Drive reçoivent le PDF ou le CSV,
// jamais un lien qui expire.
//
// TROIS PÉRIODES TOUTES FAITES, ET LE CALENDRIER. « Ce mois », « Mois
// dernier », « 3 derniers mois » couvrent ce qu'on demande d'habitude ; le
// reste se choisit jour à jour, avec la grille du filtre des SMS
// (`GrilleCalendrier`) — le même geste partout. La période retenue s'écrit
// EN TOUTES LETTRES sous les choix (« du 1er août 2026 au 4 octobre 2026 ») :
// on sait ce qu'on va recevoir avant d'appuyer.
//
// UN APPUI, UN DOCUMENT : le geste passe par `useGesteUnique`. Deux appuis
// rapprochés sur un réseau lent ouvraient sinon deux feuilles de partage.

import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { Texte } from "@/ui";
import { Icone } from "@/icones";
import { Feuille } from "@/feuille";
import { GrilleCalendrier, bornesDuChoixDeJours, toucherLeJour, type ChoixDeJours } from "@/calendrier";
import { useGesteUnique } from "@/geste";
import { lienReleve } from "@/api/guichet";
import { partagerDocument } from "@/partage";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { formaterNumero } from "@noyau/numero";
import { bornesDuChoix, nomDuReleve, periodeEnLettres, type ChoixPeriode } from "@noyau/releve";
import { textesReleve } from "@noyau/textes/releve";
import { textesSms } from "@noyau/textes/sms";
import { jourLocal, FUSEAU_DEFAUT } from "@noyau/types";
import type { Langue } from "@noyau/langue";

/** Une carte, telle que le relevé la nomme : par son NUMÉRO. */
export type CarteAReleve = { iccid: string; numero: string; libelle: string; operateur: string };

/** Le nom d'une carte dans un choix : son numéro en tranches, sinon son
 *  libellé — quel que soit le réseau. */
const nomDeCarte = (c: CarteAReleve) => formaterNumero(c.numero) || c.libelle;

/** Une rangée de choix, un seul retenu. */
function Choix<T extends string>({ options, valeur, onChoisir }: {
  options: { cle: T; libelle: string }[];
  valeur: T;
  onChoisir: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
      {options.map((o) => {
        const choisi = o.cle === valeur;
        return (
          <Pressable
            key={o.cle}
            accessibilityRole="button"
            accessibilityState={{ selected: choisi }}
            onPress={() => onChoisir(o.cle)}
            style={({ pressed }) => ({
              paddingVertical: espaces.sm, paddingHorizontal: espaces.md,
              borderRadius: rayons.rond, borderWidth: 1,
              borderColor: choisi ? couleurs.encre : couleurs.trait,
              backgroundColor: choisi ? couleurs.encre
                : pressed ? couleurs.surface2 : "transparent",
            })}
          >
            <Texte taille={textes.petit} poids={choisi ? "demi" : "moyen"}
                   style={{ color: choisi ? couleurs.surfaceHaute : couleurs.encre }}>
              {o.libelle}
            </Texte>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Le corps du relevé : les choix, la période en toutes lettres, le bouton.
 * Sans feuille autour — la fiche des coordonnées le pose DANS la sienne
 * (une feuille sur une feuille se perd sur iPhone), l'Analyse dans
 * `FeuilleReleve`.
 */
export function ReleveCorps({ langue, cartes, fuseau = FUSEAU_DEFAUT }: {
  langue: Langue;
  /** Une seule : le relevé de CETTE carte. Plusieurs : on choisit, « toutes »
   *  compris. */
  cartes: CarteAReleve[];
  fuseau?: string;
}) {
  const t = textesReleve[langue];
  // Le jour de la CAISSE, pas celui du téléphone : c'est elle qui range
  // chaque SMS dans son jour.
  const aujourdhui = jourLocal(new Date(), fuseau);
  const [carte, setCarte] = useState<string>(cartes.length === 1 ? cartes[0].iccid : "tout");
  const [periode, setPeriode] = useState<ChoixPeriode | "dates">("mois");
  const [jours, setJours] = useState<ChoixDeJours>(null);
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [refus, setRefus] = useState(false);
  const geste = useGesteUnique();

  // L'écran est-il encore là ? Un téléchargement lent ne doit pas ouvrir la
  // feuille de partage par-dessus un écran qu'on a quitté.
  const monte = useRef(true);
  useEffect(() => () => { monte.current = false; }, []);

  const bornes = periode === "dates" ? bornesDuChoixDeJours(jours)
    : bornesDuChoix(periode, aujourdhui);
  const choisie = cartes.find((c) => c.iccid === carte) ?? null;

  const telecharger = () => void geste.lancer(async () => {
    if (!bornes) return false;
    setRefus(false);
    try {
      const { url } = await lienReleve(carte, bornes.de, bornes.a, format);
      const qui = choisie ? choisie.numero || choisie.libelle : "TOTEM";
      await partagerDocument(url, nomDuReleve(qui, bornes, format), format, t.titre,
                             () => monte.current);
      return true;
    } catch {
      if (monte.current) setRefus(true);
      return false;
    }
  });

  return (
    <View style={{ gap: espaces.md }}>
      <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>{t.explication}</Texte>

      {cartes.length > 1 ? (
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.legende} ton="pale"
                 style={{ textTransform: "uppercase", letterSpacing: 1 }}>{t.carte}</Texte>
          <Choix
            valeur={carte}
            onChoisir={setCarte}
            options={[{ cle: "tout", libelle: t.toutesLesCartes },
                      ...cartes.map((c) => ({ cle: c.iccid, libelle: nomDeCarte(c) }))]}
          />
        </View>
      ) : null}

      <View style={{ gap: espaces.sm }}>
        <Texte taille={textes.legende} ton="pale"
               style={{ textTransform: "uppercase", letterSpacing: 1 }}>{t.periode}</Texte>
        <Choix
          valeur={periode}
          onChoisir={setPeriode}
          options={[
            { cle: "mois", libelle: t.ceMois },
            { cle: "moisDernier", libelle: t.moisDernier },
            { cle: "troisMois", libelle: t.troisMois },
            { cle: "dates", libelle: t.choisirDates },
          ]}
        />
        {periode === "dates" ? (
          <View style={{ gap: espaces.sm, marginTop: espaces.xs }}>
            <Texte taille={textes.legende} ton="pale">{t.touchezDeuxJours}</Texte>
            <GrilleCalendrier langue={langue} aujourdhui={aujourdhui} bornes={bornes}
                              onToucher={(jour) => setJours((c) => toucherLeJour(c, jour))} />
          </View>
        ) : null}
        {/* La période retenue, en toutes lettres : on sait ce qu'on va
            recevoir AVANT d'appuyer. */}
        {bornes ? (
          <Texte poids="demi" taille={textes.petit}>{periodeEnLettres(bornes, langue)}</Texte>
        ) : null}
      </View>

      <View style={{ gap: espaces.sm }}>
        <Texte taille={textes.legende} ton="pale"
               style={{ textTransform: "uppercase", letterSpacing: 1 }}>{t.format}</Texte>
        <Choix valeur={format} onChoisir={setFormat}
               options={[{ cle: "pdf", libelle: t.pdf }, { cle: "csv", libelle: t.csv }]} />
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!bornes || geste.occupe}
        onPress={telecharger}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", justifyContent: "center",
          gap: espaces.sm, paddingVertical: espaces.md, paddingHorizontal: espaces.md,
          borderRadius: rayons.bouton,
          backgroundColor: !bornes ? couleurs.surface3
            : pressed ? couleurs.accentAppui : couleurs.accent,
          opacity: geste.occupe ? 0.7 : 1,
        })}
      >
        <Icone nom="Doc" taille={16} couleur={couleurs.surfaceHaute} />
        <Texte poids="demi" taille={textes.petit}
               style={{ color: couleurs.surfaceHaute, flexShrink: 1, textAlign: "center" }}>
          {geste.occupe ? t.enCours : t.telecharger}
        </Texte>
      </Pressable>
      {refus ? <Texte taille={textes.legende} ton="negatif">{t.impossible}</Texte> : null}
    </View>
  );
}

/** Le relevé dans sa propre feuille — pour l'Analyse. */
export function FeuilleReleve({ langue, cartes, fuseau, onFermer }: {
  langue: Langue;
  cartes: CarteAReleve[];
  fuseau?: string;
  onFermer: () => void;
}) {
  const t = textesReleve[langue];
  return (
    <Feuille
      visible
      libelleFermer={textesSms[langue].fermer}
      onFermer={onFermer}
      entete={
        <Texte taille={textes.intertitre} poids="demi">{t.titre}</Texte>
      }
    >
      <ReleveCorps langue={langue} cartes={cartes} fuseau={fuseau} />
    </Feuille>
  );
}
