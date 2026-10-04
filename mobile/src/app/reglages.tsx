// Les réglages : la langue, le terminal, la sortie.
//
// Écran à part plutôt qu'un cinquième onglet : on y vient une fois par mois,
// et la barre garde ses quatre entrées — ce qu'un propriétaire vient faire.
//
// Ce qui n'y est PAS, à dessein : rien qui touche au code secret. Il ne se
// règle pas, ne se garde pas, ne s'oublie pas — il n'existe qu'au moment
// d'une opération.
//
// RIEN NE POUSSE LE BAS DE L'ÉCRAN APRÈS COUP. À chaque ouverture, « Sécurité »
// et « Se déconnecter » s'affichaient, puis descendaient d'un bloc entier une
// à trois secondes plus tard — la liste des comptes arrivait — et encore
// jusqu'à quatre-vingts secondes plus tard, quand l'essai de notification
// finissait de réinscrire le téléphone. Chaque bloc qui attend quelque chose
// garde maintenant sa place : des formes grises pour ce qui n'est pas encore
// là, le dernier état connu pour ce qui se revérifie en fond — et ce dernier
// état est gardé SUR LE TÉLÉPHONE, pas seulement en mémoire : on vient ici
// une fois par mois, et la mémoire se perd à chaque lancement.
//
// Quand le cahier n'a ENCORE RIEN (juste après la connexion), l'écran
// s'arrête sous les cartes. Les codes USSD — une section de six rangées PAR
// OPÉRATEUR, qu'on ne connaît pas encore — et ce qui les suit arrivaient
// après coup et poussaient « Sécurité » de cinq cents points par opérateur.
// Rien de ce qui est à l'écran ne bouge donc quand les chiffres arrivent :
// ce qui manque s'ajoute EN DESSOUS.
//
// La roue ne tourne que sous le doigt (`useRoue`) : revenu du boîtier
// qu'on vient de rebrancher, on tire, et « hors ligne » se relit.

import { useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, View,
  Pressable, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Defilement, Accroc, BoutonIcone, Carte, Filet, MotTotem, Pastille, Texte,
        appuiTexte, avecAppui } from "@/ui";
import { Squelette } from "@/animations";
import { Icone } from "@/icones";
import { SectionCartes, carteRetiree, motDuRefus } from "@/reglages-cartes";
import { SectionCodes } from "@/reglages-codes";
import { SectionQui } from "@/reglages-qui";
import { boitierSeTait, depuisQuand, FicheTerminalHorsLigne } from "@/terminal-hors-ligne";
import { couleurs, espaces, textes } from "@/theme/jetons";
import { useDonnees, useMaintenant, useRoue } from "@/donnees";
import { useChangerLangue, useLangue } from "@/langue";
import { useSession } from "@/session";
import { essaiNotification } from "@/api/guichet";
import * as Reglage from "@/api/reglage";
import {
  inscrireAvecPatience, peutEncoreDemander, souciDeLaSonnerie,
  type EtatSonnerie,
} from "@/sonnerie";
import { textesReglages } from "@noyau/textes/reglages";
import { textesAccueil } from "@noyau/textes/accueil";
import { messageDEssai } from "@noyau/essai";
import { textesCharpente } from "@noyau/textes/charpente";
import { LANGUES } from "@noyau/langue";
import { SANS_NOUVELLES_S } from "@noyau/boitier";
import { ageVu, FUSEAU_DEFAUT } from "@noyau/types";

