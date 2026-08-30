// Qui peut se connecter — la gestion des comptes, sur le téléphone.
//
// Le pendant mobile de « SectionQui » (web/app/reglages/interactifs.tsx).
// La section ne s'affiche que pour le propriétaire : la liste des comptes
// lui est réservée (403 pour les autres), et l'écran se tait alors de
// lui-même — un invité ne voit même pas qu'elle existe.
//
// L'inscription libre est fermée dès le premier compte : créer un compte
// ICI est le seul chemin pour faire entrer quelqu'un. L'avertissement vient
// AVANT les champs — un compte approuvé voit tout, le dire après serait
// trop tard.

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, TextInput, View } from "react-native";

import { Carte, Filet, Texte } from "@/ui";
import { agirSurCompte, ErreurGuichet, listerComptes,
         type CompteInscrit } from "@/api/guichet";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { textesReglages } from "@noyau/textes/reglages";
import { textesConnexion } from "@noyau/textes/connexion";
import type { Langue } from "@noyau/langue";

export function SectionQui({ langue }: { langue: Langue }) {
  const t = textesReglages[langue];
  const tc = textesConnexion[langue];
  const [comptes, setComptes] = useState<CompteInscrit[] | null>(null);
  const [permis, setPermis] = useState<boolean | null>(null);
  const [occupe, setOccupe] = useState<number | null>(null);

  const [creationOuverte, setCreationOuverte] = useState(false);
  const [courriel, setCourriel] = useState("");
  const [motdepasse, setMotdepasse] = useState("");
  const [creation, setCreation] = useState(false);
  const [mot, setMot] = useState<string | null>(null);
  const [rate, setRate] = useState(false);

  // « Pas le propriétaire » et « le réseau a toussé » ne se ressemblent
  // pas : le premier tait la section (403, comme au web), le second se DIT
  // — sinon le propriétaire conclut que l'écran n'existe pas, pendant qu'un
  // invité attend son approbation.
  const [accroc, setAccroc] = useState(false);
  const charger = useCallback(async () => {
    try {
      const { comptes } = await listerComptes();
      setComptes(comptes ?? []);
      setPermis(true);
      setAccroc(false);
    } catch (e) {
      if (e instanceof ErreurGuichet && e.statut === 403) {
        setPermis(false);
        return;
      }
      setAccroc(true);
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const agir = async (c: CompteInscrit, geste: "approuver" | "fermer" | "supprimer") => {
    const faire = async () => {
      setOccupe(c.id);
      setMot(null);
      try {
        await agirSurCompte({ id: c.id, geste });
        setRate(false);
      } catch (e) {
        // Un geste raté se DIT : un « Approuver » silencieusement perdu
        // laisse l'invité dehors et le propriétaire persuadé du contraire.
        setRate(true);
        setMot(e instanceof Error && e.message ? e.message : t.pasPartie);
      } finally {
        // Réussi ou non, la liste rechargée dit l'état réel.
        await charger();
        setOccupe(null);
      }
    };
    if (geste === "supprimer") {
      Alert.alert(t.supprimerSur, c.courriel, [
        { text: t.annuler, style: "cancel" },
        { text: t.supprimer, style: "destructive", onPress: () => void faire() },
      ]);
      return;
    }
    await faire();
  };

  const creer = async () => {
    if (creation || !courriel || motdepasse.length < 12) return;
    setCreation(true);
    setMot(null);
    try {
      await agirSurCompte({ geste: "creer", courriel, motdepasse });
      setRate(false);
      setMot(t.creerFait);
      // Le mot de passe ne reste pas à l'écran : il vient d'être transmis.
      setCourriel("");
      setMotdepasse("");
      setCreationOuverte(false);
      await charger();
    } catch (e) {
      setRate(true);
      setMot(e instanceof Error && e.message ? e.message : t.creerBouton);
    } finally {
      setCreation(false);
    }
  };

  // Pas le propriétaire : la section se tait, comme au web.
  if (permis === false) return null;
  // Le premier chargement a raté : on le dit, avec de quoi réessayer —
  // disparaître en silence ferait croire que la section n'existe pas.
  if (accroc && comptes == null) {
    return (
      <View style={{ gap: espaces.sm }}>
        <Texte taille={textes.intertitre} poids="demi">{t.qui}</Texte>
        <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
          <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
            {t.pasPartie}
          </Texte>
          <Pressable
            onPress={() => void charger()}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              paddingHorizontal: espaces.lg, paddingVertical: espaces.sm,
              borderRadius: rayons.bouton, borderWidth: 1,
              borderColor: couleurs.trait,
              backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
            })}
          >
            <Texte taille={textes.petit} poids="moyen">{tc.reessayer}</Texte>
          </Pressable>
        </Carte>
      </View>
    );
  }
  // Encore en route.
  if (comptes == null) return null;

  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi">{t.qui}</Texte>
      <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
        {t.quiAide}
      </Texte>
      <Carte>
        {comptes.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Filet /> : null}
            <View style={{ padding: espaces.lg, gap: espaces.sm }}>
              <View style={{ gap: 2 }}>
                <Texte poids="moyen" taille={textes.petit} numberOfLines={1}>
                  {c.courriel}
                </Texte>
                <Texte taille={textes.legende} ton="pale" numberOfLines={1}>
                  {c.role === "proprietaire" ? t.roleProprietaire : t.roleInvite}
                  {" · "}
                  {c.approuve ? t.ouvert : t.enAttente}
                  {" · "}
                  {c.vuLe
                    ? `${t.vuLe} ${new Date(c.vuLe).toLocaleDateString()}`
                    : t.jamaisVenu}
                </Texte>
              </View>
              {/* Le propriétaire n'a pas de boutons sur sa propre ligne : il
                  ne peut ni se bloquer ni se supprimer. */}
              {c.role !== "proprietaire" ? (
                <View style={{ flexDirection: "row", gap: espaces.sm }}>
                  <Petit
                    libelle={c.approuve ? t.fermer : t.approuver}
                    accent={!c.approuve}
                    occupe={occupe === c.id}
                    onPress={() => void agir(c, c.approuve ? "fermer" : "approuver")}
                  />
                  <Petit
                    libelle={t.supprimer}
                    danger
                    occupe={occupe === c.id}
                    onPress={() => void agir(c, "supprimer")}
                  />
                </View>
              ) : null}
            </View>
          </View>
        ))}
        {comptes.length <= 1 ? (
          <View style={{ padding: espaces.lg }}>
            <Texte taille={textes.legende} ton="pale">{t.aucunAutreCompte}</Texte>
          </View>
        ) : null}
      </Carte>

      {!creationOuverte ? (
        <Pressable
          onPress={() => { setCreationOuverte(true); setMot(null); }}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            paddingHorizontal: espaces.lg, paddingVertical: espaces.sm,
            borderRadius: rayons.bouton, borderWidth: 1,
            borderColor: couleurs.trait,
            backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
          })}
        >
          <Texte taille={textes.petit} poids="moyen">{t.creerCompte}</Texte>
        </Pressable>
      ) : (
        <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
          <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
            {t.creerCompteAide}
          </Texte>
          <Texte taille={textes.legende} ton="negatif" style={{ lineHeight: 18 }}>
            {t.creerAvertissement}
          </Texte>
          <Saisie libelle={t.creerCourriel} valeur={courriel} onChange={setCourriel}
                  clavier="email-address" />
          <View style={{ gap: espaces.xs }}>
            {/* En clair, à dessein : le propriétaire doit pouvoir le relire
                pour le transmettre. Ce n'est pas SON mot de passe. */}
            <Saisie libelle={t.creerMotDePasse} valeur={motdepasse}
                    onChange={setMotdepasse} />
            <Texte taille={textes.legende}
                   ton={motdepasse && motdepasse.length < 12 ? "negatif" : "pale"}>
              {t.creerLongueur}
            </Texte>
          </View>
          <View style={{ flexDirection: "row", gap: espaces.sm }}>
            <Pressable
              onPress={() => void creer()}
              disabled={creation || !courriel || motdepasse.length < 12}
              style={({ pressed }) => ({
                flex: 1, alignItems: "center", paddingVertical: espaces.md,
                borderRadius: rayons.bouton,
                backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
                opacity: creation || !courriel || motdepasse.length < 12 ? 0.35 : 1,
              })}
            >
              {creation
                ? <ActivityIndicator size="small" color={couleurs.surfaceHaute} />
                : <Texte poids="demi" taille={textes.petit}
                         style={{ color: couleurs.surfaceHaute }}>
                    {t.creerBouton}
                  </Texte>}
            </Pressable>
            <Pressable
              onPress={() => { setCreationOuverte(false); setMot(null); }}
              style={({ pressed }) => ({
                flex: 1, alignItems: "center", paddingVertical: espaces.md,
                borderRadius: rayons.bouton, borderWidth: 1,
                borderColor: couleurs.trait,
                backgroundColor: pressed ? couleurs.surface2 : "transparent",
              })}
            >
              <Texte taille={textes.petit} ton="doux">{t.annuler}</Texte>
            </Pressable>
          </View>
        </Carte>
      )}

      {mot ? (
        <Texte taille={textes.legende} ton={rate ? "negatif" : "doux"}
               style={{ lineHeight: 18 }}>
          {mot}
        </Texte>
      ) : null}
    </View>
  );
}

