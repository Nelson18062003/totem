// Le verrou de l'application.
//
// UN COURRIEL, PUIS UN CODE. Pas de mot de passe : on tape son courriel, un
// code à six chiffres part vers cette boîte, on le tape. Le code sert une
// fois, vit dix minutes, et ne se choisit pas — ce qui vaut mieux qu'un mot
// de passe qu'on choisit mal, qu'on réutilise ailleurs, et dont la fuite
// ailleurs ouvrait la porte ici. Le navigateur fait exactement le même
// chemin, avec la même règle (web/lib/porte.ts).
//
// LE PREMIER COMPTE de la plateforme est celui du propriétaire. Le créer
// envoie, lui aussi, un code : la toute première entrée prouve déjà qu'on
// tient la boîte. Les comptes suivants, c'est le propriétaire qui les crée.
//
// L'écran ne dit JAMAIS si une adresse a un compte (« si cette adresse a un
// accès, un code vient de partir ») — le dire apprendrait à n'importe qui
// quelles adresses ouvrent quelque chose ici.
//
// Ce n'est PAS le code PIN Mobile Money. Celui-là ne se saisit qu'au moment
// d'une opération, sur un pavé de boutons, et ne s'enregistre nulle part.
//
// Ce qui se range dans le coffre, c'est le JETON rendu par la plateforme —
// jamais le code, jamais la clé de secours.
//
// AVANT LE COURRIEL, L'ADRESSE. Cet écran commence par demander à
// l'adresse configurée : « y a-t-il un TOTEM ici ? » Tant que la réponse
// n'est pas oui, les champs restent fermés. L'application a porté pendant un
// temps une adresse d'exemple qui appartenait à quelqu'un d'autre : ce qu'on
// tapait partait vers un serveur inconnu. Rien ne part plus vers une adresse
// qui n'a pas montré patte blanche.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Pressable,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChampTexte, Defilement,
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
  adressePlateforme, adresseValable, codesPossibles, definirAdresse,
  demanderCode, peutSInscrire, verifierPlateforme, type EtatPlateforme,
} from "@/api/guichet";
import { textesConnexion } from "@noyau/textes/connexion";
import { autreLangue } from "@noyau/langue";
import { polices } from "@/theme/jetons";

