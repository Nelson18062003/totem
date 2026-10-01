// Une opération, du premier champ au code secret.
//
// Le pendant mobile de `web/app/operation.tsx`, et il suit le MÊME
// déroulement : vous remplissez le formulaire, la vraie session USSD s'ouvre
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
// LA SURCOUCHE. L'opérateur parle en blocs de texte (« 1. Transfert\n2. Retrait »)
// et l'application les montrait tels quels, en demandant de taper « 1 » :
// un terminal, pas une application. Chaque écran de l'opérateur est
// maintenant LU (`lireEcran`, dans le noyau) : ses choix deviennent des
// boutons, sa question un champ du bon clavier, sa conclusion un écran de
// fin — réussi, refusé, ou simple réponse. Une frise dit où l'on en est.
// Le texte de l'opérateur reste, mot pour mot, et l'échange entier se
// déroule d'un geste : on ne cache rien, on le met en forme.

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, View } from "react-native";
import { FadeIn, FadeInDown } from "react-native-reanimated";

import { Feuille, type Retenue } from "@/feuille";
import { PaveSecret } from "@/pave-secret";
import { ChampTexte, Texte } from "@/ui";
import { Animated, useMouvementReduit } from "@/animations";
import { Icone } from "@/icones";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { deposerCommande, lireCommande } from "@/api/guichet";
import { useLangue } from "@/langue";
import { remplirVariables } from "@noyau/codes";
import {
  champPourQuestion, demandeUnCode, lireEcran, type TypeChamp,
} from "@noyau/ussd";
import { formaterNumero } from "@noyau/numero";
import { fcfa } from "@noyau/types";
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
  /** « MTN ·8901 » : le nom de la carte, pour le récapitulatif. */
  carteLibelle?: string;
  /** Les numéros déjà vus sur cette carte, proposés d'un geste. */
  recents?: ClientRecent[];
};

type Msg = { de: "reseau" | "vous"; texte: string };

