// L'accueil : la carte, ses gestes, et ce qui vient d'arriver.
//
// Trois blocs, dans cet ordre, parce que c'est l'ordre des questions qu'on se
// pose en ouvrant l'application : « combien ? », « je fais quoi ? », « il
// s'est passé quoi ? ».
//
// La mise en page suit la FENÊTRE, pas l'appareil : au-delà de 600 dp de
// large (tablette, pliable ouvert, écran partagé) elle passe à deux colonnes
// — la carte et ses gestes d'un côté, les messages de l'autre. Android 16 ne
// garantit plus l'orientation ; on ne peut donc rien figer.

import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Caisse } from "@/caisse";
import { Coordonnees } from "@/coordonnees";
import { Accroc, Carte, Filet, Pastille, Texte } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { Entree, Animated, useAppui } from "@/animations";
import { SqueletteCaisse, SqueletteGestes, SqueletteListe } from "@/squelettes";
import { OperationPopup, type Operation } from "@/operation";
import { FicheSms, couleursCategorie, icone as iconeCat } from "@/fiche-sms";
import { useEcran } from "@/ecran";
import * as Coffre from "@/api/coffre";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { etapesGeste } from "@noyau/codes";
import { fcfa, type Paiement, type Sim } from "@noyau/types";
import { textesAccueil } from "@noyau/textes/accueil";
import { textesAnalyse } from "@noyau/textes/analyse";
import { salutation } from "@noyau/salutation";

const CLE_SOLDE_CACHE = "totem.solde.cache";

