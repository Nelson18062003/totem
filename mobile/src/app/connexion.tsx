// La porte de l'application : se connecter, ou créer son compte.
//
// UN COURRIEL ET UN MOT DE PASSE pour entrer. Le mot de passe n'est jamais
// rangé : seulement son empreinte, sur la plateforme, qui ne se remonte pas.
// Ce qui se range dans le coffre du téléphone, c'est le JETON rendu par la
// plateforme.
//
// L'INSCRIPTION EST ICI, ET C'EST UNE DÉCISION. TOTEM est une application
// grand public, publiée sur l'App Store et le Play Store : n'importe qui la
// télécharge, crée son compte (`inscription.tsx`) et entre tout de suite.
// Il fut un temps où cette porte avait été retirée — TOTEM était alors un
// outil fermé, dont le propriétaire créait les comptes à la main. Ce temps
// est fini : `verifier-le-paquet` exige maintenant que l'inscription soit
// dans le paquet.
//
// PAS D'ADRESSE NON PLUS. L'écran montrait « Plateforme —
// https://totemlabs.app », et un lien pour la changer : une URL que
// personne ne lit, et une porte pour envoyer son mot de passe ailleurs.
// L'adresse est celle livrée avec l'application, point. Quand la plateforme
// ne répond pas, l'écran le dit en mots simples, sans adresse.
//
// Ce n'est PAS le code PIN Mobile Money. Celui-là ne se saisit qu'au moment
// d'une opération, sur un pavé de boutons, et ne s'enregistre nulle part.
//
// UN MOT DE PASSE NE PART JAMAIS VERS CE QUI N'EST PAS UN TOTEM. L'écran
// demande d'abord à l'adresse livrée : « y a-t-il un TOTEM ici ? ». Si
// quelque chose d'AUTRE répond, rien ne part. Si RIEN ne répond (le réseau
// de Douala), on laisse quand même essayer : l'adresse est la nôtre, et un
// sondage qui a raté n'est pas une porte fermée.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, BackHandler, KeyboardAvoidingView, Pressable, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChampTexte, Defilement,
  BoutonIcone, Carte, MotTotem, Texte, appuiTexte,
  couleurs, espaces, rayons, textes,
} from "@/ui";
import { Symbole } from "@/marque";
import { Entree } from "@/animations";
import { Bienvenue, accueilDejaVu } from "@/bienvenue";
import { useChangerLangue, useLangue } from "@/langue";
import { useSession } from "@/session";
import { verifierPlateforme, type EtatPlateforme } from "@/api/guichet";
import { Inscription } from "@/inscription";
import { textesConnexion } from "@noyau/textes/connexion";
import { autreLangue } from "@noyau/langue";
import { polices } from "@/theme/jetons";