// Combien de fois on interroge la base en attendant la réponse du réseau.
// 25 × 1,2 s ≈ trente secondes : au-delà, le terminal est considéré muet.
const TOURS = 25;
const PAUSE_MS = 1200;

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
      void deposerCommande("ussd_fin", {}, operation.terminal).catch(() => {});
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
      const { id } = await deposerCommande(genre, parametres,
                                           operation.terminal, cle);
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
    void deposerCommande("ussd_fin", {}, operation.terminal).catch(() => {});
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
  const [voirEchange, setVoirEchange] = useState(false);
  const [libre, setLibre] = useState(false);

  // L'OPÉRATEUR A CONCLU. Un écran qui ne demande plus rien (« Votre solde
  // est… », « Opération réussie ») termine la session : on n'offre plus un
  // champ de réponse vide sous une phrase qui n'attend rien. Un geste discret
  // permet tout de même de répondre — dans le doute, on rend la main.
  const conclu = enSession && !attente && Boolean(dernier) && ecran.attend === "rien";
  useEffect(() => {
    if (conclu && !fini && !libre) { setFini(true); onTermine?.(); }
  }, [conclu, fini, libre]);

  // Où en est-on ? Connexion → opérateur → code secret → terminé.
  const rangFrise = fini || erreur ? 3 : pave ? 2 : enSession ? 1 : 0;

  // L'issue de l'écran de fin : ce que l'opérateur a dit, pas ce qu'on espère.
  const issue = erreur && !dernier ? "interrompue"
    : fini && ecran.issue === "refusee" ? "refusee"
      : fini && ecran.issue === "reussie" ? "reussie"
        : fini && pave === false && fil.some((m) => m.texte === "••••") && ecran.issue !== "refusee"
          ? (ecran.issue ?? "reponse") : "reponse";

  // Tant que la session est vivante, toute sortie passe par la confirmation.
  // Et un formulaire entamé ne se jette pas sans question.
  const saisieEntamee = operation.champs.some((c) => (valeurs[c.cle] ?? "").trim());
  const retenue: Retenue | null =
    etape === "session" && enSession && !fini
      ? { question: t.raccrocherQuestion, arreter: t.raccrocherCourt,
          garder: t.garderSession, onArreter: raccrocher }
      : etape === "saisie" && saisieEntamee
        ? { question: t.jeterQuestion, arreter: t.jeter,
            garder: t.continuerSaisie, onArreter: onFermer }
        : null;

  const codeAffiche = remplirVariables(
    operation.etapes?.length ? operation.etapes : [operation.code], valeurs).etapes[0];

  // Le champ du bas, quand l'opérateur pose une question qu'on ne sait pas
  // servir seul : son libellé et son clavier suivent ce qu'il demande.
  const question = enSession && !attente && !pave && !fini
    && (libre || ecran.attend === "numero" || ecran.attend === "montant" || ecran.attend === "texte");
  const libelleQuestion = ecran.attend === "numero" ? t.reseauDemandeNumero
    : ecran.attend === "montant" ? t.reseauDemandeMontant : t.reseauDemandeReponse;

  const numeroSaisi = operation.champs.find((c) => c.type === "numero");
  const montantSaisi = operation.champs.find((c) => c.type === "montant");

  return (
    <Feuille
      visible
      libelleFermer={etape === "saisie" ? t.annuler : t.fermer}
      onFermer={etape === "saisie" ? onFermer : fermerSession}
      retenue={retenue}
      entete={
        <>
          <Texte taille={textes.legende} ton="pale"
                 style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
            {etape === "saisie" ? t.preparation : enSession ? t.sessionEnCours : t.session}
            {operation.carteLibelle ? ` · ${operation.carteLibelle}` : ""}
          </Texte>
          {/* Même règle que la fiche d'un SMS : on a ouvert l'écran pour
              savoir CE QU'ON COMPOSE. « Transfert vers NKENGAFAC MBOU… »
              cache justement le bénéficiaire — sur un écran qui envoie de
              l'argent. */}
          <Texte taille={textes.intertitre} poids="demi" numberOfLines={2}
                 style={{ marginTop: 2 }}>
            {operation.titre}
          </Texte>
          {etape === "session" ? (
            <Frise rang={rangFrise} echec={issue === "refusee" || issue === "interrompue"}
                   libelles={[t.etapeConnexion, t.etapeEchange, t.etapeCode, t.etapeFin]} />
          ) : null}
        </>
      }
      pied={etape === "saisie" ? (
        <View style={{ flexDirection: "row", gap: espaces.sm }}>
          <Bouton libelle={t.annuler} onPress={onFermer} contour style={{ flex: 1 }} />
          <Bouton libelle={t.lancer} onPress={lancer} desactive={!complet} style={{ flex: 1 }} />
        </View>
      ) : (
        <View style={{ gap: espaces.sm }}>
          {pave ? <PaveSecret onValider={secret} /> : null}

          {question ? (
            <Animated.View entering={reduit ? undefined : FadeIn.duration(180)}
                           style={{ gap: espaces.sm }}>
              <Texte taille={textes.legende} ton="pale">{libelleQuestion}</Texte>
              {ecran.attend === "numero" && operation.recents?.length ? (
                <Puces
                  libelle={t.clientsRecents}
                  puces={operation.recents.map((r) => ({
                    cle: r.numero, haut: r.nom || formaterNumero(r.numero),
                    bas: r.nom ? formaterNumero(r.numero) : undefined,
                  }))}
                  onChoix={(n) => setReponseLibre(n)}
                />
              ) : null}
              <View style={{ flexDirection: "row", gap: espaces.sm, alignItems: "center" }}>
                <ChampTexte
                  value={reponseLibre}
                  onChangeText={setReponseLibre}
                  placeholder={t.votreReponse}
                  placeholderTextColor={couleurs.encrePale}
                  keyboardType={ecran.attend === "montant" ? "number-pad" : "phone-pad"}
                  autoFocus
                  onSubmitEditing={() => void repondre(reponseLibre)}
                  style={{
                    flex: 1, borderWidth: 1, borderColor: couleurs.trait,
                    borderRadius: rayons.bouton, backgroundColor: couleurs.surfaceHaute,
                    paddingHorizontal: espaces.md, paddingVertical: espaces.md,
                    fontFamily: polices.corps, fontSize: textes.corps, color: couleurs.encre,
                  }}
                />
                <Bouton libelle={t.envoyer} onPress={() => void repondre(reponseLibre)}
                        desactive={!reponseLibre.trim()} />
              </View>
            </Animated.View>
          ) : null}

          {fini ? (
            <Bouton libelle={t.termine} onPress={onFermer} />
          ) : (
            // La sortie, impossible à manquer — un mot rouge, et la même
            // porte que la croix. Jamais désactivée : une attente n'est pas
            // un verrou.
            <Bouton
              libelle={enSession ? t.annulerSession : t.fermer}
              onPress={() => (retenue ? retenue.onArreter() : onFermer())}
              contour
              danger
            />
          )}
        </View>
      )}
    >
      {etape === "saisie" ? (
        <View style={{ gap: espaces.lg }}>
          {operation.champs.map((c) => (
            <View key={c.cle} style={{ gap: espaces.xs }}>
              <Texte taille={textes.petit} ton="doux">{c.label}</Texte>
              <ChampTexte
                value={valeurs[c.cle] ?? ""}
                onChangeText={(v) => set(c.cle, v)}
                placeholder={c.aide}
                placeholderTextColor={couleurs.encrePale}
                keyboardType="number-pad"
                returnKeyType="done"
                style={{
                  borderWidth: 1, borderColor: couleurs.trait,
                  borderRadius: rayons.bouton, backgroundColor: couleurs.surfaceHaute,
                  paddingHorizontal: espaces.md, paddingVertical: espaces.md,
                  fontFamily: polices.corps, fontSize: textes.titre, color: couleurs.encre,
                }}
              />
              {/* UN NUMÉRO DÉJÀ VU SE CHOISIT, IL NE SE RETAPE PAS. La faute de
                  frappe sur le chiffre vers lequel l'argent part est la plus
                  chère de toutes. */}
              {c.type === "numero" && operation.recents?.length ? (
                <Puces
                  libelle={t.clientsRecents}
                  puces={operation.recents.map((r) => ({
                    cle: r.numero, haut: r.nom || formaterNumero(r.numero),
                    bas: r.nom ? formaterNumero(r.numero) : undefined,
                  }))}
                  choisie={chiffres(valeurs[c.cle] ?? "")}
                  onChoix={(n) => set(c.cle, n)}
                />
              ) : null}
              {c.type === "montant" ? (
                <Puces
                  puces={MONTANTS.map((m) => ({ cle: String(m), haut: fcfa(m, langue) }))}
                  choisie={chiffres(valeurs[c.cle] ?? "")}
                  onChoix={(m) => set(c.cle, m)}
                />
              ) : null}
            </View>
          ))}

          {/* LE RÉCAPITULATIF, avant « Lancer » : ce qui va partir, en
              phrases, pas en code. C'est la dernière chance de voir le
              chiffre de trop. */}
          {complet ? (
            <Animated.View entering={reduit ? undefined : FadeInDown.duration(200)}
              style={{
                borderRadius: rayons.carte, borderWidth: 1, borderColor: couleurs.trait,
                backgroundColor: couleurs.surfaceHaute, padding: espaces.lg, gap: espaces.sm,
              }}>
              <Texte taille={textes.legende} ton="pale"
                     style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                {t.recap}
              </Texte>
              <Rangee libelle={t.recapOperation} valeur={operation.titre} />
              {operation.carteLibelle
                ? <Rangee libelle={t.recapDepuis} valeur={operation.carteLibelle} /> : null}
              {numeroSaisi
                ? <Rangee libelle={t.recapVers}
                          valeur={formaterNumero(chiffres(valeurs[numeroSaisi.cle] ?? ""))} /> : null}
              {montantSaisi && chiffres(valeurs[montantSaisi.cle] ?? "") ? (
                <Rangee libelle={t.recapMontant} fort
                        valeur={fcfa(Number(chiffres(valeurs[montantSaisi.cle] ?? "")), langue)} />
              ) : null}
            </Animated.View>
          ) : null}

          <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
            {t.noteSaisie}
          </Texte>
        </View>
      ) : (
        <View style={{ gap: espaces.md }}>
          {fini || (erreur && !dernier) ? (
            <Conclusion
              issue={issue}
              titre={issue === "reussie" ? t.opReussie : issue === "refusee" ? t.opRefusee
                : issue === "interrompue" ? t.opInterrompue : t.opReponse}
              texte={erreur && !dernier ? erreur : (ecran.texte || dernier)}
              note={issue === "reussie" ? t.confirmationSms : undefined}
            />
          ) : !dernier ? (
            // LA PREMIÈRE ATTENTE : la carte est à Douala, le réseau met
            // quelques secondes. Une forme qui respire dit « ça arrive » ;
            // une roue seule ne disait rien de ce qu'on attend.
            <Attente texte={operation.carteLibelle
              ? t.ouvertureSur(operation.carteLibelle) : t.ouverture} />
          ) : (
            // L'ÉCRAN DE L'OPÉRATEUR, mis en forme : son texte d'abord, puis
            // ses choix en boutons. Il entre en glissant à chaque réponse —
            // on voit que la page a tourné.
            <Animated.View key={fil.length}
              entering={reduit ? undefined : FadeInDown.duration(220)}
              style={{ gap: espaces.sm }}>
              {ecran.texte ? (
                <View style={{
                  backgroundColor: couleurs.surface2, borderRadius: rayons.carte,
                  paddingHorizontal: espaces.lg, paddingVertical: espaces.md,
                }}>
                  {/* Le texte du réseau, mot pour mot : jamais traduit. */}
                  <Texte style={{ lineHeight: 24 }}>{ecran.texte}</Texte>
                </View>
              ) : null}
              {ecran.choix.map((c) => (
                <Choix key={`${c.numero}-${c.libelle}`} numero={c.numero} libelle={c.libelle}
                       desactive={attente}
                       onPress={() => void repondre(c.numero)} />
              ))}
              {ecran.attend === "choix" && !attente && !libre ? (
                <Pressable accessibilityRole="button" onPress={() => setLibre(true)} hitSlop={8}
                  style={({ pressed }) => ({ alignSelf: "flex-start", paddingVertical: espaces.xs,
                                              opacity: pressed ? 0.5 : 1 })}>
                  <Texte taille={textes.legende} ton="doux"
                         style={{ textDecorationLine: "underline" }}>
                    {t.autreReponse}
                  </Texte>
                </Pressable>
              ) : null}
            </Animated.View>
          )}

          {attente && dernier ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
              <ActivityIndicator size="small" color={couleurs.encrePale} />
              <Texte taille={textes.legende} ton="pale">{t.terminalCompose}</Texte>
            </View>
          ) : null}

          {erreur && dernier ? (
            <View style={{
              backgroundColor: couleurs.surface2, borderRadius: rayons.carte,
              paddingHorizontal: espaces.lg, paddingVertical: espaces.md,
            }}>
              <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
                {erreur}
              </Texte>
            </View>
          ) : null}

          {/* Fini sur une simple réponse : peut-être attendait-il encore
              quelque chose. On ne le devine pas — on rend la main. */}
          {fini && issue === "reponse" && conclu && !libre ? (
            <Pressable accessibilityRole="button" hitSlop={8}
              onPress={() => { setLibre(true); setFini(false); }}
              style={({ pressed }) => ({ alignSelf: "flex-start", opacity: pressed ? 0.5 : 1 })}>
              <Texte taille={textes.legende} ton="doux"
                     style={{ textDecorationLine: "underline" }}>
                {t.repondreQuandMeme}
              </Texte>
            </Pressable>
          ) : null}

          {/* L'ÉCHANGE ENTIER, d'un geste : ce qu'on a envoyé, ce que
              l'opérateur a répondu. Le code secret n'y est jamais — quatre
              points. On met en forme ; on ne cache rien. */}
          {fil.length > 1 ? (
            <View style={{ gap: espaces.sm }}>
              <Pressable accessibilityRole="button" hitSlop={8}
                onPress={() => setVoirEchange((v) => !v)}
                style={({ pressed }) => ({ alignSelf: "flex-start", opacity: pressed ? 0.5 : 1 })}>
                <Texte taille={textes.legende} ton="doux"
                       style={{ textDecorationLine: "underline" }}>
                  {voirEchange ? t.masquerEchange : t.voirEchange}
                </Texte>
              </Pressable>
              {voirEchange ? fil.map((m, k) => (
                <View key={k} style={{
                  alignSelf: m.de === "vous" ? "flex-end" : "flex-start",
                  maxWidth: "85%", gap: 2,
                }}>
                  <Texte taille={textes.legende} ton="pale"
                         style={{ textAlign: m.de === "vous" ? "right" : "left" }}>
                    {m.de === "vous" ? t.vous : t.operateur}
                  </Texte>
                  <View style={{
                    backgroundColor: m.de === "vous" ? couleurs.accent : couleurs.surface2,
                    borderRadius: rayons.carte, paddingHorizontal: espaces.md,
                    paddingVertical: espaces.sm,
                  }}>
                    <Texte taille={textes.petit}
                           style={m.de === "vous" ? { color: couleurs.surfaceHaute } : undefined}>
                      {m.texte}
                    </Texte>
                  </View>
                </View>
              )) : null}
            </View>
          ) : null}
        </View>
      )}
    </Feuille>
  );
}

