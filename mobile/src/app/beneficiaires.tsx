// Le carnet des bénéficiaires — les gens à qui l'on envoie de l'argent.
//
// Deux listes, et elles disent d'où elles viennent : ce que la personne a
// ENREGISTRÉ (le carnet, avec les noms qu'elle a choisis), puis ce que les
// SMS de la carte ont montré (le nom que l'opérateur a écrit). Un nom vu dans
// un SMS s'enregistre d'un geste.
//
// Le carnet suit la CARTE : celui à qui elle est confiée le tient, le
// propriétaire aussi. Avec plusieurs cartes, des pastilles disent laquelle.
//
// CE QUE LA PLATEFORME A ACCEPTÉ SE VOIT TOUT DE SUITE. Après « Renommer »,
// l'ANCIEN nom revenait une à plusieurs secondes — le temps que le cahier
// soit relu — et si le réseau flanchait à ce moment-là, il restait, sans un
// mot. Après « Enregistrer » sur un numéro vu dans les SMS, la personne
// restait dans « Vus dans les SMS », avec un bouton de nouveau actif. Le
// changement s'écrit maintenant dans le carnet affiché dès que la plateforme
// a dit oui (`useRetouche`), puis le cahier est relu EN SILENCE pour le
// confirmer. Un refus se dit, à l'endroit du geste, dans les mots du
// guichet — jamais « Network request failed ».
//
// ET IL Y RESTE. Écrire dans le cahier ne suffisait pas : une relecture
// partie AVANT le « oui » — l'Analyse vue il y a peu en fait une lecture de
// mille SMS, lente — revenait APRÈS, et remettait le carnet d'avant.
// L'ancien nom réapparaissait ; la personne retirée revenait, touchable, et
// un second « Supprimer » répondait « introuvable ». Les changements
// confirmés sont donc gardés par l'écran et reposés PAR-DESSUS le carnet
// relu, jusqu'à ce qu'une relecture les porte elle-même.

import { useEffect, useRef, useState } from "react";
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
import { useDonnees, useRetouche } from "@/donnees";
import { useGesteUnique } from "@/geste";
import { useLangue } from "@/langue";
import { apresEffacement, enFormeDansLeChamp } from "@noyau/saisie";
import { agirSurBeneficiaire, ErreurGuichet } from "@/api/guichet";
import { clientsRecents } from "@noyau/recents";
import { nomPropre, numeroPropre } from "@noyau/beneficiaires";
import { formaterNumero } from "@noyau/numero";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import type { Beneficiaire, Donnees } from "@noyau/types";

/** Le carnet, tel que la plateforme le range : par nom. */
const parNom = (a: Beneficiaire, b: Beneficiaire) => a.nom.localeCompare(b.nom);

/** Écrire un changement dans le carnet du cahier, sur place. */
const carnetRetouche = (f: (carnet: Beneficiaire[]) => Beneficiaire[]) =>
  (d: Donnees): Donnees => ({ ...d, beneficiaires: f(d.beneficiaires ?? []) });

/** Une fiche que la plateforme n'a pas encore renvoyée n'a pas d'identifiant :
 *  elle en porte un provisoire, NÉGATIF, que rien n'envoie jamais. */
let provisoire = 0;

/** Ce que la plateforme a ACCEPTÉ et qu'une relecture n'a pas encore porté :
 *  un nom par fiche renommée, les fiches retirées, les numéros enregistrés
 *  (par carte et numéro — la plateforme renomme celui qu'elle connaît déjà
 *  sous ce numéro, au lieu de le doubler). */
type Confirmes = {
  noms: ReadonlyMap<number, string>;
  retires: ReadonlySet<number>;
  ajouts: ReadonlyMap<string, Beneficiaire>;
};
const AUCUN: Confirmes = { noms: new Map(), retires: new Set(), ajouts: new Map() };
const cleAjout = (carte: string, numero: string) => `${carte}:${numero}`;

/** Le carnet tel qu'il est VRAIMENT : celui relu, et par-dessus, ce que la
 *  plateforme a accepté depuis. Dans cet ordre : un retrait, puis un nouvel
 *  enregistrement du même numéro, donnent une seule fiche, la neuve. */