function Petit({ libelle, onPress, occupe, danger, accent }: {
  libelle: string;
  onPress: () => void;
  occupe: boolean;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={occupe}
      style={({ pressed }) => ({
        paddingHorizontal: espaces.md, paddingVertical: espaces.xs + 2,
        borderRadius: rayons.bouton,
        borderWidth: accent ? 0 : 1,
        borderColor: danger ? couleurs.negatif : couleurs.trait,
        backgroundColor: accent
          ? (pressed ? couleurs.accentAppui : couleurs.accent)
          : pressed ? couleurs.surface2 : "transparent",
        opacity: occupe ? 0.4 : 1,
      })}
    >
      <Texte taille={textes.legende} poids="moyen"
             ton={danger ? "negatif" : accent ? "normal" : "doux"}
             style={accent ? { color: couleurs.surfaceHaute } : undefined}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

function Saisie({ libelle, valeur, onChange, clavier }: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  clavier?: "email-address";
}) {
  return (
    <View style={{ gap: espaces.xs }}>
      <Texte taille={textes.legende} ton="pale"
             style={{ textTransform: "uppercase", letterSpacing: 1 }}>
        {libelle}
      </Texte>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        keyboardType={clavier}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          borderWidth: 1, borderColor: couleurs.trait,
          borderRadius: rayons.bouton, paddingHorizontal: espaces.md,
          paddingVertical: espaces.md, fontFamily: polices.corps,
          fontSize: 15, color: couleurs.encre,
          backgroundColor: couleurs.surface,
        }}
      />
    </View>
  );
}