export default function Connexion() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesConnexion[langue];
  const { ouvrir, inscrire } = useSession();

  // « entrer » : je me connecte. « creer » : je crée le compte du
  // propriétaire. « secours » : je présente la clé de secours.
  const [mode, setMode] = useState<"entrer" | "creer" | "secours">("entrer");
  // Où l'on en est : donner son courriel, ou taper le code reçu.
  const [etape, setEtape] = useState<"courriel" | "code">("courriel");
  const [courriel, setCourriel] = useState("");
  const [code, setCode] = useState("");
  const [cle, setCle] = useState("");
  // Les secondes avant de pouvoir redemander un code : la plateforme refuse
  // d'en poser un second dans la minute, l'écran ne propose pas un geste vain.
  const [renvoi, setRenvoi] = useState(0);
  // Peut-on encore créer un compte ? La plateforme l'a dit en répondant à
  // « y a-t-il un TOTEM ici ». Un bouton qui mène toujours à un refus est un
  // bouton de trop.
  const [inscriptionOuverte, setInscriptionOuverte] = useState(false);
  const [codesOuverts, setCodesOuverts] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (renvoi <= 0) return;
    const minuteur = setTimeout(() => setRenvoi((n) => n - 1), 1000);
    return () => clearTimeout(minuteur);
  }, [renvoi]);

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
    setCodesOuverts(codesPossibles());
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

  // Rien ne part QUE vers un TOTEM qui a répondu.
  const porteOuverte = etat === "trouvee";

  const chiffres = code.replace(/\D/g, "");
  const complet = mode === "secours" ? Boolean(cle)
    : etape === "code" ? chiffres.length === 6
      : Boolean(courriel.trim());

  /** Demander (ou redemander) un code — ou créer le compte du propriétaire,
   *  qui en envoie un lui-même. */
  const envoyerLeCode = async () => {
    if (mode === "creer") await inscrire(courriel.trim(), langue);
    else await demanderCode(courriel.trim(), langue);
    setEtape("code");
    setCode("");
    setRenvoi(60);
  };

  const valider = async () => {
    if (!complet || enCours || !porteOuverte) return;
    setEnCours(true);
    setErreur(null);
    try {
      if (mode === "secours") {
        await ouvrir("", cle, langue);
        setCle("");                 // rien ne subsiste après l'envoi
        return;
      }
      if (etape === "courriel") {
        await envoyerLeCode();
        setEnCours(false);
        return;
      }
      await ouvrir(courriel.trim(), chiffres, langue);
      setCode("");
    } catch (e) {
      // Le guichet rend déjà le message dans la bonne langue ; on ne le
      // réécrit pas ici, on ne fait que le montrer.
      const message = e instanceof Error ? e.message : "";
      setErreur(message || t.connexionImpossible);
      setEnCours(false);
    }
  };

  const renvoyer = async () => {
    if (renvoi > 0 || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      // Un second code se demande toujours par la porte ordinaire — même
      // juste après l'inscription : le compte existe désormais.
      await demanderCode(courriel.trim(), langue);
      setRenvoi(60);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t.connexionImpossible);
    } finally {
      setEnCours(false);
    }
  };

  const changerDeMode = (m: "entrer" | "creer" | "secours") => {
    setMode((actuel) => (actuel === m ? "entrer" : m));
    setEtape("courriel");
    setCode("");
    setCle("");
    setErreur(null);
  };

  // L'accueil d'abord — et rien tant qu'on ne sait pas s'il a été vu.
  if (accueilli === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.surface }} />;
  }
  if (!accueilli) {
    return <Bienvenue onFini={() => setAccueilli(true)} />;
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
              {mode === "creer" ? t.inscriptionTitre : t.titre}
            </Texte>
            {/* Le sous-titre ne s'affiche qu'à la création d'un compte, où il
                dit une chose utile (le compte attendra l'approbation). À la
                connexion, il ne faisait que remplir l'écran. */}
            {mode === "creer" ? (
              <Texte ton="doux" style={{ textAlign: "center", lineHeight: 22 }}>
                {t.premierCompte}
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
                <ChampTexte
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
            {mode === "secours" ? (
              <>
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
                    value={cle}
                    onChangeText={(v) => { setCle(v); setErreur(null); }}
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
                  {/* L'œil : une icône nue, donc un `BoutonIcone` — il
                      s'enfonce sous le doigt et s'annonce comme un bouton. */}
                  <BoutonIcone
                    nom={visible ? "EyeOff" : "Eye"}
                    couleur={couleurs.encrePale}
                    etiquette={visible ? t.masquerMotDePasse : t.montrerMotDePasse}
                    onPress={() => setVisible((v) => !v)}
                  />
                </View>
                <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
                  {t.cleDeSecoursAide}
                </Texte>
              </>
            ) : etape === "courriel" ? (
              <>
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
                  onSubmitEditing={valider}
                  returnKeyType="send"
                  style={{
                borderWidth: 1,
                borderColor: erreur ? couleurs.negatif : couleurs.trait,
                borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
                paddingHorizontal: espaces.md, paddingVertical: espaces.md,
                fontFamily: polices.corps, fontSize: textes.corps,
                color: couleurs.encre,
              }}
                />
                {/* Sans courrier, aucun code ne partira : on le dit AVANT
                    qu'on attende une lettre qui ne viendra jamais. */}
                {porteOuverte && !codesOuverts ? (
                  <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
                    {t.codesIndisponibles}
                  </Texte>
                ) : null}
              </>
            ) : (
              <>
                <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>
                  {t.codeAide(courriel.trim())}
                </Texte>
                <Texte taille={textes.petit} ton="doux" poids="moyen">
                  {t.codeRecu}
                </Texte>
                {/* « oneTimeCode » : le téléphone propose le code tout seul
                    quand la lettre arrive. */}
                <ChampTexte
                  value={code}
                  onChangeText={(v) => { setCode(v.replace(/[^\d\s]/g, "").slice(0, 7)); setErreur(null); }}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  autoFocus
                  editable={!enCours}
                  onSubmitEditing={valider}
                  returnKeyType="go"
                  style={[
                    {
                borderWidth: 1,
                borderColor: erreur ? couleurs.negatif : couleurs.trait,
                borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
                paddingHorizontal: espaces.md, paddingVertical: espaces.md,
                fontFamily: polices.corps, fontSize: textes.corps,
                color: couleurs.encre,
              },
                    { textAlign: "center", letterSpacing: 8, fontSize: textes.titre },
                  ]}
                />
              </>
            )}

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
                {enCours ? (etape === "courriel" && mode !== "secours" ? t.envoiDuCode : t.verification)
                  : mode === "secours" || etape === "code" ? t.seConnecter
                    : mode === "creer" ? t.creerUnCompte : t.recevoirCode}
              </Texte>
            </Pressable>

            {mode !== "secours" && etape === "code" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: espaces.md }}>
                <Pressable onPress={() => void renvoyer()} hitSlop={8}
                           disabled={renvoi > 0 || enCours}
                           accessibilityRole="button" style={appuiTexte}>
                  <Texte taille={textes.petit} ton={renvoi > 0 ? "pale" : "doux"} poids="moyen"
                         style={{ textDecorationLine: renvoi > 0 ? "none" : "underline" }}>
                    {renvoi > 0 ? t.renvoyerDans(renvoi) : t.renvoyer}
                  </Texte>
                </Pressable>
                <Pressable onPress={() => { setEtape("courriel"); setErreur(null); setCode(""); }}
                           hitSlop={8} accessibilityRole="button" style={appuiTexte}>
                  <Texte taille={textes.petit} ton="doux" poids="moyen"
                         style={{ textDecorationLine: "underline" }}>
                    {t.autreAdresse}
                  </Texte>
                </Pressable>
              </View>
            ) : null}
          </Carte>
          </Entree>

          {/* Le pied, réduit à ce qui SERT : changer de mode s'il y a lieu,
              changer de langue, retrouver l'adresse de la plateforme quand
              tout va bien (un mot discret, pas un encart). La promesse sur le
              code PIN vit dans la politique de confidentialité et sur le pavé
              lui-même — la répéter ici ne faisait qu'épaissir l'écran. */}
          <Entree delai={120} style={{ gap: espaces.lg, alignItems: "center" }}>
            {(inscriptionOuverte || mode === "creer") && mode !== "secours" && (
              <Pressable onPress={() => changerDeMode("creer")} hitSlop={8} disabled={enCours}
                         accessibilityRole="button" style={appuiTexte}>
                <Texte taille={textes.petit} poids="moyen" ton="doux"
                       style={{ textDecorationLine: "underline" }}>
                  {mode === "creer" ? t.jAiDejaUnCompte : t.creerUnCompte}
                </Texte>
              </Pressable>
            )}

            {/* La clé de secours ne s'annonce pas plus fort que cela : ce
                n'est pas le chemin de tous les jours. */}
            <Pressable onPress={() => changerDeMode("secours")} hitSlop={8} disabled={enCours}
                       accessibilityRole="button" style={appuiTexte}>
              <Texte taille={textes.legende} ton="pale">
                {mode === "secours" ? t.retourAuCompte : t.cleDeSecours}
              </Texte>
            </Pressable>

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
