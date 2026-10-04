// Les coordonnées d'une carte — le « RIB » de la SIM, version téléphone.
//
// Le pendant de `web/app/coordonnees.tsx`. On y fait trois choses :
//
//   COPIER   le nom et le numéro, d'un appui — pour les coller dans un
//            message. La fiche ne savait que PARTAGER, en se disant que la
//            feuille d'Android porte « Copier » avec : c'était trois gestes
//            au lieu d'un, et la copie emportait une troisième ligne (le
//            réseau) qu'il fallait effacer à chaque fois. « C'est trop
//            long », a dit le propriétaire. Le nom et le numéro ont aussi
//            chacun leur bouton, comme sur le web : le numéro SEUL part en
//            chiffres, prêt à coller dans un champ sans retoucher.
//   PARTAGER le nom, le numéro ET le réseau, par WhatsApp ou par SMS — à
//            quelqu'un qui ne connaît pas encore la carte.
//   LE PDF   le document qu'on imprime ou qu'on joint.
//
// Aucune donnée n'est inventée : le numéro vient de ce que la carte déclare
// ou de ce que le propriétaire a inscrit, le nom de ce qu'il a inscrit dans
// les Réglages. Sans nom, la fiche le dit et mène aux Réglages.

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Share, View } from "react-native";
import { router } from "expo-router";
import { nomDeFichier, partagerDocument } from "@/partage";
import { copierTexte } from "@/presse-papiers";

import { Carte, Filet, Texte, appuiTexte } from "@/ui";
import { Icone } from "@/icones";
import { Feuille } from "@/feuille";
import { LogoOperateur } from "@/logos-operateurs";
import { lienCoordonnees } from "@/api/guichet";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { formaterNumero } from "@noyau/numero";
import {
  ceQueCopierEmporte, numeroACopier, serviceMobileMoney, texteACopier, texteAPartager,
} from "@noyau/coordonnees";
import { textesAccueil } from "@noyau/textes/accueil";
import type { Langue } from "@noyau/langue";

/**
 * Un geste de copie : il dit ce qu'il a fait, puis s'efface. Rend la
 * fonction à appeler et l'état « c'est copié ».
 *
 * « Copié » ne s'affiche pas quand l'appel au presse-papiers échoue (voir
 * `presse-papiers.ts`, et ce qu'il peut — et ne peut pas — savoir). La
 * minuterie s'arrête avec l'écran : la feuille se referme souvent juste
 * après qu'on a copié.
 */
function useCopie(annonce: string): [boolean, (texte: string) => void] {
  const [fait, setFait] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (minuterie.current) clearTimeout(minuterie.current);
  }, []);
  const copier = (texte: string) => {
    if (!copierTexte(texte)) return;
    setFait(true);
    // Une aide vocale ne voit pas l'icône changer : on le lui DIT.
    try { AccessibilityInfo.announceForAccessibility(annonce); } catch { /* rien à dire */ }
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setFait(false), 1800);
  };
  return [fait, copier];
}

