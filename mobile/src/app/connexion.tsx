// Le verrou de l'application.
//
// Le mot de passe du propriétaire — PAS le code PIN Mobile Money. Celui-là ne
// se saisit qu'au moment d'une opération, sur un pavé de boutons, et ne
// s'enregistre nulle part. La note en bas de l'écran le dit, parce que c'est
// exactement là qu'on peut se tromper.
//
// Le mot de passe ne vit que dans l'état de cet écran, le temps de l'envoi.
// Ce qui se range dans le coffre, c'est le JETON rendu par la plateforme —
// jamais le mot de passe lui-même.
//
// AVANT LE MOT DE PASSE, L'ADRESSE. Cet écran commence par demander à
// l'adresse configurée : « y a-t-il un TOTEM ici ? » Tant que la réponse
// n'est pas oui, le champ du mot de passe reste fermé.
//
// Ce n'est pas de la prudence théorique. L'application a porté pendant un
// temps une adresse d'exemple, reprise d'une documentation, qui appartenait
// en fait à quelqu'un d'autre : le mot de passe du propriétaire partait vers
// un serveur inconnu, et l'écran ne disait qu'un « connexion impossible »
// où l'on cherchait une faute de frappe dans le mot de passe. Un mot de
// passe ne part plus vers une adresse qui n'a pas montré patte blanche.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Carte, MotTotem, Pastille, Texte, couleurs, espaces, rayons, textes,
} from "@/ui";
import { Icone } from "@/icones";
import { useChangerLangue, useLangue } from "@/langue";
import { useSession } from "@/session";
import {
  adressePlateforme, adresseValable, definirAdresse, verifierPlateforme,
  type EtatPlateforme,
} from "@/api/guichet";
import { textesConnexion } from "@noyau/textes/connexion";
import { autreLangue } from "@noyau/langue";
import { polices } from "@/theme/jetons";

