// Une opération, du premier chiffre au code secret — en plein écran.
//
// Le pendant mobile de `web/app/operation.tsx`, et il suit le MÊME
// déroulement : vous dites à qui et combien, la vraie session USSD s'ouvre
// sur la carte de Douala, l'application répond elle-même aux questions du
// menu avec vos informations, et quand l'opérateur réclame le code secret, le
// pavé prend la main. Une question qu'on ne comprend pas vous est posée
// telle quelle : on ne devine jamais.
//
// Ce qui décide « est-ce le code secret qu'on me demande ? » ne vit pas ici
// mais dans `@noyau/ussd`, partagé avec la plateforme et testé. Deux
// jugements différents sur la même question, et le code partirait en clair
// d'un côté.
//
// UNE QUESTION PAR ÉCRAN. La version d'avant tenait dans une feuille posée
// sur l'accueil : un en-tête, une frise, le texte de l'opérateur, ses choix,
// un lien d'échange, un bouton rouge — tout à la fois, sur la moitié d'un
// écran, avec le clavier du téléphone par-dessus. Le propriétaire l'a dit
// sans détour : « trop d'informations au même endroit ». On ne retouche pas
// un écran pareil, on le refait :
//
//   « À qui ? »  →  « Combien ? »  →  « Vérifiez »  →  on parle à MTN…
//   →  le code secret  →  c'est fait.
//
// Chaque écran ne pose qu'une question, en grand. Les chiffres se tapent sur
// un pavé À NOUS, posé dans l'écran : le clavier du téléphone ne monte plus
// par-dessus le bouton, ni sur iPhone ni sur Android. Le menu de l'opérateur
// ne se montre plus quand l'application y répond seule — on montre ce qui se
// passe (« on parle avec MTN… »), pas comment. Il ne réapparaît que s'il
// pose une question qu'on ne sait pas servir, et alors ses choix sont des
// boutons. Le texte de l'opérateur, lui, reste à un geste (« Détails »), mot
// pour mot : on met en forme, on ne cache rien.

import { useEffect, useRef, useState } from "react";
import {
  Alert, Keyboard, KeyboardAvoidingView, Modal, Pressable, View,
  useWindowDimensions,
} from "react-native";
import {
  Easing, FadeIn, FadeInRight, useAnimatedStyle, useSharedValue, withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoutonIcone, ChampTexte, Defilement, Texte } from "@/ui";
import { Animated, useMouvementReduit } from "@/animations";
import { Icone, type NomIcone } from "@/icones";
import {
  couleurOperateur, couleurs, espaces, polices, rayons, textes,
} from "@/theme/jetons";
import { deposerCommande, lireCommande } from "@/api/guichet";
import { useLangue } from "@/langue";
import { toucherDepart, toucherEchec, toucherReussite } from "@/toucher";
import { remplirVariables } from "@noyau/codes";
import {
  champPourQuestion, demandeUnCode, lireEcran, type TypeChamp,
} from "@noyau/ussd";
import { formaterNumero } from "@noyau/numero";
import { nombre } from "@noyau/types";
import type { ClientRecent } from "@noyau/recents";
import { textesGuichet } from "@noyau/textes/guichet";

export type ChampOperation = {
  cle: string;
  label: string;
  aide: string;
  type: TypeChamp;
};

export type Operation = {
  titre: string;
  code: string;                 // le code USSD composé en premier, tel quel
  champs: ChampOperation[];     // vide : la session s'ouvre directement
  /** L'ICCID de la carte visée. Sans lui, le robot composerait sur sa
   *  première carte — et avec deux SIM, une opération Orange partirait sur
   *  la MTN. */
  carte?: string;
  /** Le parcours complet quand le bouton vient du carnet appris. Jamais le
   *  code secret : l'apprentissage s'arrête juste avant. */
  etapes?: string[];
  /** Le terminal qui doit exécuter — celui de la carte visée. */
  terminal?: string | null;
  /** « MTN ·8901 » : le nom de la carte, pour la vérification. */
  carteLibelle?: string;
  /** « MTN » : à qui l'on parle, pendant que le réseau répond. */
  operateur?: string;
  /** Les numéros déjà vus sur cette carte, proposés d'un geste. */
  recents?: ClientRecent[];
};

type Msg = { de: "reseau" | "vous"; texte: string };

// Combien de fois on interroge la base en attendant la réponse du réseau.
// 25 × 1,2 s ≈ trente secondes : au-delà, le terminal est considéré muet.
const TOURS = 25;
const PAUSE_MS = 1200;

/** Des montants qu'on tape tous les jours — un geste au lieu de six chiffres. */
const MONTANTS = [1000, 5000, 10000, 25000];

const LONGUEUR_CODE_MIN = 4;
const LONGUEUR_CODE_MAX = 6;

const chiffresDe = (v: string) => v.replace(/\D/g, "");

/** Un numéro se tient à partir de huit chiffres ; un montant, dès le premier
 *  franc. Le réseau reste juge : ceci n'évite que le « Continuer » à vide. */
function pret(type: TypeChamp, valeur: string): boolean {
  const c = chiffresDe(valeur);
  return type === "numero" ? c.length >= 8 : Number(c) > 0;
}

