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

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { Feuille, type Retenue } from "@/feuille";
import { PaveSecret } from "@/pave-secret";
import { Texte } from "@/ui";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { deposerCommande, lireCommande } from "@/api/guichet";
import { useLangue } from "@/langue";
import { remplirVariables } from "@noyau/codes";
import { champPourQuestion, demandeUnCode, type TypeChamp } from "@noyau/ussd";
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
  const pave = enSession && !attente && !fini && demandeUnCode(dernier);

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
            {" · "}{codeAffiche}
          </Texte>
          {/* Même règle que la fiche d'un SMS : on a ouvert l'écran pour
              savoir CE QU'ON COMPOSE. « Transfert vers NKENGAFAC MBOU… »
              cache justement le bénéficiaire — sur un écran qui envoie de
              l'argent. */}
          <Texte taille={textes.intertitre} poids="demi" numberOfLines={2}
                 style={{ marginTop: 2 }}>
            {operation.titre}
          </Texte>
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

          {enSession && !attente && !pave && !fini ? (
            <View style={{ flexDirection: "row", gap: espaces.sm, alignItems: "center" }}>
              <TextInput
                value={reponseLibre}
                onChangeText={setReponseLibre}
                placeholder={t.votreReponse}
                placeholderTextColor={couleurs.encrePale}
                keyboardType="phone-pad"
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
          ) : null}

          {fini ? (
            <>
              <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
                {t.confirmationSms}
              </Texte>
              <Bouton libelle={t.termine} onPress={onFermer} />
            </>
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
              <TextInput
                value={valeurs[c.cle] ?? ""}
                onChangeText={(v) => set(c.cle, v)}
                placeholder={c.aide}
                placeholderTextColor={couleurs.encrePale}
                keyboardType="number-pad"
                style={{
                  borderWidth: 1, borderColor: couleurs.trait,
                  borderRadius: rayons.bouton, backgroundColor: couleurs.surfaceHaute,
                  paddingHorizontal: espaces.md, paddingVertical: espaces.md,
                  fontFamily: polices.corps, fontSize: textes.corps, color: couleurs.encre,
                }}
              />
            </View>
          ))}
          <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
            {t.noteSaisie}
          </Texte>
        </View>
      ) : (
        // UNE seule carte, qui se réécrit à chaque réponse du réseau. Le
        // message de l'opérateur dit ce qu'on s'apprête à confirmer : il
        // garde toute la place.
        <View style={{ gap: espaces.md }}>
          {dernier ? (
            <View style={{
              backgroundColor: couleurs.surface2, borderRadius: rayons.carte,
              paddingHorizontal: espaces.lg, paddingVertical: espaces.md,
            }}>
              {/* Le texte du réseau, mot pour mot : jamais traduit. */}
              <Texte style={{ lineHeight: 24 }}>{dernier}</Texte>
            </View>
          ) : null}

          {attente ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
              <ActivityIndicator size="small" color={couleurs.encrePale} />
              <Texte taille={textes.legende} ton="pale">{t.terminalCompose}</Texte>
            </View>
          ) : null}

          {erreur ? (
            <View style={{
              backgroundColor: couleurs.surface2, borderRadius: rayons.carte,
              paddingHorizontal: espaces.lg, paddingVertical: espaces.md,
            }}>
              <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
                {erreur}
              </Texte>
            </View>
          ) : null}
        </View>
      )}
    </Feuille>
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
