// AJOUTER MA CARTE — ce que voit un compte qui n'a encore aucune carte.
//
// TOTEM est grand public : on crée son compte dans l'application et l'on
// entre tout de suite. À ce moment-là, le compte n'a AUCUNE carte — et
// l'écran le plus important est celui qui dit comment en avoir une. Il dit
// les deux façons (envoyer sa puce à TOTEM, ou brancher son propre boîtier),
// l'aide pour ouvrir un compte Mobile Money chez l'opérateur, et à qui
// écrire.
//
// CE N'EST PAS UN BOÎTIER HORS LIGNE. Un compte neuf n'a pas de boîtier du
// tout : lui montrer « Terminal hors ligne » (`carteEnPause`), ce serait
// l'envoyer chercher une panne qui n'existe pas. Et ce n'est pas « Aucune
// carte dans le terminal » non plus — cette phrase parle au propriétaire
// d'un boîtier, pas à quelqu'un qui vient d'arriver.
//
// L'ADRESSE DE CONTACT N'EST PAS ÉCRITE ICI : elle vit sur la plateforme
// (voir `ouContacterTotem`). Une adresse inventée promettrait une boîte qui
// n'existe pas.

import { router } from "expo-router";
import { Linking, Pressable, View } from "react-native";

import { Carte, Filet, Texte, avecAppui } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { ouContacterTotem } from "@/api/guichet";
import { textesAccueil } from "@noyau/textes/accueil";
import type { Langue } from "@noyau/langue";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";

/** Écrire à TOTEM : l'adresse que la plateforme donne, ou sa page de
 *  contact. Jamais une adresse écrite dans l'application. Sert aussi à la
 *  fiche de suppression du compte (« écrivez-nous pour récupérer votre
 *  puce »). */
export async function contacter(): Promise<void> {
  const ou = await ouContacterTotem().catch(() => null);
  if (ou) await Linking.openURL(ou).catch(() => {});
}

function Facon({ icone, titre, texte }: { icone: NomIcone; titre: string; texte: string }) {
  return (
    <View style={{ flexDirection: "row", gap: espaces.md, padding: espaces.lg }}>
      <View style={{
        width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
        backgroundColor: couleurs.surface2,
      }}>
        <Icone nom={icone} taille={18} couleur={couleurs.encre} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Texte poids="demi">{titre}</Texte>
        <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>{texte}</Texte>
      </View>
    </View>
  );
}

/**
 * L'écran entier, sur l'accueil : les deux façons, l'aide, le contact.
 *
 * `code` : le CODE DE COMPTE, que la personne joint à sa puce pour que la
 * carte arrive dans le BON compte. Pas l'adresse e-mail : n'importe qui peut
 * avoir créé un compte à l'adresse d'un autre avant lui, et TOTEM lui
 * aurait attribué la puce (voir web/lib/code-de-compte.ts). La plateforme
 * refuse d'ailleurs d'attribuer une puce à un compte grand public sans ce
 * code.
 */
export function AjouterMaCarte({ langue, code }: { langue: Langue; code?: string | null }) {
  const t = textesAccueil[langue];
  return (
    <View style={{ gap: espaces.md }}>
      <View style={{ gap: espaces.xs }}>
        <Texte taille={textes.intertitre} poids="demi" accessibilityRole="header">
          {t.ajouterCarteTitre}
        </Texte>
        <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>
          {t.ajouterCarteIntro}
        </Texte>
      </View>

      <Carte>
        <Facon icone="PuceSim" titre={t.ajouterCarteEnvoyerTitre} texte={t.ajouterCarteEnvoyer} />
        <Filet />
        <Facon icone="Home" titre={t.ajouterCarteBoitierTitre} texte={t.ajouterCarteBoitier} />
      </Carte>

      <Carte style={{ padding: espaces.lg, flexDirection: "row", gap: espaces.md }}>
        <Icone nom="Bank" taille={18} couleur={couleurs.encreDouce} />
        <Texte taille={textes.petit} style={{ flex: 1, lineHeight: 20 }}>
          {t.ajouterCarteOuvrir}
        </Texte>
      </Carte>

      <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>
        {t.ajouterCarteEnsuite}
      </Texte>
      {code ? (
        <Carte style={{ padding: espaces.lg, gap: espaces.xs }}>
          <Texte taille={textes.legende} ton="pale">{t.ajouterCarteCodeTitre}</Texte>
          <Texte taille={textes.intertitre} poids="demi" selectable
                 style={{ letterSpacing: 2 }}>
            {code}
          </Texte>
          <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>
            {t.ajouterCarteCode}
          </Texte>
        </Carte>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => void contacter()}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", justifyContent: "center",
          gap: espaces.sm, paddingVertical: espaces.md, borderRadius: rayons.bouton,
          backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
        })}
      >
        <Icone nom="Mail" taille={16} couleur={couleurs.surfaceHaute} />
        <Texte poids="demi" style={{ color: couleurs.surfaceHaute }}>
          {t.ajouterCarteContacter}
        </Texte>
      </Pressable>
    </View>
  );
}

/**
 * La version courte, pour les autres écrans (Opérations, Code USSD) : une
 * phrase, et le chemin vers l'accueil où tout est expliqué.
 */
export function AjouterMaCarteCourt({ langue }: { langue: Langue }) {
  const t = textesAccueil[langue];
  return (
    <Pressable accessibilityRole="button" onPress={() => router.navigate("/")}
               style={avecAppui({})}>
      <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm,
                      borderStyle: "dashed" }}>
        <Texte poids="demi">{t.ajouterCarteTitre}</Texte>
        <Texte ton="doux" taille={textes.petit} style={{ textAlign: "center", lineHeight: 20 }}>
          {t.ajouterCarteCourt}
        </Texte>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs }}>
          <Texte taille={textes.petit} poids="moyen" style={{ textDecorationLine: "underline" }}>
            {t.ajouterCarteVoir}
          </Texte>
          <Icone nom="Chevron" taille={12} couleur={couleurs.encre} />
        </View>
      </Carte>
    </Pressable>
  );
}