export default function Accueil() {
  const langue = useLangue();
  const t = textesAccueil[langue];
  const ta = textesAnalyse[langue];
  const ecran = useEcran();
  const { donnees, chargement, erreur, recharger } = useDonnees({ sms: 30, recus: 60 });

  const sims = donnees?.sims ?? [];
  const enPlace = sims.filter((s) => s.enPlace);
  const cartes = enPlace.length ? enPlace : sims;
  const raccourcis = donnees?.raccourcis ?? {};

  const [choisie, setChoisie] = useState<string | null>(null);
  const active = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const [operation, setOperation] = useState<Operation | null>(null);
  const [smsOuvert, setSmsOuvert] = useState<Paiement | null>(null);
  const [coordonnees, setCoordonnees] = useState(false);

  // Masqué par défaut tant que le choix n'est pas lu : le solde ne doit
  // jamais APPARAÎTRE puis se cacher — dans ce sens-là, c'est trop tard.
  const [soldeCache, setSoldeCache] = useState(true);
  useEffect(() => {
    Coffre.lire(CLE_SOLDE_CACHE).then((v) => setSoldeCache(v === "1")).catch(() => {});
  }, []);
  const basculerSolde = () => {
    setSoldeCache((c) => {
      void Coffre.ecrire(CLE_SOLDE_CACHE, c ? "0" : "1").catch(() => {});
      return !c;
    });
  };

  const operationDe = (cle: string, titre: string, champs: Operation["champs"]): Operation => {
    const et = active ? etapesGeste(active.operateur, cle, raccourcis[active.operateur] ?? []) : [];
    return { titre, code: et[0] ?? "", etapes: et, champs,
             carte: active?.iccid, terminal: donnees?.terminal?.id ?? null };
  };

  type Geste = { label: string; icone: NomIcone; fabrique: () => Operation };
  const tous: Geste[] = active == null ? [] : [
    { label: t.depot, icone: "ArrowDown", fabrique: () => operationDe("depot", t.depotTitre, [
      { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
      { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" }]) },
    { label: t.retrait, icone: "Wallet", fabrique: () => operationDe("retrait", t.retraitTitre, [
      { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
      { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" }]) },
    { label: t.transfert, icone: "ArrowUp", fabrique: () => operationDe("transfert", t.transfertTitre, [
      { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
      { cle: "montant", label: t.montantFcfa, aide: "50 000", type: "montant" }]) },
    { label: t.monNumero, icone: "Phone", fabrique: () => operationDe("mon_numero", t.monNumero, []) },
  ];
  const gestes = tous.filter((g) => g.fabrique().code);
  const derniers = (donnees?.paiements ?? []).slice(0, 4);

  // Deux colonnes dès qu'il y a la place. Sur téléphone, une seule.
  const deux = ecran.deuxColonnes;

  const colonneGauche = (
    <View style={{ gap: espaces.lg, flex: deux ? 1 : undefined }}>
      {cartes.length > 1 && active ? (
        <Entree>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm,
                         justifyContent: deux ? "flex-start" : "center" }}>
            {cartes.map((c) => (
              <PuceCarte key={c.iccid} carte={c} actif={c.iccid === active.iccid}
                         onPress={() => setChoisie(c.iccid)} />
            ))}
          </View>
        </Entree>
      ) : null}

      {active ? (
        <Entree delai={60}>
          <Caisse carte={active} langue={langue} soldeCache={soldeCache} />
        </Entree>
      ) : chargement ? (
        // PENDANT L'ATTENTE, UNE FORME — pas le vide. L'écran ne montrait
        // RIEN tant que les chiffres n'étaient pas là : le propriétaire ne
        // pouvait pas distinguer « ça arrive » de « c'est cassé ».
        <SqueletteCaisse />
      ) : (
        <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm,
                        borderStyle: "dashed" }}>
          {/* Le premier écran d'un propriétaire tout neuf : ni carte, ni SMS.
              Il n'y lisait qu'un titre — « Aucune carte dans le terminal » —
              et rien d'autre : pas de suite, pas d'explication, la liste des
              SMS et les gestes étant tous masqués faute de carte. La phrase
              qui dit quoi attendre existait déjà, et TOUS les autres écrans
              l'affichent (Opérations, USSD, et l'accueil du web) ; seul
              l'accueil du téléphone — celui qui s'ouvre en premier — ne la
              disait pas. */}
          <Texte poids="demi">{t.aucuneCarte}</Texte>
          <Texte ton="doux" taille={textes.petit}
                 style={{ textAlign: "center", lineHeight: 20 }}>
            {t.aucuneCarteDetail}
          </Texte>
        </Carte>
      )}

      {/* Les commandes de la carte, HORS de la carte : masquer le solde,
          l'actualiser, partager ses coordonnées. Trois cercles, aucun mot —
          la carte reste nette. */}
      {/* RIEN À COMPOSER SUR UNE CARTE ABSENTE. Quand aucune puce n'est dans
          le terminal, l'écran retombe sur les cartes RETIRÉES (voir plus
          haut) pour montrer leur dernier solde connu — c'est utile. Mais les
          boutons restaient armés : interroger le solde ou lancer un geste
          partait vers une puce qui n'est pas dans le boîtier, et échouait
          sans qu'on comprenne pourquoi. On les retire ; la carte, elle,
          reste affichée avec sa phrase d'avertissement. */}
      {active?.enPlace ? (
        <Entree delai={120}>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: espaces.lg }}>
            {active.solde != null ? (
              <Commande icone={soldeCache ? "Eye" : "EyeOff"} onPress={basculerSolde}
                        libelle={soldeCache ? t.montrerSolde : t.masquerSolde} />
            ) : null}
            <Commande icone="Refresh" libelle={t.actualiserAria}
                      onPress={() => setOperation(operationDe("solde", t.consulterSolde, []))} />
            {/* Les coordonnées à donner pour être payé — la fiche s'ouvre
                ICI, comme sur le web. Ce bouton renvoyait aux Réglages :
                un détour, pour la chose qu'on montre le plus souvent. */}
            <Commande icone="Identite" libelle={t.coordonneesAria}
                      onPress={() => setCoordonnees(true)} />
          </View>
        </Entree>
      ) : null}

      {/* Les gestes. Deux par ligne sur téléphone, quatre dès qu'il y a la
          place — la grille suit la fenêtre, pas l'appareil. */}
      {gestes.length && active?.enPlace ? (
        <Entree delai={180}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
            {gestes.map((g) => (
              // Deux par ligne, toujours : les gestes vivent dans une
              // COLONNE, qui fait la largeur d'un téléphone même sur
              // tablette. Les serrer à quatre d'après la largeur de l'écran
              // tronquait « Withdrawal » en « Withdra… ».
              <BoutonGeste key={g.label} libelle={g.label} icone={g.icone}
                           onPress={() => setOperation(g.fabrique())} />
            ))}
          </View>
        </Entree>
      ) : chargement ? (
        <SqueletteGestes />
      ) : active?.enPlace ? (
        // Aucun code relevé pour cet opérateur : le web le DIT et mène aux
        // Réglages ; ici les gestes disparaissaient sans un mot, comme si
        // l'application était en panne.
        <Entree delai={180}>
          <Pressable onPress={() => router.push("/reglages")}>
            <Carte style={{ padding: espaces.lg, borderStyle: "dashed",
                            alignItems: "center" }}>
              <Texte taille={textes.petit} ton="pale"
                     style={{ textAlign: "center", lineHeight: 20 }}>
                {t.aucunCode(active.operateur)}{" "}
                <Texte taille={textes.petit} ton="doux"
                       style={{ textDecorationLine: "underline" }}>
                  {t.aucunCodeLien}
                </Texte>.
              </Texte>
            </Carte>
          </Pressable>
        </Entree>
      ) : null}
    </View>
  );

  const colonneDroite = (
    <View style={{ gap: espaces.lg, flex: deux ? 1 : undefined }}>
      {derniers.length ? (
        <Entree delai={240}>
          <View style={{ gap: espaces.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Texte taille={textes.intertitre} poids="demi" style={{ flex: 1 }}>
                {t.derniersSms}
              </Texte>
              <Pressable onPress={() => router.push("/encaissements")} hitSlop={8}
                         style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs }}>
                <Texte taille={textes.petit} ton="doux">{t.toutVoir}</Texte>
                <Icone nom="Chevron" taille={14} couleur={couleurs.encrePale} />
              </Pressable>
            </View>
            <Carte>
              {derniers.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Filet /> : null}
                  <LigneSms paiement={p} langue={langue}
                            onPress={() => setSmsOuvert(p)} />
                </View>
              ))}
            </Carte>
          </View>
        </Entree>
      ) : chargement ? (
        // Le titre PUIS les formes : l'écran se compose dans le bon ordre, et
        // « Derniers SMS » est déjà lisible pendant que les lignes arrivent.
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.intertitre} poids="demi">{t.derniersSms}</Texte>
          <SqueletteListe lignes={4} />
        </View>
      ) : null}

      {donnees?.terminal ? (
        <Entree delai={300}>
          <Carte style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                          padding: espaces.lg }}>
            <Pastille vif={donnees.terminal.enLigne} />
            <Texte taille={textes.petit} style={{ flex: 1 }}>
              {donnees.terminal.enLigne ? t.enLigne : t.muet}
            </Texte>
            <Texte taille={textes.legende} ton="pale" chiffresAlignes>
              {donnees.terminal.majTexte}
            </Texte>
          </Carte>
        </Entree>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: ecran.marge,
          paddingTop: espaces.md,
          paddingBottom: 108,
          gap: espaces.xl,
          // Sur grand écran, le contenu se centre au lieu de s'étirer : une
          // ligne large de mille points ne se lit plus, elle se balaie.
          maxWidth: deux ? 1100 : undefined,
          width: "100%",
          alignSelf: "center",
        }}
        refreshControl={
          <RefreshControl refreshing={chargement} onRefresh={recharger}
                          tintColor={couleurs.encrePale} />
        }
      >
        {/* L'en-tête : le salut, et l'engrenage. Rien d'autre — le nom de
            l'application n'a pas à se répéter sur son propre écran. */}
        <Entree montee={6}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Texte taille={textes.petit} ton="pale">
                {salutation(langue, donnees?.courriel)}
              </Texte>
              <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
            </View>
            {/* L'analyse puis l'engrenage : les deux écrans « à part »,
                côte à côte dans l'angle où le pouce les attend. */}
            <Pressable onPress={() => router.push("/analyse")} hitSlop={12}
                       accessibilityLabel={ta.titre}
                       style={{ marginRight: espaces.lg }}>
              <Icone nom="Chart" taille={22} couleur={couleurs.encreDouce} />
            </Pressable>
            <Pressable onPress={() => router.push("/reglages")} hitSlop={12}
                       accessibilityLabel={t.reglages}>
              <Icone nom="Settings" taille={22} couleur={couleurs.encreDouce} />
            </Pressable>
          </View>
        </Entree>

        {erreur ? <Accroc message={erreur} onReessayer={recharger} /> : null}

        {deux ? (
          <View style={{ flexDirection: "row", gap: espaces.xl, alignItems: "flex-start" }}>
            {colonneGauche}
            {colonneDroite}
          </View>
        ) : (
          <>{colonneGauche}{colonneDroite}</>
        )}
      </ScrollView>

      {operation ? (
        <OperationPopup operation={operation} onFermer={() => setOperation(null)}
                        onTermine={recharger} />
      ) : null}

      {smsOuvert ? (
        <FicheSms paiement={smsOuvert} onFermer={() => setSmsOuvert(null)}
                  onChange={recharger} />
      ) : null}

      {coordonnees && active ? (
        <Coordonnees langue={langue} onFermer={() => setCoordonnees(false)}
                     carte={{ iccid: active.iccid, nom: active.nom,
                              numero: active.numero,
                              operateur: active.operateur, libelle: active.libelle }} />
      ) : null}
    </SafeAreaView>
  );
}

