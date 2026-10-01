// Qui peut se connecter — la gestion des comptes, sur le téléphone.
//
// Le pendant mobile de « SectionQui » (web/app/reglages/interactifs.tsx).
// La section ne s'affiche que pour le propriétaire : la liste des comptes
// lui est réservée (403 pour les autres), et l'écran se tait alors de
// lui-même — un invité ne voit même pas qu'elle existe.
//
// L'inscription libre est fermée dès le premier compte : créer un compte
// ICI est le seul chemin pour faire entrer quelqu'un. Un courriel suffit — on
// entre par un code reçu à ce courriel, il n'y a plus de mot de passe à
// transmettre.
//
// LES CARTES DE CHACUN. Un invité ne voit que les cartes qu'on lui confie
// ici, et rien du tout tant qu'on ne lui en a confié aucune. L'avertissement
// vient AVANT le champ — le dire après la création ferait croire à un accès
// cassé.
//
// clavier : protégé par app/reglages.tsx — la section vit dans l'écran des
// réglages, dont le KeyboardAvoidingView pousse le formulaire au-dessus du
// clavier (vérifié par scripts/verifier-le-clavier.mjs).

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";

import { ChampTexte, Carte, Filet, Texte } from "@/ui";
import { useGesteUnique } from "@/geste";
import { agirSurCompte, ErreurGuichet, listerComptes,
         type CarteAConfier, type CompteInscrit } from "@/api/guichet";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { dateVue } from "@noyau/types";
import { textesReglages } from "@noyau/textes/reglages";
import { textesConnexion } from "@noyau/textes/connexion";
import type { Langue } from "@noyau/langue";

