// Les réglages : la langue, le terminal, la sortie.
//
// Écran à part plutôt qu'un cinquième onglet : on y vient une fois par mois,
// et la barre garde ses quatre entrées — ce qu'un propriétaire vient faire.
//
// Ce qui n'y est PAS, à dessein : rien qui touche au code secret. Il ne se
// règle pas, ne se garde pas, ne s'oublie pas — il n'existe qu'au moment
// d'une opération.

import { useState } from "react";
import { ActivityIndicator, ScrollView, View, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Carte, Filet, MotTotem, Pastille, Texte } from "@/ui";
import { Icone } from "@/icones";
import { couleurs, espaces, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useChangerLangue, useLangue } from "@/langue";
import { useSession } from "@/session";
import { essaiNotification } from "@/api/guichet";
import { textesReglages } from "@noyau/textes/reglages";
import { textesCharpente } from "@noyau/textes/charpente";
import { LANGUES } from "@noyau/langue";

export default function Reglages() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesReglages[langue];
  const c = textesCharpente[langue];
  const { fermer } = useSession();
  const { donnees } = useDonnees({ sms: 0, recus: 0 });
  const terminal = donnees?.terminal ?? null;

  const seDeconnecter = () => {
    Alert.alert(t.seDeconnecter, undefined, [
      { text: t.annuler, style: "cancel" },
      {
        text: t.seDeconnecter, style: "destructive",
        onPress: () => { void fermer(); },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
          <Pressable onPress={() => router.back()} hitSlop={12}
                     accessibilityLabel={t.annuler}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <Icone nom="Chevron" taille={22} couleur={couleurs.encreDouce} />
            </View>
          </Pressable>
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
        </View>

        {/* La langue */}
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.intertitre} poids="demi">{t.langue}</Texte>
          <Carte>
            {LANGUES.map((l, i) => (
              <View key={l.code}>
                {i > 0 ? <Filet /> : null}
                <Pressable
                  onPress={() => changerLangue(l.code)}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", gap: espaces.md,
                    padding: espaces.lg,
                    backgroundColor: pressed ? couleurs.surface2 : "transparent",
                  })}
                >
                  <Icone nom="Globe" taille={20} couleur={couleurs.encreDouce} />
                  <Texte style={{ flex: 1 }} poids={l.code === langue ? "demi" : "normal"}>
                    {l.libelle}
                  </Texte>
                  {l.code === langue ? (
                    <Texte taille={textes.legende} ton="pale">{t.langueActive}</Texte>
                  ) : null}
                </Pressable>
              </View>
            ))}
          </Carte>
          <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
            {t.noteLangue}
          </Texte>
        </View>

        {/* Le terminal */}
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.intertitre} poids="demi">{t.terminal}</Texte>
          <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
            {terminal ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
                  <Pastille vif={terminal.enLigne} />
                  <Texte>{terminal.enLigne ? c.terminalActif : c.terminalMuet}</Texte>
                  <Texte taille={textes.petit} ton="pale" chiffresAlignes
                         style={{ marginLeft: "auto" }}>
                    {terminal.majTexte}
                  </Texte>
                </View>
                <Filet />
                <Rangee libelle={t.nom} valeur={terminal.nom} />
                {terminal.version ? (
                  <Rangee libelle={t.version} valeur={terminal.version} />
                ) : null}
              </>
            ) : (
              <Texte ton="doux">{c.aucunTerminal}</Texte>
            )}
          </Carte>
        </View>

        {/* « Est-ce que mon téléphone sonne ? »
            Il existait sur la plateforme web, pas ici — c'est-à-dire pas là
            où l'on vient de refuser ou d'accepter les notifications, et où
            l'on se pose justement la question. */}
        <EssaiNotification />

        {/* La sécurité — et la promesse sur le code secret, répétée ici parce
            que c'est l'écran où l'on vient chercher « où est mon code ? ». */}
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.intertitre} poids="demi">{t.securite}</Texte>
          <Carte>
            <View style={{ flexDirection: "row", gap: espaces.md, padding: espaces.lg }}>
              <Icone nom="Lock" taille={20} couleur={couleurs.encreDouce} />
              <Texte taille={textes.petit} ton="doux" style={{ flex: 1, lineHeight: 20 }}>
                {t.notePin}
              </Texte>
            </View>
            <Filet />
            <Pressable
              onPress={seDeconnecter}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: espaces.md,
                padding: espaces.lg,
                backgroundColor: pressed ? couleurs.surface2 : "transparent",
              })}
            >
              <Icone nom="Close" taille={20} couleur={couleurs.negatif} />
              <Texte ton="negatif" poids="moyen">{t.seDeconnecter}</Texte>
            </Pressable>
          </Carte>
        </View>

        <View style={{ alignItems: "center", paddingTop: espaces.lg, gap: espaces.xs }}>
          <MotTotem taille={12} />
          <Texte taille={textes.legende} ton="pale">{t.proprietaire}</Texte>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Rangee({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Texte taille={textes.petit} ton="doux">{libelle}</Texte>
      <Texte taille={textes.petit} style={{ marginLeft: "auto" }} chiffresAlignes>
        {valeur || "—"}
      </Texte>
    </View>
  );
}