export default function Reglages() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesReglages[langue];
  const c = textesCharpente[langue];
  const ta = textesAccueil[langue];
  const { fermer } = useSession();
  const { donnees, attente, erreur, recharger, actualiser, quand, duCahier } =
    useDonnees({ sms: 0, recus: 0 });
  // La seule roue permise : levée par le doigt, jamais par un chargement.
  const roue = useRoue();
  const maintenant = useMaintenant();
  const [ficheTerminal, setFicheTerminal] = useState(false);
  const terminal = donnees?.terminal ?? null;
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;
  // Les cartes en place d'abord — c'est elles qu'on vient régler. Une carte
  // dont le boîtier se tait n'est pas « retirée » : elle reste à sa place.
  const sims = [...(donnees?.sims ?? [])]
    .sort((a, b) => Number(carteRetiree(a)) - Number(carteRetiree(b)));
  // Une section de codes PAR OPÉRATEUR présent, comme au web : le repli
  // « Orange » d'autrefois mentait dès qu'une MTN était dans le berceau.
  const enPlaceOps = sims.filter((s) => !carteRetiree(s)).map((s) => s.operateur);
  const operateurs = [...new Set([...enPlaceOps, ...sims.map((s) => s.operateur)])]
    .filter((op) => op && op !== "?");

  // L'ÉTAT DU BOÎTIER, À L'HEURE DE L'ÉCRAN. « il y a 12 s » restait écrit
  // des heures : c'était une photo prise au chargement. L'âge du dernier
  // signe de vie avance maintenant avec l'horloge de l'écran, à partir de
  // ce que la plateforme a mesuré — jamais d'après l'horloge du téléphone
  // comparée à celle du boîtier.
  //
  // Le verdict « hors ligne » reste celui de la plateforme, le même que
  // l'accueil et les Opérations (`terminal-hors-ligne.tsx`). Mais on ne dit
  // plus « actif » sur des chiffres qui ne le prouvent plus : relus du
  // téléphone, ou dont le dernier signe de vie connu a passé le seuil
  // faute d'avoir été relu. On dit alors seulement de quand datent les
  // dernières nouvelles.
  const seTait = boitierSeTait(donnees, duCahier);
  // « Revérifier » a parlé, et le boîtier est revenu : la fiche se referme.
  useEffect(() => { if (ficheTerminal && !seTait) setFicheTerminal(false); }, [ficheTerminal, seTait]);
  const ageS = terminal?.vuIlYa != null && quand != null
    ? terminal.vuIlYa + Math.max(0, maintenant - quand) / 1000 : null;
  const ilYa = ageS != null
    ? ageVu(maintenant - ageS * 1000, maintenant, langue) : (terminal?.majTexte ?? "");
  const incertain = !seTait && (duCahier || (ageS != null && ageS > SANS_NOUVELLES_S));

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
      <Defilement contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg }}
                  keyboardShouldPersistTaps="handled"
                  refreshControl={roue}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
          <BoutonIcone nom="Chevron" etiquette={t.annuler}
                       onPress={() => router.back()}
                       style={{ transform: [{ rotate: "180deg" }] }} />
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
        </View>

        {/* La panne se dit : sans cela, un terminal et des cartes
            absents ressemblaient à un compte vide. */}
        {erreur ? <Accroc message={erreur} onReessayer={() => void recharger()} /> : null}

        {/* La langue */}
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.intertitre} poids="demi">{t.langue}</Texte>
          <Carte>
            {LANGUES.map((l, i) => (
              <View key={l.code}>
                {i > 0 ? <Filet /> : null}
                <Pressable
                  accessibilityRole="button"
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

        {/* Le terminal. Sans rien au cahier, sa place se garde en formes
            grises ; en panne, l'Accroc ci-dessus parle seul. */}
        {donnees || attente ? (
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.intertitre} poids="demi">{t.terminal}</Texte>
          <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
            {terminal ? (
              <>
                {/* Hors ligne, la rangée s'ouvre sur l'explication — ce que
                    cela veut dire, l'argent, quoi faire à la boutique —
                    comme sur l'accueil. « Terminal muet · il y a 3 min » ne
                    disait rien de tout cela. */}
                {seTait ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setFicheTerminal(true)}
                    style={avecAppui({ gap: espaces.xs })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
                      <Pastille couleur={couleurs.alerte} />
                      <Texte ton="alerte">{ta.terminalMuetCourt}</Texte>
                      <Texte taille={textes.petit} ton="pale" chiffresAlignes
                             style={{ marginLeft: "auto" }}>
                        {depuisQuand(terminal?.vuLe ?? null, maintenant, fuseau, langue) ?? ilYa}
                      </Texte>
                      <Icone nom="Chevron" taille={14} couleur={couleurs.alerte} />
                    </View>
                    <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 19 }}>
                      {ta.horsLigneVoir}
                    </Texte>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
                    <Pastille vif={!incertain}
                              couleur={incertain ? couleurs.encrePale : undefined} />
                    <Texte>{incertain ? t.terminal : c.terminalActif}</Texte>
                    <Texte taille={textes.petit} ton="pale" chiffresAlignes
                           style={{ marginLeft: "auto" }}>
                      {incertain ? t.misAJour(ilYa) : ilYa}
                    </Texte>
                  </View>
                )}
                <Filet />
                <Rangee libelle={t.nom} valeur={terminal.nom} />
                {terminal.version ? (
                  <Rangee libelle={t.version} valeur={terminal.version} />
                ) : null}
              </>
            ) : donnees ? (
              // « Aucun terminal ne s'est encore annoncé » veut dire, pour le
              // propriétaire, que son boîtier de Douala a disparu. Les
              // Réglages étant un écran de pile, ils se remontent à CHAQUE
              // visite : la phrase s'affichait donc systématiquement, le
              // temps de la requête. À force de la voir à tort, on ne la
              // croit plus — et c'est le jour où elle est vraie qu'on
              // l'ignore. Elle ne se dit que sur des chiffres REÇUS.
              <Texte ton="doux">{c.aucunTerminal}</Texte>
            ) : (
              <>
                <Squelette largeur="55%" hauteur={18} />
                <Filet />
                <Squelette largeur="70%" hauteur={14} />
                <Squelette largeur="45%" hauteur={14} />
              </>
            )}
          </Carte>
        </View>
        ) : null}

        {/* Les cartes : le nom et le numéro de chacune — ce que la fiche
            des coordonnées montre s'inscrit ici. Un réglage fait se relit
            EN SILENCE : rien ne tourne, rien ne saute. */}
        <SectionCartes sims={sims} langue={langue}
                       terminal={terminal?.id ?? null}
                       attente={attente}
                       onChange={() => actualiser()} />

        {/* RIEN SOUS LES CARTES TANT QUE LE CAHIER N'A RIEN. Les codes
            d'opérateurs qu'on ne connaît pas encore, puis tout ce qui suit,
            arriveraient au-dessus de « Sécurité » et la pousseraient. Ce qui
            n'est pas encore là s'ajoute en dessous, sans rien déplacer. En
            panne, tout se montre : on doit pouvoir se déconnecter. */}
        {attente ? null : (
          <>
            {/* « Est-ce que mon téléphone sonne ? »
                Il existait sur la plateforme web, pas ici — c'est-à-dire pas là
                où l'on vient de refuser ou d'accepter les notifications, et où
                l'on se pose justement la question. */}
            <EssaiNotification />

            {/* Les codes USSD — une section par opérateur vu par le terminal,
                avec les boutons appris par le robot en regard. */}
            {/* Le carnet des boutons d'un opérateur sert à TOUTES ses cartes :
                il reste au propriétaire. Celui qui tient des cartes confiées
                compose avec, il ne le réécrit pas. */}
            {donnees?.proprietaire !== false && operateurs.map((op) => (
              <SectionCodes key={op} operateur={op}
                            enPlace={enPlaceOps.includes(op)}
                            appris={donnees?.raccourcis?.[op] ?? []}
                            langue={langue}
                            terminal={terminal?.id ?? null}
                            onChange={() => actualiser()} />
            ))}

            {/* Qui peut se connecter — visible du propriétaire seul : la
                section se tait d'elle-même pour les autres. */}
            <SectionQui langue={langue} proprietaire={donnees?.proprietaire}
                        sims={donnees?.sims ?? []} />

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
                  accessibilityRole="button"
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
              <Texte taille={textes.legende} ton="pale">
                {donnees?.proprietaire === false ? t.titulaire : t.proprietaire}
              </Texte>
            </View>
          </>
        )}
      </Defilement>
      </KeyboardAvoidingView>

      {ficheTerminal && terminal ? (
        <FicheTerminalHorsLigne vuLe={terminal.vuLe ?? null} maintenant={maintenant}
                                fuseau={fuseau} langue={langue} onReverifier={recharger}
                                onFermer={() => setFicheTerminal(false)} />
      ) : null}
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