/** Des montants qu'on tape tous les jours — un geste au lieu de six chiffres. */
const MONTANTS = [1000, 5000, 10000, 25000, 50000];

/** Où en est la session : quatre étapes, un point plein pour chaque franchie. */
function Frise({ rang, echec, libelles }: { rang: number; echec?: boolean; libelles: string[] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: espaces.md, gap: 6 }}
          accessibilityLabel={libelles[rang]}>
      {libelles.map((l, k) => {
        const passe = k < rang;
        const ici = k === rang;
        const teinte = ici && echec ? couleurs.negatif
          : passe || ici ? couleurs.accent : couleurs.surface3;
        return (
          <View key={l} style={{ flex: 1, gap: 4 }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: teinte }} />
            <Texte taille={textes.legende} ton={ici ? "normal" : "pale"} numberOfLines={1}
                   poids={ici ? "moyen" : "normal"}>
              {l}
            </Texte>
          </View>
        );
      })}
    </View>
  );
}

/** Un choix du menu de l'opérateur, en bouton : son numéro, son libellé. */
function Choix({ numero, libelle, onPress, desactive }: {
  numero: string; libelle: string; onPress: () => void; desactive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      disabled={desactive}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: espaces.md,
        minHeight: 52, paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
        borderRadius: rayons.carte, borderWidth: 1, borderColor: couleurs.trait,
        backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
        opacity: desactive ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View style={{
        width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
        backgroundColor: couleurs.surface2,
      }}>
        <Texte taille={textes.petit} poids="demi" chiffresAlignes>{numero}</Texte>
      </View>
      <Texte poids="moyen" style={{ flex: 1 }}>{libelle}</Texte>
      <View style={{ transform: [{ rotate: "0deg" }] }}>
        <Icone nom="Chevron" taille={16} couleur={couleurs.encrePale} />
      </View>
    </Pressable>
  );
}

