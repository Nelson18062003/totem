// Les coordonnées d'une carte — le « RIB » de la SIM, version téléphone.
//
// Le pendant de `web/app/coordonnees.tsx`, au geste près : sur le web on
// COPIE (pour coller dans un message), sur le téléphone on PARTAGE — la
// feuille d'Android porte WhatsApp, les SMS, et « Copier » avec. Un seul
// bouton couvre donc tous les chemins, et c'est celui que la main connaît.
//
// Aucune donnée n'est inventée : le numéro vient de ce que la carte déclare
// ou de ce que le propriétaire a inscrit, le nom de ce qu'il a inscrit dans
// les Réglages. Sans nom, la fiche le dit et mène aux Réglages.

import { Pressable, Share, View } from "react-native";
import { router } from "expo-router";

import { Carte, Filet, Texte } from "@/ui";
import { Icone } from "@/icones";
import { Feuille } from "@/feuille";
import { LogoOperateur } from "@/logos-operateurs";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { formaterNumero } from "@noyau/numero";
import { textesAccueil } from "@noyau/textes/accueil";
import type { Langue } from "@noyau/langue";

/** Le nom commercial du service — ce qu'on écrit sur la ligne « réseau ». */
function service(operateur: string): string {
  if (operateur === "MTN") return "MTN Mobile Money";
  if (operateur === "Orange") return "Orange Money";
  return operateur || "Mobile Money";
}

export function Coordonnees({ carte, langue, onFermer }: {
  carte: { nom: string; numero: string; operateur: string; libelle: string };
  langue: Langue;
  onFermer: () => void;
}) {
  const t = textesAccueil[langue];
  const nom = carte.nom.trim();
  const numero = formaterNumero(carte.numero);
  const reseau = service(carte.operateur);

  // Le texte qui part : nom, numéro, réseau — chacun sur sa ligne, sans
  // étiquette, prêt à envoyer tel quel. Le même que le bouton « Copier »
  // du web assemble.
  const partager = () => {
    const message = [nom, numero, reseau].filter(Boolean).join("\n");
    void Share.share({ message }).catch(() => {
      /* feuille refermée sans choisir : il n'y a rien à rattraper */
    });
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
        <Pressable
          onPress={partager}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center",
            gap: espaces.sm, paddingVertical: espaces.md,
            borderRadius: rayons.bouton,
            backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
          })}
        >
          <Icone nom="Partage" taille={17} couleur={couleurs.surfaceHaute} />
          <Texte poids="demi" taille={textes.petit}
                 style={{ color: couleurs.surfaceHaute }}>
            {t.coordPartager}
          </Texte>
        </Pressable>
      }
    >
      <Carte>
        <Rangee libelle={t.coordNom}>
          {nom ? (
            <Texte poids="demi">{nom}</Texte>
          ) : (
            // Pas de nom : on le dit, et on mène là où il s'inscrit.
            <Pressable onPress={() => { onFermer(); router.push("/reglages"); }}
                       hitSlop={6}>
              <Texte taille={textes.petit} ton="pale"
                     style={{ textDecorationLine: "underline" }}>
                {t.coordSansNom}
              </Texte>
            </Pressable>
          )}
        </Rangee>
        <Filet />
        <Rangee libelle={t.coordNumero}>
          <Texte poids="demi" chiffresAlignes>{numero || "—"}</Texte>
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