/** Ce que cet écran sait de la sonnerie : l'état, le message du système, et
 *  si la permission ne se redemande plus. */
type Sonnerie = { etat: EtatSonnerie; souci: string | null; reglagesUtiles: boolean };

const ETATS_SONNERIE: readonly EtatSonnerie[] = [
  "inscrit", "reservee", "refusee", "simulateur", "sansProjet", "sansJeton", "echec",
];

/**
 * LE DERNIER ÉTAT DE LA SONNERIE QUE CET ÉCRAN A LU — gardé d'une visite à
 * l'autre, et SUR LE TÉLÉPHONE.
 *
 * Chaque ouverture des Réglages FORÇAIT une réinscription complète, et le
 * bloc montrait un petit rond le temps qu'elle finisse : quelques secondes
 * d'ordinaire, jusqu'à quatre-vingts sans réseau (2 + 5 + 15 + 60 s de
 * patience). Puis l'explication, le message du système et « Réessayer »
 * arrivaient d'un coup et poussaient tout le bas de l'écran. On montre
 * maintenant TOUT DE SUITE ce qu'on savait la dernière fois, et l'on
 * revérifie en fond sans changer la hauteur du bloc.
 *
 * Le premier jet ne le gardait qu'en mémoire, perdue à chaque lancement :
 * on vient ici une fois par mois, et presque chaque visite était donc une
 * « première » — « Inscription… », puis le verdict qui changeait la hauteur.
 *
 * Rien de personnel ici : un état de la permission et du service de CE
 * téléphone. Seul « réservé au propriétaire » dépend du compte connecté —
 * et la revérification de fond le redit en quelques instants.
 */