export function Coordonnees({ carte, langue, onFermer }: {
  carte: { iccid: string; nom: string; numero: string;
           operateur: string; libelle: string };
  langue: Langue;
  onFermer: () => void;
}) {
  const t = textesAccueil[langue];
  const nom = carte.nom.trim();
  const numero = formaterNumero(carte.numero);
  const reseau = serviceMobileMoney(carte.operateur);

  // COPIER : le nom et le numéro, rien d'autre (voir `@noyau/coordonnees`).
  // Le bouton dit ce qu'il emporte VRAIMENT : sans nom inscrit, il ne copie
  // que le numéro, et l'aide vocale ne doit pas annoncer le nom avec.
  const emporte = ceQueCopierEmporte(nom, carte.numero);
  const libelleCopier = emporte === "nom" ? t.coordCopierNom
    : emporte === "numero" ? t.copierNumero : t.coordCopierNomNumero;
  const [copie, copier] = useCopie(emporte === "nom" ? t.nomCopie
    : emporte === "numero" ? t.numeroCopie : t.coordCopie);

  // PARTAGER : nom, numéro, réseau — chacun sur sa ligne, sans étiquette,
  // prêt à envoyer tel quel à quelqu'un qui ne connaît pas la carte.
  const partager = () => {
    void Share.share({ message: texteAPartager(nom, carte.numero, carte.operateur) })
      .catch(() => { /* feuille refermée sans choisir : rien à rattraper */ });
  };

  // Le PDF — LE MÊME document que le bouton « Télécharger » du web (un seul
  // générateur, lib/pdf-rib). Il part comme un FICHIER, par la feuille de
  // partage du téléphone (voir src/partage.ts) — plus par une page web.
  const [pdf, setPdf] = useState<"repos" | "envoi" | "refus">("repos");
  const ouvrirPdf = async () => {
    if (pdf === "envoi") return;
    setPdf("envoi");
    try {
      const { url } = await lienCoordonnees(carte.iccid);
      await partagerDocument(
        url, nomDeFichier(`Coordonnees-${carte.libelle || carte.numero}`, "pdf"),
        "pdf", t.coordPdf);
      setPdf("repos");
    } catch {
      setPdf("refus");
    }
  };

  return (
    <Feuille
      visible
      libelleFermer={t.coordFermer}
      onFermer={onFermer}
      entete={
        <>
          <Texte taille={textes.legende} ton="pale"
                 style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            {carte.libelle}
          </Texte>
          <Texte taille={textes.intertitre} poids="demi"
                 style={{ marginTop: espaces.xs }}>
            {t.coordonneesTitre}
          </Texte>
        </>
      }
      pied={
        <View style={{ gap: espaces.sm }}>
          {/* COPIER et PARTAGER côte à côte : la feuille ne gagne pas une
              rangée de boutons, et ne mange pas l'écran d'un petit
              téléphone. Copier passe devant — c'est le geste de tous les
              jours. Rien n'est à copier quand la carte n'a ni nom ni
              numéro : le bouton ne s'affiche pas plutôt que de copier du
              vide. */}
          <View style={{ flexDirection: "row", gap: espaces.sm }}>
            {emporte ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copie ? t.coordCopie : libelleCopier}
                onPress={() => copier(texteACopier(nom, carte.numero))}
                style={({ pressed }) => ({
                  flex: 1, flexDirection: "row", alignItems: "center",
                  justifyContent: "center", gap: espaces.sm,
                  paddingVertical: espaces.md, paddingHorizontal: espaces.sm,
                  borderRadius: rayons.bouton,
                  backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
                })}
              >
                <Icone nom={copie ? "Check" : "Copy"} taille={17}
                       couleur={couleurs.surfaceHaute} />
                <Texte poids="demi" taille={textes.petit}
                       style={{ color: couleurs.surfaceHaute, flexShrink: 1,
                                textAlign: "center" }}>
                  {copie ? t.coordCopie : t.coordCopier}
                </Texte>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={partager}
              style={({ pressed }) => ({
                flex: 1, flexDirection: "row", alignItems: "center",
                justifyContent: "center", gap: espaces.sm,
                paddingVertical: espaces.md, paddingHorizontal: espaces.sm,
                borderRadius: rayons.bouton, borderWidth: 1,
                borderColor: couleurs.trait,
                backgroundColor: pressed ? couleurs.surface2 : "transparent",
              })}
            >
              <Icone nom="Partage" taille={16} couleur={couleurs.encreDouce} />
              <Texte poids="moyen" taille={textes.petit} ton="doux"
                     style={{ flexShrink: 1, textAlign: "center" }}>
                {t.coordPartager}
              </Texte>
            </Pressable>
          </View>
          {/* Le PDF, en troisième geste : le document qu'on imprime ou
              qu'on joint — le texte reste le chemin de tous les jours. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => void ouvrirPdf()}
            disabled={pdf === "envoi"}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center",
              gap: espaces.sm, paddingVertical: espaces.md,
              borderRadius: rayons.bouton, borderWidth: 1,
              borderColor: couleurs.trait,
              backgroundColor: pressed ? couleurs.surface2 : "transparent",
              opacity: pdf === "envoi" ? 0.6 : 1,
            })}
          >
            <Icone nom="Doc" taille={16} couleur={couleurs.encreDouce} />
            <Texte poids="moyen" taille={textes.petit} ton="doux"
                   style={{ flexShrink: 1, textAlign: "center" }}>
              {t.coordPdf}
            </Texte>
          </Pressable>
          {pdf === "refus" ? (
            <Texte taille={textes.legende} ton="negatif">
              {t.coordPdfImpossible}
            </Texte>
          ) : null}
        </View>
      }
    >
      <Carte>
        <Rangee libelle={t.coordNom} accessoire={nom ? (
          <BoutonCopier valeur={nom} libelle={t.coordCopierNom}
                        libelleFait={t.nomCopie} />
        ) : null}>
          {/* `selectable` : l'appui long reste un recours, pour ne copier
              qu'un morceau. */}
          {nom ? (
            <Texte poids="demi" selectable>{nom}</Texte>
          ) : (
            // Pas de nom : on le dit, et on mène là où il s'inscrit.
            <Pressable accessibilityRole="button" hitSlop={6} style={appuiTexte}
                       onPress={() => { onFermer(); router.push("/reglages"); }}>
              <Texte taille={textes.petit} ton="pale"
                     style={{ textDecorationLine: "underline" }}>
                {t.coordSansNom}
              </Texte>
            </Pressable>
          )}
        </Rangee>
        <Filet />
        <Rangee libelle={t.coordNumero} accessoire={numero ? (
          // Les chiffres seuls, prêts pour un champ — voir `numeroACopier`.
          <BoutonCopier valeur={numeroACopier(carte.numero)} libelle={t.copierNumero}
                        libelleFait={t.numeroCopie} />
        ) : null}>
          <Texte poids="demi" chiffresAlignes selectable>{numero || "—"}</Texte>
        </Rangee>
        <Filet />
        <Rangee libelle={t.coordReseau} accessoire={
          <LogoOperateur operateur={carte.operateur} taille={26} />
        }>
          <Texte poids="demi">{reseau}</Texte>
        </Rangee>
      </Carte>
      <Texte taille={textes.legende} ton="pale"
             style={{ marginTop: espaces.md, lineHeight: 18 }}>
        {t.coordPied}
      </Texte>
    </Feuille>
  );
}

/** Une ligne de la fiche : l'étiquette au-dessus, la valeur en évidence. */
function Rangee({ libelle, accessoire, children }: {
  libelle: string;
  accessoire?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center",
                   gap: espaces.md, padding: espaces.lg }}>
      <View style={{ flex: 1, minWidth: 0, gap: espaces.xs }}>
        <Texte taille={textes.legende} ton="pale"
               style={{ textTransform: "uppercase", letterSpacing: 1 }}>
          {libelle}
        </Texte>
        {children}
      </View>
      {accessoire}
    </View>
  );
}

/** Copier UNE ligne : le nom seul, ou le numéro seul (en chiffres, pour un
 *  champ). Le même geste que le bouton rond du web, contre la valeur qu'il
 *  emporte. L'icône devient une coche le temps de le dire. */
function BoutonCopier({ valeur, libelle, libelleFait }: {
  valeur: string; libelle: string; libelleFait: string;
}) {
  const [fait, copier] = useCopie(libelleFait);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={fait ? libelleFait : libelle}
      onPress={() => copier(valeur)}
      // Le rond fait 36 points ; le doigt, lui, en trouve 52.
      hitSlop={8}
      style={({ pressed }) => ({
        width: 36, height: 36, borderRadius: rayons.rond,
        alignItems: "center", justifyContent: "center",
        borderWidth: 1, borderColor: fait ? couleurs.positif : couleurs.trait,
        backgroundColor: pressed ? couleurs.surface2 : "transparent",
      })}
    >
      <Icone nom={fait ? "Check" : "Copy"} taille={16}
             couleur={fait ? couleurs.positif : couleurs.encreDouce} />
    </Pressable>
  );
}
