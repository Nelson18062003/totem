// CRÉER SON COMPTE — la porte d'entrée de TOTEM.
//
// TOTEM EST UNE APPLICATION GRAND PUBLIC. N'importe qui la télécharge sur
// l'App Store ou le Play Store, crée son compte ici, et entre TOUT DE SUITE :
// pas d'attente, pas d'approbation. Tant qu'aucune carte ne lui est
// attribuée, l'accueil lui montre « Ajouter ma carte » (voir
// `ajouter-ma-carte.tsx`).
//
// SIX CHAMPS, ET RIEN DE PLUS : prénom, nom, adresse, e-mail, téléphone, mot
// de passe. Chacun sert à quelque chose de précis — attribuer une puce à la
// BONNE personne, et pouvoir la joindre quand elle l'envoie. Un champ de
// plus serait une question à laquelle on ne sait pas dire pourquoi on la
// pose.
//
// Ouvrir la porte à tous ne donne accès à rien : un compte neuf ne voit QUE
// les cartes qu'on lui a attribuées, et il n'en a aucune. La portée par carte
// est tenue par la plateforme, ligne par ligne (`verifier-les-cartes`).
//
// Ce n'est PAS le code PIN Mobile Money. On le redit au moment même où l'on
// choisit un mot de passe : c'est là que la confusion coûterait.

import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  BoutonIcone, Carte, ChampTexte, Defilement, Texte, appuiTexte,
  couleurs, espaces, rayons, textes,
} from "@/ui";
import { Symbole } from "@/marque";
import { Entree } from "@/animations";
import { useGesteUnique } from "@/geste";
import { useLangue } from "@/langue";
import { apresEffacement, enFormeDansLeChamp } from "@noyau/saisie";
import { useSession } from "@/session";
import { adressePlateforme, versErreurGuichet } from "@/api/guichet";
import { textesConnexion } from "@noyau/textes/connexion";
import { polices } from "@/theme/jetons";

/** La même forme que la plateforme (`courrielAcceptable`) : refuser ici ce
 *  qu'elle refuserait là-bas évite un aller-retour pour rien. */
const FORME_COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** La même longueur que la plateforme exige (`motDePasseAcceptable`). */
const LONGUEUR_MINIMALE = 12;

/** Un numéro plausible : de 8 à 15 chiffres, un « + » devant au plus. Les
 *  espaces, points et tirets qu'on tape pour se relire ne comptent pas. */
function telephonePlausible(t: string): boolean {
  const net = t.replace(/[\s.\-()]/g, "");
  return /^\+?\d{8,15}$/.test(net);
}

function Etiquette({ children }: { children: string }) {
  return <Texte taille={textes.petit} ton="doux" poids="moyen">{children}</Texte>;
}