export function SectionQui({ langue }: { langue: Langue }) {
  const t = textesReglages[langue];
  const tc = textesConnexion[langue];
  const [comptes, setComptes] = useState<CompteInscrit[] | null>(null);
  const [cartes, setCartes] = useState<CarteAConfier[]>([]);
  // Le compte dont on choisit les cartes, ou aucun.
  const [enChoix, setEnChoix] = useState<number | null>(null);
  // La carte dont l'attribution part en ce moment (« compte-iccid »).
  const [bascule, setBascule] = useState<string | null>(null);
  const [permis, setPermis] = useState<boolean | null>(null);
  const [occupe, setOccupe] = useState<number | null>(null);

  const [creationOuverte, setCreationOuverte] = useState(false);
  const [courriel, setCourriel] = useState("");
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
      const r = await listerComptes();
      setComptes(r.comptes ?? []);
      setCartes(r.cartes ?? []);
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
    // FERMER AUSSI SE CONFIRME. « Supprimer » demandait confirmation,
    // « Fermer » partait au premier appui — alors que les deux retirent
    // l'accès à quelqu'un, et que les boutons se touchent. Un doigt qui
    // dérape mettait un associé dehors, sans un mot et sans retour possible
    // depuis cet écran.
    if (geste === "fermer") {
      Alert.alert(t.fermerSur, c.courriel, [
        { text: t.annuler, style: "cancel" },
        { text: t.fermer, style: "destructive", onPress: () => void faire() },
      ]);
      return;
    }
    await faire();
  };

  // `if (creation)` ne garde rien : l'état React ne se ferme qu'au rendu
  // suivant. Deux appuis rapprochés partaient tous les deux ; la base n'en
  // gardait qu'un — c'est elle qui tient la règle — mais le second revenait
  // avec « un compte existe déjà avec ce courriel », juste après une création
  // réussie. Le propriétaire lisait un échec là où tout s'était bien passé.
  const gesteCreer = useGesteUnique();

  const creer = () => gesteCreer.lancer(async () => {
    if (!courriel.trim()) return;
    setCreation(true);
    setMot(null);
    try {
      const r = await agirSurCompte({ geste: "creer", courriel: courriel.trim() }) as
        { id?: number } | null;
      setRate(false);
      setMot(t.creerFait);
      setCourriel("");
      setCreationOuverte(false);
      await charger();
      // Le geste qui suit naturellement : choisir ses cartes. Sans cela, le
      // compte neuf ne verrait rien, et l'on croirait l'accès cassé.
      if (typeof r?.id === "number") setEnChoix(r.id);
      return true;
    } catch (e) {
      setRate(true);
      setMot(e instanceof Error && e.message ? e.message : t.creerBouton);
      return false;
    } finally {
      setCreation(false);
    }
  });

  /** Confier une carte, ou la reprendre. La liste rechargée dit ensuite
   *  l'état réel — jamais celui qu'on espérait. */
  const basculer = async (c: CompteInscrit, iccid: string, confiee: boolean) => {
    if (bascule) return;
    setBascule(`${c.id}-${iccid}`);
    setMot(null);
    try {
      await agirSurCompte({ id: c.id, iccid, geste: confiee ? "retirer" : "attribuer" });
      setRate(false);
    } catch (e) {
      setRate(true);
      setMot(e instanceof Error && e.message ? e.message : t.pasPartie);
    } finally {
      await charger();
      setBascule(null);
    }
  };

  const nomDeCarte = (iccid: string) =>
    cartes.find((x) => x.iccid === iccid)?.libelle ?? `··${iccid.slice(-4)}`;

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
            accessibilityRole="button"
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
                {/* LE COURRIEL EN ENTIER. C'est sur lui qu'on décide
                    d'ouvrir la caisse à quelqu'un : « jean.dupont@exemp… »
                    et « jean.dupont@exemple-piege.cm » se ressemblent
                    beaucoup une fois coupés. On ne tronque pas ce qui sert
                    à reconnaître une personne. */}
                <Texte poids="moyen" taille={textes.petit} selectable>
                  {c.courriel}
                </Texte>
                <Texte taille={textes.legende} ton="pale" numberOfLines={1}>
                  {c.role === "proprietaire" ? t.roleProprietaire : t.roleInvite}
                  {" · "}
                  {c.approuve ? t.ouvert : t.enAttente}
                  {" · "}
                  {c.vuLe
                    ? `${t.vuLe} ${dateVue(c.vuLe, langue)}`
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

              {/* CE QUE CETTE PERSONNE VOIT, en toutes lettres : « aucune »
                  n'est pas un oubli d'affichage, c'est un compte qui ne voit
                  rien. */}
              <View style={{
                gap: espaces.xs, padding: espaces.md,
                borderRadius: rayons.bouton, backgroundColor: couleurs.surface2,
              }}>
                <Texte taille={textes.legende} ton="pale">{t.cartesDeLaPersonne}</Texte>
                <Texte taille={textes.petit}
                       ton={c.cartes !== null && c.cartes.length === 0 ? "alerte" : "normal"}>
                  {c.cartes === null ? t.cartesToutes
                    : c.cartes.length === 0 ? t.cartesAucune
                      : c.cartes.map(nomDeCarte).join(" · ")}
                </Texte>
                {c.cartes !== null && enChoix !== c.id ? (
                  <Petit libelle={t.cartesConfier} occupe={false}
                         onPress={() => setEnChoix(c.id)} />
                ) : null}
                {c.cartes !== null && enChoix === c.id ? (
                  <View style={{ gap: espaces.xs, marginTop: espaces.xs }}>
                    {cartes.length === 0 ? (
                      <Texte taille={textes.legende} ton="pale">{t.cartesAucuneDansLaMaison}</Texte>
                    ) : null}
                    {cartes.map((carte) => {
                      const confiee = c.cartes!.includes(carte.iccid);
                      const enRoute = bascule === `${c.id}-${carte.iccid}`;
                      return (
                        <Pressable
                          key={carte.iccid}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: confiee, busy: enRoute }}
                          disabled={bascule !== null}
                          onPress={() => void basculer(c, carte.iccid, confiee)}
                          style={({ pressed }) => ({
                            flexDirection: "row", alignItems: "center", gap: espaces.md,
                            minHeight: 48, paddingHorizontal: espaces.md,
                            borderRadius: rayons.bouton, borderWidth: 1,
                            borderColor: confiee ? couleurs.accent : couleurs.trait,
                            backgroundColor: pressed ? couleurs.surface3 : couleurs.surfaceHaute,
                            opacity: bascule !== null && !enRoute ? 0.5 : 1,
                          })}
                        >
                          <View style={{
                            width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                            borderColor: confiee ? couleurs.accent : couleurs.trait,
                            backgroundColor: confiee ? couleurs.accent : "transparent",
                          }} />
                          <View style={{ flex: 1, paddingVertical: espaces.sm }}>
                            <Texte taille={textes.petit} poids="moyen">{carte.libelle}</Texte>
                            <Texte taille={textes.legende} ton="pale" selectable>
                              {[carte.nom, carte.numero].filter(Boolean).join(" · ") || carte.iccid}
                              {carte.enPlace ? "" : ` · ${t.cartesRetiree}`}
                            </Texte>
                          </View>
                          {enRoute ? <ActivityIndicator size="small" color={couleurs.encrePale} />
                            : confiee ? (
                              <Texte taille={textes.legende} ton="doux">{t.cartesConfiee}</Texte>
                            ) : null}
                        </Pressable>
                      );
                    })}
                    <Petit libelle={t.cartesFermer} occupe={false}
                           onPress={() => setEnChoix(null)} />
                  </View>
                ) : null}
              </View>
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
          accessibilityRole="button"
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
          <Texte taille={textes.legende} ton="doux" style={{ lineHeight: 18 }}>
            {t.creerAvertissement}
          </Texte>
          <Saisie libelle={t.creerCourriel} valeur={courriel} onChange={setCourriel}
                  clavier="email-address" />
          <View style={{ flexDirection: "row", gap: espaces.sm }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void creer()}
              disabled={creation || !courriel.trim()}
              style={({ pressed }) => ({
                flex: 1, alignItems: "center", paddingVertical: espaces.md,
                borderRadius: rayons.bouton,
                backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
                opacity: creation || !courriel.trim() ? 0.35 : 1,
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
              accessibilityRole="button"
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
      accessibilityRole="button"
      onPress={onPress}
      disabled={occupe}
      // 26 dp de haut, sans marge de touche, entre deux gestes irréversibles.
      // Le reste de l'application respecte le plancher — les onglets font 44,
      // les commandes rondes 46, les icônes portent toutes un `hitSlop`. Ce
      // bouton-ci faisait la moitié du minimum.
      hitSlop={10}
      style={({ pressed }) => ({
        paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
        minHeight: 44, justifyContent: "center",
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
      <ChampTexte
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
