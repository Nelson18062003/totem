// L'accueil : une carte, ce qu'on fait avec, et l'argent qui vient de bouger.
//
// REFAIT POUR SE LIRE SANS MODE D'EMPLOI. Le propriétaire le montrait à son
// père et à ses proches, qui ne savaient pas à quoi servait la moitié des
// boutons : un titre « Overview » qui ne disait rien, trois cercles muets,
// quatre grosses tuiles d'un autre style pour des gestes du même ordre, une
// liste de SMS mêlant publicités et soldes, et une carte « terminal relié »
// qui ne disait rien tant que tout allait bien. Quatre designers ont
// proposé, trois juges ont tranché ; ce qui reste, de haut en bas :
//
//   — le salut, et l'engrenage ;
//   — les cartes, en puces sur UNE ligne (quatre cartes n'en font plus
//     deux) ;
//   — la carte, avec l'âge de son solde dessous — le JOUR compris — et
//     « Actualiser » à côté ;
//   — UNE rangée de ronds nommés, tous du même dessin : Dépôt, Retrait,
//     Transfert, Recevoir (la fiche des coordonnées), Code USSD ;
//   — les derniers MOUVEMENTS D'ARGENT, toutes cartes, la carte nommée.
//
// Rien n'est perdu : « Mon numéro » et le solde exact sont dans Opérations
// (avec une phrase qui dit ce qu'ils font), l'Analyse dans Comptes, l'état
// complet du terminal dans Réglages — et la ligne sous la carte prévient
// dès que le terminal se tait.
//
// La mise en page suit la FENÊTRE, pas l'appareil : au-delà de 600 dp de
// large (tablette, pliable ouvert, écran partagé) elle passe à deux colonnes
// — la carte et ses gestes d'un côté, les mouvements de l'autre.

import { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { AjouterMaCarte } from "@/ajouter-ma-carte";
import { Caisse } from "@/caisse";
import { Coordonnees } from "@/coordonnees";
import { FeuilleReleve } from "@/releve";
import { useMargeSousLaBarre, Defilement, Accroc, BoutonIcone, Carte, Filet, Texte,
         appuiTexte, avecAppui } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { Entree, Animated, useAppui } from "@/animations";
import { SqueletteCaisse, SqueletteListe, SqueletteRonds } from "@/squelettes";
import { OperationPopup, type Operation } from "@/operation";
import { FicheSms, couleursCategorie, icone as iconeCat } from "@/fiche-sms";
import { useEcran } from "@/ecran";
import * as Coffre from "@/api/coffre";
import { cartesAMontrer, useCarteChoisie } from "@/carte-choisie";
import { descriptionDesRonds, useRonds } from "@/ronds-accueil";
import type { Rond } from "@noyau/ronds";
import {
  carteEnPause, FicheTerminalHorsLigne, PastilleHorsLigne, silenceDepuis,
} from "@/terminal-hors-ligne";
import { PucesCartes } from "@/puces-cartes";
import {
  ECART_ROND, HAUTEUR_ETAT, LIGNE_ROND, LIGNES_MOUVEMENTS,
  LIGNES_MOUVEMENTS_LARGE, NOM_ROND, ROND,
} from "@/mesures-accueil";
import { couleurOperateur, couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { useDonnees, useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { etapesGeste } from "@noyau/codes";
import { clientsRecents } from "@noyau/recents";
import { aQui } from "@noyau/beneficiaires";
import { estMouvement } from "@noyau/sms";
import { jourCourt, jourDuReleve, libelleJour } from "@noyau/periodes";
import {
  FUSEAU_DEFAUT, fcfa, jourLocal, type EtatTerminal, type Paiement, type Sim,
} from "@noyau/types";
import { textesAccueil } from "@noyau/textes/accueil";
import { textesGuichet } from "@noyau/textes/guichet";
import { salutation } from "@noyau/salutation";

const CLE_SOLDE_CACHE = "totem.solde.cache";
// Combien de cartes au dernier passage : la forme d'attente dessine les
// puces SEULEMENT s'il y en avait plusieurs — sans quoi un propriétaire à une
// carte verrait l'écran remonter de 48 points à chaque ouverture.
const CLE_NOMBRE_CARTES = "totem.cartes.nombre";

type T = (typeof textesAccueil)["fr"];

export default function Accueil() {
  // Ce que la barre d'onglets flottante recouvre — voir `useMargeSousLaBarre`.
  const margeBas = useMargeSousLaBarre();
  const langue = useLangue();
  const t = textesAccueil[langue];
  const tg = textesGuichet[langue];
  const ecran = useEcran();
  const { donnees, attente, erreur, recharger, actualiser: relireEnSilence, duCahier } =
    useDonnees({ sms: 30, recus: 60 });
  // La roue de « tirer » : sous le doigt, sur cet écran, et nulle part
  // ailleurs — voir `useRoue`.
  const roue = useRoue();
  const maintenant = useMaintenant();

  const sims = donnees?.sims ?? [];
  // Un ordre qui ne bouge pas : voir `cartesAMontrer`.
  const cartes = cartesAMontrer(sims);
  const raccourcis = donnees?.raccourcis ?? {};
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;

  // La carte choisie est PARTAGÉE avec Opérations, et retenue d'une
  // ouverture à l'autre (voir `carte-choisie.ts`).
  const choisie = useCarteChoisie();
  const active = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const [operation, setOperation] = useState<Operation | null>(null);
  const [smsOuvert, setSmsOuvert] = useState<Paiement | null>(null);
  const [coordonnees, setCoordonnees] = useState(false);
  const [releve, setReleve] = useState(false);
  const [ficheTerminal, setFicheTerminal] = useState(false);

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

  const [plusieurs, setPlusieurs] = useState(true);
  useEffect(() => {
    Coffre.lire(CLE_NOMBRE_CARTES)
      .then((v) => { if (v != null) setPlusieurs(Number(v) > 1); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!donnees) return;
    void Coffre.ecrire(CLE_NOMBRE_CARTES, String(cartes.length)).catch(() => {});
  }, [donnees, cartes.length]);

  const operationDe = (cle: string, titre: string, icone: NomIcone,
                       champs: Operation["champs"]): Operation => {
    const et = active ? etapesGeste(active.operateur, cle, raccourcis[active.operateur] ?? []) : [];
    return { titre, icone, code: et[0] ?? "", etapes: et, champs,
             carte: active?.iccid, terminal: donnees?.terminal?.id ?? null,
             carteLibelle: active?.libelle, operateur: active?.operateur,
             recents: aQui(donnees?.beneficiaires,
                           clientsRecents(donnees?.paiements ?? [], active?.iccid), active?.iccid) };
  };

  // LES GESTES D'ARGENT. Un geste dont on ne connaît pas le code ne
  // s'affiche PAS : un bouton qui composerait au hasard vaut moins que pas
  // de bouton du tout.
  // UN NOM PAR GESTE, le même partout : « Dépôt · Retrait · Transfert », sur
  // le rond, dans Opérations, et en tête du parcours qu'il ouvre. L'accueil
  // disait « Retrait » sur le rond et « Retrait d'argent » en tête, l'anglais
  // « Withdraw » ici et « Withdrawal » là.
  type Geste = { cle: Rond; libelle: string; aide: string; icone: NomIcone;
                 fabrique: () => Operation };
  const tous: Geste[] = active == null ? [] : [
    { cle: "depot", libelle: tg.depot, aide: tg.depotSous, icone: "ArrowDown",
      fabrique: () => operationDe("depot", tg.depot, "ArrowDown", [
        { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" }]) },
    { cle: "retrait", libelle: tg.retrait, aide: tg.retraitSous, icone: "Billet",
      fabrique: () => operationDe("retrait", tg.retrait, "Billet", [
        { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" }]) },
    { cle: "transfert", libelle: tg.transfert, aide: tg.transfertSous, icone: "ArrowUp",
      fabrique: () => operationDe("transfert", tg.transfert, "ArrowUp", [
        { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "50 000", type: "montant" }]) },
  ];
  const gestes = tous.filter((g) => g.fabrique().code);

  // Ce que fait chaque rond. `boitier` : il passe par le boîtier de la carte
  // (il pâlit quand celui-ci se tait). `null` : rien à composer — le rond
  // ne s'affiche pas.
  const choix = useRonds();
  const descriptions = descriptionDesRonds(langue);
  const actionDuRond = (r: Rond, carte: Sim):
    { boitier: boolean; faire: () => void } | null => {
    const composer = (cle: string, titre: string, icone: NomIcone,
                      champs: Operation["champs"] = []) => {
      const o = operationDe(cle, titre, icone, champs);
      return o.code ? { boitier: true, faire: () => setOperation(o) } : null;
    };
    const geste = tous.find((g) => g.cle === r);
    if (geste) return geste.fabrique().code
      ? { boitier: true, faire: () => setOperation(geste.fabrique()) } : null;
    if (r === "menu") return composer("menu", tg.menu, "Grid");
    if (r === "solde") return composer("solde", tg.monSolde, "Refresh");
    if (r === "mon_numero") return composer("mon_numero", tg.monNumero, "Phone");
    // Recevoir ne passe pas par le boîtier : ce sont le nom et le numéro, à
    // donner à qui paie. Il reste toujours actif — les bénéficiaires aussi.
    if (r === "recevoir") return { boitier: false, faire: () => setCoordonnees(true) };
    if (r === "beneficiaires") return { boitier: false, faire: () => router.push("/beneficiaires") };
    if (r === "releve") return { boitier: false, faire: () => setReleve(true) };
    return { boitier: true,
             faire: () => router.push({ pathname: "/ussd", params: { carte: carte.iccid } }) };
  };
  const actualiser = active && operationDe("solde", tg.monSolde, "Refresh", []).code
    ? () => setOperation(operationDe("solde", tg.monSolde, "Refresh", [])) : null;

  // L'ARGENT QUI VIENT DE BOUGER — toutes cartes, et rien d'autre : ni les
  // consultations de solde, ni les échecs, ni les codes, ni les publicités.
  // Toutes cartes, parce qu'un paiement arrivé sur la MTN pendant qu'on
  // regardait l'Orange ne doit pas disparaître : on répondrait « pas reçu »
  // à un client qui a payé. La carte est nommée sur chaque ligne.
  const deux = ecran.deuxColonnes;
  const mouvements = (donnees?.paiements ?? []).filter(estMouvement)
    .slice(0, deux ? LIGNES_MOUVEMENTS_LARGE : LIGNES_MOUVEMENTS);
  const aujourdhui = jourLocal(new Date(maintenant), fuseau);

  // LE BOÎTIER SE TAIT : les gestes d'argent restent à leur place, mais
  // l'appui explique au lieu de composer — une demande déposée pendant que
  // le boîtier se tait partait des heures plus tard, à son retour.
  // Seulement si le boîtier QUI PORTE cette carte se tait (`carteEnPause`).
  const seTait = carteEnPause(donnees, duCahier, active ?? null);
  const depuisSilence = silenceDepuis(donnees, duCahier, active ?? null);
  // Ouvrir l'explication pose aussi la question, en silence : la réponse
  // fraîche peut dire que le boîtier est revenu — la fiche se referme alors.
  const expliquer = () => { setFicheTerminal(true); relireEnSilence(); };
  useEffect(() => { if (ficheTerminal && !seTait) setFicheTerminal(false); }, [ficheTerminal, seTait]);

  // Rien de ce qui arrive avec les données ne doit faire SAUTER l'écran : la
  // forme d'attente de chaque bloc a la hauteur du vrai (`mesures-accueil`).
  const enAttente = !active && attente;

  const blocCarte = active ? (
    <Entree delai={60}>
      <View>
        {cartes.length > 1 ? (
          <PucesCartes cartes={cartes} active={active.iccid} pleine={deux}
                       marge={ecran.marge} langue={langue} />
        ) : null}
        <Caisse carte={active} langue={langue} soldeCache={soldeCache}
                onBasculerSolde={basculerSolde} signalFige={seTait} />
        <LigneEtat carte={active} seTait={seTait} maintenant={maintenant} fuseau={fuseau}
                   langue={langue} t={t} onActualiser={actualiser}
                   onTerminal={() => expliquer()} />
      </View>
    </Entree>
  ) : enAttente ? (
    // PENDANT L'ATTENTE, UNE FORME — pas le vide. L'écran ne montrait RIEN
    // tant que les chiffres n'étaient pas là : le propriétaire ne pouvait
    // pas distinguer « ça arrive » de « c'est cassé ».
    <SqueletteCaisse puces={plusieurs} />
  ) : erreur ? null : donnees?.proprietaire === false ? (
    // UN COMPTE SANS CARTE — le plus souvent, quelqu'un qui vient de créer
    // son compte. Il n'a pas de boîtier : ni « hors ligne », ni « aucune
    // carte dans le terminal ». On lui dit comment AJOUTER sa carte.
    <Entree delai={60}>
      <AjouterMaCarte langue={langue} code={donnees.codeCompte} />
    </Entree>
  ) : (
    // La panne passe AVANT la carte vide : hors ligne, « aucune carte »
    // serait un mensonge.
    <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm,
                    borderStyle: "dashed" }}>
      <Texte poids="demi">{t.aucuneCarte}</Texte>
      <Texte ton="doux" taille={textes.petit}
             style={{ textAlign: "center", lineHeight: 20 }}>
        {t.aucuneCarteDetail}
      </Texte>
      {/* Sans aucune carte, le boîtier qui se tait doit encore se dire :
          inviter à « attendre une SIM » quand la vraie panne est un boîtier
          éteint, c'est envoyer chercher au mauvais endroit. */}
      {seTait ? (
        <View style={{ marginTop: espaces.sm }}>
          <PastilleHorsLigne langue={langue} onPress={() => expliquer()} />
        </View>
      ) : null}
    </Carte>
  );

  // RIEN À COMPOSER SUR UNE CARTE ABSENTE : une carte retirée montre son
  // dernier solde connu, mais aucun geste — il partirait vers une puce qui
  // n'est plus dans le boîtier.
  const ronds = active?.enPlace ? (
    <Entree delai={120}>
      <View>
        <View style={{ flexDirection: "row", justifyContent: "center",
                       width: "100%", maxWidth: 460, alignSelf: "center" }}>
          {/* LES RONDS CHOISIS, dans l'ordre choisi (Réglages → Accueil).
              Un rond qui passe par le boîtier pâlit quand il se tait ; un
              geste dont on ne connaît pas le code ne s'affiche pas. */}
          {choix.map((r) => {
            const d = descriptions[r];
            const action = actionDuRond(r, active);
            if (!action) return null;
            return (
              <Rond key={r} icone={d.icone} libelle={d.libelle} aide={d.aide}
                    operateur={r === "menu" ? active.operateur : undefined}
                    enPause={action.boitier && seTait}
                    onPress={() => (action.boitier && seTait ? expliquer() : action.faire())} />
            );
          })}
        </View>
        {gestes.length === 0 ? (
          // Aucun code relevé pour cet opérateur : on le DIT, et on mène
          // là où il s'inscrit — sans quoi les gestes disparaissaient sans
          // un mot, comme si l'application était en panne.
          <Pressable onPress={() => router.push("/reglages")}
                     accessibilityRole="button" style={appuiTexte}>
            <Carte style={{ marginTop: espaces.md, padding: espaces.lg, borderStyle: "dashed",
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
        ) : null}
      </View>
    </Entree>
  ) : enAttente ? <SqueletteRonds /> : null;

  const blocMouvements = active || enAttente ? (
    <Entree delai={180}>
      <View style={{ gap: espaces.sm, marginTop: deux ? 0 : espaces.sm }}>
        {/* Le titre est le MÊME pendant l'attente : il se lit tout de suite,
            et l'écran se compose dans le bon ordre. */}
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: 24,
                       gap: espaces.sm }}>
          <Texte poids="demi" accessibilityRole="header" style={{ flex: 1 }}>
            {t.mouvements}
          </Texte>
          {donnees ? (
            <Pressable onPress={() => router.push("/encaissements")} hitSlop={8}
                       accessibilityRole="button"
                       style={avecAppui({ flexDirection: "row", alignItems: "center",
                                          gap: espaces.xs })}>
              <Texte taille={textes.petit} ton="doux">{t.toutVoir}</Texte>
              <Icone nom="Chevron" taille={14} couleur={couleurs.encrePale} />
            </Pressable>
          ) : null}
        </View>
        {!donnees ? (
          <SqueletteListe lignes={deux ? LIGNES_MOUVEMENTS_LARGE : LIGNES_MOUVEMENTS} />
        ) : mouvements.length ? (
          <Carte>
            {mouvements.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Filet /> : null}
                <LigneMouvement paiement={p} langue={langue} aujourdhui={aujourdhui}
                                nommerCarte={sims.length > 1}
                                onPress={() => setSmsOuvert(p)} />
              </View>
            ))}
          </Carte>
        ) : (
          // Des SMS, mais aucun mouvement d'argent parmi eux : on le dit, et
          // la boîte de réception est à un appui.
          <Carte>
            <Pressable onPress={() => router.push("/encaissements")}
                       accessibilityRole="button"
                       style={avecAppui({ flexDirection: "row", alignItems: "center",
                                          gap: espaces.md, padding: espaces.lg })}>
              <Texte taille={textes.petit} ton="pale" style={{ flex: 1, lineHeight: 20 }}>
                {(donnees.paiements ?? []).length ? t.aucunMouvement : t.aucunSms}
              </Texte>
              <Icone nom="Chevron" taille={14} couleur={couleurs.encrePale} />
            </Pressable>
          </Carte>
        )}
      </View>
    </Entree>
  ) : null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Defilement
        contentContainerStyle={{
          paddingHorizontal: ecran.marge,
          paddingTop: espaces.sm,
          paddingBottom: margeBas,
          gap: espaces.lg,
          // Sur grand écran, le contenu se centre au lieu de s'étirer : une
          // ligne large de mille points ne se lit plus, elle se balaie.
          maxWidth: deux ? 1100 : undefined,
          width: "100%",
          alignSelf: "center",
        }}
        refreshControl={roue}
      >
        {/* L'EN-TÊTE : le salut, et l'engrenage. « Overview » est parti — il
            ne disait rien ; le salut, lui, accueille. Le graphe de l'Analyse
            aussi : une icône sans nom que personne ne reconnaissait. Elle
            est dans l'onglet Comptes, sur une ligne qui dit son nom. */}
        <Entree montee={6}>
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 44,
                         gap: espaces.md }}>
            <Texte taille={textes.titre} poids="demi" numberOfLines={1}
                   adjustsFontSizeToFit minimumFontScale={0.75}
                   accessibilityRole="header"
                   style={{ flex: 1, letterSpacing: -0.3 }}>
              {salutation(langue, donnees?.courriel, donnees?.prenom)}
            </Texte>
            <BoutonIcone nom="Settings" etiquette={t.reglages}
                         onPress={() => router.push("/reglages")} />
          </View>
        </Entree>

        {erreur ? <Accroc message={erreur} onReessayer={() => void recharger()} /> : null}

        {deux ? (
          <View style={{ flexDirection: "row", gap: espaces.xl, alignItems: "flex-start" }}>
            <View style={{ flex: 1, gap: espaces.lg }}>{blocCarte}{ronds}</View>
            <View style={{ flex: 1 }}>{blocMouvements}</View>
          </View>
        ) : (
          <>{blocCarte}{ronds}{blocMouvements}</>
        )}
      </Defilement>

      {operation ? (
        <OperationPopup operation={operation} onFermer={() => setOperation(null)}
                        onTermine={() => relireEnSilence({ suivi: true })}
                        onRefus={() => relireEnSilence()} />
      ) : null}

      {smsOuvert ? (
        <FicheSms paiement={smsOuvert} onFermer={() => setSmsOuvert(null)} fuseau={fuseau}
                  onChange={() => relireEnSilence()} />
      ) : null}

      {ficheTerminal ? (
        <FicheTerminalHorsLigne vuLe={depuisSilence} maintenant={maintenant}
                                fuseau={fuseau} langue={langue} onReverifier={recharger}
                                onFermer={() => setFicheTerminal(false)}
                                chezTotem={donnees?.proprietaire === false} />
      ) : null}

      {coordonnees && active ? (
        <Coordonnees langue={langue} fuseau={fuseau} onFermer={() => setCoordonnees(false)}
                     carte={{ iccid: active.iccid, nom: active.nom,
                              numero: active.numero,
                              operateur: active.operateur, libelle: active.libelle }} />
      ) : null}

      {releve && active ? (
        <FeuilleReleve langue={langue} fuseau={fuseau} onFermer={() => setReleve(false)}
                       cartes={[{ iccid: active.iccid, numero: active.numero,
                                  libelle: active.libelle, operateur: active.operateur }]} />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * LA LIGNE SOUS LA CARTE : de quand date le solde — LE JOUR COMPRIS — et, à
 * droite, ce qu'on peut y faire. Sa hauteur ne bouge jamais (une ou deux
 * lignes de texte y tiennent) : l'alerte du terminal vient s'y loger au
 * lieu de pousser l'écran.
 */
function LigneEtat({ carte, seTait, maintenant, fuseau, langue, t, onActualiser, onTerminal }: {
  carte: Sim; seTait: boolean; maintenant: number; fuseau: string; langue: "en" | "fr"; t: T;
  onActualiser: (() => void) | null; onTerminal: () => void;
}) {
  let texte: string;
  if (!carte.enPlace) texte = t.carteMuette(carte.derniereVue);
  else if (carte.solde == null) texte = t.aucunSoldeCourt;
  else if (!carte.soldeMaj) texte = t.soldeSansHeure;
  else {
    // « 21:54 » seul ne dit pas si c'était ce soir ou hier soir : un solde
    // d'hier s'annonçait comme celui de maintenant — le chiffre pour lequel
    // on ouvre l'application. Une plateforme pas encore à jour n'envoie pas
    // l'instant : on garde alors l'heure seule, comme avant.
    const jour = jourDuReleve(carte.soldeLe, maintenant, fuseau);
    texte = jour?.genre === "hier" ? t.soldeReleveHier(carte.soldeMaj)
      : jour?.genre === "avant" ? t.soldeReleveLe(jourCourt(jour.cle, langue), carte.soldeMaj)
      : t.soldeReleve(carte.soldeMaj);
  }

  return (
    <View style={{ marginTop: espaces.sm, minHeight: HAUTEUR_ETAT, flexDirection: "row",
                   alignItems: "center", gap: espaces.sm, paddingHorizontal: espaces.xs }}>
      {!carte.enPlace ? <Icone nom="Close" taille={13} couleur={couleurs.alerte} /> : null}
      <Texte taille={textes.legende} ton={carte.enPlace ? "pale" : "alerte"}
             style={{ flex: 1, lineHeight: 16 }}>
        {texte}
      </Texte>
      {seTait ? (
        // LE BOÎTIER SE TAIT, à la place d'« Actualiser » — qui partirait
        // vers un boîtier qui ne répond pas. L'appui EXPLIQUE (ce que c'est,
        // l'argent qui arrive quand même, quoi faire à la boutique) au lieu
        // de mener aux Réglages, qui répétaient « muet » sans rien dire.
        <PastilleHorsLigne langue={langue} onPress={onTerminal} />
      ) : carte.enPlace && onActualiser ? (
        // « Actualiser » remplace le cercle « Solde » : il pose la question
        // au réseau, juste à côté de la réponse qu'il va remplacer.
        <Pressable onPress={onActualiser}
                   accessibilityRole="button"
                   accessibilityLabel={t.actualiserAria}
                   hitSlop={{ top: 6, bottom: 6 }}
                   style={({ pressed }) => ({
                     height: HAUTEUR_ETAT, flexDirection: "row", alignItems: "center",
                     gap: espaces.xs, paddingHorizontal: espaces.md,
                     borderRadius: rayons.bouton, borderWidth: 1, borderColor: couleurs.trait,
                     backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
                   })}>
          <Icone nom="Refresh" taille={14} couleur={couleurs.encre} />
          <Texte taille={textes.petit} poids="moyen">{t.actualiser}</Texte>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * UN ROND D'ACTION : le cercle, et son NOM dessous — comme les applications
 * d'opérateur que tout le monde a déjà dans la main. Tous du même dessin :
 * il y avait des cercles muets ET de grosses tuiles pour des gestes du même
 * ordre, deux familles de boutons pour une seule chose à faire. Le nom a
 * deux lignes réservées : un nom long passe à la ligne sur un petit écran
 * sans rien pousser.
 */
function Rond({ icone, libelle, aide, onPress, enPause = false, operateur }: {
  icone: NomIcone; libelle: string; aide: string; onPress: () => void;
  /** Le rond du Menu porte la marque de l'opérateur : son logo, et un cadre
   *  à sa couleur. Une grille grise ne disait pas quel menu on ouvrait. */
  operateur?: string;
  /** Le boîtier se tait : le geste reste à sa place (rien ne saute), pâli,
   *  et l'appui explique pourquoi il ne part pas. */
  enPause?: boolean;
}) {
  const appui = useAppui();
  // UN MOT NE SE COUPE PAS EN DEUX. Sur 320 points, une colonne fait 57 :
  // « Withdraw » en 12 n'y tenait pas, et l'écran affichait « Withdra / w ».
  // Sous 360 points, le nom passe en 11 et ne grossit plus avec le réglage
  // « taille du texte » ; au-dessus, il grossit de 15 % au plus — de quoi
  // rester entier dans sa colonne. L'aide vocale, elle, lit le nom entier
  // quoi qu'il arrive.
  const etroit = useWindowDimensions().width < 360;
  return (
    <Animated.View style={[{ width: "20%", opacity: enPause ? 0.45 : 1 }, appui.style]}>
      <Pressable onPress={onPress} {...appui} accessibilityRole="button"
                 accessibilityLabel={libelle} accessibilityHint={aide}
                 style={{ alignItems: "center", gap: ECART_ROND }}>
        {({ pressed }) => (
          <>
            <View style={{
              width: ROND, height: ROND, borderRadius: rayons.rond,
              borderWidth: operateur ? 2 : 1,
              borderColor: operateur ? couleurOperateur(operateur) : couleurs.trait,
              backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
              alignItems: "center", justifyContent: "center",
            }}>
              {operateur && operateurReconnu(operateur)
                ? <LogoOperateur operateur={operateur} taille={22} />
                : <Icone nom={icone} taille={22} couleur={couleurs.encre} />}
            </View>
            <View style={{ height: NOM_ROND, width: "100%" }}>
              <Texte taille={etroit ? 11 : textes.legende} poids="moyen"
                     maxFontSizeMultiplier={etroit ? 1 : 1.15}
                     numberOfLines={2}
                     style={{ textAlign: "center", lineHeight: LIGNE_ROND }}>
                {libelle}
              </Texte>
            </View>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Un mouvement d'argent : la nature d'un coup d'œil, le nom, le montant —
 *  le jour quand ce n'est pas aujourd'hui, la carte quand il y en a
 *  plusieurs. */
function LigneMouvement({ paiement: p, langue, aujourdhui, nommerCarte, onPress }: {
  paiement: Paiement; langue: "en" | "fr"; aujourdhui: string; nommerCarte: boolean;
  onPress: () => void;
}) {
  const entree = p.sens === "in";
  const sortie = p.sens === "out";
  const schema = couleursCategorie(p.nature ?? p.categorie);

  return (
    <Pressable onPress={onPress}
               accessibilityRole="button"
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
          {/* Le jour se dit ICI, avec l'heure de l'écran : « p.date » est un
              « Aujourd'hui » écrit par la plateforme LA VEILLE, et relu du
              cahier le lendemain matin. */}
          {p.jour === aujourdhui ? p.heure : `${libelleJour(p.jour, aujourdhui, langue)} · ${p.heure}`}
        </Texte>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        {p.montant != null ? (
          <Texte poids="demi" chiffresAlignes taille={textes.petit}
                 ton={entree ? "positif" : sortie ? "negatif" : "doux"}>
            {entree ? "+" : sortie ? "−" : ""}{fcfa(p.montant, langue)}
          </Texte>
        ) : null}
        {nommerCarte ? (
          <Texte taille={textes.legende} ton="pale" numberOfLines={1}>{p.sim}</Texte>
        ) : null}
      </View>
    </Pressable>
  );
}
