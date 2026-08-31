// Les réglages : la langue, le terminal, la sortie.
//
// Écran à part plutôt qu'un cinquième onglet : on y vient une fois par mois,
// et la barre garde ses quatre entrées — ce qu'un propriétaire vient faire.
//
// Ce qui n'y est PAS, à dessein : rien qui touche au code secret. Il ne se
// règle pas, ne se garde pas, ne s'oublie pas — il n'existe qu'au moment
// d'une opération.

import { useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, ScrollView, View,
  Pressable, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Accroc, Carte, Filet, MotTotem, Pastille, Texte } from "@/ui";
import { Icone } from "@/icones";
import { SectionCartes } from "@/reglages-cartes";
import { SectionCodes } from "@/reglages-codes";
import { SectionQui } from "@/reglages-qui";
import { couleurs, espaces, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useChangerLangue, useLangue } from "@/langue";
import { useSession } from "@/session";
import { essaiNotification } from "@/api/guichet";
import {
  inscrireAvecPatience, peutEncoreDemander, souciDeLaSonnerie,
  type EtatSonnerie,
} from "@/sonnerie";
import { textesReglages } from "@noyau/textes/reglages";
import { textesCharpente } from "@noyau/textes/charpente";
import { LANGUES } from "@noyau/langue";

export default function Reglages() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesReglages[langue];
  const c = textesCharpente[langue];
  const { fermer } = useSession();
  const { donnees, erreur, recharger } = useDonnees({ sms: 0, recus: 0 });
  const terminal = donnees?.terminal ?? null;
  // Les cartes en place d'abord — c'est elles qu'on vient régler.
  const sims = [...(donnees?.sims ?? [])]
    .sort((a, b) => Number(b.enPlace) - Number(a.enPlace));
  // Une section de codes PAR OPÉRATEUR présent, comme au web : le repli
  // « Orange » d'autrefois mentait dès qu'une MTN était dans le berceau.
  const enPlaceOps = sims.filter((s) => s.enPlace).map((s) => s.operateur);
  const operateurs = [...new Set([...enPlaceOps, ...sims.map((s) => s.operateur)])]
    .filter((op) => op && op !== "?");

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
      {/* Le clavier ne couvre pas le formulaire de création de compte, qui
          vit au milieu de la page : bord à bord, Android ne redimensionne
          rien tout seul (voir feuille.tsx). Et « handled » : un appui sur
          « Créer » pendant que le clavier est levé COMPTE — sans lui, le
          premier toucher ne faisait que ranger le clavier. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg }}
                  keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
          <Pressable onPress={() => router.back()} hitSlop={12}
                     accessibilityLabel={t.annuler}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <Icone nom="Chevron" taille={22} couleur={couleurs.encreDouce} />
            </View>
          </Pressable>
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
        </View>

        {/* La panne se dit : sans cela, un terminal et des cartes
            absents ressemblaient à un compte vide. */}
        {erreur ? <Accroc message={erreur} onReessayer={recharger} /> : null}

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

        {/* Les cartes : le nom et le numéro de chacune — ce que la fiche
            des coordonnées montre s'inscrit ici. */}
        <SectionCartes sims={sims} langue={langue}
                       terminal={terminal?.id ?? null}
                       onChange={recharger} />

        {/* « Est-ce que mon téléphone sonne ? »
            Il existait sur la plateforme web, pas ici — c'est-à-dire pas là
            où l'on vient de refuser ou d'accepter les notifications, et où
            l'on se pose justement la question. */}
        <EssaiNotification />

        {/* Les codes USSD — une section par opérateur vu par le terminal,
            avec les boutons appris par le robot en regard. */}
        {operateurs.map((op) => (
          <SectionCodes key={op} operateur={op}
                        enPlace={enPlaceOps.includes(op)}
                        appris={donnees?.raccourcis?.[op] ?? []}
                        langue={langue}
                        terminal={terminal?.id ?? null}
                        onChange={recharger} />
        ))}

        {/* Qui peut se connecter — visible du propriétaire seul : la
            section se tait d'elle-même pour les autres. */}
        <SectionQui langue={langue} />

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
      </KeyboardAvoidingView>
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
  const [inscription, setInscription] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rate, setRate] = useState(false);
  // Ce qui a empêché ce téléphone de s'inscrire, s'il y a quelque chose.
  const [etat, setEtat] = useState<EtatSonnerie | null>(null);
  const [reglagesUtiles, setReglagesUtiles] = useState(false);
  // Le message du système, mot pour mot. Souvent le seul qui mène quelque
  // part — « Default FirebaseApp is not initialized » désigne la panne d'un
  // mot, là où « sans jeton » ne désigne rien.
  const [souci, setSouci] = useState<string | null>(null);

  // POURQUOI ON REGARDE À L'OUVERTURE DE L'ÉCRAN. C'est ici qu'on vient
  // quand on se demande « pourquoi ça ne sonne pas ». Attendre un appui sur
  // un bouton pour dire « les notifications sont refusées » ferait chercher
  // ailleurs entre-temps.
  useEffect(() => {
    let vivant = true;
    (async () => {
      const r = await inscrireAvecPatience(true).catch((): EtatSonnerie => "echec");
      if (!vivant) return;
      setEtat(r);
      setSouci(souciDeLaSonnerie());
      if (r === "refusee") setReglagesUtiles(!(await peutEncoreDemander()));
    })();
    return () => { vivant = false; };
  }, []);

  const explication: Record<EtatSonnerie, string> = {
    inscrit: t.sonnerieInscrit,
    refusee: t.sonnerieRefusee,
    simulateur: t.sonnerieSimulateur,
    sansProjet: t.sonnerieSansProjet,
    sansJeton: t.sonnerieSansJeton,
    echec: t.sonnerieEchec,
  };

  const reinscrire = async () => {
    if (inscription) return;
    setInscription(true);
    setMessage(null);
    try {
      const r = await inscrireAvecPatience(true);
      setEtat(r);
      setSouci(souciDeLaSonnerie());
      if (r === "refusee") setReglagesUtiles(!(await peutEncoreDemander()));
    } finally {
      setInscription(false);
    }
  };

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

  const pret = etat === "inscrit";
  // Recompiler n'est pas un geste qu'on fait depuis un téléphone : inutile
  // de proposer un bouton qui ne mènerait à rien.
  const peutReessayer = etat !== null && etat !== "inscrit"
    && etat !== "simulateur" && etat !== "sansProjet";

  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi">{t.essai}</Texte>
      <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
        <Texte taille={textes.petit} ton="pale" style={{ lineHeight: 18 }}>
          {t.essaiAide}
        </Texte>

        {/* L'ÉTAT DE CE TÉLÉPHONE, avant tout le reste. C'est la première
            chose à savoir quand ça ne sonne pas. */}
        {etat === null ? (
          <ActivityIndicator size="small" color={couleurs.encrePale} />
        ) : (
          <View style={{ flexDirection: "row", gap: espaces.sm, alignItems: "flex-start" }}>
            <View style={{ paddingTop: 5 }}>
              <Pastille vif={pret} />
            </View>
            <Texte
              taille={textes.petit}
              ton={pret ? "doux" : "negatif"}
              style={{ flex: 1, lineHeight: 18 }}
            >
              {explication[etat]}
            </Texte>
          </View>
        )}

        {/* Le message du système, tel quel. Il est en anglais et technique —
            on le montre quand même : c'est lui qui permet de dire ce qui
            manque, à nous comme à qui viendrait aider. */}
        {souci ? (
          <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 16 }}>
            {souci}
          </Texte>
        ) : null}

        {/* Une permission refusée pour de bon ne se redemande pas : Android
            ignore l'appel. Le seul chemin passe par ses propres réglages. */}
        {reglagesUtiles ? (
          <Pressable onPress={() => { void Linking.openSettings(); }}>
            <Texte taille={textes.petit} poids="moyen" ton="doux"
                   style={{ textDecorationLine: "underline" }}>
              {t.sonnerieOuvrirReglages}
            </Texte>
          </Pressable>
        ) : null}

        {peutReessayer ? (
          <Pressable
            onPress={reinscrire}
            disabled={inscription}
            style={({ pressed }) => ({
              borderWidth: 1, borderColor: couleurs.trait,
              borderRadius: 10, paddingVertical: espaces.md,
              alignItems: "center", flexDirection: "row",
              justifyContent: "center", gap: espaces.sm,
              backgroundColor: pressed ? couleurs.surface2 : "transparent",
              opacity: inscription ? 0.5 : 1,
            })}
          >
            {inscription ? <ActivityIndicator size="small" color={couleurs.encrePale} /> : null}
            <Texte poids="demi" ton="doux">
              {inscription ? t.sonnerieEnCours : t.sonnerieInscrire}
            </Texte>
          </Pressable>
        ) : null}

        {/* L'essai n'a de sens que si ce téléphone est inscrit. */}
        <Pressable
          onPress={essayer}
          disabled={envoi || !pret}
          style={({ pressed }) => ({
            borderWidth: 1, borderColor: couleurs.trait,
            borderRadius: 10, paddingVertical: espaces.md,
            alignItems: "center", flexDirection: "row",
            justifyContent: "center", gap: espaces.sm,
            backgroundColor: pressed ? couleurs.surface2 : "transparent",
            opacity: envoi || !pret ? 0.4 : 1,
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
