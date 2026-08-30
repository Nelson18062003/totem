// La boîte de réception : les SMS reçus par les cartes.
//
// Le pendant mobile de `web/app/encaissements/`. Même ordre, mêmes filtres :
// la recherche, puis la carte, puis la nature — du plus large au plus fin.
// Les messages se groupent par JOUR, comme une messagerie.
//
// Le texte de l'opérateur s'affiche mot pour mot, dans la langue où la SIM
// l'a reçu. Le traduire serait le trahir.

import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import { Carte, Filet, Texte } from "@/ui";
import { FicheSms, couleursCategorie, icone as iconeCat } from "@/fiche-sms";
import { texteSurEcran } from "@noyau/sms";
import { Icone, type NomIcone } from "@/icones";
import { Entree } from "@/animations";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { textesSms } from "@noyau/textes/sms";
import { fcfa, type Categorie, type Paiement } from "@noyau/types";

// Les natures proposées en filtre, dans l'ordre où on les cherche.
const FILTRES: Categorie[] = ["encaissement", "envoi", "transfert", "publicite"];

export default function Encaissements() {
  const langue = useLangue();
  const t = textesSms[langue];
  const { donnees, chargement, recharger } = useDonnees({ sms: 200 });

  const [recherche, setRecherche] = useState("");
  const [carte, setCarte] = useState<string | null>(null);       // null = toutes
  const [categorie, setCategorie] = useState<Categorie | null>(null);
  const [ouvert, setOuvert] = useState<Paiement | null>(null);

  // Arriver déjà filtré : l'Analyse pousse un nom de client, la liste
  // s'ouvre sur ses paiements — même chemin que le web
  // (`/encaissements?recherche=…`). Le champ reste libre ensuite, et
  // « moment » fait que retoucher le MÊME nom refiltre quand même.
  const params = useLocalSearchParams<{ recherche?: string; moment?: string }>();
  useEffect(() => {
    if (typeof params.recherche === "string" && params.recherche) {
      setRecherche(params.recherche);
    }
  }, [params.recherche, params.moment]);

  const paiements = donnees?.paiements ?? [];
  const sims = donnees?.sims ?? [];

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return paiements.filter((p) => {
      if (carte && p.sim !== carte) return false;
      if (categorie && p.categorie !== categorie) return false;
      if (!q) return true;
      // On cherche dans tout ce qui est lisible : le nom, le numéro, le
      // montant, et le message entier.
      return [p.nom, p.tiers, p.numero, p.smsBrut, p.reference,
              p.montant == null ? "" : String(p.montant)]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [paiements, recherche, carte, categorie]);

  // Groupés par jour, dans l'ordre où ils sont arrivés.
  const jours = useMemo(() => {
    const par = new Map<string, { libelle: string; lignes: Paiement[] }>();
    for (const p of filtres) {
      const g = par.get(p.jour) ?? { libelle: p.date, lignes: [] };
      g.lignes.push(p);
      par.set(p.jour, g);
    }
    return [...par.values()];
  }, [filtres]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg, paddingBottom: 108 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={chargement} onRefresh={recharger}
                                        tintColor={couleurs.encrePale} />}
      >
        <Entree>
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
        </Entree>

        {/* La recherche. */}
        <Entree delai={60}>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: espaces.sm,
            borderWidth: 1, borderColor: couleurs.trait, borderRadius: rayons.rond,
            backgroundColor: couleurs.surfaceHaute,
            paddingHorizontal: espaces.lg, paddingVertical: espaces.sm,
          }}>
            <Icone nom="Search" taille={18} couleur={couleurs.encrePale} />
            <TextInput
              value={recherche}
              onChangeText={setRecherche}
              placeholder={t.recherchePlaceholder}
              placeholderTextColor={couleurs.encrePale}
              style={{
                flex: 1, paddingVertical: espaces.xs,
                fontFamily: polices.corps, fontSize: textes.corps, color: couleurs.encre,
              }}
            />
            {recherche ? (
              <Pressable onPress={() => setRecherche("")} hitSlop={10}
                         accessibilityLabel={t.effacerRecherche}>
                <Icone nom="Close" taille={16} couleur={couleurs.encrePale} />
              </Pressable>
            ) : null}
          </View>
        </Entree>

        {/* Les cartes, puis les natures — du plus large au plus fin. */}
        <Entree delai={120}>
          <View style={{ gap: espaces.sm }}>
            <Rangee>
              <Puce libelle={t.toutesLesCartes} actif={carte === null}
                    onPress={() => setCarte(null)} />
              {sims.map((s) => (
                <Puce key={s.iccid} libelle={s.libelle} actif={carte === s.libelle}
                      onPress={() => setCarte(s.libelle)} />
              ))}
            </Rangee>
            <Rangee>
              <Puce libelle={t.toutesLesCategories} actif={categorie === null}
                    onPress={() => setCategorie(null)} />
              {FILTRES.map((c) => (
                <Puce key={c} libelle={t.cat[c]} actif={categorie === c}
                      icone={iconeDe(c)} onPress={() => setCategorie(c)} />
              ))}
            </Rangee>
          </View>
        </Entree>

        {jours.length === 0 && !chargement ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm }}>
            <Texte poids="demi">
              {recherche || carte || categorie ? t.aucunResultatTitre : t.aucunSmsTitre}
            </Texte>
            <Texte ton="doux" taille={textes.petit} style={{ textAlign: "center", lineHeight: 20 }}>
              {recherche || carte || categorie ? t.aucunResultatDetail : t.aucunSmsDetail}
            </Texte>
          </Carte>
        ) : null}

        {jours.map((j, k) => (
          <Entree key={j.libelle} delai={180 + k * 40}>
            <View style={{ gap: espaces.sm }}>
              <Texte taille={textes.legende} ton="pale"
                     style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                {j.libelle}
              </Texte>
              <Carte>
                {j.lignes.map((p, i) => (
                  <View key={p.id}>
                    {i > 0 ? <Filet /> : null}
                    <Ligne paiement={p} langue={langue}
                           onPress={() => setOuvert(p)} />
                  </View>
                ))}
              </Carte>
            </View>
          </Entree>
        ))}
      </ScrollView>

      {ouvert ? (
        <FicheSms paiement={ouvert} onFermer={() => setOuvert(null)}
                  onChange={recharger} />
      ) : null}
    </SafeAreaView>
  );
}

