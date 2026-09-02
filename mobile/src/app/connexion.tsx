// Le verrou de l'application.
//
// UN COURRIEL ET UN MOT DE PASSE, vérifiés contre un compte rangé en base. Le
// mot de passe n'y est jamais : seulement son empreinte, qui ne se remonte
// pas. Le même écran sert à créer un compte — c'est la même paire de champs,
// il aurait été absurde d'en faire deux écrans.
//
// LE PREMIER COMPTE de la plateforme est celui du propriétaire : il entre
// tout de suite. Les suivants sont créés et attendent qu'il leur ouvre.
//
// Ce n'est PAS le code PIN Mobile Money. Celui-là ne se saisit qu'au moment
// d'une opération, sur un pavé de boutons, et ne s'enregistre nulle part. La
// note en bas de l'écran le dit, parce que c'est exactement là qu'on peut se
// tromper.
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
  ActivityIndicator, KeyboardAvoidingView, Pressable,
  ScrollView, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  BoutonIcone, Carte, MotTotem, Pastille, Texte, appuiTexte, avecAppui,
  couleurs, espaces, rayons, textes,
} from "@/ui";
import { Symbole } from "@/marque";
import { Entree } from "@/animations";
import { Bienvenue, accueilDejaVu } from "@/bienvenue";
import { Icone } from "@/icones";
import { useChangerLangue, useLangue } from "@/langue";
import { useSession } from "@/session";
import {
  adressePlateforme, adresseValable, definirAdresse, peutSInscrire,
  verifierPlateforme, type EtatPlateforme,
} from "@/api/guichet";
import { textesConnexion } from "@noyau/textes/connexion";
import { autreLangue } from "@noyau/langue";
import { polices } from "@/theme/jetons";