function carnetConfirme(relu: Beneficiaire[], c: Confirmes): Beneficiaire[] {
  if (c === AUCUN) return relu;
  const reste = relu
    .filter((b) => !c.retires.has(b.id))
    .map((b) => (c.noms.has(b.id) ? { ...b, nom: c.noms.get(b.id)! } : b));
  for (const a of c.ajouts.values()) {
    const deja = reste.findIndex((b) => b.carte === a.carte && b.numero === a.numero);
    if (deja >= 0) reste[deja] = { ...reste[deja], nom: a.nom };
    else reste.push(a);
  }
  return reste.sort(parNom);
}

/** Ce que la relecture porte déjà n'a plus besoin d'être reposé. */
function encoreAttendus(relu: Beneficiaire[], c: Confirmes): Confirmes {
  if (c === AUCUN) return c;
  const parId = new Map(relu.map((b) => [b.id, b]));
  const noms = new Map([...c.noms].filter(([id, nom]) => {
    const b = parId.get(id);
    return b !== undefined && b.nom !== nom;
  }));
  const retires = new Set([...c.retires].filter((id) => parId.has(id)));
  const ajouts = new Map([...c.ajouts].filter(([, a]) =>
    !relu.some((b) => b.carte === a.carte && b.numero === a.numero && b.nom === a.nom)));
  if (noms.size === c.noms.size && retires.size === c.retires.size
      && ajouts.size === c.ajouts.size) return c;
  return noms.size || retires.size || ajouts.size ? { noms, retires, ajouts } : AUCUN;
}