export function OperationPopup({
  operation, onFermer, onTermine,
}: {
  operation: Operation;
  onFermer: () => void;
  onTermine?: () => void;
}) {
  const langue = useLangue();
  const t = textesGuichet[langue];

  const [etape, setEtape] = useState<"saisie" | "session">(
    operation.champs.length ? "saisie" : "session");
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [fil, setFil] = useState<Msg[]>([]);
  const [attente, setAttente] = useState(false);
  const [enSession, setEnSession] = useState(false);
  // LA CLÉ D'INTENTION DE CETTE OPÉRATION — tirée une fois, à l'ouverture.
  // Elle accompagne le premier code composé, celui qui peut porter le
  // bénéficiaire et le montant. Si ce geste repart (un appui recompté, une
  // requête reprise après un délai), la plateforme reconnaît la clé et rend
  // la demande déjà créée : l'argent ne part pas deux fois.
  const cleOperation = useRef<string>(
    `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reponseLibre, setReponseLibre] = useState("");

  const avecCarte = (p: Record<string, unknown>) =>
    operation.carte ? { ...p, carte: operation.carte } : p;

  // Les champs pas encore consommés par les questions du réseau.
  const restants = useRef<ChampOperation[]>([...operation.champs]);
  // L'écran est-il encore monté ? Une session peut répondre après la
  // fermeture ; on ne veut pas écrire dans un composant démonté.
  const vivant = useRef(true);
  // Un raccrochage est-il DÛ au démontage ? Le nettoyage ci-dessous le lit ;
  // il est tenu à jour plus bas, dès que la session vit ou se termine.
  const raccrochageDu = useRef(false);
  useEffect(() => () => {
    vivant.current = false;
    // QUITTER SANS RACCROCHER LAISSE LA SIM EN LIGNE. Les boutons raccrochent
    // déjà ; ce qui manquait, c'est le départ AUTREMENT — un balayage arrière,
    // la navigation, l'application mise en fond. La fiche se démonte alors
    // sans un mot, et la session reste ouverte sur la vraie carte, à Douala :
    // l'opération suivante peut échouer parce que la carte est encore sur un
    // menu. On raccroche.
    if (raccrochageDu.current) {
      void deposerCommande("ussd_fin", avecCarte({}), operation.terminal).catch(() => {});
    }
  }, [operation.terminal]);

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));
  const complet = operation.champs.every((c) => (valeurs[c.cle] ?? "").trim());
  const chiffres = (v: string) => v.replace(/\D/g, "");

  /** Dépose une demande et attend la réponse du réseau. */
  const envoyer = async (
    genre: "ussd" | "ussd_reponse",
    parametres: Record<string, unknown>,
    bulle?: Msg,
    // Jointe au seul envoi qui peut porter un transfert complet : l'ouverture.
    cle?: string,
  ): Promise<string | null> => {
    setAttente(true);
    setErreur(null);
    if (bulle) setFil((f) => [...f, bulle]);
    try {
      // La carte voyage avec CHAQUE geste de la session : la plateforme y
      // lit que la réponse vient du titulaire de cette carte, et le robot
      // dans quelle session la poser.
      const demande = avecCarte(parametres);
      const { id } = await deposerCommande(genre, demande, operation.terminal, cle);
      for (let i = 0; i < TOURS; i++) {
        await new Promise((r) => setTimeout(r, PAUSE_MS));
        if (!vivant.current) return null;
        const c = await lireCommande(id).catch(() => null);
        if (c && (c.etat === "faite" || c.etat === "echouee")) {
          setAttente(false);
          const texte = c.resultat || (c.etat === "faite" ? t.reponseVide : t.echec);
          setFil((f) => [...f, { de: "reseau", texte }]);
          if (c.etat === "echouee") { setEnSession(false); setFini(true); return null; }
          setEnSession(true);
          return texte;
        }
      }
      throw new Error(t.terminalMuet);
    } catch (e) {
      // Le guichet rend déjà ses messages dans la bonne langue : tels quels.
      setErreur(e instanceof Error && e.message ? e.message : t.accroc);
      setAttente(false);
      return null;
    }
  };

  // Après chaque réponse du réseau : répondre tout seul si on sait, sinon
  // rendre la main (le pavé pour le code, une zone de texte pour le reste).
  const derouler = async (texte: string | null) => {
    while (texte) {
      if (demandeUnCode(texte)) return;                  // le pavé prend la main
      const champ = champPourQuestion(texte, restants.current);
      if (!champ) return;                                // question inattendue : à vous
      restants.current = restants.current.filter((c) => c !== champ);
      const valeur = chiffres(valeurs[champ.cle] ?? "");
      texte = await envoyer("ussd_reponse", { texte: valeur }, { de: "vous", texte: valeur });
    }
  };

  // UNE SEULE SESSION, JAMAIS DEUX. `setEtape` est asynchrone : un
  // double-appui sur « Lancer » rappelle `lancer` avant que le pied ne se
  // redessine, et déposait DEUX commandes « ussd » pour la même carte — deux
  // sessions ouvertes sur la SIM, une opération d'argent jouée deux fois. Le
  // verrou synchrone (un drapeau, pas un état) ferme cette porte, comme
  // partout ailleurs dans le code. `lancer` est à usage unique de toute
  // façon : une fois lancée, l'écran quitte l'étape « saisie ».
  const lance = useRef(false);
  const lancer = async () => {
    if (lance.current) return;
    lance.current = true;
    // Le clavier de la saisie ne survit pas à la saisie : resté ouvert, il
    // couvrait la session — le message de l'opérateur, le pavé du code.
    Keyboard.dismiss();
    setEtape("session");
    restants.current = [...operation.champs];
    const brutes = operation.etapes?.length ? operation.etapes : [operation.code];

    // LES TROUS D'ABORD. Un code peut porter « {numero} » et « {montant} » :
    // on les remplace par ce qui vient d'être saisi, et le code part alors
    // ENTIER, le réseau ne demandant plus que le code secret.
    const { etapes, consommees, manquantes } = remplirVariables(brutes, valeurs);
    // Un trou sans réponse ne part JAMAIS tel quel : « {numero} » composé au
    // réseau, c'est un code faux — au mieux il échoue, au pire il tombe sur
    // autre chose. On s'arrête, et on dit lequel manque.
    if (manquantes.length) {
      setErreur(t.trouSansReponse(manquantes.map((m) => `{${m}}`).join(", ")));
      setFini(true);
      return;
    }
    // Ce qui voyage déjà dans le code ne se resaisit pas ensuite.
    if (consommees.length) {
      restants.current = restants.current.filter((c) => !consommees.includes(c.cle));
    }

    let texte = await envoyer(
      "ussd",
      operation.carte ? { code: etapes[0], carte: operation.carte } : { code: etapes[0] },
      { de: "vous", texte: etapes[0] },
      cleOperation.current);
    for (const e of etapes.slice(1)) {
      if (texte == null) return;
      texte = await envoyer("ussd_reponse", { texte: e }, { de: "vous", texte: e });
    }
    await derouler(texte);
  };

  // Sans formulaire, la session part toute seule à l'ouverture.
  const parti = useRef(false);
  useEffect(() => {
    if (operation.champs.length === 0 && !parti.current) {
      parti.current = true;
      void lancer();
    }
  }, []);

  // UNE RÉPONSE PART UNE SEULE FOIS — le code secret surtout.
  //
  // `lancer` a son verrou synchrone ; `secret` et `repondre` n'en avaient
  // pas, et s'en remettaient à l'état asynchrone `attente` pour cacher le
  // déclencheur. Or le re-rendu qui cache le pavé arrive APRÈS l'appel : un
  // double-appui rapide sur « Valider » envoyait donc DEUX fois
  // « ussd_reponse … secret:true » dans la session USSD vivante — le code
  // secret joué deux fois, exactement ce que le verrou de `lancer` empêche
  // sur son chemin. Un drapeau synchrone, partagé, ferme cette porte ; il se
  // relève quand la requête est finie, pour qu'une vraie seconde réponse
  // (une autre question du réseau) reste possible.
  const repondEnCours = useRef(false);

  const secret = async (code: string) => {
    if (repondEnCours.current) return;
    repondEnCours.current = true;
    try {
      // La bulle affichée n'est PAS le code : quatre points. Le code ne
      // traverse que la requête, et le robot le masque en base sitôt lu.
      const texte = await envoyer("ussd_reponse", { texte: code, secret: true },
                                  { de: "vous", texte: "••••" });
      if (texte) { setFini(true); onTermine?.(); }
    } finally {
      repondEnCours.current = false;
    }
  };

  const repondre = async (brut: string) => {
    const valeur = brut.trim();
    if (!valeur) return;
    if (repondEnCours.current) return;
    repondEnCours.current = true;
    setReponseLibre("");
    try {
      await derouler(await envoyer("ussd_reponse", { texte: valeur },
                                   { de: "vous", texte: valeur }));
    } finally {
      repondEnCours.current = false;
    }
  };

  /** L'ordre de raccrochage, sans faire attendre l'écran. */
  const posterFin = () => {
    raccrochageDu.current = false;   // c'est fait : le démontage ne refait rien
    void deposerCommande("ussd_fin", avecCarte({}), operation.terminal).catch(() => {});
  };

  const raccrocher = () => { posterFin(); onFermer(); };

  // Fermer alors qu'une commande est encore EN VOL : on raccroche
  // défensivement — une session qui s'ouvre après la fermeture ne doit pas
  // rester pendue sur la carte, sans écran pour la conduire.
  const fermerSession = () => {
    if (attente && !fini) posterFin();
    onFermer();
  };

  // Une session vivante et non finie devra être raccrochée si l'on quitte.
  useEffect(() => { raccrochageDu.current = enSession && !fini; }, [enSession, fini]);

  const dernier = [...fil].reverse().find((m) => m.de === "reseau")?.texte ?? "";
  const ecran = lireEcran(dernier);
  const pave = enSession && !attente && !fini && demandeUnCode(dernier);
  const reduit = useMouvementReduit();
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState(false);
  const [libre, setLibre] = useState(false);
  // Le formulaire, un champ par écran : `pas` désigne le champ montré, et
  // le dernier pas (= nombre de champs) est la vérification.
  const [pas, setPas] = useState(0);
  const verification = pas >= operation.champs.length;

  // L'OPÉRATEUR A CONCLU. Un écran qui ne demande plus rien (« Votre solde
  // est… », « Opération réussie ») termine la session : on n'offre plus un
  // champ de réponse vide sous une phrase qui n'attend rien. Un geste discret
  // permet tout de même de répondre — dans le doute, on rend la main.
  const conclu = enSession && !attente && Boolean(dernier) && ecran.attend === "rien";
  useEffect(() => {
    if (conclu && !fini && !libre) { setFini(true); onTermine?.(); }
  }, [conclu, fini, libre]);

  // L'issue de l'écran de fin : ce que l'opérateur a dit, pas ce qu'on espère.
  const issue: Issue = erreur ? "interrompue"
    : ecran.issue === "refusee" ? "refusee"
      : ecran.issue === "reussie" ? "reussie" : "reponse";
  const termine = fini || Boolean(erreur);

  // CE QUE L'ÉCRAN A DIT, ET RIEN D'AUTRE, SE SENT AU DOIGT. Une réussite
  // que l'opérateur a écrite vibre « réussi » ; un refus, « échec ». Une
  // simple réponse (un solde) ne vibre pas : elle n'est ni l'un ni l'autre.
  const sentie = useRef(false);
  useEffect(() => {
    if (!termine || sentie.current) return;
    sentie.current = true;
    if (issue === "reussie") toucherReussite();
    else if (issue === "refusee" || issue === "interrompue") toucherEchec();
  }, [termine, issue]);

  const op = operation.operateur || operation.carteLibelle?.split(/\s/)[0] || t.reseau;
  const saisieEntamee = operation.champs.some((c) => (valeurs[c.cle] ?? "").trim());

  // UNE SEULE PORTE DE SORTIE — la croix, le retour d'Android, le balayage.
  // Une session vivante ne se quitte pas sans raccrocher, et une saisie
  // entamée ne se jette pas sans question.
  const sortir = () => {
    if (etape === "session" && enSession && !termine) {
      Alert.alert(t.raccrocherQuestion, undefined, [
        { text: t.garderSession, style: "cancel" },
        { text: t.raccrocherCourt, style: "destructive", onPress: raccrocher },
      ]);
      return;
    }
    if (etape === "saisie" && saisieEntamee) {
      Alert.alert(t.jeterQuestion, undefined, [
        { text: t.continuerSaisie, style: "cancel" },
        { text: t.jeter, style: "destructive", onPress: onFermer },
      ]);
      return;
    }
    if (etape === "session" && !termine) fermerSession(); else onFermer();
  };
  // Le retour ramène à la question d'avant ; à la première, il sort.
  const reculer = () => {
    if (etape === "saisie" && pas > 0) setPas((p) => p - 1);
    else sortir();
  };
  const avancer = () => setPas((p) => p + 1);

  // Le destinataire, tel qu'on le connaît : son nom s'il est dans les SMS.
  const champNumero = operation.champs.find((c) => c.type === "numero");
  const champMontant = operation.champs.find((c) => c.type === "montant");
  const numeroSaisi = champNumero ? chiffresDe(valeurs[champNumero.cle] ?? "") : "";
  const montantSaisi = champMontant ? Number(chiffresDe(valeurs[champMontant.cle] ?? "")) : 0;
  const nomDuDestinataire = operation.recents?.find((r) => r.numero === numeroSaisi)?.nom;

  // Ce que l'on montre, une chose à la fois.
  let vue: React.ReactNode;
  let cleVue: string;
  if (etape === "saisie" && !verification) {
    const champ = operation.champs[pas];
    cleVue = `champ-${pas}`;
    vue = (
      <EtapeChiffres
        titre={champ.type === "montant" ? t.combien : champ.label}
        type={champ.type}
        valeur={valeurs[champ.cle] ?? ""}
        aide={champ.aide}
        onChange={(v) => set(champ.cle, v)}
        recents={champ.type === "numero" ? operation.recents : undefined}
        onRecent={(n) => { set(champ.cle, n); avancer(); }}
        bouton={t.continuer}
        onValider={avancer}
        langue={langue}
      />
    );
  } else if (etape === "saisie") {
    cleVue = "verification";
    vue = (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center",
                       paddingHorizontal: espaces.xl, gap: espaces.md }}>
          <Texte taille={textes.petit} ton="pale">{t.verifiez}</Texte>
          {montantSaisi ? (
            <Montant valeur={montantSaisi} langue={langue} grand />
          ) : (
            <Texte taille={textes.titre} poids="demi" style={{ textAlign: "center" }}>
              {operation.titre}
            </Texte>
          )}
          {numeroSaisi ? (
            <View style={{ alignItems: "center", gap: 2 }}>
              <Texte taille={textes.intertitre} style={{ textAlign: "center" }}>
                {t.vers} <Texte taille={textes.intertitre} poids="demi">
                  {nomDuDestinataire || formaterNumero(numeroSaisi)}
                </Texte>
              </Texte>
              {nomDuDestinataire ? (
                <Texte ton="doux" chiffresAlignes>{formaterNumero(numeroSaisi)}</Texte>
              ) : null}
            </View>
          ) : null}
          {operation.carteLibelle ? (
            <PastilleCarte libelle={t.depuis(operation.carteLibelle)} operateur={op} />
          ) : null}
        </View>
        <Texte taille={textes.petit} ton="pale"
               style={{ textAlign: "center", paddingHorizontal: espaces.xl,
                        marginBottom: espaces.md }}>
          {t.codeEnsuite}
        </Texte>
        <GrosBouton libelle={t.confirmer}
                    onPress={() => { toucherDepart(); void lancer(); }} />
      </View>
    );
  } else if (termine) {
    cleVue = "fin";
    vue = (
      <Fin
        issue={issue}
        titre={issue === "reussie" ? t.opReussie : issue === "refusee" ? t.opRefusee
          : issue === "interrompue" ? t.opInterrompue : t.opReponse}
        texte={erreur ?? (ecran.texte || dernier)}
        note={issue === "reussie" ? t.confirmationSms : undefined}
        fil={fil}
        details={details}
        onDetails={() => setDetails((d) => !d)}
        // Fini sur une simple réponse : peut-être attendait-il encore
        // quelque chose. On ne le devine pas — on rend la main.
        repondreQuandMeme={issue === "reponse" && conclu && !libre
          ? () => { setLibre(true); setFini(false); } : undefined}
        bouton={t.termine}
        // Une session encore ouverte (un accroc en plein échange) se
        // raccroche en partant : elle ne reste pas pendue sur la carte.
        onTerminer={enSession && !fini ? raccrocher : onFermer}
        t={t}
      />
    );
  } else if (pave) {
    cleVue = `code-${fil.length}`;
    vue = <EtapeCode onValider={secret} t={t} />;
  } else if (attente || !dernier) {
    cleVue = "attente";
    vue = <Attente texte={!dernier ? t.connexionA(op) : t.onParleA(op)}
                   couleur={couleurOperateur(op)} reduit={reduit} />;
  } else if (ecran.choix.length && !libre) {
    cleVue = `menu-${fil.length}`;
    vue = (
      <Defilement contentContainerStyle={{ padding: espaces.xl, gap: espaces.sm }}>
        <Texte taille={textes.petit} ton="pale">{t.operateurDemande(op)}</Texte>
        {/* Le texte du réseau, mot pour mot : jamais traduit. */}
        {ecran.texte ? (
          <Texte taille={textes.titre} poids="demi" style={{ marginBottom: espaces.md }}>
            {ecran.texte}
          </Texte>
        ) : null}
        {ecran.choix.map((c) => (
          <Choix key={`${c.numero}-${c.libelle}`} libelle={c.libelle}
                 onPress={() => void repondre(c.numero)} />
        ))}
        <Pressable accessibilityRole="button" onPress={() => setLibre(true)} hitSlop={8}
          style={({ pressed }) => ({ alignSelf: "center", padding: espaces.md,
                                      opacity: pressed ? 0.5 : 1 })}>
          <Texte taille={textes.petit} ton="doux">{t.autreReponse}</Texte>
        </Pressable>
      </Defilement>
    );
  } else if (ecran.attend === "texte") {
    cleVue = `texte-${fil.length}`;
    vue = (
      <View style={{ flex: 1, padding: espaces.xl, gap: espaces.lg }}>
        <Texte taille={textes.petit} ton="pale">{t.operateurDemande(op)}</Texte>
        <Texte taille={textes.titre} poids="demi">{ecran.texte || dernier}</Texte>
        <ChampTexte
          value={reponseLibre}
          onChangeText={setReponseLibre}
          placeholder={t.votreReponse}
          placeholderTextColor={couleurs.encrePale}
          autoFocus
          onSubmitEditing={() => void repondre(reponseLibre)}
          style={{
            borderBottomWidth: 2, borderColor: couleurs.encre,
            paddingVertical: espaces.md, fontFamily: polices.moyen,
            fontSize: textes.titre, color: couleurs.encre,
          }}
        />
        <View style={{ flex: 1 }} />
        <GrosBouton libelle={t.envoyer} desactive={!reponseLibre.trim()}
                    onPress={() => void repondre(reponseLibre)} />
      </View>
    );
  } else {
    // L'opérateur demande un chiffre qu'on ne sait pas servir seul — un
    // numéro, un montant, ou un choix qu'on veut taper soi-même : le même
    // pavé que pour la saisie, sous SA question à lui.
    cleVue = `question-${fil.length}`;
    vue = (
      <EtapeChiffres
        surtitre={t.operateurDemande(op)}
        titre={ecran.texte || dernier}
        type={ecran.attend === "montant" ? "montant" : "numero"}
        brut={ecran.attend !== "numero" && ecran.attend !== "montant"}
        valeur={reponseLibre}
        aide=""
        onChange={setReponseLibre}
        recents={ecran.attend === "numero" ? operation.recents : undefined}
        onRecent={(n) => void repondre(n)}
        bouton={t.envoyer}
        onValider={() => void repondre(reponseLibre)}
        langue={langue}
      />
    );
  }

  const nbPas = operation.champs.length + 1;

  return (
    <Modal visible animationType={reduit ? "none" : "slide"}
           presentationStyle="fullScreen" onRequestClose={reculer}
           statusBarTranslucent>
      <View style={{
        flex: 1, backgroundColor: couleurs.surface,
        paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, espaces.lg),
      }}>
        {/* L'EN-TÊTE : revenir, ce qu'on fait, sortir. Rien d'autre. */}
        <View style={{
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: espaces.lg, paddingVertical: espaces.md, gap: espaces.md,
        }}>
          <View style={{ width: 32 }}>
            {etape === "saisie" && pas > 0 ? (
              <BoutonIcone nom="Chevron" etiquette={t.retour} onPress={reculer}
                           style={{ transform: [{ rotate: "180deg" }] }} />
            ) : null}
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Texte poids="demi" numberOfLines={1}>{operation.titre}</Texte>
            {operation.carteLibelle ? (
              <Texte taille={textes.legende} ton="pale" numberOfLines={1}>
                {operation.carteLibelle}
              </Texte>
            ) : null}
          </View>
          <View style={{ width: 32, alignItems: "flex-end" }}>
            {termine ? null : (
              <BoutonIcone nom="Close" etiquette={t.fermer} onPress={sortir} />
            )}
          </View>
        </View>

        {/* Où l'on en est du formulaire : un trait, pas une frise. */}
        {etape === "saisie" && nbPas > 1 ? (
          <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: espaces.xl }}>
            {Array.from({ length: nbPas }).map((_, i) => (
              <View key={i} style={{
                flex: 1, height: 3, borderRadius: 2,
                backgroundColor: i <= pas ? couleurs.encre : couleurs.surface3,
              }} />
            ))}
          </View>
        ) : null}

        {/* `behavior="padding"`, sans condition de plateforme : le seul
            champ du système qui reste (une réponse en lettres) ne doit pas
            finir sous le clavier. */}
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Animated.View key={cleVue} style={{ flex: 1 }}
            entering={reduit ? undefined
              : etape === "saisie" ? FadeInRight.duration(220) : FadeIn.duration(260)}>
            {vue}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

type Issue = "reussie" | "refusee" | "interrompue" | "reponse";
type T = (typeof textesGuichet)["fr"];

/** Un montant en grand : les chiffres, puis « FCFA » plus petit à côté. */
function Montant({ valeur, langue, grand, vide }: {
  valeur: number; langue: "fr" | "en"; grand?: boolean; vide?: boolean;
}) {
  const taille = grand ? 48 : 44;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: espaces.sm }}>
      <Texte taille={taille} poids="demi" chiffresAlignes ton={vide ? "pale" : "normal"}
             maxFontSizeMultiplier={1.2} adjustsFontSizeToFit numberOfLines={1}
             style={{ letterSpacing: -1 }}>
        {nombre(valeur, langue)}
      </Texte>
      <Texte taille={textes.intertitre} ton="pale" poids="moyen">FCFA</Texte>
    </View>
  );
}

/**
 * UN CHAMP DE CHIFFRES, SUR UN ÉCRAN À LUI.
 *
 * La question en haut, la réponse en très grand au milieu, le pavé en bas.
 * Pas de clavier du téléphone : sur iPhone, le pavé numérique du système
 * n'a pas de touche « OK » et couvrait le bouton suivant — le pavé est ici
 * une partie de l'écran, il ne cache rien.
 */
function EtapeChiffres({
  surtitre, titre, type, brut, valeur, aide, onChange, recents, onRecent,
  bouton, onValider, langue,
}: {
  surtitre?: string;
  titre: string;
  type: TypeChamp;
  /** Une réponse quelconque au menu : on montre les chiffres tels quels. */
  brut?: boolean;
  valeur: string;
  aide: string;
  onChange: (v: string) => void;
  recents?: ClientRecent[];
  onRecent: (numero: string) => void;
  bouton: string;
  onValider: () => void;
  langue: "fr" | "en";
}) {
  const t = textesGuichet[langue];
  const c = chiffresDe(valeur);
  const max = type === "montant" ? 9 : 15;
  const taper = (x: string) => onChange((c + x).replace(/^0+(?=\d)/, "").slice(0, max));
  const effacer = () => onChange(c.slice(0, -1));
  const valide = brut ? c.length > 0 : pret(type, c);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: espaces.xl, paddingTop: espaces.xl, gap: espaces.xs }}>
        {surtitre ? <Texte taille={textes.petit} ton="pale">{surtitre}</Texte> : null}
        <Texte taille={textes.titre} poids="demi" style={{ lineHeight: 32 }}>{titre}</Texte>
      </View>

      <View style={{ flex: 1, justifyContent: "center", alignItems: "center",
                     paddingHorizontal: espaces.xl, gap: espaces.lg }}>
        {type === "montant" && !brut ? (
          <Montant valeur={Number(c) || 0} langue={langue} vide={!c} />
        ) : (
          <Texte taille={36} poids="demi" chiffresAlignes numberOfLines={1}
                 adjustsFontSizeToFit maxFontSizeMultiplier={1.2}
                 ton={c ? "normal" : "pale"} style={{ letterSpacing: 0.5 }}>
            {c ? (brut ? c : formaterNumero(c)) : (aide || "—")}
          </Texte>
        )}

        {/* Les montants de tous les jours, sous le montant. */}
        {type === "montant" && !brut ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center",
                         gap: espaces.sm }}>
            {MONTANTS.map((m) => {
              const choisi = Number(c) === m;
              return (
                <Pressable key={m} accessibilityRole="button" onPress={() => onChange(String(m))}
                  style={({ pressed }) => ({
                    paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                    borderRadius: rayons.rond,
                    backgroundColor: choisi ? couleurs.encre
                      : pressed ? couleurs.surface3 : couleurs.surface2,
                  })}>
                  <Texte taille={textes.petit} poids="moyen" chiffresAlignes
                         style={choisi ? { color: couleurs.surfaceHaute } : undefined}>
                    {nombre(m, langue)}
                  </Texte>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* UN NUMÉRO DÉJÀ VU SE CHOISIT, IL NE SE RETAPE PAS. La faute de
            frappe sur le chiffre vers lequel l'argent part est la plus chère
            de toutes. Un visage, un prénom : on reconnaît avant de lire. */}
        {recents?.length ? (
          <View style={{ alignSelf: "stretch", gap: espaces.sm }}>
            <Texte taille={textes.legende} ton="pale" style={{ textAlign: "center" }}>
              {t.clientsRecents}
            </Texte>
            <Defilement horizontal showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: espaces.md, paddingHorizontal: espaces.xs,
                                                 flexGrow: 1, justifyContent: "center" }}>
              {recents.map((r) => (
                <Visage key={r.numero} client={r} choisi={r.numero === c}
                        onPress={() => onRecent(r.numero)} />
              ))}
            </Defilement>
          </View>
        ) : null}
      </View>

      <Pave onChiffre={taper} onEffacer={effacer}
            gauche={type === "montant" && !brut ? "000" : undefined}
            etiquetteEffacer={t.effacerDernier} />
      <GrosBouton libelle={bouton} desactive={!valide} onPress={onValider} />
    </View>
  );
}

/** Un client récent : ses initiales dans un rond, son prénom dessous. */
function Visage({ client, choisi, onPress }: {
  client: ClientRecent; choisi: boolean; onPress: () => void;
}) {
  const nom = client.nom.trim();
  const mots = nom.split(/\s+/).filter(Boolean);
  const initiales = mots.length
    ? (mots[0][0] + (mots[1]?.[0] ?? "")).toUpperCase()
    : client.numero.slice(-2);
  // Dans une LISTE, on coupe : les visages s'alignent, l'œil parcourt. Mais
  // sur DEUX lignes : deux « Nkengafac » se distinguent par le second mot.
  const court = mots.length
    ? mots.slice(0, 2).map((m) => m[0] + m.slice(1).toLowerCase()).join(" ")
    : formaterNumero(client.numero);
  return (
    <Pressable accessibilityRole="button"
               accessibilityLabel={`${nom || ""} ${formaterNumero(client.numero)}`.trim()}
               onPress={onPress}
               style={({ pressed }) => ({ width: 72, alignItems: "center", gap: espaces.xs,
                                           opacity: pressed ? 0.6 : 1 })}>
      <View style={{
        width: 52, height: 52, borderRadius: rayons.rond, alignItems: "center",
        justifyContent: "center",
        backgroundColor: choisi ? couleurs.encre : couleurs.surfaceHaute,
        borderWidth: 1, borderColor: choisi ? couleurs.encre : couleurs.trait,
      }}>
        <Texte poids="demi" style={choisi ? { color: couleurs.surfaceHaute } : undefined}>
          {initiales}
        </Texte>
      </View>
      <Texte taille={textes.legende} ton="doux" numberOfLines={2}
             style={{ textAlign: "center", lineHeight: 15 }}>{court}</Texte>
    </Pressable>
  );
}

/**
 * LE PAVÉ — à nous, dans l'écran. Trois colonnes, quatre rangées, de grandes
 * touches sans bordure qui s'éclairent sous le doigt.
 */
function Pave({ onChiffre, onEffacer, gauche, etiquetteEffacer }: {
  onChiffre: (c: string) => void;
  onEffacer: () => void;
  gauche?: string;
  etiquetteEffacer: string;
}) {
  const { height } = useWindowDimensions();
  // Un petit écran (iPhone SE) garde la place du bouton sous le pavé.
  const haut = height < 700 ? 50 : 60;
  const rangees: (string | null)[][] = [
    ["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [gauche ?? null, "0", "⌫"],
  ];
  return (
    <View style={{ paddingHorizontal: espaces.lg, paddingBottom: espaces.sm }}>
      {rangees.map((r, i) => (
        <View key={i} style={{ flexDirection: "row" }}>
          {r.map((x, j) => x == null ? <View key={j} style={{ flex: 1, height: haut }} /> : (
            <Pressable key={j} accessibilityRole="button"
              accessibilityLabel={x === "⌫" ? etiquetteEffacer : x}
              onPress={() => (x === "⌫" ? onEffacer() : onChiffre(x))}
              style={({ pressed }) => ({
                flex: 1, height: haut, alignItems: "center", justifyContent: "center",
                borderRadius: rayons.carte * 2,
                backgroundColor: pressed ? couleurs.surface2 : "transparent",
              })}>
              <Texte taille={x === "000" ? textes.intertitre : 28}
                     poids={x === "⌫" ? "normal" : "moyen"} chiffresAlignes
                     maxFontSizeMultiplier={1.1}
                     ton={x === "⌫" ? "doux" : "normal"}>
                {x}
              </Texte>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Le grand bouton du bas — un seul par écran. */
function GrosBouton({ libelle, onPress, desactive }: {
  libelle: string; onPress: () => void; desactive?: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: espaces.lg }}>
      <Pressable accessibilityRole="button" disabled={desactive} onPress={onPress}
        accessibilityState={{ disabled: Boolean(desactive) }}
        style={({ pressed }) => ({
          height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center",
          backgroundColor: desactive ? couleurs.surface3
            : pressed ? couleurs.accentAppui : couleurs.accent,
          transform: [{ scale: pressed && !desactive ? 0.98 : 1 }],
        })}>
        <Texte poids="demi" taille={17}
               style={{ color: desactive ? couleurs.encrePale : couleurs.surfaceHaute }}>
          {libelle}
        </Texte>
      </Pressable>
    </View>
  );
}

/** La carte d'où part l'opération, en pastille, à la couleur de l'opérateur. */
function PastilleCarte({ libelle, operateur }: { libelle: string; operateur: string }) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: espaces.sm,
      paddingHorizontal: espaces.md, paddingVertical: espaces.xs + 2,
      borderRadius: rayons.rond, backgroundColor: couleurs.surfaceHaute,
      borderWidth: 1, borderColor: couleurs.trait, marginTop: espaces.sm,
    }}>
      <View style={{ width: 8, height: 8, borderRadius: rayons.rond,
                     backgroundColor: couleurOperateur(operateur) }} />
      <Texte taille={textes.petit} ton="doux">{libelle}</Texte>
    </View>
  );
}

/**
 * LE CODE SECRET. Des points, le pavé, « Valider ». Les chiffres ne vivent
 * que dans l'état de ce composant : jamais affichés, jamais journalisés,
 * envoyés seulement à « Valider » — puis aussitôt oubliés ici, et masqués
 * en base par le robot sitôt lus. Trois choses qu'on serait tenté
 * d'ajouter, et qu'il ne faut PAS : le clavier du système (suggestions,
 * historique, claviers tiers), un « afficher le code » (le pavé sert dans un
 * taxi, dans une file), une vibration par chiffre (son rythme donne la
 * longueur du code).
 */
function EtapeCode({ onValider, t }: { onValider: (code: string) => void; t: T }) {
  const [code, setCode] = useState("");
  const valider = () => {
    if (code.length < LONGUEUR_CODE_MIN) return;
    onValider(code);
    setCode("");            // rien ne subsiste après l'envoi
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: espaces.md }}>
        <View style={{ width: 56, height: 56, borderRadius: rayons.rond,
                       backgroundColor: couleurs.surface2, alignItems: "center",
                       justifyContent: "center" }}>
          <Icone nom="Lock" taille={24} couleur={couleurs.encre} />
        </View>
        <Texte taille={textes.titre} poids="demi">{t.codeTitre}</Texte>
        <Texte taille={textes.petit} ton="pale">{t.codeNote}</Texte>
        <View accessibilityLabel={t.chiffresComposes(code.length)}
              style={{ flexDirection: "row", gap: espaces.md, marginTop: espaces.lg,
                       height: 16, alignItems: "center" }}>
          {Array.from({ length: Math.max(LONGUEUR_CODE_MIN, code.length) }).map((_, i) => (
            <View key={i} style={{
              width: 14, height: 14, borderRadius: rayons.rond,
              backgroundColor: i < code.length ? couleurs.encre : "transparent",
              borderWidth: 1.5, borderColor: i < code.length ? couleurs.encre : couleurs.encrePale,
            }} />
          ))}
        </View>
      </View>
      <Pave onChiffre={(x) => setCode((v) => (v.length >= LONGUEUR_CODE_MAX ? v : v + x))}
            onEffacer={() => setCode((v) => v.slice(0, -1))}
            etiquetteEffacer={t.effacerDernier} />
      <GrosBouton libelle={t.valider} desactive={code.length < LONGUEUR_CODE_MIN}
                  onPress={valider} />
    </View>
  );
}

/** Un choix du menu de l'opérateur : une rangée qu'on touche. */
function Choix({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: espaces.md,
        paddingHorizontal: espaces.lg, paddingVertical: espaces.lg,
        borderRadius: 14,
        backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
      })}>
      <Texte taille={17} poids="moyen" style={{ flex: 1 }}>{libelle}</Texte>
      <Icone nom="Chevron" taille={18} couleur={couleurs.encrePale} />
    </Pressable>
  );
}

/**
 * L'ATTENTE — la carte est à Douala, le réseau met quelques secondes. Un
 * rond qui respire, à la couleur de l'opérateur, et UNE phrase : ce qui se
 * passe, pas comment.
 */
function Attente({ texte, couleur, reduit }: { texte: string; couleur: string; reduit: boolean }) {
  const souffle = useSharedValue(0);
  useEffect(() => {
    if (reduit) return;
    souffle.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduit]);
  const anneau = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + souffle.value * 0.25 }],
    opacity: 0.35 - souffle.value * 0.25,
  }));
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: espaces.xl }}
          accessibilityLiveRegion="polite">
      <View style={{ width: 120, height: 120, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={[{
          position: "absolute", width: 120, height: 120, borderRadius: rayons.rond,
          backgroundColor: couleur,
        }, anneau]} />
        <View style={{ width: 72, height: 72, borderRadius: rayons.rond,
                       backgroundColor: couleurs.surfaceHaute, alignItems: "center",
                       justifyContent: "center", borderWidth: 3, borderColor: couleur }}>
          <Icone nom="PuceSim" taille={28} couleur={couleurs.encre} />
        </View>
      </View>
      <Texte taille={textes.intertitre} poids="moyen" style={{ textAlign: "center" }}>
        {texte}
      </Texte>
    </View>
  );
}

/** C'est fini : ce que l'opérateur a dit, en une phrase et une couleur. */
function Fin({
  issue, titre, texte, note, fil, details, onDetails, repondreQuandMeme,
  bouton, onTerminer, t,
}: {
  issue: Issue;
  titre: string;
  texte: string;
  note?: string;
  fil: Msg[];
  details: boolean;
  onDetails: () => void;
  repondreQuandMeme?: () => void;
  bouton: string;
  onTerminer: () => void;
  t: T;
}) {
  const icone: NomIcone = issue === "reussie" ? "Check"
    : issue === "reponse" ? "Bubble" : "Close";
  const teinte = issue === "reussie" ? couleurs.positifVif
    : issue === "reponse" ? couleurs.encre : couleurs.negatif;
  return (
    <View style={{ flex: 1 }}>
      <Defilement contentContainerStyle={{
        flexGrow: 1, justifyContent: "center", alignItems: "center",
        padding: espaces.xl, gap: espaces.lg,
      }}>
        <Animated.View entering={FadeIn.duration(300)} style={{
          width: 88, height: 88, borderRadius: rayons.rond, alignItems: "center",
          justifyContent: "center", backgroundColor: teinte,
        }}>
          <Icone nom={icone} taille={40} couleur={couleurs.surfaceHaute} />
        </Animated.View>
        <Texte taille={textes.titre} poids="demi" style={{ textAlign: "center" }}>
          {titre}
        </Texte>
        {/* Le texte du réseau, mot pour mot : jamais traduit. Pour une simple
            réponse (un solde, un numéro), c'est lui l'information — en grand. */}
        {texte ? (
          <Texte taille={issue === "reponse" ? textes.intertitre : textes.corps}
                 ton={issue === "reponse" ? "normal" : "doux"}
                 style={{ textAlign: "center", lineHeight: issue === "reponse" ? 28 : 22 }}>
            {texte}
          </Texte>
        ) : null}
        {note ? (
          <Texte taille={textes.petit} ton="pale" style={{ textAlign: "center", lineHeight: 20 }}>
            {note}
          </Texte>
        ) : null}
        {repondreQuandMeme ? (
          <Pressable accessibilityRole="button" onPress={repondreQuandMeme} hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Texte taille={textes.petit} ton="doux" style={{ textDecorationLine: "underline" }}>
              {t.repondreQuandMeme}
            </Texte>
          </Pressable>
        ) : null}

        {/* L'ÉCHANGE ENTIER, d'un geste : ce qu'on a envoyé, ce que
            l'opérateur a répondu. Le code secret n'y est jamais — quatre
            points. */}
        {fil.length > 1 ? (
          <Pressable accessibilityRole="button" onPress={onDetails} hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginTop: espaces.md })}>
            <Texte taille={textes.petit} ton="doux">
              {details ? t.masquerDetails : t.details}
            </Texte>
          </Pressable>
        ) : null}
        {details ? (
          <View style={{ alignSelf: "stretch", gap: espaces.sm }}>
            {fil.map((m, k) => (
              <View key={k} style={{
                alignSelf: m.de === "vous" ? "flex-end" : "flex-start", maxWidth: "85%",
                backgroundColor: m.de === "vous" ? couleurs.accent : couleurs.surfaceHaute,
                borderRadius: 14, paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
              }}>
                <Texte taille={textes.petit}
                       style={m.de === "vous" ? { color: couleurs.surfaceHaute } : undefined}>
                  {m.texte}
                </Texte>
              </View>
            ))}
          </View>
        ) : null}
      </Defilement>
      <GrosBouton libelle={bouton} onPress={onTerminer} />
    </View>
  );
}