/**
 * « Est-ce que mon téléphone sonne ? »
 *
 * On vient d'installer l'application et d'accepter — ou de refuser d'un
 * geste — les notifications. Sans ce bouton, il faudrait attendre qu'un vrai
 * client envoie de l'argent pour savoir si la chaîne fonctionne. Et si elle
 * ne fonctionne pas, chercher à l'aveugle : la permission ? le jeton ?
 * Firebase ? le canal Android ?
 *
 * Il dit aussi ce qu'il NE prouve pas. La chaîne complète part du modem et
 * finit sur cet écran ; l'essai n'en éprouve que le dernier kilomètre. Le
 * taire laisserait croire que tout est vérifié — et l'on ne chercherait pas
 * du côté du terminal le jour où c'est lui qui est muet.
 */
function EssaiNotification() {
  const langue = useLangue();
  const t = textesReglages[langue];
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rate, setRate] = useState(false);

  const essayer = async () => {
    if (envoi) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const r = await essaiNotification(langue);
      if (r.aucun) {
        setRate(true);
        setMessage(t.essaiAucunAppareil);
      } else if (r.servis > 0) {
        setRate(false);
        setMessage(t.essaiReussi
          + (r.oublies ? ` (${r.oublies} ${t.essaiOublies})` : ""));
      } else {
        setRate(true);
        // Le détail vient du service de notification, en anglais. On le
        // montre quand même : sans lui, « rien n'a pu être envoyé » ne dit
        // pas par où chercher.
        setMessage(t.essaiEchec
          + (r.soucis?.length ? ` — ${r.soucis.join(" · ")}` : ""));
      }
    } catch (e) {
      setRate(true);
      setMessage(e instanceof Error ? e.message : t.essaiEchec);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi">{t.essai}</Texte>
      <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
        <Texte taille={textes.petit} ton="pale" style={{ lineHeight: 18 }}>
          {t.essaiAide}
        </Texte>
        <Pressable
          onPress={essayer}
          disabled={envoi}
          style={({ pressed }) => ({
            borderWidth: 1, borderColor: couleurs.trait,
            borderRadius: 10, paddingVertical: espaces.md,
            alignItems: "center", flexDirection: "row",
            justifyContent: "center", gap: espaces.sm,
            backgroundColor: pressed ? couleurs.surface2 : "transparent",
            opacity: envoi ? 0.5 : 1,
          })}
        >
          {envoi ? <ActivityIndicator size="small" color={couleurs.encrePale} /> : null}
          <Texte poids="demi" ton="doux">
            {envoi ? t.essaiEnCours : t.essaiBouton}
          </Texte>
        </Pressable>
        {message ? (
          <Texte
            taille={textes.petit}
            ton={rate ? "negatif" : "doux"}
            style={{ lineHeight: 18 }}
          >
            {message}
          </Texte>
        ) : null}
      </Carte>
    </View>
  );
}
