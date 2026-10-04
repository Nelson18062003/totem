// Le guichet : les gestes, sur la carte choisie.
//
// Le pendant mobile de `web/app/actions/guichet.tsx`. Les codes viennent du
// catalogue relevé sur le terrain et des boutons appris par le robot
// (`@noyau/codes`) — jamais devinés : deviner des chiffres qui déplacent de
// l'argent serait irresponsable. Un geste sans code connu ne s'affiche pas.

import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useMargeSousLaBarre, Defilement, Accroc, Carte, Filet, LigneAction, Texte, avecAppui } from "@/ui";
import { AjouterMaCarteCourt } from "@/ajouter-ma-carte";
import { Coordonnees } from "@/coordonnees";
import { cartesAMontrer, choisirCarte, useCarteChoisie } from "@/carte-choisie";
import {
  carteEnPause, FicheTerminalHorsLigne, PastilleHorsLigne, silenceDepuis,
} from "@/terminal-hors-ligne";
import { toucherChoix } from "@/toucher";
import { Icone, type NomIcone } from "@/icones";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { OperationPopup, type ChampOperation, type Operation } from "@/operation";
import { useDonnees, useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { etapesGeste } from "@noyau/codes";
import { clientsRecents } from "@noyau/recents";
import { aQui } from "@noyau/beneficiaires";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import { textesGuichet } from "@noyau/textes/guichet";
import { textesUssd } from "@noyau/textes/ussd";
import { FUSEAU_DEFAUT } from "@noyau/types";

export default function Actions() {
  // Ce que la barre d'onglets flottante recouvre — voir `useMargeSousLaBarre`.
  const margeBas = useMargeSousLaBarre();
  const langue = useLangue();
  const t = textesGuichet[langue];
  const tu = textesUssd[langue];
  const tb = textesBeneficiaires[langue];
  // Aucune ligne demandée : l'accueil, toujours monté, en met déjà trente
  // au cahier partagé — les clients récents se lisent là, sans que cet
  // onglet devienne un écran lourd qui ferait attendre.
  const { donnees, attente, erreur, recharger, actualiser, duCahier } =
    useDonnees({ sms: 0, recus: 0 });
  const roue = useRoue();
  const maintenant = useMaintenant();
  const [ficheTerminal, setFicheTerminal] = useState(false);

  const [operation, setOperation] = useState<Operation | null>(null);
  // LA MÊME CARTE QUE L'ACCUEIL. Chaque écran gardait la sienne : on
  // choisissait la MTN sur l'accueil et l'on trouvait l'Orange ici, sur
  // l'écran où l'on déplace de l'argent.
  const choisie = useCarteChoisie();
  const [coordonnees, setCoordonnees] = useState(false);

  // Les cartes en place, dans le même ordre stable que l'accueil.
  const cartes = cartesAMontrer(donnees?.sims ?? []).filter((s) => s.enPlace);
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  // Le boîtier se tait : composer déposerait une demande qu'il exécuterait
  // à son retour, des heures plus tard. L'appui explique, comme sur l'accueil.
  // Seulement si le boîtier QUI PORTE cette carte se tait (`carteEnPause`).
  const seTait = carteEnPause(donnees, duCahier, carte ?? null);
  const depuisSilence = silenceDepuis(donnees, duCahier, carte ?? null);
  const expliquer = () => { setFicheTerminal(true); actualiser(); };
  useEffect(() => { if (ficheTerminal && !seTait) setFicheTerminal(false); }, [ficheTerminal, seTait]);
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;
  const raccourcis = donnees?.raccourcis ?? {};

  if (!carte) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <Defilement
          contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg, paddingBottom: margeBas }}
          refreshControl={roue}
        >
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
          {/* La panne AVANT l'état vide : hors ligne, « aucune carte »
              serait un mensonge. ET LE CHARGEMENT AVANT LES DEUX : au
              premier rendu, `donnees` est nul et l'écran en `attente`, si bien
              que l'écran annonçait « Aucune carte dans le terminal » à
              chaque ouverture, le temps de la requête. Pour un propriétaire,
              cette phrase parle d'un boîtier à 300 km — l'afficher par
              défaut apprend à ne plus la croire, et c'est justement le jour
              où elle sera vraie qu'on l'ignorera. */}
          {erreur ? (
            <Accroc message={erreur} onReessayer={() => void recharger()} />
          ) : attente ? null : donnees?.proprietaire === false && !(donnees.sims ?? []).length ? (
            // Un compte sans carte : le chemin vers « Ajouter ma carte ».
            <AjouterMaCarteCourt langue={langue} />
          ) : (
            <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm }}>
              <Texte poids="demi">{t.aucuneCarte}</Texte>
              <Texte ton="doux" taille={textes.petit} style={{ textAlign: "center", lineHeight: 20 }}>
                {t.aucuneCarteDetail}
              </Texte>
            </Carte>
          )}
        </Defilement>
      </SafeAreaView>
    );
  }

  const op = carte.operateur;

  // Le bouton défini par le propriétaire d'abord, sinon le catalogue, sinon
  // la porte du menu de l'opérateur.
  const operationDe = (cle: string, titre: string, champs: ChampOperation[]): Operation => {
    const et = etapesGeste(op, cle, raccourcis[op] ?? []);
    return {
      titre, code: et[0] ?? "", etapes: et, champs,
      carte: carte.iccid, terminal: donnees?.terminal?.id ?? null,
      carteLibelle: carte.libelle, operateur: carte.operateur,
      recents: aQui(donnees?.beneficiaires,
                    clientsRecents(donnees?.paiements ?? [], carte.iccid), carte.iccid),
    };
  };

  type Geste = { titre: string; sous?: string; icone: NomIcone; fabrique: () => Operation };

  // Le tableau est typé AVANT le filtre : sans cela, TypeScript élargit
  // « icone » en simple chaîne et ne vérifie plus qu'elle existe au jeu.
  const tousLesGestes: Geste[] = [
    {
      titre: t.depot, sous: t.depotSous, icone: "ArrowDown",
      fabrique: () => operationDe("depot", t.depotTitre, [
        { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
      ]),
    },
    {
      titre: t.retrait, sous: t.retraitSous, icone: "Wallet",
      fabrique: () => operationDe("retrait", t.retraitTitre, [
        { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
      ]),
    },
    {
      titre: t.transfert, sous: t.transfertSous, icone: "ArrowUp",
      fabrique: () => operationDe("transfert", t.transfertTitre, [
        { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleCinquanteMille, type: "montant" },
      ]),
    },
    // Un geste dont on ne connaît pas le code ne s'affiche PAS : un bouton
    // qui composerait au hasard vaut moins que pas de bouton du tout.
  ];
  const gestes = tousLesGestes.filter((g) => g.fabrique().code);

  const toutesLesConsultations: Geste[] = [
    { titre: t.consulterSolde, sous: t.soldeSous, icone: "Refresh",
      fabrique: () => operationDe("solde", t.consulterSolde, []) },
    { titre: t.monNumero, sous: t.monNumeroSous, icone: "Phone",
      fabrique: () => operationDe("mon_numero", t.monNumero, []) },
  ];
  const consultations = toutesLesConsultations.filter((c) => c.fabrique().code);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Defilement
        contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg, paddingBottom: margeBas }}
        refreshControl={roue}
      >
        {/* Le titre, et — quand le boîtier se tait — la pastille dans la MÊME
            rangée, à hauteur fixe. Posée en tête de l'écran, l'alerte
            apparaissait à la réponse de la plateforme et poussait les gestes
            d'argent sous le doigt qui s'en approchait. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md,
                       minHeight: 44 }}>
          <Texte taille={textes.titre} poids="demi" style={{ flex: 1 }}>{t.titre}</Texte>
          {seTait ? <PastilleHorsLigne langue={langue} onPress={expliquer} /> : null}
        </View>

        {/* La carte visée. Avec deux SIM en place, c'est ICI que se décide sur
            laquelle on compose — se tromper enverrait l'argent depuis la
            mauvaise caisse. */}
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.legende} ton="pale"
                 style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
            {t.carteVisee}
          </Texte>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
            {cartes.map((c) => {
              const active = c.iccid === carte.iccid;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={c.iccid}
                  onPress={() => { choisirCarte(c.iccid); if (!active) toucherChoix(); }}
                  accessibilityState={{ selected: active }}
                  style={avecAppui({
                    paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                    borderRadius: rayons.bouton,
                    borderWidth: active ? 0 : 1, borderColor: couleurs.trait,
                    backgroundColor: active ? couleurs.accent : couleurs.surfaceHaute,
                  })}
                >
                  <Texte taille={textes.petit} poids="moyen"
                         style={active ? { color: couleurs.surfaceHaute } : undefined}
                         ton={active ? "normal" : "doux"}>
                    {c.libelle}
                  </Texte>
                </Pressable>
              );
            })}
          </View>
        </View>

        {gestes.length === 0 ? (
          <Carte style={{ padding: espaces.lg, borderStyle: "dashed" }}>
            <Texte taille={textes.petit} ton="pale" style={{ textAlign: "center", lineHeight: 20 }}>
              {t.aucunCodeReleve(op)}
            </Texte>
          </Carte>
        ) : (
          <Carte>
            {gestes.map((g, i) => (
              <View key={g.titre}>
                {i > 0 ? <Filet /> : null}
                <LigneAction titre={g.titre} sous={g.sous} icone={g.icone} enPause={seTait}
                             onPress={() => (seTait ? expliquer() : setOperation(g.fabrique()))} />
              </View>
            ))}
          </Carte>
        )}

        {consultations.length ? (
          <View style={{ gap: espaces.sm }}>
            <Texte taille={textes.intertitre} poids="demi">{t.consultation}</Texte>
            <Carte>
              {consultations.map((c, i) => (
                <View key={c.titre}>
                  {i > 0 ? <Filet /> : null}
                  <LigneAction titre={c.titre} sous={c.sous} icone={c.icone} enPause={seTait}
                               onPress={() => (seTait ? expliquer() : setOperation(c.fabrique()))} />
                </View>
              ))}
            </Carte>
          </View>
        ) : null}

        {/* Le cadran : composer n'importe quel code, comme sur un téléphone.
            Le web l'a en page à part (« Code USSD ») ; ici il s'ouvre d'une
            ligne — c'est le geste de secours quand aucun bouton ne convient. */}
        {/* LE CATALOGUE COMPLET : ce que l'accueil montre en ronds a aussi
            sa ligne ici, avec la phrase qui dit ce qu'il fait — deux
            chemins vers chaque chose. */}
        <Carte>
          <LigneAction titre={t.recevoir} sous={t.recevoirSous} icone="Identite"
                       onPress={() => setCoordonnees(true)} />
          <Filet />
          <LigneAction titre={tb.titre} sous={tb.sous} icone="Personnes"
                       onPress={() => router.push("/beneficiaires")} />
          <Filet />
          {/* Le cadran s'ouvre sur LA carte choisie ici. */}
          <LigneAction titre={tu.titre} sous={tu.composerSous} icone="Hash"
                       onPress={() => router.push({ pathname: "/ussd",
                                                    params: { carte: carte.iccid } })} />
        </Carte>
      </Defilement>

      {coordonnees ? (
        <Coordonnees langue={langue} onFermer={() => setCoordonnees(false)}
                     carte={{ iccid: carte.iccid, nom: carte.nom, numero: carte.numero,
                              operateur: carte.operateur, libelle: carte.libelle }} />
      ) : null}

      {operation ? (
        <OperationPopup
          operation={operation}
          onFermer={() => setOperation(null)}
          // Une session aboutie a pu changer le solde : on relit — EN
          // SILENCE, et encore trois fois pour attraper le SMS de
          // l'opérateur, qui arrive quelques secondes après.
          onTermine={() => actualiser({ suivi: true })}
          onRefus={() => actualiser()}
        />
      ) : null}

      {ficheTerminal ? (
        <FicheTerminalHorsLigne vuLe={depuisSilence} maintenant={maintenant}
                                fuseau={fuseau} langue={langue} onReverifier={recharger}
                                onFermer={() => setFicheTerminal(false)}
                                chezTotem={donnees?.proprietaire === false} />
      ) : null}
    </SafeAreaView>
  );
}