export function Inscription({ porteOuverte, avis, onRetour }: {
  /** Faux quand ce qui répond n'est pas un TOTEM : rien ne part. */
  porteOuverte: boolean;
  /** La phrase de l'écran de connexion quand la plateforme ne répond pas. */
  avis: string | null;
  onRetour: () => void;
}) {
  const langue = useLangue();
  const t = textesConnexion[langue];
  const { inscrire } = useSession();
  const geste = useGesteUnique();

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [courriel, setCourriel] = useState("");
  const [telephone, setTelephone] = useState("");
  const [motdepasse, setMotdepasse] = useState("");
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const changer = (poser: (v: string) => void) => (v: string) => { poser(v); setErreur(null); };

  /** Ce qui manque, dit en une phrase — avant de rien envoyer. */
  const defaut = (): string | null => {
    if (![prenom, nom, adresse, courriel, telephone, motdepasse].every((v) => v.trim())) {
      return t.champsManquants;
    }
    if (!FORME_COURRIEL.test(courriel.trim())) return t.courrielInvalide;
    if (!telephonePlausible(telephone)) return t.telephoneInvalide;
    if (motdepasse.length < LONGUEUR_MINIMALE) return t.motDePasseTropCourt;
    return null;
  };

  const valider = () => {
    if (!porteOuverte) return;
    const manque = defaut();
    if (manque) { setErreur(manque); return; }
    void geste.lancer(async () => {
      setErreur(null);
      try {
        await inscrire({
          prenom: prenom.trim(), nom: nom.trim(), adresse: adresse.trim(),
          telephone: telephone.trim(), courriel: courriel.trim().toLowerCase(),
          motdepasse,
        }, langue);
        // La session est ouverte : la racine passe d'elle-même aux onglets,
        // et cet écran se démonte. Rien à écrire ici après.
        return true;
      } catch (e) {
        // Le guichet rend la phrase de la plateforme, dans la bonne langue.
        setErreur(versErreurGuichet(e, langue).message || t.inscriptionImpossible);
        return false;
      }
    }).catch(() => {});
  };

  const ouvrirConfidentialite = async () => {
    const base = await adressePlateforme();
    if (base) void Linking.openURL(`${base}/confidentialite`).catch(() => {});
  };

  const occupe = geste.occupe;
  const modifiable = !occupe && porteOuverte;
  const champ = {
    borderWidth: 1, borderColor: couleurs.trait,
    borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
    paddingHorizontal: espaces.md, paddingVertical: espaces.md,
    fontFamily: polices.corps, fontSize: textes.corps, color: couleurs.encre,
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.surface }}>
      {/* `padding` sur les deux plateformes, comme la connexion : six champs
          les uns sous les autres, et le clavier se pose exactement sur le
          dernier — le mot de passe, celui qu'on doit voir. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Defilement
          contentContainerStyle={{ padding: espaces.xl, gap: espaces.lg, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <BoutonIcone nom="Chevron" etiquette={t.jAiDejaUnCompte}
                         onPress={onRetour}
                         style={{ transform: [{ rotate: "180deg" }] }} />
          </View>

          <Entree delai={0} style={{ alignItems: "center", gap: espaces.sm }}>
            <Symbole taille={36} couleur={couleurs.encre} />
            <Texte taille={textes.titre} poids="demi" accessibilityRole="header"
                   style={{ textAlign: "center" }}>
              {t.inscriptionTitre}
            </Texte>
            <Texte taille={textes.petit} ton="doux"
                   style={{ textAlign: "center", lineHeight: 20 }}>
              {t.inscriptionSousTitre}
            </Texte>
          </Entree>

          <Entree delai={80}>
            <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
              <Etiquette>{t.prenom}</Etiquette>
              <ChampTexte value={prenom} onChangeText={changer(setPrenom)}
                          autoComplete="given-name" textContentType="givenName"
                          autoCapitalize="words" returnKeyType="next"
                          editable={modifiable} style={champ} />

              <Etiquette>{t.nom}</Etiquette>
              <ChampTexte value={nom} onChangeText={changer(setNom)}
                          autoComplete="family-name" textContentType="familyName"
                          autoCapitalize="words" returnKeyType="next"
                          editable={modifiable} style={champ} />

              <Etiquette>{t.adresse}</Etiquette>
              <ChampTexte value={adresse} onChangeText={changer(setAdresse)}
                          placeholder={t.adresseExemple}
                          placeholderTextColor={couleurs.encrePale}
                          autoComplete="street-address" textContentType="fullStreetAddress"
                          autoCapitalize="sentences" returnKeyType="next"
                          editable={modifiable} style={champ} />

              <Etiquette>{t.courriel}</Etiquette>
              <ChampTexte value={courriel} onChangeText={changer(setCourriel)}
                          autoCapitalize="none" autoCorrect={false}
                          autoComplete="email" textContentType="emailAddress"
                          keyboardType="email-address" inputMode="email"
                          returnKeyType="next"
                          editable={modifiable} style={champ} />

              <Etiquette>{t.telephone}</Etiquette>
              <ChampTexte value={telephone}
                          onChangeText={changer((v) => setTelephone(
                            enFormeDansLeChamp("numero", apresEffacement(telephone, v), langue)))}
                          placeholder={t.telephoneExemple}
                          placeholderTextColor={couleurs.encrePale}
                          autoComplete="tel" textContentType="telephoneNumber"
                          keyboardType="phone-pad" inputMode="tel"
                          editable={modifiable} style={champ} />

              <Etiquette>{t.motDePasse}</Etiquette>
              <View style={{
                flexDirection: "row", alignItems: "center",
                borderWidth: 1, borderColor: couleurs.trait,
                borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
                paddingHorizontal: espaces.md,
              }}>
                <ChampTexte
                  value={motdepasse}
                  onChangeText={changer(setMotdepasse)}
                  secureTextEntry={!visible}
                  autoCapitalize="none" autoCorrect={false}
                  autoComplete="new-password" textContentType="newPassword"
                  editable={modifiable}
                  onSubmitEditing={valider}
                  returnKeyType="go"
                  style={{
                    flex: 1, paddingVertical: espaces.md,
                    fontFamily: polices.corps, fontSize: textes.corps, color: couleurs.encre,
                  }}
                />
                <BoutonIcone
                  nom={visible ? "EyeOff" : "Eye"}
                  couleur={couleurs.encrePale}
                  etiquette={visible ? t.masquerMotDePasse : t.montrerMotDePasse}
                  onPress={() => setVisible((v) => !v)}
                />
              </View>
              <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
                {t.motDePasseConseil} {t.inscriptionNotePin}
              </Texte>

              {erreur ? (
                <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
                  {erreur}
                </Texte>
              ) : avis ? (
                <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
                  {avis}
                </Texte>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={valider}
                disabled={occupe || !porteOuverte}
                style={({ pressed }) => ({
                  backgroundColor: !porteOuverte
                    ? couleurs.surface3
                    : pressed ? couleurs.accentAppui : couleurs.accent,
                  borderRadius: rayons.bouton,
                  paddingVertical: espaces.md,
                  alignItems: "center", flexDirection: "row",
                  justifyContent: "center", gap: espaces.sm,
                })}
              >
                {occupe ? <ActivityIndicator size="small" color={couleurs.surface} /> : null}
                <Texte poids="demi" style={{ color: couleurs.surfaceHaute }}>
                  {occupe ? t.creation : t.creerMonCompte}
                </Texte>
              </Pressable>

              <Texte taille={textes.legende} ton="pale"
                     style={{ textAlign: "center", lineHeight: 18 }}>
                {t.conditionsAvant}
                <Texte taille={textes.legende} ton="doux"
                       accessibilityRole="link"
                       onPress={() => void ouvrirConfidentialite()}
                       style={{ textDecorationLine: "underline" }}>
                  {t.conditionsLien}
                </Texte>
                {t.conditionsApres}
              </Texte>
            </Carte>
          </Entree>

          <Entree delai={120} style={{ alignItems: "center" }}>
            <Pressable onPress={onRetour} hitSlop={8} accessibilityRole="button"
                       style={appuiTexte}>
              <Texte taille={textes.petit} poids="moyen"
                     style={{ textDecorationLine: "underline" }}>
                {t.jAiDejaUnCompte}
              </Texte>
            </Pressable>
          </Entree>
        </Defilement>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