export default function Connexion() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesConnexion[langue];
  const { ouvrir, avis: avisDeSession, oublierAvis } = useSession();
  // « Votre compte a été supprimé » : lu UNE fois, puis oublié par la
  // session — un retour à la connexion plus tard ne le redit pas.
  const [supprime] = useState(avisDeSession === "compteSupprime");
  useEffect(() => { if (avisDeSession) oublierAvis(); }, [avisDeSession, oublierAvis]);

  const [courriel, setCourriel] = useState("");
  const [motdepasse, setMotdepasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  // Se connecter, ou créer son compte : deux écrans, une seule porte.
  const [inscription, setInscription] = useState(false);

  // LE RETOUR D'ANDROID ramène de « Créer un compte » à la connexion. Sans
  // lui, l'inscription n'étant pas une route mais un état de cet écran (la
  // racine), le geste « retour » QUITTAIT l'application — et les six champs
  // tapés partaient avec.
  useEffect(() => {
    if (!inscription) return;
    const abonnement = BackHandler.addEventListener("hardwareBackPress", () => {
      setInscription(false);
      return true;
    });
    return () => abonnement.remove();
  }, [inscription]);

  // Ce qu'on a trouvé au bout de l'adresse livrée. `null` = pas encore su.
  const [etat, setEtat] = useState<EtatPlateforme | null>(null);

  // L'ACCUEIL — les trois écrans qu'on ne voit qu'une fois.
  // `null` = on n'a pas encore lu le réglage : on n'affiche RIEN plutôt que
  // de montrer le formulaire une demi-seconde avant de le recouvrir.
  const [accueilli, setAccueilli] = useState<boolean | null>(null);
  useEffect(() => {
    accueilDejaVu().then(setAccueilli).catch(() => setAccueilli(true));
  }, []);

  const autre = autreLangue(langue);
  // Le drapeau dit la langue qu'on OBTIENT en appuyant — celle qu'on cherche.
  const drapeau = autre.code === "fr" ? "🇫🇷" : "🇬🇧";
  const nomAutre = autre.code === "fr" ? "Français" : "English";

  /** Frapper à la porte : y a-t-il un TOTEM à l'adresse livrée ? */
  const sonder = useCallback(async () => {
    setEtat(null);
    setEtat(await verifierPlateforme());
  }, []);
  useEffect(() => { void sonder(); }, [sonder]);

  // Le mot de passe ne part jamais vers ce qui a répondu « je ne suis pas un
  // TOTEM », ni vers un TOTEM qui dit lui-même ne pas savoir connecter.
  const porteOuverte = etat !== "absente" && etat !== "non-configuree";
  const avis = etat === "injoignable" ? t.reseauEnPanne
    : etat === "absente" || etat === "non-configuree" ? t.connexionIndisponible
      : null;

  const complet = Boolean(courriel) && Boolean(motdepasse);

  const valider = async () => {
    if (!complet || enCours || !porteOuverte) return;
    setEnCours(true);
    setErreur(null);
    try {
      await ouvrir(courriel, motdepasse, langue);
      setMotdepasse("");
    } catch (e) {
      // Le guichet rend déjà le message dans la bonne langue ; on ne le
      // réécrit pas ici, on ne fait que le montrer.
      const message = e instanceof Error ? e.message : "";
      setErreur(message || t.connexionImpossible);
      setEnCours(false);
    }
  };

  // L'accueil d'abord — et rien tant qu'on ne sait pas s'il a été vu.
  if (accueilli === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.surface }} />;
  }
  if (!accueilli) {
    return <Bienvenue onFini={() => setAccueilli(true)} />;
  }
  if (inscription) {
    return <Inscription porteOuverte={porteOuverte} avis={avis}
                        onRetour={() => setInscription(false)} />;
  }

  return (
    // Le même fond neutre que le reste de l'application : le propriétaire a
    // tranché — la marque se porte en NOIR sur fond clair, comme les écrans
    // qu'on habite.
    <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.surface }}>
      {/* `padding` SUR LES DEUX PLATEFORMES. Sur Android, ce composant ne
          faisait RIEN (`behavior: undefined`) : ouvrir le clavier recouvrait
          le champ du mot de passe, et l'on tapait douze caractères à
          l'aveugle. « Je ne voyais pas mon mot de passe » — c'était ça. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Defilement
          contentContainerStyle={{
            flexGrow: 1, justifyContent: "center",
            padding: espaces.xl, gap: espaces.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* L'entrée en scène : la marque d'abord, puis la carte, puis le
              pied — chaque bloc se pose, dans l'ordre où l'œil les prend. */}
          <Entree delai={0} style={{ alignItems: "center", gap: espaces.md }}>
            <Symbole taille={44} couleur={couleurs.encre} />
            <MotTotem taille={24} couleur={couleurs.encre} />
            <Texte taille={textes.titre} poids="demi" style={{ textAlign: "center" }}>
              {t.titre}
            </Texte>
          </Entree>

          {supprime ? (
            <Carte style={{ padding: espaces.lg }}>
              <Texte taille={textes.petit} style={{ lineHeight: 20 }}
                     accessibilityLiveRegion="polite">
                {t.compteSupprime}
              </Texte>
            </Carte>
          ) : null}

          <Entree delai={80}>
          <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
            <Texte taille={textes.petit} ton="doux" poids="moyen">
              {t.courriel}
            </Texte>
            <ChampTexte
              value={courriel}
              onChangeText={(v) => { setCourriel(v); setErreur(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              inputMode="email"
              editable={!enCours && porteOuverte}
              style={{
                borderWidth: 1,
                borderColor: erreur ? couleurs.negatif : couleurs.trait,
                borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
                paddingHorizontal: espaces.md, paddingVertical: espaces.md,
                fontFamily: polices.corps, fontSize: textes.corps,
                color: couleurs.encre,
              }}
            />

            <Texte taille={textes.petit} ton="doux" poids="moyen">
              {t.motDePasse}
            </Texte>

            <View style={{
              flexDirection: "row", alignItems: "center",
              borderWidth: 1, borderColor: erreur ? couleurs.negatif : couleurs.trait,
              borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
              paddingHorizontal: espaces.md,
            }}>
              <ChampTexte
                value={motdepasse}
                onChangeText={(v) => { setMotdepasse(v); setErreur(null); }}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                editable={!enCours && porteOuverte}
                onSubmitEditing={valider}
                returnKeyType="go"
                style={{
                  flex: 1, paddingVertical: espaces.md,
                  fontFamily: polices.corps, fontSize: textes.corps,
                  color: couleurs.encre,
                }}
              />
              {/* L'œil : une icône nue, donc un `BoutonIcone` — il s'enfonce
                  sous le doigt et s'annonce comme un bouton. Écrit à la main,
                  il ne faisait ni l'un ni l'autre, et son étiquette était en
                  français quel que soit l'écran. */}
              <BoutonIcone
                nom={visible ? "EyeOff" : "Eye"}
                couleur={couleurs.encrePale}
                etiquette={visible ? t.masquerMotDePasse : t.montrerMotDePasse}
                onPress={() => setVisible((v) => !v)}
              />
            </View>

            {erreur ? (
              <Texte taille={textes.petit} ton="negatif">{erreur}</Texte>
            ) : avis ? (
              // Un seul message, en mots simples — jamais une adresse web.
              <View style={{ gap: espaces.xs }}>
                <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
                  {avis}
                </Texte>
                <Pressable onPress={() => void sonder()} hitSlop={8}
                           accessibilityRole="button" style={appuiTexte}>
                  <Texte taille={textes.petit} ton="doux" poids="moyen"
                         style={{ textDecorationLine: "underline" }}>
                    {t.reessayer}
                  </Texte>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={valider}
              disabled={!complet || enCours || !porteOuverte}
              style={({ pressed }) => ({
                backgroundColor: !complet || !porteOuverte
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
          </Entree>

          {/* CRÉER UN COMPTE — visible sans chercher, sous la carte. La
              plupart de ceux qui ouvrent l'application pour la première
              fois n'ont pas encore de compte : c'est pour eux. */}
          <Entree delai={100}>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setErreur(null); setInscription(true); }}
              style={({ pressed }) => ({
                borderWidth: 1, borderColor: couleurs.trait,
                borderRadius: rayons.bouton,
                backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
                paddingVertical: espaces.md, paddingHorizontal: espaces.lg,
                alignItems: "center", gap: 2,
              })}
            >
              <Texte taille={textes.petit} ton="doux">{t.pasEncoreDeCompte}</Texte>
              <Texte poids="demi">{t.creerUnCompte}</Texte>
            </Pressable>
          </Entree>

          {/* Le pied : la langue. */}
          <Entree delai={120} style={{ gap: espaces.lg, alignItems: "center" }}>
            {/* La bascule de langue : un drapeau et le nom de l'AUTRE langue,
                dans une pastille visible — celle qui la cherche la voit. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => changerLangue(autre.code)}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: espaces.sm,
                backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
                borderWidth: 1, borderColor: couleurs.surface2,
                borderRadius: 999,
                paddingVertical: espaces.sm + 2, paddingHorizontal: espaces.lg,
              })}
            >
              <Texte taille={18}>{drapeau}</Texte>
              <Texte taille={textes.petit} poids="moyen">{nomAutre}</Texte>
            </Pressable>
          </Entree>
        </Defilement>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
