// La racine de l'application : les polices, la langue, et le verrou.
//
// Rien ne s'affiche tant que les polices ne sont pas là. C'est voulu : un
// écran qui apparaît en Helvetica puis saute en Inter donne l'impression que
// l'application se répare en direct. Mieux vaut un instant de plus sur
// l'écran de démarrage.

import { useEffect } from "react";
import { Stack } from "expo-router";
import * as Demarrage from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from "@expo-google-fonts/inter";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans";

import { FournisseurLangue } from "@/langue";
import { FournisseurSession, useSession } from "@/session";
import { FournisseurDonnees } from "@/donnees";
import { useSonnerie } from "@/sonnerie";
import { couleurs } from "@/theme/jetons";

// L'écran de démarrage reste tant qu'on ne sait pas où aller : sans cela,
// l'application montrerait l'accueil une fraction de seconde avant de
// basculer sur la connexion.
Demarrage.preventAutoHideAsync().catch(() => {});

export default function Racine() {
  return (
    <FournisseurLangue>
      <FournisseurSession>
        {/* LE CAHIER SUR LE COMPTOIR, au-dessus de tous les écrans : sept
            d'entre eux demandaient les mêmes chiffres, chacun pour soi. Il
            est DANS la session — se déconnecter l'efface. */}
        <FournisseurDonnees>
          <Charpente />
        </FournisseurDonnees>
      </FournisseurSession>
    </FournisseurLangue>
  );
}

function Charpente() {
  const { connecte } = useSession();
  // Une fois connecté, le téléphone s'inscrit pour être prévenu. Rien ne
  // bloque : un refus de notification laisse l'application entière.
  useSonnerie(connecte);
  const [polices] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    DMSans_700Bold,
  });

  const pret = polices && connecte !== null;

  useEffect(() => {
    if (pret) Demarrage.hideAsync().catch(() => {});
  }, [pret]);

  if (!pret) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: couleurs.surface },
          animation: "fade",
        }}
      >
        {/* Une session valable ? On entre. Sinon, le verrou.
            `Protected` évite le clignotement d'un écran qu'on quitte
            aussitôt : la route n'est même pas montée. */}
        <Stack.Protected guard={connecte}>
          <Stack.Screen name="(onglets)" />
          {/* Les reglages vivent hors des onglets : on y vient
              depuis l'accueil, la barre garde ses quatre entrees. */}
          <Stack.Screen name="reglages" options={{ animation: "slide_from_right" }} />
          {/* Le cadran USSD aussi : on y vient depuis Opérations, pour
              composer un code à la main comme sur un téléphone. */}
          <Stack.Screen name="ussd" options={{ animation: "slide_from_right" }} />
          {/* L'analyse : la semaine en chiffres, depuis l'accueil. */}
          <Stack.Screen name="analyse" options={{ animation: "slide_from_right" }} />
        </Stack.Protected>
        <Stack.Protected guard={!connecte}>
          <Stack.Screen name="connexion" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