/** Une rangée du récapitulatif. */
function Rangee({ libelle, valeur, fort }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: espaces.md }}>
      <Texte taille={textes.petit} ton="doux">{libelle}</Texte>
      <Texte taille={fort ? textes.corps : textes.petit} poids={fort ? "demi" : "moyen"}
             style={{ flexShrink: 1, textAlign: "right" }} selectable>
        {valeur}
      </Texte>
    </View>
  );
}

/** Des pastilles à toucher : un client récent, un montant courant. */
function Puces({ libelle, puces, choisie, onChoix }: {
  libelle?: string;
  puces: { cle: string; haut: string; bas?: string }[];
  choisie?: string;
  onChoix: (cle: string) => void;
}) {
  return (
    <View style={{ gap: espaces.xs }}>
      {libelle ? <Texte taille={textes.legende} ton="pale">{libelle}</Texte> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.xs }}>
        {puces.map((p) => {
          const active = choisie === p.cle;
          return (
            <Pressable key={p.cle} accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChoix(p.cle)}
              style={({ pressed }) => ({
                paddingHorizontal: espaces.md, paddingVertical: 6, minHeight: 36,
                justifyContent: "center", borderRadius: rayons.rond, borderWidth: 1,
                borderColor: active ? couleurs.accent : couleurs.trait,
                backgroundColor: active ? couleurs.accent
                  : pressed ? couleurs.surface2 : couleurs.surfaceHaute,
              })}>
              <Texte taille={textes.legende} poids="moyen" numberOfLines={1}
                     style={active ? { color: couleurs.surfaceHaute } : undefined}>
                {p.haut}
              </Texte>
              {p.bas ? (
                <Texte taille={textes.legende} ton={active ? "normal" : "pale"} numberOfLines={1}
                       style={active ? { color: couleurs.surfaceHaute } : undefined}>
                  {p.bas}
                </Texte>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** La première attente : une forme qui respire, et ce qu'on attend. */
function Attente({ texte }: { texte: string }) {
  return (
    <View style={{
      backgroundColor: couleurs.surface2, borderRadius: rayons.carte,
      padding: espaces.lg, gap: espaces.md, alignItems: "center",
    }}>
      <ActivityIndicator size="large" color={couleurs.encrePale} />
      <Texte taille={textes.petit} ton="doux" style={{ textAlign: "center" }}>{texte}</Texte>
    </View>
  );
}

/** L'écran de fin : ce que l'opérateur a conclu, en grand. */
function Conclusion({ issue, titre, texte, note }: {
  issue: string; titre: string; texte: string; note?: string;
}) {
  const reduit = useMouvementReduit();
  const teinte = issue === "reussie" ? couleurs.positifVif
    : issue === "refusee" || issue === "interrompue" ? couleurs.negatif : couleurs.encrePale;
  return (
    <Animated.View entering={reduit ? undefined : FadeInDown.duration(260)}
                   style={{ alignItems: "center", gap: espaces.md, paddingVertical: espaces.md }}>
      <View style={{
        width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
        borderWidth: 2, borderColor: teinte,
      }}>
        <Icone nom={issue === "reussie" ? "Check" : issue === "reponse" ? "Bubble" : "Close"}
               taille={28} couleur={teinte} />
      </View>
      <Texte taille={textes.intertitre} poids="demi" style={{ textAlign: "center" }}>{titre}</Texte>
      {texte ? (
        <View style={{
          alignSelf: "stretch", backgroundColor: couleurs.surface2, borderRadius: rayons.carte,
          paddingHorizontal: espaces.lg, paddingVertical: espaces.md,
        }}>
          <Texte style={{ lineHeight: 24 }} selectable>{texte}</Texte>
        </View>
      ) : null}
      {note ? (
        <Texte taille={textes.legende} ton="pale" style={{ textAlign: "center", lineHeight: 18 }}>
          {note}
        </Texte>
      ) : null}
    </Animated.View>
  );
}

function Bouton({
  libelle, onPress, desactive, contour, danger, style,
}: {
  libelle: string;
  onPress: () => void;
  desactive?: boolean;
  contour?: boolean;
  danger?: boolean;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={desactive}
      style={({ pressed }) => ([{
        borderRadius: rayons.bouton,
        paddingVertical: espaces.md,
        paddingHorizontal: espaces.lg,
        alignItems: "center",
        borderWidth: contour ? 1 : 0,
        borderColor: danger ? couleurs.negatif : couleurs.trait,
        backgroundColor: contour
          ? (pressed ? couleurs.surface2 : "transparent")
          : desactive
            ? couleurs.surface3
            : (pressed ? couleurs.accentAppui : couleurs.accent),
        opacity: desactive && !contour ? 0.5 : 1,
      }, style])}
    >
      <Texte
        poids="demi"
        taille={textes.petit}
        ton={contour ? (danger ? "negatif" : "doux") : "normal"}
        style={contour ? undefined : { color: couleurs.surfaceHaute }}
      >
        {libelle}
      </Texte>
    </Pressable>
  );
}