/** Une rangée de filtres qui glisse horizontalement : sur un écran étroit,
 *  quatre natures ne tiennent pas de front. */
function Rangee({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: espaces.sm, paddingRight: espaces.lg }}>
      {children}
    </ScrollView>
  );
}

function Puce({ libelle, actif, icone, onPress }: {
  libelle: string; actif: boolean; icone?: NomIcone; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: actif }}
      style={{
        flexDirection: "row", alignItems: "center", gap: espaces.xs,
        paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
        borderRadius: rayons.rond,
        borderWidth: actif ? 0 : 1, borderColor: couleurs.trait,
        backgroundColor: actif ? couleurs.accent : couleurs.surfaceHaute,
      }}
    >
      {icone ? (
        <Icone nom={icone} taille={14}
               couleur={actif ? couleurs.surfaceHaute : couleurs.encreDouce} />
      ) : null}
      <Texte taille={textes.petit} poids="moyen"
             ton={actif ? "normal" : "doux"}
             style={actif ? { color: couleurs.surfaceHaute } : undefined}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

function iconeDe(c: Categorie): NomIcone {
  if (c === "encaissement" || c === "depot") return "ArrowDown";
  if (c === "envoi" || c === "retrait") return "ArrowUp";
  if (c === "transfert") return "Transfer";
  if (c === "publicite") return "Megaphone";
  if (c === "solde") return "Refresh";
  return "Bubble";
}

/** Une ligne : la pastille de nature, l'entête, le message, le montant. */
function Ligne({ paiement: p, langue, onPress }: {
  paiement: Paiement; langue: "en" | "fr"; onPress: () => void;
}) {
  const entree = p.sens === "in";
  const sortie = p.sens === "out";
  const schema = couleursCategorie(p.nature ?? p.categorie);

  return (
    <Pressable onPress={onPress}
               style={({ pressed }) => ({
                 flexDirection: "row", gap: espaces.md, padding: espaces.lg,
                 backgroundColor: pressed ? couleurs.surface2 : "transparent",
               })}>
      <View style={{
        width: 36, height: 36, borderRadius: rayons.petit, backgroundColor: schema.fond,
        alignItems: "center", justifyContent: "center",
      }}>
        <Icone nom={iconeCat(p.nature ?? p.categorie)} taille={16} couleur={schema.encre} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: espaces.xs }}>
            {p.nonLu ? (
              <View style={{ width: 6, height: 6, borderRadius: rayons.rond,
                             backgroundColor: couleurs.accent }} />
            ) : null}
            <Texte taille={textes.petit} ton="pale" numberOfLines={1} style={{ flex: 1 }}>
              {[p.numero, p.sim, p.heure].filter(Boolean).join(" · ")}
            </Texte>
          </View>
          {p.montant != null ? (
            <Texte poids="demi" chiffresAlignes taille={textes.petit}
                   ton={entree ? "positif" : sortie ? "negatif" : "doux"}>
              {entree ? "+" : sortie ? "−" : ""}{fcfa(p.montant, langue)}
            </Texte>
          ) : null}
        </View>

        {p.tiers ? (
          <Texte poids={p.nonLu ? "demi" : "moyen"} numberOfLines={1}>{p.tiers}</Texte>
        ) : (
          // Sans partie humaine (publicité, information), c'est le message
          // lui-même qui prend la place — mot pour mot.
          // MASQUÉ, comme dans la fiche. La défense contre les codes à
          // usage unique ne vaut que si elle est posée PARTOUT où le texte
          // s'affiche : une liste qui montre le code en clair annule le
          // masquage de la fiche.
          <Texte ton="doux" taille={textes.petit} numberOfLines={2}
                 style={{ lineHeight: 20 }}>
            {texteSurEcran(p)}
          </Texte>
        )}
      </View>
    </Pressable>
  );
}