export default function Beneficiaires() {
  const langue = useLangue();
  const t = textesBeneficiaires[langue];
  const margeBas = useMargeDuBas();
  // Trente SMS suffisent à dire les récents ; l'accueil, monté sous cet
  // écran, en demande autant — le cahier partagé ne redescend rien.
  const { donnees, attente, erreur, recharger, actualiser, quand } =
    useDonnees({ sms: 30, recus: 0 });
  const retoucher = useRetouche();
  const cartes = donnees?.sims ?? [];
  const [choisie, setChoisie] = useState<string | null>(null);
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];

  // LES CHANGEMENTS ACCEPTÉS, reposés sur le carnet relu tant qu'une
  // relecture ne les porte pas. Un numéro enregistré est donc au carnet dès
  // le « oui », et n'en ressort plus : son bouton « Enregistrer », dans
  // « Vus dans les SMS », ne se rallume pas.
  //
  // On ne les lâche qu'à l'arrivée d'une RÉPONSE de la plateforme (`quand`
  // change) qui les porte — jamais sur le carnet que l'on vient soi-même de
  // retoucher, qui les porterait forcément et ne prouverait rien.
  const [confirmes, setConfirmes] = useState<Confirmes>(AUCUN);
  const relu = donnees?.beneficiaires;
  const reluVu = useRef(relu);
  reluVu.current = relu;
  useEffect(() => {
    const r = reluVu.current;
    if (r) setConfirmes((c) => encoreAttendus(r, c));
  }, [quand]);
  const carnet = carnetConfirme(relu ?? [], confirmes)
    .filter((b) => b.carte === carte?.iccid);
  const dejaLa = new Set(carnet.map((b) => b.numero));

  const vus = clientsRecents(donnees?.paiements ?? [], carte?.iccid, 12)
    .map((r) => ({ ...r, numero: numeroPropre(r.numero) }))
    .filter((r) => !dejaLa.has(r.numero));

  const [ajout, setAjout] = useState(false);
  const [nom, setNom] = useState("");
  const [numero, setNumero] = useState("");
  // Le refus se dit LÀ OÙ l'on a appuyé : sous la rangée qu'on renomme,
  // dans le formulaire d'ajout, ou sous les numéros vus.
  const [souci, setSouci] = useState<{ ou: "edition" | "ajout" | "vus"; texte: string } | null>(null);

  // Un appui, une demande : l'état React ne se ferme qu'au rendu suivant, et
  // deux appuis sur « Retirer » faisaient répondre « introuvable » au second
  // juste après un retrait réussi.
  const geste = useGesteUnique();
  const envoi = geste.occupe;

  /** Demander à la plateforme ; si elle dit oui, écrire le changement dans
   *  le carnet affiché — l'écran le garde, et le cahier le reçoit pour les
   *  autres écrans —, puis relire le cahier en silence. */
  const faire = (ou: "edition" | "ajout" | "vus", appel: () => Promise<unknown>,
                 confirme: (c: Confirmes) => Confirmes,
                 changement: (d: Donnees) => Donnees, ensuite?: () => void) =>
    geste.lancer(async () => {
      setSouci(null);
      try {
        await appel();
      } catch (e) {
        // La raison du guichet, déjà dans la langue de l'écran ; tout autre
        // message est celui d'une machine, pas une phrase pour la personne.
        setSouci({ ou, texte: e instanceof ErreurGuichet && e.message ? e.message : t.echec });
        return false;
      }
      setConfirmes(confirme);
      retoucher(changement);
      ensuite?.();
      actualiser();
      return true;
    });

  const enregistrer = (ou: "ajout" | "vus", n: string, num: string) => {
    if (!carte) return;
    const iccid = carte.iccid;
    const propre = numeroPropre(num);
    const nomFinal = nomPropre(n);
    // Une seule fiche provisoire, la même pour l'écran et pour le cahier :
    // son identifiant sert de clé à la rangée, il ne doit pas changer.
    const fiche: Beneficiaire = { id: --provisoire, carte: iccid, numero: propre, nom: nomFinal };
    void faire(ou,
      () => agirSurBeneficiaire({ geste: "enregistrer", carte: iccid, numero: num, nom: nomFinal }),
      (c) => ({ ...c, ajouts: new Map(c.ajouts).set(cleAjout(iccid, propre), fiche) }),
      // Le même numéro sur la même carte est RENOMMÉ par la plateforme, pas
      // doublé : le carnet affiché fait de même.
      carnetRetouche((c) => {
        const deja = c.find((b) => b.carte === iccid && b.numero === propre);
        return (deja
          ? c.map((b) => (b === deja ? { ...b, nom: nomFinal } : b))
          : [...c, fiche]
        ).sort(parNom);
      }),
      () => {
        if (ou === "ajout") { setAjout(false); setNom(""); setNumero(""); }
      });
  };

  // RENOMMER SUR PLACE. La boîte « saisir un texte » du système n'existe que
  // sur iPhone : sur Android, « Renommer » n'aurait rien fait du tout. La
  // rangée devient un champ, la même chose sur les deux téléphones.
  const [edition, setEdition] = useState<Beneficiaire | null>(null);
  const [nomEdition, setNomEdition] = useState("");
  const editer = (b: Beneficiaire) => { setEdition(b); setNomEdition(b.nom); setSouci(null); };
  const renommer = () => {
    if (!edition || !nomEdition.trim()) return;
    const { id, carte: iccid, numero: num } = edition;
    const nomFinal = nomPropre(nomEdition);
    void faire("edition",
      () => agirSurBeneficiaire({ geste: "renommer", id, nom: nomFinal }),
      // Le nouveau nom l'emporte sur celui d'un enregistrement pas encore
      // relu du même numéro : il est plus récent.
      (c) => {
        const ajouts = new Map(c.ajouts);
        ajouts.delete(cleAjout(iccid, num));
        return { ...c, noms: new Map(c.noms).set(id, nomFinal), ajouts };
      },
      carnetRetouche((c) => c.map((b) => (b.id === id ? { ...b, nom: nomFinal } : b)).sort(parNom)),
      () => setEdition(null));
  };
  const retirer = (b: Beneficiaire) => {
    Alert.alert(t.supprimerQuestion(b.nom), undefined, [
      { text: t.annuler, style: "cancel" },
      { text: t.supprimer, style: "destructive", onPress: () => {
          void faire("edition",
            () => agirSurBeneficiaire({ geste: "supprimer", id: b.id }),
            // Retiré du carnet, le numéro peut revenir dans « Vus » — et s'y
            // réenregistrer : un ancien enregistrement du même numéro, pas
            // encore relu, ne doit plus le retenir au carnet.
            (c) => {
              const ajouts = new Map(c.ajouts);
              ajouts.delete(cleAjout(b.carte, b.numero));
              const noms = new Map(c.noms);
              noms.delete(b.id);
              return { noms, retires: new Set(c.retires).add(b.id), ajouts };
            },
            carnetRetouche((c) => c.filter((x) => x.id !== b.id)),
            () => setEdition(null));
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

        {/* `erreur` ne vient qu'à un écran qui n'a RIEN à montrer : un
            carnet déjà là reste à l'écran, sans carte rouge par-dessus. */}
        {erreur ? <Accroc message={erreur} onReessayer={() => void recharger()} /> : null}

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
          {!donnees ? (
            // Rien encore : des formes grises — jamais « aucun bénéficiaire »,
            // qui serait faux. En panne, l'Accroc parle, et rien d'autre.
            attente ? (
              <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
                <Squelette largeur="60%" hauteur={16} />
                <Squelette largeur="40%" hauteur={16} />
              </Carte>
            ) : null
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
                        <Bouton libelle={t.supprimer} contour desactive={envoi}
                                onPress={() => retirer(b)} />
                        <Bouton libelle={t.annuler} contour
                                onPress={() => { setEdition(null); setSouci(null); }} />
                        <Bouton libelle={t.enregistrer} desactive={!nomEdition.trim() || envoi}
                                onPress={renommer} />
                      </View>
                      {souci?.ou === "edition" ? <Refus texte={souci.texte} /> : null}
                    </View>
                  ) : b.id > 0 ? (
                    <Rangee nom={b.nom} numero={b.numero} onPress={() => editer(b)}
                            droite={<Icone nom="Chevron" taille={16} couleur={couleurs.encrePale} />} />
                  ) : (
                    // Pas encore relue de la plateforme : pas d'identifiant à
                    // renommer ni à retirer. Elle le devient à la relecture.
                    <Rangee nom={b.nom} numero={b.numero} />
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
            {/* Le numéro s'écrit lisible à mesure qu'on tape : « 677 12 34 56 ». */}
            <ChampTexte value={numero}
                        onChangeText={(v) => setNumero(enFormeDansLeChamp("numero", apresEffacement(numero, v), langue))}
                        placeholder={t.numero}
                        placeholderTextColor={couleurs.encrePale} keyboardType="phone-pad"
                        style={[champ, { fontSize: 22, fontVariant: ["tabular-nums"], letterSpacing: 0.5 }]} />
            <View style={{ flexDirection: "row", gap: espaces.sm }}>
              <Bouton libelle={t.annuler} contour
                      onPress={() => { setAjout(false); setSouci(null); }} />
              <Bouton libelle={t.enregistrer} desactive={!pret || envoi}
                      onPress={() => enregistrer("ajout", nom, numero)} />
            </View>
            {souci?.ou === "ajout" ? <Refus texte={souci.texte} /> : null}
          </Carte>
        ) : carte ? (
          <Pressable accessibilityRole="button"
            onPress={() => { setAjout(true); setSouci(null); }}
            style={avecAppui({ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                               alignSelf: "flex-start" })}>
            <Icone nom="Plus" taille={18} couleur={couleurs.encre} />
            <Texte poids="moyen">{t.ajouter}</Texte>
          </Pressable>
        ) : null}

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
                        accessibilityState={{ disabled: envoi }}
                        onPress={() => enregistrer("vus", r.nom || r.numero, r.numero)}
                        style={({ pressed }) => ({
                          paddingHorizontal: espaces.md, paddingVertical: espaces.xs + 2,
                          borderRadius: rayons.rond, backgroundColor: couleurs.surface2,
                          opacity: envoi ? 0.45 : pressed ? 0.5 : 1,
                        })}>
                        <Texte taille={textes.petit} poids="moyen">{t.enregistrer}</Texte>
                      </Pressable>
                    } />
                </View>
              ))}
            </Carte>
          ) : donnees ? (
            <Texte ton="doux" taille={textes.petit}>{t.aucunVu}</Texte>
          ) : null}
          {souci?.ou === "vus" ? <Refus texte={souci.texte} /> : null}
        </View>

        <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>{t.origine}</Texte>
      </Defilement>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Ce que la plateforme a refusé, dit à l'endroit du geste. */
function Refus({ texte }: { texte: string }) {
  return (
    <Texte ton="negatif" taille={textes.petit} style={{ lineHeight: 20 }}>{texte}</Texte>
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
