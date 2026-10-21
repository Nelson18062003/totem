// L'ONGLET « … » — PLUS.
//
// La barre ne garde que les quatre gestes de tous les jours : l'accueil, les
// paiements, les SMS, les opérations. Le reste vit ici, une ligne par écran,
// et chaque ligne dit ce qu'on y trouve : les comptes (qui avaient leur
// onglet, pour un écran qu'on ouvre de temps en temps), les volumes, le
// relevé, les bénéficiaires, le cadran, les réglages.
//
// Rien ici ne demande de données à part : le relevé lit les cartes dans le
// cahier, comme partout ailleurs.

import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useMargeSousLaBarre, Accroc, Defilement, Carte, Filet, LigneAction, Texte } from "@/ui";
import { Entree } from "@/animations";
import { FeuilleReleve } from "@/releve";
import { cartesAMontrer } from "@/carte-choisie";
import { carteRetiree } from "@/reglages-cartes";
import { espaces, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { textesPlus } from "@noyau/textes/plus";
import { textesCartes } from "@noyau/textes/cartes";
import { textesVolumes } from "@noyau/textes/volumes";
import { textesReleve } from "@noyau/textes/releve";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import { textesUssd } from "@noyau/textes/ussd";
import { textesCharpente } from "@noyau/textes/charpente";
import { FUSEAU_DEFAUT } from "@noyau/types";

export default function Plus() {
  const margeBas = useMargeSousLaBarre();
  const langue = useLangue();
  const t = textesPlus[langue];
  // Les cartes seules, comme Opérations et les Réglages : aucun SMS.
  const { donnees, erreur, recharger } = useDonnees({ sms: 0, recus: 0 });
  const [releve, setReleve] = useState(false);
  const cartes = cartesAMontrer(donnees?.sims ?? []).filter((s) => !carteRetiree(s));

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Defilement contentContainerStyle={{ padding: espaces.lg, paddingBottom: margeBas,
                                           gap: espaces.xl }}>
        <Entree montee={6}>
          <Texte taille={textes.titre} poids="demi" accessibilityRole="header">{t.titre}</Texte>
        </Entree>

        {/* Hors ligne, le relevé disparaîtrait sans un mot (il lui faut les
            cartes) : la panne se dit, comme sur chaque écran. */}
        {erreur ? <Accroc message={erreur} onReessayer={() => void recharger()} /> : null}

        <Entree delai={60}>
          <View style={{ gap: espaces.sm }}>
            <Texte taille={textes.intertitre} poids="demi" accessibilityRole="header">
              {t.groupeComptes}
            </Texte>
            <Carte>
              <LigneAction titre={textesCartes[langue].titre} sous={t.comptesSous} icone="Wallet"
                           onPress={() => router.push("/comptes")} />
              <Filet />
              <LigneAction titre={textesVolumes[langue].titre} sous={t.analyseSous} icone="Chart"
                           onPress={() => router.push("/volumes")} />
              {cartes.length ? (
                <>
                  <Filet />
                  <LigneAction titre={textesReleve[langue].titre} sous={t.releveSous} icone="Doc"
                               onPress={() => setReleve(true)} />
                </>
              ) : null}
            </Carte>
          </View>
        </Entree>

        <Entree delai={120}>
          <View style={{ gap: espaces.sm }}>
            <Texte taille={textes.intertitre} poids="demi" accessibilityRole="header">
              {t.groupeOutils}
            </Texte>
            <Carte>
              <LigneAction discret titre={textesBeneficiaires[langue].titre}
                           sous={textesBeneficiaires[langue].sous} icone="Personnes"
                           onPress={() => router.push("/beneficiaires")} />
              <Filet />
              {/* Le cadran s'ouvre sur la carte retenue ailleurs (accueil,
                  Opérations) : c'est lui qui la retrouve. */}
              <LigneAction discret titre={textesUssd[langue].titre}
                           sous={textesUssd[langue].composerSous} icone="Hash"
                           onPress={() => router.push("/ussd")} />
              <Filet />
              <LigneAction discret titre={textesCharpente[langue].reglages}
                           sous={t.reglagesSous} icone="Settings"
                           onPress={() => router.push("/reglages")} />
            </Carte>
          </View>
        </Entree>
      </Defilement>

      {releve ? (
        <FeuilleReleve langue={langue} fuseau={donnees?.fuseau || FUSEAU_DEFAUT}
                       onFermer={() => setReleve(false)}
                       cartes={cartes.map((c) => ({ iccid: c.iccid, numero: c.numero,
                                                    libelle: c.libelle, operateur: c.operateur }))} />
      ) : null}
    </SafeAreaView>
  );
}