const CLE_SONNERIE = "totem.sonnerie";
let sonnerieLue: Sonnerie | null = null;
let relectureSonnerie: Promise<void> | null = null;

/** Relire ce qui est rangé sur le téléphone — une fois par lancement, dès
 *  le chargement de ce fichier : à l'ouverture des Réglages, c'est fait. */
function relireLaSonnerie(): Promise<void> {
  relectureSonnerie ??= Reglage.lire(CLE_SONNERIE).then((v) => {
    if (sonnerieLue || !v) return;
    const s = JSON.parse(v) as Partial<Sonnerie> | null;
    if (!s || !ETATS_SONNERIE.includes(s.etat as EtatSonnerie)) return;
    sonnerieLue = {
      etat: s.etat as EtatSonnerie,
      souci: typeof s.souci === "string" ? s.souci : null,
      reglagesUtiles: s.reglagesUtiles === true,
    };
  }).catch(() => { /* rien de lisible : on attendra le verdict */ });
  return relectureSonnerie;
}
void relireLaSonnerie();

function retenirLaSonnerie(s: Sonnerie): void {
  sonnerieLue = s;
  void Reglage.ecrire(CLE_SONNERIE, JSON.stringify(s));
}

/** Ce qu'une tentative a donné, dans les mots de cet écran. */
async function lireLaSonnerie(etat: EtatSonnerie): Promise<Sonnerie> {
  const reglagesUtiles = etat === "refusee"
    ? !(await peutEncoreDemander().catch(() => true)) : false;
  return { etat, souci: souciDeLaSonnerie(), reglagesUtiles };
}

/** Les échecs qui passent : un réseau qui tousse, un service qui tarde. */
const PASSAGERS: ReadonlySet<EtatSonnerie> = new Set(["echec", "sansJeton"]);

/**
 * CE QUE LA REVÉRIFICATION DE FOND A LE DROIT DE CHANGER À L'ÉCRAN.
 *
 * Un téléphone inscrit hier l'est encore aujourd'hui : son jeton est chez la
 * plateforme. Qu'une réinscription de fond échoue sur un réseau faible ne
 * prouve pas le contraire — et l'écran disait « Ce téléphone sonnera », puis
 * soixante-dix secondes plus tard virait au rouge sur deux lignes, message
 * du système et bouton en plus, en poussant tout le bas. Un échec PASSAGER
 * ne défait donc pas un « inscrit » : il ne se dit que si la personne
 * appuie — et « Envoyer un essai », toujours là, éprouve la chaîne pour de
 * vrai. Un verdict DÉFINITIF (permission retirée, réservé au propriétaire)
 * remplace, lui, ce qu'on savait.
 *
 * Même état qu'avant : rien ne bouge à l'écran ; le message le plus récent
 * est gardé pour la prochaine visite.
 */