/** La puce d'une carte : son logo, et le nom court. */
function PuceCarte({ carte, actif, onPress }: {
  carte: Sim; actif: boolean; onPress: () => void;
}) {
  const appui = useAppui();
  return (
    <Animated.View style={appui.style}>
      <Pressable onPress={onPress} {...appui}
                 accessibilityState={{ selected: actif }}
                 style={{
                   flexDirection: "row", alignItems: "center", gap: espaces.sm,
                   paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                   borderRadius: rayons.rond,
                   borderWidth: actif ? 0 : 1, borderColor: couleurs.trait,
                   backgroundColor: actif ? couleurs.accent : couleurs.surfaceHaute,
                 }}>
        {operateurReconnu(carte.operateur)
          ? <LogoOperateur operateur={carte.operateur} taille={16} /> : null}
        <Texte taille={textes.petit} poids="moyen" ton={actif ? "normal" : "doux"}
               style={actif ? { color: couleurs.surfaceHaute } : undefined}>
          {carte.libelle}
        </Texte>
      </Pressable>
    </Animated.View>
  );
}

/** Une commande ronde, sous la carte. */
function Commande({ icone, libelle, onPress }: {
  icone: NomIcone; libelle: string; onPress: () => void;
}) {
  const appui = useAppui();
  return (
    <Animated.View style={appui.style}>
      <Pressable onPress={onPress} {...appui} accessibilityLabel={libelle}
                 style={{
                   width: 46, height: 46, borderRadius: rayons.rond,
                   borderWidth: 1, borderColor: couleurs.trait,
                   backgroundColor: couleurs.surfaceHaute,
                   alignItems: "center", justifyContent: "center",
                 }}>
        <Icone nom={icone} taille={19} couleur={couleurs.encreDouce} />
      </Pressable>
    </Animated.View>
  );
}