export default function Connexion() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesConnexion[langue];
  const { ouvrir } = useSession();

  const [motdepasse, setMotdepasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // L'adresse de la plateforme, et ce qu'on a trouvé au bout.
  // `null` = on n'a pas encore regardé.
  const [etat, setEtat] = useState<EtatPlateforme | null>(null);
  const [adresse, setAdresse] = useState("");
  const [saisie, setSaisie] = useState<string | null>(null);   // null = pas en train de changer
  // Une erreur d'adresse a son propre message : elle s'affiche là où l'on
  // vient de taper, pas sous le mot de passe, qui n'y est pour rien.
  const [erreurAdresse, setErreurAdresse] = useState<string | null>(null);

  const autre = autreLangue(langue);

  /** Frapper à la porte : y a-t-il un TOTEM à cette adresse ? */
  const sonder = useCallback(async () => {
    setEtat(null);
    const a = await adressePlateforme();
    setAdresse(a);
    // Sans adresse du tout (premier lancement), inutile d'appeler : on
    // demande directement laquelle, plutôt que d'afficher un échec.
    if (!adresseValable(a)) {
      setEtat("absente");
      setSaisie((s) => (s === null ? "https://" : s));
      return;
    }
    setEtat(await verifierPlateforme(a));
  }, []);

  useEffect(() => { void sonder(); }, [sonder]);

  const enregistrerAdresse = async () => {
    if (saisie === null) return;
    if (!(await definirAdresse(saisie))) {
      setErreurAdresse(t.adresseInvalide);
      return;
    }
    setErreurAdresse(null);
    setSaisie(null);
    await sonder();
  };

  // Le mot de passe ne part QUE vers un TOTEM qui a répondu.
  const porteOuverte = etat === "trouvee";

  const valider = async () => {
    if (!motdepasse || enCours || !porteOuverte) return;
    setEnCours(true);
    setErreur(null);
    try {
      await ouvrir(motdepasse, langue);
      setMotdepasse("");            // rien ne subsiste après l'envoi
    } catch (e) {
      // Le guichet rend déjà le message dans la bonne langue ; on ne le
      // réécrit pas ici, on ne fait que le montrer.
      const message = e instanceof Error ? e.message : "";
      setErreur(message || t.connexionImpossible);
      setEnCours(false);
    }
  };

  return (
    // La connexion est une SURFACE DE MARQUE : c'est le seul endroit, avec la
    // couverture, où le sable et la latérite ont le droit de tenir le fond.
    <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.sable }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1, justifyContent: "center",
            padding: espaces.xl, gap: espaces.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", gap: espaces.md }}>
            <MotTotem taille={22} />
            <Texte taille={textes.titre} poids="demi" style={{ textAlign: "center" }}>
              {t.titre}
            </Texte>
            <Texte ton="doux" style={{ textAlign: "center", lineHeight: 22 }}>
              {t.sousTitre}
            </Texte>
          </View>

          {/* LA PLATEFORME, avant le mot de passe.
              Cet encart n'est pas décoratif : il est la réponse à la seule
              question qui compte avant de taper quoi que ce soit — « est-ce
              que je parle bien à MON TOTEM ? ». Il porte donc l'adresse en
              toutes lettres, pas un voyant vert. */}
          <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
              <Icone nom="Globe" taille={16} couleur={couleurs.encrePale} />
              <Texte taille={textes.petit} ton="doux" poids="moyen" style={{ flex: 1 }}>
                {t.plateforme}
              </Texte>
              {etat === null ? (
                <ActivityIndicator size="small" color={couleurs.encrePale} />
              ) : (
                <Pastille couleur={
                  etat === "trouvee" ? couleurs.positifVif
                    : etat === "non-configuree" ? couleurs.alerte
                      : couleurs.negatif
                } />
              )}
            </View>

            {saisie === null ? (
              <>
                {/* L'adresse en toutes lettres. `selectable` : on peut la
                    copier pour la comparer à celle de Vercel. */}
                <Texte
                  taille={textes.petit}
                  ton={etat === "trouvee" ? "doux" : "pale"}
                  selectable
                  style={{ lineHeight: 20 }}
                >
                  {adresse || "—"}
                </Texte>

                {etat !== null && etat !== "trouvee" ? (
                  <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
                    {etat === "absente" ? t.plateformeAbsente
                      : etat === "injoignable" ? t.plateformeInjoignable
                        : t.plateformeNonConfiguree}
                  </Texte>
                ) : null}

                <View style={{ flexDirection: "row", gap: espaces.lg }}>
                  <Pressable
                    onPress={() => { setSaisie(adresse || "https://"); setErreurAdresse(null); }}
                    hitSlop={8}
                  >
                    <Texte taille={textes.petit} ton="doux" poids="moyen"
                           style={{ textDecorationLine: "underline" }}>
                      {t.changerAdresse}
                    </Texte>
                  </Pressable>
                  {etat !== null && etat !== "trouvee" ? (
                    <Pressable onPress={() => void sonder()} hitSlop={8}>
                      <Texte taille={textes.petit} ton="doux" poids="moyen"
                             style={{ textDecorationLine: "underline" }}>
                        {t.reessayer}
                      </Texte>
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : (
              <>
                <TextInput
                  value={saisie}
                  onChangeText={(v) => { setSaisie(v); setErreurAdresse(null); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  inputMode="url"
                  autoFocus
                  onSubmitEditing={enregistrerAdresse}
                  returnKeyType="done"
                  style={{
                    borderWidth: 1,
                    borderColor: erreurAdresse ? couleurs.negatif : couleurs.trait,
                    borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
                    paddingHorizontal: espaces.md, paddingVertical: espaces.md,
                    fontFamily: polices.corps, fontSize: textes.corps,
                    color: couleurs.encre,
                  }}
                />
                {erreurAdresse ? (
                  <Texte taille={textes.petit} ton="negatif">{erreurAdresse}</Texte>
                ) : null}
                <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
                  {t.adresseAide}
                </Texte>
                <View style={{ flexDirection: "row", gap: espaces.sm }}>
                  <Pressable
                    onPress={enregistrerAdresse}
                    style={({ pressed }) => ({
                      flex: 1, alignItems: "center",
                      backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
                      borderRadius: rayons.bouton, paddingVertical: espaces.md,
                    })}
                  >
                    <Texte poids="demi" style={{ color: couleurs.surfaceHaute }}>
                      {t.enregistrer}
                    </Texte>
                  </Pressable>
                  <Pressable
                    onPress={() => { setSaisie(null); setErreurAdresse(null); }}
                    style={{
                      alignItems: "center", justifyContent: "center",
                      borderWidth: 1, borderColor: couleurs.trait,
                      borderRadius: rayons.bouton,
                      paddingVertical: espaces.md, paddingHorizontal: espaces.lg,
                    }}
                  >
                    <Texte ton="doux">{t.annuler}</Texte>
                  </Pressable>
                </View>
              </>
            )}
          </Carte>

          <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
            <Texte taille={textes.petit} ton="doux" poids="moyen">
              {t.motDePasse}
            </Texte>

            <View style={{
              flexDirection: "row", alignItems: "center",
              borderWidth: 1, borderColor: erreur ? couleurs.negatif : couleurs.trait,
              borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
              paddingHorizontal: espaces.md,
            }}>
              <TextInput
                value={motdepasse}
                onChangeText={(v) => { setMotdepasse(v); setErreur(null); }}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!enCours && porteOuverte}
                onSubmitEditing={valider}
                returnKeyType="go"
                style={{
                  flex: 1, paddingVertical: espaces.md,
                  fontFamily: polices.corps, fontSize: textes.corps,
                  color: couleurs.encre,
                }}
              />
              <Pressable
                onPress={() => setVisible((v) => !v)}
                hitSlop={12}
                accessibilityLabel={visible ? "Masquer" : "Afficher"}
              >
                <Icone nom={visible ? "EyeOff" : "Eye"} couleur={couleurs.encrePale} />
              </Pressable>
            </View>

            {erreur ? (
              <Texte taille={textes.petit} ton="negatif">{erreur}</Texte>
            ) : null}

            <Pressable
              onPress={valider}
              disabled={!motdepasse || enCours || !porteOuverte}
              style={({ pressed }) => ({
                backgroundColor: !motdepasse || !porteOuverte
                  ? couleurs.surface3
                  : pressed ? couleurs.accentAppui : couleurs.accent,
                borderRadius: rayons.bouton,
                paddingVertical: espaces.md,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: espaces.sm,
              })}
            >
              {enCours ? <ActivityIndicator size="small" color={couleurs.surface} /> : null}
              <Texte poids="demi" style={{ color: couleurs.surfaceHaute }}>
                {enCours ? t.verification : t.seConnecter}
              </Texte>
            </Pressable>
          </Carte>

          <View style={{ gap: espaces.lg, alignItems: "center" }}>
            {/* La promesse sur le code secret. Elle vit ici, sur l'écran que
                tout le monde voit, et pas enfouie dans les réglages. */}
            <View style={{ flexDirection: "row", gap: espaces.sm, paddingHorizontal: espaces.sm }}>
              <Icone nom="Lock" taille={16} couleur={couleurs.encrePale} />
              <Texte taille={textes.legende} ton="pale" style={{ flex: 1, lineHeight: 18 }}>
                {t.notePin}
              </Texte>
            </View>

            {/* La bascule porte le nom de l'AUTRE langue, écrit dans cette
                langue : celle qui la cherche peut la lire. */}
            <Pressable
              onPress={() => changerLangue(autre.code)}
              style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}
              hitSlop={8}
            >
              <Icone nom="Globe" taille={16} couleur={couleurs.encreDouce} />
              <Texte taille={textes.petit} ton="doux">{autre.bascule}</Texte>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