function verdictDeFond(nouveau: Sonnerie): Sonnerie {
  const avant = sonnerieLue;
  if (avant?.etat === "inscrit" && PASSAGERS.has(nouveau.etat)) return avant;
  retenirLaSonnerie(nouveau);
  return avant && avant.etat === nouveau.etat ? avant : nouveau;
}

/** Combien de temps la revérification de fond tient le bouton grisé. Elle
 *  peut dormir entre deux réessais (2, 5, 15, puis 60 s) : au-delà, la
 *  personne doit pouvoir appuyer — et son appui relance une tentative
 *  neuve (`sonnerie.tsx`), au lieu de rejoindre cette attente. */
const FOND_MAX_MS = 15_000;

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
  // Un geste : « Inscrire ce téléphone », appuyé.
  const [inscription, setInscription] = useState(false);
  // La revérification de l'ouverture, en fond.
  const [enFond, setEnFond] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [rate, setRate] = useState(false);
  // Ce qui a empêché ce téléphone de s'inscrire, s'il y a quelque chose —
  // et, d'abord, ce qu'on en savait à la visite précédente.
  const [lu, setLu] = useState<Sonnerie | null>(sonnerieLue);

  // POURQUOI ON REGARDE À L'OUVERTURE DE L'ÉCRAN. C'est ici qu'on vient
  // quand on se demande « pourquoi ça ne sonne pas ». Attendre un appui sur
  // un bouton pour dire « les notifications sont refusées » ferait chercher
  // ailleurs entre-temps.
  //
  // SANS FORCER — ce qui ne veut pas dire sans travailler. Une inscription
  // en route depuis moins de trente secondes se rejoint ; une inscription
  // finie depuis moins de vingt rend son verdict tel quel. Au-delà — le cas
  // ordinaire, on vient ici une fois par mois — une tentative complète
  // repart (`sonnerie.tsx`). Elle travaille EN FOND : l'écran montre déjà le
  // dernier état connu, et seul un verdict qui change vraiment quelque
  // chose le remplace (`verdictDeFond`).
  useEffect(() => {
    let vivant = true;
    const relache = setTimeout(() => { if (vivant) setEnFond(false); }, FOND_MAX_MS);
    void (async () => {
      // Ce qui est rangé d'abord : c'est à LUI que le verdict se compare.
      await relireLaSonnerie();
      if (vivant && sonnerieLue) setLu((deja) => deja ?? sonnerieLue);
      const etat = await inscrireAvecPatience().catch((): EtatSonnerie => "echec");
      const s = verdictDeFond(await lireLaSonnerie(etat));
      if (!vivant) return;
      setLu(s);
      setEnFond(false);
    })();
    return () => { vivant = false; clearTimeout(relache); };
  }, []);

  const explication: Record<EtatSonnerie, string> = {
    inscrit: t.sonnerieInscrit,
    reservee: t.sonnerieReservee,
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
      // Appuyé : le verdict se dit tel qu'il est, quel qu'il soit.
      const etat = await inscrireAvecPatience(true).catch((): EtatSonnerie => "echec");
      const s = await lireLaSonnerie(etat);
      retenirLaSonnerie(s);
      setLu(s);
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
      // La règle est dans le noyau, partagée avec le navigateur : un
      // téléphone qui sonne ne cache plus celui qui se tait.
      const dit = messageDEssai(t, r);
      setRate(dit.rate);
      setMessage(dit.texte);
    } catch (e) {
      // Les mots du guichet — jamais « Network request failed ».
      setRate(true);
      setMessage(motDuRefus(e, t.essaiEchec));
    } finally {
      setEnvoi(false);
    }
  };

  const etat = lu?.etat ?? null;
  const souci = lu?.souci ?? null;
  const pret = etat === "inscrit";
  // Recompiler n'est pas un geste qu'on fait depuis un téléphone : inutile
  // de proposer un bouton qui ne mènerait à rien.
  const peutReessayer = etat !== null && etat !== "inscrit"
    && etat !== "simulateur" && etat !== "sansProjet" && etat !== "reservee";
  // Une inscription travaille : celle qu'on a demandée, ou celle de fond.
  // Le bouton le dit sans changer de taille.
  const occupe = inscription || enFond;

  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi">{t.essai}</Texte>
      <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
        <Texte taille={textes.petit} ton="pale" style={{ lineHeight: 18 }}>
          {t.essaiAide}
        </Texte>

        {/* L'ÉTAT DE CE TÉLÉPHONE, avant tout le reste. C'est la première
            chose à savoir quand ça ne sonne pas. Jamais un rond qui tourne
            à sa place : le dernier état connu, ou — la toute première fois
            sur ce téléphone — « Inscription… », dans une rangée qui a déjà
            la hauteur de deux lignes, celle de la plupart des réponses.
            Cette première fois, la place du bouton n'est PAS gardée : la
            réponse la plus probable est « inscrit », qui n'en a pas, et la
            garder ferait remonter le bas de l'écran presque à chaque fois
            pour l'éviter dans le cas rare. */}
        <View style={{ flexDirection: "row", gap: espaces.sm, alignItems: "flex-start",
                       minHeight: 36 }}>
          <View style={{ paddingTop: 5 }}>
            <Pastille vif={pret} couleur={etat === null ? couleurs.encrePale : undefined} />
          </View>
          <Texte
            taille={textes.petit}
            ton={etat === null ? "pale" : pret ? "doux" : "negatif"}
            style={{ flex: 1, lineHeight: 18 }}
          >
            {etat === null ? t.sonnerieEnCours : explication[etat]}
          </Texte>
        </View>

        {/* Le message du système, tel quel. Il est en anglais et technique —
            on le montre quand même : c'est lui qui permet de dire ce qui
            manque, à nous comme à qui viendrait aider. */}
        {souci ? (
          <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 16 }}>
            {souci}
          </Texte>
        ) : null}

        {/* Une permission refusée pour de bon ne se redemande pas : Android
            ignore l'appel. Le seul chemin passe par ses propres réglages.
            Ce lien QUITTE l'application : Android met un instant à ouvrir ses
            réglages, et pendant cet instant rien ne disait que l'appui était
            pris — d'où l'opacité. */}
        {lu?.reglagesUtiles ? (
          <Pressable accessibilityRole="button" style={appuiTexte}
                     onPress={() => { void Linking.openSettings(); }}>
            <Texte taille={textes.petit} poids="moyen" ton="doux"
                   style={{ textDecorationLine: "underline" }}>
              {t.sonnerieOuvrirReglages}
            </Texte>
          </Pressable>
        ) : null}

        {peutReessayer ? (
          <Pressable
            accessibilityRole="button"
            onPress={reinscrire}
            disabled={occupe}
            style={({ pressed }) => ({
              borderWidth: 1, borderColor: couleurs.trait,
              borderRadius: 10, paddingVertical: espaces.md,
              alignItems: "center", flexDirection: "row",
              justifyContent: "center", gap: espaces.sm,
              backgroundColor: pressed ? couleurs.surface2 : "transparent",
              opacity: occupe ? 0.5 : 1,
            })}
          >
            {/* Le petit rond ne tourne que sous le doigt : la revérification
                de fond se dit en mots, sans rien qui bouge. */}
            {inscription ? <ActivityIndicator size="small" color={couleurs.encrePale} /> : null}
            <Texte poids="demi" ton="doux">
              {occupe ? t.sonnerieEnCours : t.sonnerieInscrire}
            </Texte>
          </Pressable>
        ) : null}

        {/* L'essai n'a de sens que si ce téléphone est inscrit. */}
        <Pressable
          accessibilityRole="button"
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