function BoutonGeste({ libelle, icone, onPress }: {
  libelle: string; icone: NomIcone; onPress: () => void;
}) {
  const appui = useAppui();
  return (
    <Animated.View style={[{ width: "48.5%" }, appui.style]}>
      <Pressable onPress={onPress} {...appui}
                 style={{
                   alignItems: "center", gap: espaces.sm,
                   paddingVertical: espaces.lg, paddingHorizontal: espaces.sm,
                   borderRadius: rayons.carte,
                   borderWidth: 1, borderColor: couleurs.trait,
                   backgroundColor: couleurs.surfaceHaute,
                 }}>
        <Icone nom={icone} taille={20} couleur={couleurs.encreDouce} />
        <Texte taille={textes.petit} poids="moyen" numberOfLines={1}>{libelle}</Texte>
      </Pressable>
    </Animated.View>
  );
}

/** Une ligne de message : la nature d'un coup d'œil, le nom, le montant. */
function LigneSms({ paiement: p, langue, onPress }: {
  paiement: Paiement; langue: "en" | "fr"; onPress: () => void;
}) {
  const entree = p.sens === "in";
  const sortie = p.sens === "out";
  const schema = couleursCategorie(p.nature ?? p.categorie);

  return (
    <Pressable onPress={onPress}
               style={({ pressed }) => ({
                 flexDirection: "row", alignItems: "center", gap: espaces.md,
                 padding: espaces.lg,
                 backgroundColor: pressed ? couleurs.surface2 : "transparent",
               })}>
      <View style={{ width: 34, height: 34, borderRadius: rayons.petit,
                     backgroundColor: schema.fond, alignItems: "center",
                     justifyContent: "center" }}>
        <Icone nom={iconeCat(p.nature ?? p.categorie)} taille={15} couleur={schema.encre} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs }}>
          {p.nonLu ? (
            <View style={{ width: 6, height: 6, borderRadius: rayons.rond,
                           backgroundColor: couleurs.accent }} />
          ) : null}
          <Texte poids={p.nonLu ? "demi" : "moyen"} numberOfLines={1} style={{ flex: 1 }}>
            {p.tiers || p.nom}
          </Texte>
        </View>
        <Texte taille={textes.legende} ton="pale" numberOfLines={1}>
          {p.heure}
        </Texte>
      </View>
      {p.montant != null ? (
        <Texte poids="demi" chiffresAlignes taille={textes.petit}
               ton={entree ? "positif" : sortie ? "negatif" : "doux"}>
          {entree ? "+" : sortie ? "−" : ""}{fcfa(p.montant, langue)}
        </Texte>
      ) : null}
    </Pressable>
  );
}
