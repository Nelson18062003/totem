// Le carnet des bénéficiaires — les gens à qui l'on envoie de l'argent.
//
// Deux listes, et elles disent d'où elles viennent : ce que la personne a
// ENREGISTRÉ (le carnet, avec les noms qu'elle a choisis), puis ce que les
// SMS de la carte ont montré (le nom que l'opérateur a écrit). Un nom vu dans
// un SMS s'enregistre d'un geste.
//
// Le carnet suit la CARTE : celui à qui elle est confiée le tient, le
// propriétaire aussi. Avec plusieurs cartes, des pastilles disent laquelle.

import { useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import {
  Accroc, BoutonIcone, Carte, ChampTexte, Defilement, Filet, Texte, avecAppui,
  useMargeDuBas,
} from "@/ui";
import { Squelette } from "@/animations";
import { Icone } from "@/icones";
import { couleurs, couleurOperateur, espaces, polices, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { agirSurBeneficiaire } from "@/api/guichet";
import { clientsRecents } from "@noyau/recents";
import { nomPropre, numeroPropre } from "@noyau/beneficiaires";
import { formaterNumero } from "@noyau/numero";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import type { Beneficiaire } from "@noyau/types";

export default function Beneficiaires() {
  const langue = useLangue();
  const t = textesBeneficiaires[langue];
  const margeBas = useMargeDuBas();
  // Trente SMS suffisent à dire les récents ; l'accueil, monté sous cet
  // écran, en demande autant — le cahier partagé ne redescend rien.
  const { donnees, chargement, erreur, recharger } = useDonnees({ sms: 30, recus: 0 });
  const cartes = donnees?.sims ?? [];
  const [choisie, setChoisie] = useState<string | null>(null);
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const carnet = (donnees?.beneficiaires ?? []).filter((b) => b.carte === carte?.iccid);
  const dejaLa = new Set(carnet.map((b) => b.numero));
  const vus = clientsRecents(donnees?.paiements ?? [], carte?.iccid, 12)
    .map((r) => ({ ...r, numero: numeroPropre(r.numero) }))
    .filter((r) => !dejaLa.has(r.numero));

  const [ajout, setAjout] = useState(false);
  const [nom, setNom] = useState("");
  const [numero, setNumero] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const faire = async (geste: () => Promise<unknown>) => {
    if (envoi) return;
    setEnvoi(true);
    setSouci(null);
    try {
      await geste();
      recharger();
      return true;
    } catch (e) {
      setSouci(e instanceof Error && e.message ? e.message : t.echec);
      return false;
    } finally {
      setEnvoi(false);
    }
  };

  const enregistrer = async (n: string, num: string) => {
    if (!carte) return;
    const ok = await faire(() => agirSurBeneficiaire({
      geste: "enregistrer", carte: carte.iccid, numero: num, nom: nomPropre(n) }));
    if (ok) { setAjout(false); setNom(""); setNumero(""); }
  };

  // RENOMMER SUR PLACE. La boîte « saisir un texte » du système n'existe que
  // sur iPhone : sur Android, « Renommer » n'aurait rien fait du tout. La
  // rangée devient un champ, la même chose sur les deux téléphones.
  const [edition, setEdition] = useState<Beneficiaire | null>(null);
  const [nomEdition, setNomEdition] = useState("");
  const editer = (b: Beneficiaire) => { setEdition(b); setNomEdition(b.nom); };
  const renommer = async () => {
    if (!edition || !nomEdition.trim()) return;
    const id = edition.id;
    if (await faire(() => agirSurBeneficiaire({ geste: "renommer", id, nom: nomEdition }))) {
      setEdition(null);
    }
  };
  const retirer = (b: Beneficiaire) => {
    Alert.alert(t.supprimerQuestion(b.nom), undefined, [
      { text: t.annuler, style: "cancel" },
      { text: t.supprimer, style: "destructive", onPress: () => {
          void faire(() => agirSurBeneficiaire({ geste: "supprimer", id: b.id }))
            .then((ok) => { if (ok) setEdition(null); });
        } },
    ]);
  };

  const pret = nom.trim().length > 0 && /^\d{8,15}$/.test(numeroPropre(numero));

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Defilement contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg,
                                           paddingBottom: margeBas }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
          <BoutonIcone nom="Chevron" etiquette={t.annuler} onPress={() => router.back()}
                       style={{ transform: [{ rotate: "180deg" }] }} />
          <View style={{ flex: 1 }}>
            <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
            <Texte taille={textes.petit} ton="pale">{t.sous}</Texte>
          </View>
        </View>

        {erreur && !donnees ? <Accroc message={erreur} onReessayer={recharger} /> : null}

        {cartes.length > 1 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
            {cartes.map((c) => {
              const active = c.iccid === carte?.iccid;
              return (
                <Pressable key={c.iccid} accessibilityRole="button"
                  accessibilityState={{ selected: active }} onPress={() => setChoisie(c.iccid)}
                  style={avecAppui({
                    flexDirection: "row", alignItems: "center", gap: espaces.sm,
                    paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                    borderRadius: rayons.rond, borderWidth: 1,
                    borderColor: active ? couleurs.encre : couleurs.trait,
                    backgroundColor: active ? couleurs.encre : couleurs.surfaceHaute,
                  })}>
                  <View style={{ width: 8, height: 8, borderRadius: rayons.rond,
                                 backgroundColor: couleurOperateur(c.operateur) }} />
                  <Texte taille={textes.petit} poids="moyen"
                         style={active ? { color: couleurs.surfaceHaute } : undefined}>
                    {c.libelle}
                  </Texte>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* LE CARNET */}
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.legende} ton="pale" style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
            {t.enregistres}
          </Texte>
          {!donnees && chargement ? (
            <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
              <Squelette largeur="60%" hauteur={16} />
              <Squelette largeur="40%" hauteur={16} />
            </Carte>
          ) : carnet.length ? (
            <Carte>
              {carnet.map((b, i) => (
                <View key={b.id}>
                  {i ? <Filet /> : null}
                  {edition?.id === b.id ? (
                    <View style={{ padding: espaces.md, gap: espaces.sm }}>
                      <ChampTexte value={nomEdition} onChangeText={setNomEdition} autoFocus
                                  placeholder={t.nom} placeholderTextColor={couleurs.encrePale}
                                  style={champ} />
                      <Texte taille={textes.petit} ton="pale" chiffresAlignes>
                        {formaterNumero(b.numero)}
                      </Texte>
                      <View style={{ flexDirection: "row", gap: espaces.sm }}>
                        <Bouton libelle={t.supprimer} contour onPress={() => retirer(b)} />
                        <Bouton libelle={t.annuler} contour onPress={() => setEdition(null)} />
                        <Bouton libelle={t.enregistrer} desactive={!nomEdition.trim() || envoi}
                                onPress={() => void renommer()} />
                      </View>
                    </View>
                  ) : (
                    <Rangee nom={b.nom} numero={b.numero} onPress={() => editer(b)}
                            droite={<Icone nom="Chevron" taille={16} couleur={couleurs.encrePale} />} />
                  )}
                </View>
              ))}
            </Carte>
          ) : (
            <Texte ton="doux" taille={textes.petit} style={{ lineHeight: 20 }}>{t.aucunEnregistre}</Texte>
          )}
        </View>

        {/* L'AJOUT À LA MAIN */}
        {ajout ? (
          <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
            <Texte poids="demi">{t.ajouter}</Texte>
            <ChampTexte value={nom} onChangeText={setNom} placeholder={t.nomAide}
                        placeholderTextColor={couleurs.encrePale} autoCapitalize="words"
                        style={champ} />
            <ChampTexte value={numero} onChangeText={setNumero} placeholder={t.numero}
                        placeholderTextColor={couleurs.encrePale} keyboardType="phone-pad"
                        style={champ} />
            <View style={{ flexDirection: "row", gap: espaces.sm }}>
              <Bouton libelle={t.annuler} contour onPress={() => setAjout(false)} />
              <Bouton libelle={t.enregistrer} desactive={!pret || envoi}
                      onPress={() => void enregistrer(nom, numero)} />
            </View>
          </Carte>
        ) : carte ? (
          <Pressable accessibilityRole="button" onPress={() => setAjout(true)}
            style={avecAppui({ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                               alignSelf: "flex-start" })}>
            <Icone nom="Plus" taille={18} couleur={couleurs.encre} />
            <Texte poids="moyen">{t.ajouter}</Texte>
          </Pressable>
        ) : null}

        {souci ? <Texte ton="negatif" taille={textes.petit}>{souci}</Texte> : null}

        {/* CE QUE LES SMS ONT MONTRÉ */}
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.legende} ton="pale" style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
            {t.vusDansSms}
          </Texte>
          {vus.length ? (
            <Carte>
              {vus.map((r, i) => (
                <View key={r.numero}>
                  {i ? <Filet /> : null}
                  <Rangee nom={r.nom || formaterNumero(r.numero)} numero={r.numero}
                    droite={
                      <Pressable accessibilityRole="button" disabled={envoi}
                        onPress={() => void enregistrer(r.nom || r.numero, r.numero)}
                        style={avecAppui({ paddingHorizontal: espaces.md, paddingVertical: espaces.xs + 2,
                                           borderRadius: rayons.rond, backgroundColor: couleurs.surface2 })}>
                        <Texte taille={textes.petit} poids="moyen">{t.enregistrer}</Texte>
                      </Pressable>
                    } />
                </View>
              ))}
            </Carte>
          ) : donnees ? (
            <Texte ton="doux" taille={textes.petit}>{t.aucunVu}</Texte>
          ) : null}
        </View>

        <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>{t.origine}</Texte>
      </Defilement>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const champ = {
  borderWidth: 1, borderColor: couleurs.trait, borderRadius: rayons.bouton,
  backgroundColor: couleurs.surfaceHaute, paddingHorizontal: espaces.md,
  paddingVertical: espaces.md, fontFamily: polices.corps, fontSize: textes.corps,
  color: couleurs.encre,
};

/** Une personne : ses initiales, son nom, son numéro. Dans une LISTE, le nom
 *  se coupe pour que les rangées s'alignent. */
function Rangee({ nom, numero, droite, onPress }: {
  nom: string; numero: string; droite?: React.ReactNode; onPress?: () => void;
}) {
  const mots = nom.trim().split(/\s+/).filter((m) => /\p{L}/u.test(m));
  const initiales = mots.length ? (mots[0][0] + (mots[1]?.[0] ?? "")).toUpperCase() : "#";
  const contenu = (
    <>
      <View style={{ width: 40, height: 40, borderRadius: rayons.rond, alignItems: "center",
                     justifyContent: "center", backgroundColor: couleurs.surface2 }}>
        <Texte poids="demi" taille={textes.petit}>{initiales}</Texte>
      </View>
      <View style={{ flex: 1 }}>
        <Texte poids="moyen" numberOfLines={1}>{nom}</Texte>
        <Texte taille={textes.petit} ton="pale" chiffresAlignes>{formaterNumero(numero)}</Texte>
      </View>
      {droite}
    </>
  );
  const style = { flexDirection: "row" as const, alignItems: "center" as const,
                  gap: espaces.md, padding: espaces.md };
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ ...style, backgroundColor: pressed ? couleurs.surface2 : "transparent" })}>
      {contenu}
    </Pressable>
  ) : <View style={style}>{contenu}</View>;
}

function Bouton({ libelle, onPress, desactive, contour }: {
  libelle: string; onPress: () => void; desactive?: boolean; contour?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={desactive} onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, paddingVertical: espaces.md, borderRadius: rayons.bouton, alignItems: "center",
        borderWidth: contour ? 1 : 0, borderColor: couleurs.trait,
        backgroundColor: desactive ? couleurs.surface3 : contour
          ? (pressed ? couleurs.surface2 : couleurs.surfaceHaute)
          : (pressed ? couleurs.accentAppui : couleurs.accent),
      })}>
      <Texte poids="demi" style={{ color: contour ? couleurs.encre
        : desactive ? couleurs.encrePale : couleurs.surfaceHaute }}>{libelle}</Texte>
    </Pressable>
  );
}