export default function Connexion() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesConnexion[langue];
  const { ouvrir, inscrire } = useSession();

  // « entrer » : je me connecte. « creer » : je crée un compte.
  const [mode, setMode] = useState<"entrer" | "creer">("entrer");
  const [courriel, setCourriel] = useState("");
  const [motdepasse, setMotdepasse] = useState("");
  const [attente, setAttente] = useState(false);   // compte créé, en attente
  // Peut-on encore créer un compte ? La plateforme l'a dit en répondant à
  // « y a-t-il un TOTEM ici ». Un bouton qui mène toujours à un refus est un
  // bouton de trop.
  const [inscriptionOuverte, setInscriptionOuverte] = useState(false);
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
    setInscriptionOuverte(peutSInscrire());
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

  // Au moins douze caractères : la longueur vaut mieux que la complication,
  // et c'est la seule règle. Voir web/lib/motdepasse.ts.
  const assezLong = motdepasse.length >= 12;
  const complet = mode === "creer"
    ? Boolean(courriel) && assezLong
    : Boolean(courriel) && Boolean(motdepasse);

  const valider = async () => {
    if (!complet || enCours || !porteOuverte) return;
    setEnCours(true);
    setErreur(null);
    try {
      if (mode === "creer") {
        const entre = await inscrire(courriel, motdepasse, langue);
        setMotdepasse("");          // rien ne subsiste après l'envoi
        // Un compte en attente ne connecte personne : on le dit, franchement,
        // plutôt que de laisser croire à un échec.
        if (!entre) { setAttente(true); setEnCours(false); }
        return;
      }
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

  const changerDeMode = () => {
    setMode((m) => (m === "entrer" ? "creer" : "entrer"));
    setMotdepasse("");
    setErreur(null);
  };

  // L'accueil d'abord — et rien tant qu'on ne sait pas s'il a été vu.
  if (accueilli === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.surface }} />;
  }
  if (!accueilli) {
    return <Bienvenue onFini={() => setAccueilli(true)} />;
  }

  // LE COMPTE EST CRÉÉ, ET IL ATTEND. On le dit sur un écran à lui : renvoyer
  // au formulaire donnerait l'impression d'un échec, alors que tout s'est
  // bien passé — il manque seulement l'accord du propriétaire.
  if (attente) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.surface }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1, justifyContent: "center",
            padding: espaces.xl, gap: espaces.lg,
          }}
        >
          <View style={{ alignItems: "center", gap: espaces.md }}>
            <MotTotem taille={22} couleur={couleurs.encre} />
            <Texte taille={textes.titre} poids="demi" style={{ textAlign: "center" }}>
              {t.compteEnAttenteTitre}
            </Texte>
            <Texte ton="doux" style={{ textAlign: "center", lineHeight: 22 }}>
              {t.compteEnAttenteTexte}
            </Texte>
          </View>
          <Pressable
            onPress={() => { setAttente(false); setMode("entrer"); }}
            accessibilityRole="button"
            style={avecAppui({
              borderWidth: 1, borderColor: couleurs.trait,
              borderRadius: rayons.bouton, paddingVertical: espaces.md,
              alignItems: "center",
            })}
          >
            <Texte poids="demi" ton="doux">{t.jAiDejaUnCompte}</Texte>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    // Le même fond neutre que le reste de l'application : le propriétaire a
    // tranché — la marque se porte en NOIR sur fond clair, comme les écrans
    // qu'on habite. Le sable et la latérite restent à la couverture.
    <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.surface }}>
      {/* `padding` SUR LES DEUX PLATEFORMES. Sur Android, ce composant ne
          faisait RIEN (`behavior: undefined`) : ouvrir le clavier recouvrait
          le champ du mot de passe, et l'on tapait douze caractères à
          l'aveugle. « Je ne voyais pas mon mot de passe » — c'était ça. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
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
              {mode === "creer" ? t.inscriptionTitre : t.titre}
            </Texte>
            {/* Le sous-titre ne s'affiche qu'à la création d'un compte, où il
                dit une chose utile (le compte attendra l'approbation). À la
                connexion, il ne faisait que remplir l'écran. */}
            {mode === "creer" ? (
              <Texte ton="doux" style={{ textAlign: "center", lineHeight: 22 }}>
                {t.inscriptionSousTitre}
              </Texte>
            ) : null}
          </Entree>

          {/* LA PLATEFORME — seulement quand elle a quelque chose à dire.
              Quand l'adresse embarquée répond « je suis un TOTEM », cet
              encart n'apprenait rien : il occupait l'écran avec une URL que
              personne ne lit. Il ne s'affiche plus que s'il y a un SOUCI
              (pas de plateforme, injoignable) ou qu'on est en train de
              changer l'adresse — les deux seuls moments où il est la
              réponse à une vraie question. */}
          {porteOuverte && saisie === null ? null : (
          <Entree delai={40}>
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
                    accessibilityRole="button"
                    style={appuiTexte}
                  >
                    <Texte taille={textes.petit} ton="doux" poids="moyen"
                           style={{ textDecorationLine: "underline" }}>
                      {t.changerAdresse}
                    </Texte>
                  </Pressable>
                  {etat !== null && etat !== "trouvee" ? (
                    <Pressable onPress={() => void sonder()} hitSlop={8}
                               accessibilityRole="button" style={appuiTexte}>
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
                    accessibilityRole="button"
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
                    accessibilityRole="button"
                    style={avecAppui({
                      alignItems: "center", justifyContent: "center",
                      borderWidth: 1, borderColor: couleurs.trait,
                      borderRadius: rayons.bouton,
                      paddingVertical: espaces.md, paddingHorizontal: espaces.lg,
                    })}
                  >
                    <Texte ton="doux">{t.annuler}</Texte>
                  </Pressable>
                </View>
              </>
            )}
          </Carte>
          </Entree>
          )}

          <Entree delai={80}>
          <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
            <Texte taille={textes.petit} ton="doux" poids="moyen">
              {t.courriel}
            </Texte>
            <TextInput
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
              <TextInput
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

            {mode === "creer" ? (
              <Texte
                taille={textes.legende}
                ton={motdepasse && !assezLong ? "negatif" : "pale"}
                style={{ lineHeight: 18 }}
              >
                {t.motDePasseConseil}
              </Texte>
            ) : null}

            {erreur ? (
              <Texte taille={textes.petit} ton="negatif">{erreur}</Texte>
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
                {enCours ? t.verification
                  : mode === "creer" ? t.creerUnCompte : t.seConnecter}
              </Texte>
            </Pressable>
          </Carte>
          </Entree>

          {/* Le pied, réduit à ce qui SERT : changer de mode s'il y a lieu,
              changer de langue, retrouver l'adresse de la plateforme quand
              tout va bien (un mot discret, pas un encart). La promesse sur le
              code PIN vit dans la politique de confidentialité et sur le pavé
              lui-même — la répéter ici ne faisait qu'épaissir l'écran. */}
          <Entree delai={120} style={{ gap: espaces.lg, alignItems: "center" }}>
            {(inscriptionOuverte || mode === "creer") && (
              <Pressable onPress={changerDeMode} hitSlop={8} disabled={enCours}
                         accessibilityRole="button" style={appuiTexte}>
                <Texte taille={textes.petit} poids="moyen" ton="doux"
                       style={{ textDecorationLine: "underline" }}>
                  {mode === "creer" ? t.jAiDejaUnCompte : t.creerUnCompte}
                </Texte>
              </Pressable>
            )}

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
