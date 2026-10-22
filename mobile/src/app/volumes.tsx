// LES VOLUMES — ce qui est entré et sorti des cartes, sur la période qu'on
// choisit : un jour, une semaine, un mois, six mois, ou des dates.
//
// Le pendant de `web/app/volumes/ecran.tsx`. Rien n'est calculé ici : la
// plateforme lit TOUTE la période (et non les mille derniers SMS) et compte
// avec le noyau (`noyau/volumes.ts`) ; le téléphone reçoit les mêmes
// chiffres que le site, au centime.
//
// Le propriétaire a refusé deux versions : la première « trop complexe, mal
// structurée », la seconde « pas assez visuelle ». Puis, à l'essai : « trop
// lent, ça bugue, aucune transition ; le graphe, je ne sais pas comment le
// lire ; la carte s'affiche par son numéro entier ». D'où :
//   — ce qui a été lu se GARDE, et les périodes voisines se chargent en
//     silence : le prochain appui trouve ses chiffres déjà là ;
//   — l'appui répond tout de suite (la pastille glisse, le nom de la période
//     change), et les chiffres arrivent du côté où l'on va ;
//   — une carte se nomme comme à l'accueil : son logo et « MTN ·6299 » ;
//   — le graphe dit en MOTS la colonne choisie, avec un axe en montants.
//
// LES TAILLES : une colonne sur un téléphone (petit, moyen, grand), deux sur
// une tablette couchée — les deux barres toujours en tête.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View, type LayoutChangeEvent, type ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Defilement, Accroc, BoutonIcone, Carte, Filet, Texte, avecAppui } from "@/ui";
import { Icone } from "@/icones";
import { useEcran } from "@/ecran";
import { couleurs, espaces, rayons, textes, TEINTES_POINTE } from "@/theme/jetons";
import { useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { Animated, COURBE, useMouvementReduit } from "@/animations";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { lienBilan, lienReleve, lireVolumes, versErreurGuichet } from "@/api/guichet";
import { nomDeFichier, partagerDocument } from "@/partage";
import { BoutonFiltre, FeuilleChoix } from "@/filtres";
import { Calendrier } from "@/calendrier";
import { FeuilleReleve } from "@/releve";
import {
  francs, francsCourts, jourCourtVolumes, nomDeFamille, textesVolumes,
} from "@noyau/textes/volumes";
import { textesReleve } from "@noyau/textes/releve";
import { textesAnalyse } from "@noyau/textes/analyse";
import { textesUssd } from "@noyau/textes/ussd";
import {
  cleDeLaDemande, colonneParDefaut, creneauLePlusCharge, demandeDeLaPeriode, ecartLisible,
  etiquetteDuPas, famillesDe, GENRES_PERIODE, graduations, nomDeLaColonne, nomDeLaPeriode,
  periodeDeLaDemande, periodeVoisine, raccourcisDeDates, serieVisible, voisinesAPrecharger,
  type CarteVolumes, type DemandeDeVolumes, type FamilleVolume, type GenrePeriode, type Pas,
  type PointDeSerie, type ReponseVolumes,
} from "@noyau/volumes";
import { formaterNumero } from "@noyau/numero";
import { initialesDe } from "@noyau/flux";
import { jourLocal, FUSEAU_DEFAUT } from "@noyau/types";
import type { Langue } from "@noyau/langue";

const COULEUR_FAMILLE: Record<FamilleVolume, string> = {
  argent: couleurs.familleArgent, especes: couleurs.familleEspeces,
  transferts: couleurs.familleTransferts, commissions: couleurs.familleCommissions,
};

/** Une carte comme l'accueil la nomme : son logo, et « MTN ·6299 ». Le
 *  logo vit dans une boîte de largeur fixe : celui de MTN est plus large que
 *  celui d'Orange, et les noms ne s'alignaient plus d'une ligne à l'autre. */
function NomDeCarte({ carte, taille = textes.petit }: { carte: CarteVolumes; taille?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs, flexShrink: 1 }}>
      {operateurReconnu(carte.operateur) ? (
        <View style={{ width: 34, alignItems: "center" }}><LogoOperateur operateur={carte.operateur} taille={16} /></View>
      ) : null}
      <Texte taille={taille} poids="demi" numberOfLines={1} style={{ flexShrink: 1 }}>{carte.libelle}</Texte>
    </View>
  );
}

type Vue = { r: ReponseVolumes; cle: string; sens: -1 | 0 | 1 };

export default function Volumes() {
  const langue = useLangue();
  const t = textesVolumes[langue];
  const ecran = useEcran();
  const etroit = ecran.largeurContenu < 340;
  const maintenant = useMaintenant();
  const aujourdhui = jourLocal(new Date(maintenant), FUSEAU_DEFAUT);

  const [demande, setDemande] = useState<DemandeDeVolumes>({ periode: "mois", jour: aujourdhui, carte: "tout", qui: null });
  const [vue, setVue] = useState<Vue | null>(null);
  const [attente, setAttente] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choixCarte, setChoixCarte] = useState(false);
  const [calendrier, setCalendrier] = useState(false);
  const [releve, setReleve] = useState(false);
  // Ce qui a été lu, gardé pour la vie de l'écran (et pas au-delà : un
  // téléphone perdu ne garde rien une fois l'écran quitté). Une demande en
  // route n'est jamais lancée deux fois.
  const memoire = useRef(new Map<string, ReponseVolumes>());
  const enVol = useRef(new Map<string, Promise<ReponseVolumes>>());
  const numero = useRef(0);
  // Ouvrir la fiche d'un correspondant ou d'une carte remonte en haut : la
  // fiche commence là, et le retour aussi.
  const defilement = useRef<ScrollView>(null);
  useEffect(() => { defilement.current?.scrollTo({ y: 0, animated: false }); }, [demande.qui, demande.carte]);

  const lire = useCallback((d: DemandeDeVolumes): Promise<ReponseVolumes> => {
    const k = cleDeLaDemande(d, aujourdhui);
    const deja = memoire.current.get(k);
    if (deja) return Promise.resolve(deja);
    const vol = enVol.current.get(k);
    if (vol) return vol;
    const p = lireVolumes(d).then((r) => { memoire.current.set(k, r); return r; })
      .finally(() => enVol.current.delete(k));
    enVol.current.set(k, p);
    return p;
  }, [aujourdhui]);

  /** Aller à une vue : tout de suite si elle est en mémoire ; sinon l'écran
   *  dit déjà la période demandée, et garde l'ancienne vue, pâlie, le temps
   *  que les chiffres arrivent. Une réponse en retard n'écrase jamais une
   *  demande plus récente. */
  const aller = useCallback((d: DemandeDeVolumes, sens: -1 | 0 | 1 = 0, oublier = false) => {
    setDemande(d);
    setErreur(null);
    const k = cleDeLaDemande(d, aujourdhui);
    const n = ++numero.current;
    if (oublier) memoire.current.delete(k);
    const deja = memoire.current.get(k);
    if (deja) { setVue({ r: deja, cle: k, sens }); setAttente(false); return Promise.resolve(); }
    setAttente(true);
    return lire(d).then((r) => {
      if (n !== numero.current) return;
      setVue({ r, cle: k, sens });
      setAttente(false);
    }).catch((e) => {
      if (n !== numero.current) return;
      setAttente(false);
      setErreur(versErreurGuichet(e, langue).message);
    });
  }, [aujourdhui, lire, langue]);

  const changer = (x: Partial<DemandeDeVolumes>, sens: -1 | 0 | 1 = 0) => { void aller({ ...demande, ...x }, sens); };
  // La première vue, au montage.
  useEffect(() => { void aller(demande); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Tirer pour rafraîchir : on oublie ce qu'on avait gardé.
  const relire = useCallback(() => { memoire.current.clear(); return aller(demande, 0, true); }, [aller, demande]);
  const roue = useRoue(relire);

  // LES VOISINES, EN SILENCE — une à la fois, après l'affichage.
  useEffect(() => {
    if (!vue || vue.r.volumes.fiche !== undefined) return;
    const voisines = voisinesAPrecharger(vue.r.volumes.periode, vue.r.carte, aujourdhui);
    let fini = false;
    const minuteur = setTimeout(async () => {
      for (const d of voisines) {
        if (fini) return;
        try { await lire(d); } catch { /* une voisine qui échoue n'empêche rien */ }
      }
    }, 300);
    return () => { fini = true; clearTimeout(minuteur); };
  }, [vue, aujourdhui, lire]);

  // LES CHIFFRES ARRIVENT DU CÔTÉ OÙ L'ON VA (‹ : de la gauche), en fondu
  // pour une autre durée — rien qui glisse avec « réduire les animations ».
  const reduit = useMouvementReduit();
  const avance = useSharedValue(1);
  const cote = useSharedValue(0);
  useEffect(() => {
    if (!vue) return;
    cote.value = vue.sens;
    if (reduit) { avance.value = 1; return; }
    avance.value = 0;
    avance.value = withTiming(1, { duration: 240, easing: COURBE });
  }, [vue?.cle]); // eslint-disable-line react-hooks/exhaustive-deps
  const arrivee = useAnimatedStyle(() => ({
    opacity: avance.value,
    transform: [{ translateX: (1 - avance.value) * 26 * cote.value }, { translateY: cote.value === 0 ? (1 - avance.value) * 6 : 0 }],
  }));

  const reponse = vue?.r ?? null;
  // La période DEMANDÉE — celle dont l'écran parle dès l'appui.
  const visee = periodeDeLaDemande(demande, aujourdhui) ?? reponse?.volumes.periode ?? null;
  const allerVoisine = (sens: -1 | 1) => {
    const x = visee ? periodeVoisine(visee, sens, aujourdhui) : null;
    if (x) void aller(demandeDeLaPeriode(x, demande.carte), sens);
  };

  const telecharger = async () => {
    const p = reponse?.volumes.periode;
    if (!p || !reponse) return;
    try {
      const { url } = await lienReleve(reponse.carte, p.de, p.jusqua, "pdf");
      await partagerDocument(url, nomDeFichier(`Releve-${p.de}_${p.jusqua}`, "pdf"), "pdf", t.telechargerReleve);
    } catch { /* la feuille de partage dit elle-même ce qui n'a pas marché */ }
  };

  const deux = ecran.classe === "etendue" || ecran.classe === "large";
  const v = reponse?.volumes;
  const carteChoisie = reponse && demande.carte !== "tout"
    ? reponse.cartes.find((c) => c.iccid === demande.carte) ?? null : null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Defilement
        ref={defilement}
        refreshControl={roue}
        contentContainerStyle={{
          paddingHorizontal: ecran.marge, paddingTop: espaces.sm, paddingBottom: espaces.xxl,
          gap: espaces.lg, width: "100%", maxWidth: deux ? 1100 : 640, alignSelf: "center",
        }}
      >
        {/* La tête : retour, titre, relevé de la période. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <BoutonIcone nom="Chevron" etiquette={textesUssd[langue].fermerEcran}
                       onPress={() => (demande.qui ? changer({ qui: null }) : router.back())}
                       style={{ transform: [{ rotate: "180deg" }] }} />
          <Texte taille={textes.titre} poids="demi" style={{ flex: 1 }}>{t.titre}</Texte>
          <BoutonIcone nom="Download" etiquette={t.telechargerReleve} onPress={() => void telecharger()} />
        </View>

        <Pastilles langue={langue} etroit={etroit} choisie={calendrier ? "dates" : demande.periode}
                   onChoisir={(g) => (g === "dates" ? setCalendrier(true)
                     : changer({ periode: g, jour: aujourdhui, de: undefined, a: undefined, qui: null }))} />

        {/* ‹ Octobre 2026 › — le nom change à l'appui, avant les chiffres. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <BoutonIcone nom="Chevron" etiquette={t.precedente} onPress={() => allerVoisine(-1)}
                       style={{ transform: [{ rotate: "180deg" }] }} />
          <Texte taille={textes.intertitre} poids="demi" accessibilityLiveRegion="polite"
                 style={{ flex: 1, textAlign: "center" }}>
            {visee ? nomDeLaPeriode(visee, langue) : " "}
          </Texte>
          <View style={{ opacity: visee && periodeVoisine(visee, 1, aujourdhui) ? 1 : 0.25 }}>
            <BoutonIcone nom="Chevron" etiquette={t.suivante} onPress={() => allerVoisine(1)} />
          </View>
        </View>
        {reponse && reponse.cartes.length > 1 ? (
          <View style={{ flexDirection: "row" }}>
            <BoutonFiltre libelle={carteChoisie ? carteChoisie.libelle : t.toutesLesCartes}
                          etiquette={t.carte} actif={!!carteChoisie} icone="PuceSim"
                          avant={carteChoisie && operateurReconnu(carteChoisie.operateur)
                            ? <LogoOperateur operateur={carteChoisie.operateur} taille={15} /> : undefined}
                          onPress={() => setChoixCarte(true)} />
          </View>
        ) : null}

        {!reponse ? (
          erreur ? <Accroc message={erreur} onReessayer={() => void aller(demande, 0, true)} /> : <Attente />
        ) : reponse.cartes.length === 0 ? (
          <Vide titre={t.pasDeCarte} detail={t.pasDeCarteDetail} />
        ) : (
          // Pendant qu'une vue qu'on n'avait pas se lit, l'écran garde la
          // précédente, pâlie : pas de formes grises qui sautent à chaque appui.
          <View style={{ gap: espaces.lg, opacity: attente ? 0.5 : 1 }}>
            {erreur ? <Accroc message={erreur} onReessayer={() => void aller(demande, 0, true)} /> : null}
            <Animated.View style={[{ gap: espaces.lg }, arrivee]}>
              {v!.fiche !== undefined ? (
                <FicheCorrespondant r={reponse} langue={langue} deux={deux} />
              ) : (
                <Colonnes2 deux={deux}
                  gauche={<>
                    <Duel r={reponse} langue={langue} />
                    {carteChoisie ? <LeSolde r={reponse} carte={carteChoisie} langue={langue} /> : null}
                    <Avertissements r={reponse} langue={langue} />
                    <Graphe serie={v!.serie} pas={v!.periode.pas} langue={langue} titre={t.serie[v!.periode.pas]}
                            debut={v!.debutDeLHistorique} />
                    {v!.totaux.n > 0 ? <AvecQui r={reponse} langue={langue} onQui={(qui) => changer({ qui })} /> : null}
                  </>}
                  droite={<>
                    <ChiffresCles r={reponse} langue={langue} />
                    {v!.totaux.n === 0 ? <Vide titre={t.rien} detail={t.rienDetail} /> : <>
                      <Anneaux r={reponse} langue={langue} />
                      {reponse.carte === "tout"
                        ? <ParCarte r={reponse} langue={langue} onCarte={(carte) => changer({ carte, qui: null })} /> : null}
                      <HeuresDePointe heures={v!.heures} langue={langue} />
                    </>}
                    <Documents langue={langue} onReleve={() => setReleve(true)} />
                  </>}
                />
              )}
            </Animated.View>
          </View>
        )}
      </Defilement>

      {choixCarte && reponse ? (
        <FeuilleChoix
          titre={t.choisirLaCarte}
          options={[{ cle: "tout", libelle: t.toutesLesCartes, icone: "PuceSim" },
                    ...reponse.cartes.map((c) => ({
                      cle: c.iccid, libelle: c.libelle, sous: formaterNumero(c.numero) || undefined,
                      avant: operateurReconnu(c.operateur)
                        ? <View style={{ width: 34, alignItems: "center" }}><LogoOperateur operateur={c.operateur} taille={18} /></View>
                        : undefined,
                    }))]}
          choisie={demande.carte}
          onChoisir={(carte) => { setChoixCarte(false); changer({ carte, qui: null }); }}
          onFermer={() => setChoixCarte(false)} />
      ) : null}
      {calendrier ? (
        <Calendrier langue={langue} aujourdhui={aujourdhui}
                    mots={{ titre: t.choisirLesDates, aide: t.aideDates, voir: t.voirCesDates }}
                    raccourcis={raccourcisDeDates(aujourdhui).map((x) => ({ libelle: t.raccourcis[x.cle], bornes: x.bornes }))}
                    depart={demande.periode === "dates" && visee ? { de: visee.de, a: visee.a } : null}
                    onChoisir={(b) => { setCalendrier(false); changer({ periode: "dates", de: b.de, a: b.a, jour: undefined, qui: null }); }}
                    onFermer={() => setCalendrier(false)} />
      ) : null}
      {releve && reponse ? (
        <FeuilleReleve langue={langue} fuseau={reponse.fuseau} onFermer={() => setReleve(false)}
                       cartes={reponse.cartes.map((c) => ({ iccid: c.iccid, numero: c.numero,
                                                            libelle: c.libelle, operateur: c.operateur }))} />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * LES CINQ DURÉES, sur un rail — et la pastille sombre GLISSE de l'une à
 * l'autre : on voit d'où l'on vient. Chacune part de la largeur de son nom :
 * à parts égales, à 320 points, « Semaine » se lisait « Sema… ».
 */
function Pastilles({ langue, etroit, choisie, onChoisir }: {
  langue: Langue; etroit: boolean; choisie: GenrePeriode; onChoisir: (g: GenrePeriode) => void;
}) {
  const t = textesVolumes[langue];
  const reduit = useMouvementReduit();
  const places = useRef(new Map<GenrePeriode, { x: number; w: number }>());
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const [pret, setPret] = useState(false);
  const placer = useCallback((anime: boolean) => {
    const p = places.current.get(choisie);
    if (!p) return;
    if (!anime || reduit) { x.value = p.x; w.value = p.w; return; }
    x.value = withTiming(p.x, { duration: 260, easing: COURBE });
    w.value = withTiming(p.w, { duration: 260, easing: COURBE });
  }, [choisie, reduit, x, w]);
  useEffect(() => { placer(true); }, [placer]);
  const pastille = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));
  const mesurer = (g: GenrePeriode) => (e: LayoutChangeEvent) => {
    places.current.set(g, { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width });
    if (g === choisie) { placer(false); setPret(true); }
  };
  return (
    <View accessibilityRole="tablist"
          style={{ flexDirection: "row", gap: etroit ? 2 : 4, padding: 4, borderRadius: rayons.rond,
                   backgroundColor: couleurs.surface2 }}>
      <Animated.View pointerEvents="none"
                     style={[{ position: "absolute", top: 4, bottom: 4, left: 0, borderRadius: rayons.rond,
                               backgroundColor: couleurs.accent, opacity: pret ? 1 : 0 }, pastille]} />
      {GENRES_PERIODE.map((g) => {
        const actif = g === choisie;
        return (
          <Pressable key={g} accessibilityRole="tab" accessibilityState={{ selected: actif }}
                     onLayout={mesurer(g)} onPress={() => onChoisir(g)}
                     style={avecAppui({
                       flexGrow: 1, flexShrink: 1, flexBasis: "auto", paddingHorizontal: 6,
                       minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: rayons.rond,
                     })}>
            <Texte taille={etroit ? textes.legende : textes.petit} poids={actif ? "demi" : "moyen"} numberOfLines={1}
                   adjustsFontSizeToFit minimumFontScale={0.75}
                   style={{ color: actif ? couleurs.surfaceHaute : couleurs.encreDouce }}>
              {t.periodes[g]}
            </Texte>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Une colonne, ou deux côte à côte sur une tablette couchée. */
function Colonnes2({ deux, gauche, droite }: { deux: boolean; gauche: ReactNode; droite: ReactNode }) {
  if (!deux) return <View style={{ gap: espaces.lg }}>{gauche}{droite}</View>;
  return (
    <View style={{ flexDirection: "row", gap: espaces.lg, alignItems: "flex-start" }}>
      <View style={{ flex: 3, gap: espaces.lg }}>{gauche}</View>
      <View style={{ flex: 2, gap: espaces.lg }}>{droite}</View>
    </View>
  );
}

function Titre({ children, droite }: { children: string; droite?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaces.sm, flexWrap: "wrap" }}>
      <Texte taille={textes.intertitre} poids="demi" style={{ flexShrink: 1 }}>{children}</Texte>
      {droite}
    </View>
  );
}

function Point({ couleur, taille = 10 }: { couleur: string; taille?: number }) {
  return <View style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: couleur }} />;
}

// --- Les deux barres ---------------------------------------------------------

/** L'écart avec la période d'avant : « × 7,7 » au-delà du double, « ▲ 12 % »
 *  en deçà, et rien du tout quand l'historique ne couvre pas la période
 *  d'avant (six mois d'une caisse ouverte en juillet montaient de 24 145 %). */
function Ecart({ maintenant, avant, comparable, langue }: { maintenant: number; avant: number; comparable: boolean; langue: Langue }) {
  const e = ecartLisible(maintenant, avant, langue, comparable);
  if (!e) return null;
  return (
    <View style={{ backgroundColor: couleurs.surface2, borderRadius: rayons.rond, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Texte taille={textes.legende} poids="demi" ton="doux" chiffresAlignes>{e.texte}</Texte>
    </View>
  );
}

function Duel({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const { totaux, avant } = r.volumes;
  const comparable = r.volumes.comparable !== false;
  const max = Math.max(totaux.entrees, totaux.sorties, 1);
  const ligne = (nom: string, valeur: number, n: number, avantV: number, couleur: string, ton: "positif" | "negatif") => (
    // Le montant a SA ligne : à côté du nom, il passait à la ligne dès qu'un
    // écart s'affichait, et l'écran changeait de forme d'une période à l'autre.
    <View style={{ gap: espaces.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: espaces.sm, rowGap: espaces.xs }}>
        <Point couleur={couleur} />
        <Texte poids="demi">{nom}</Texte>
        <Ecart maintenant={valeur} avant={avantV} comparable={comparable} langue={langue} />
        <Texte taille={textes.legende} ton="pale" style={{ marginLeft: "auto" }}>
          {t.operations(n)}
        </Texte>
      </View>
      <Texte taille={26} poids="gras" ton={ton} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
             style={{ letterSpacing: -0.5 }}>
        {francs(valeur, langue)}
      </Texte>
      <View accessibilityRole="image" accessibilityLabel={`${nom} ${francs(valeur, langue)}`}
            style={{ height: 14, borderRadius: 5, backgroundColor: couleur, width: `${Math.max(1, (valeur / max) * 100)}%`,
                     marginTop: espaces.xs }} />
    </View>
  );
  return (
    <Carte style={{ padding: espaces.lg, gap: espaces.lg }}>
      {ligne(t.entrees, totaux.entrees, totaux.nEntrees, avant.entrees, couleurs.entree, "positif")}
      {ligne(t.sorties, totaux.sorties, totaux.nSorties, avant.sorties, couleurs.sortie, "negatif")}
      <Filet />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaces.sm, flexWrap: "wrap" }}>
        <Texte poids="demi">{t.reste}</Texte>
        <Texte taille={28} poids="gras" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
               style={{ flexShrink: 1, marginLeft: "auto", letterSpacing: -0.6 }}>
          {francs(totaux.net, langue, true)}
        </Texte>
      </View>
    </Carte>
  );
}

// --- Ce qui peut manquer -----------------------------------------------------

function IconeAlerte({ taille = 18 }: { taille?: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleurs.alerte} strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <Path d="M12 9v4M12 17h.01" />
    </Svg>
  );
}

function Avertissements({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const a = r.volumes.avertissements;
  const lignes: string[] = [];
  if (r.tronque) lignes.push(t.tronque);
  for (const s of r.silencieuses) {
    const c = r.cartes.find((x) => x.iccid === s.iccid);
    if (c) lignes.push(t.silence(c.libelle));
  }
  if (a.illisibles) lignes.push(t.illisibles(a.illisibles));
  if (a.aVerifier) lignes.push(t.aVerifier(a.aVerifier));
  if (a.ecarts) lignes.push(t.ecarts(a.ecarts));
  if (a.incomplets) lignes.push(t.incomplets(a.incomplets));
  if (!lignes.length) return null;
  return (
    <View accessibilityRole="alert" style={{
      flexDirection: "row", gap: espaces.md, padding: espaces.lg, borderRadius: rayons.carte,
      borderWidth: 1, borderColor: couleurs.alerteTrait, backgroundColor: couleurs.alerteFond,
    }}>
      <IconeAlerte />
      <View style={{ flex: 1, gap: 4 }}>
        <Texte taille={textes.petit} poids="demi">{t.incomplet}</Texte>
        {lignes.map((l) => <Texte key={l} taille={textes.petit} ton="doux">· {l}</Texte>)}
      </View>
    </View>
  );
}

// --- Les chiffres clés -------------------------------------------------------

function ChiffresCles({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const { totaux, cles, nbCorrespondants } = r.volumes;
  const g = cles.plusGrosse;
  const cases: [string, string, string][] = [
    [t.kOperations, totaux.n.toLocaleString(langue === "en" ? "en-US" : "fr-FR").replace(/[  ]/g, " "), t.kParJour(cles.parJour)],
    [t.kMoyenne, francs(cles.moyenne, langue), t.kParOperation],
    [t.kPlusGrosse, g ? francs(g.montant, langue) : "—",
     g ? (g.sens === "in" ? t.kRecueLe : t.kEnvoyeeLe)(jourCourtVolumes(g.jour, langue)) : ""],
    [t.kCorrespondants, String(nbCorrespondants), t.kPersonnes],
    [t.kCommissions, francs(cles.commissions, langue), t.kGagnees],
    [t.kFrais, francs(totaux.frais, langue), t.kPayes],
  ];
  return (
    <View style={{ gap: espaces.md }}>
      <Titre>{t.chiffresCles}</Titre>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
        {cases.map(([nom, valeur, sous]) => (
          <Carte key={nom} style={{ flexGrow: 1, flexBasis: "45%", padding: espaces.md, gap: 3 }}>
            <Texte taille={textes.petit} ton="doux" numberOfLines={1}>{nom}</Texte>
            <Texte taille={textes.intertitre} poids="gras" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {valeur}
            </Texte>
            <Texte taille={textes.legende} ton="pale">{sous}</Texte>
          </Carte>
        ))}
      </View>
    </View>
  );
}

// --- Le graphe : chaque jour (heure, semaine, mois) --------------------------

/**
 * LE GRAPHE, refait pour se LIRE (le pendant de celui du site).
 *
 * L'ancien mettait les entrées en haut, les sorties en bas, sans aucun
 * chiffre : « je ne sais pas comment l'interpréter ». Ici, en tête, la
 * colonne choisie EN MOTS (la plus récente qui a bougé, par défaut) ; deux
 * barres côte à côte sur la même ligne de base, entrée à gauche ; un axe en
 * montants ronds ; et la courbe commence au premier SMS de la caisse.
 */
function Graphe({ serie: brute, pas, langue, titre, debut }: {
  serie: PointDeSerie[]; pas: Pas; langue: Langue; titre: string; debut?: string | null;
}) {
  const t = textesVolumes[langue];
  const { serie, coupee } = serieVisible(brute, pas, debut);
  const [choisie, setChoisie] = useState(() => colonneParDefaut(serie));
  useEffect(() => setChoisie(colonneParDefaut(serie)), [brute]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!serie.length) return null;
  const c = serie[Math.min(choisie, serie.length - 1)];
  const haut = Math.max(1, ...serie.map((x) => Math.max(x.entrees, x.sorties)));
  const marques = graduations(haut);
  const sommet = marques[marques.length - 1];
  const etiquettes = new Set([0, Math.floor((serie.length - 1) / 3), Math.floor(((serie.length - 1) * 2) / 3), serie.length - 1]);
  const H = 160;
  // Une ligne par chiffre, le montant à droite : en trois colonnes, un
  // « Reste » de sept chiffres se lisait « −1 616 949… ». Un montant ne se
  // coupe jamais.
  const resume = (nom: string, valeur: string, ton?: "positif" | "negatif") => (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: espaces.sm }}>
      <Texte taille={textes.legende} ton="doux">{nom}</Texte>
      <Texte taille={textes.petit} poids="demi" ton={ton} chiffresAlignes style={{ flexShrink: 1, textAlign: "right" }}>
        {valeur}
      </Texte>
    </View>
  );
  return (
    <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
      <Titre droite={<Cles langue={langue} />}>{titre}</Titre>
      <View accessibilityLiveRegion="polite"
            style={{ backgroundColor: couleurs.surface, borderRadius: rayons.bouton, padding: espaces.md, gap: 4 }}>
        <Texte taille={textes.petit} poids="demi" style={{ marginBottom: 2 }}>{nomDeLaColonne(c.cle, pas, langue)}</Texte>
        {resume(t.entrees, francs(c.entrees, langue), "positif")}
        {resume(t.sorties, francs(c.sorties, langue), "negatif")}
        {resume(t.reste, francs(c.entrees - c.sorties, langue, true))}
      </View>
      <View style={{ flexDirection: "row", gap: espaces.sm }}>
        {/* L'axe : des montants ronds, discrets. */}
        <View style={{ width: 38, height: H }}>
          {marques.map((m) => (
            <Texte key={m} taille={9} ton="pale" chiffresAlignes numberOfLines={1}
                   style={{ position: "absolute", right: 0, bottom: (m / sommet) * H - 6 }}>
              {francsCourts(m, langue)}
            </Texte>
          ))}
          <Texte taille={9} ton="pale" style={{ position: "absolute", right: 0, bottom: -6 }}>0</Texte>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ height: H }}>
            {marques.map((m) => (
              <View key={m} pointerEvents="none"
                    style={{ position: "absolute", left: 0, right: 0, bottom: (m / sommet) * H, height: 1,
                             backgroundColor: couleurs.trait, opacity: 0.6 }} />
            ))}
            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: couleurs.surface3 }} />
            <View style={{ flexDirection: "row", height: H }}>
              {serie.map((x, i) => {
                const actif = i === choisie;
                return (
                  <Pressable key={x.cle} onPress={() => setChoisie(i)}
                             accessibilityRole="button" accessibilityState={{ selected: actif }}
                             accessibilityLabel={`${nomDeLaColonne(x.cle, pas, langue)} : ${t.entrees} ${francs(x.entrees, langue)}, ${t.sorties} ${francs(x.sorties, langue)}`}
                             // Le fond répond sous le doigt, même sur une colonne
                             // vide : une opacité sur du vide ne se voit pas.
                             style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "flex-end",
                                                        justifyContent: "center", gap: 2, paddingHorizontal: 1, borderRadius: 3,
                                                        backgroundColor: pressed ? couleurs.surface3 : actif ? couleurs.surface2 : "transparent" })}>
                    <View style={{ flex: 1, maxWidth: 9, height: `${(x.entrees / sommet) * 100}%`, minHeight: x.entrees > 0 ? 2 : 0,
                                   backgroundColor: couleurs.entree, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                    <View style={{ flex: 1, maxWidth: 9, height: `${(x.sorties / sommet) * 100}%`, minHeight: x.sorties > 0 ? 2 : 0,
                                   backgroundColor: couleurs.sortie, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                  </Pressable>
                );
              })}
            </View>
          </View>
          {/* Les repères vivent sous la rangée, pas dans les colonnes : une
              colonne d'un mois n'a pas la largeur de « 10 ». */}
          <View style={{ height: 14, marginTop: 4 }}>
            {[...etiquettes].map((i) => {
              const premier = i === 0, dernier = i === serie.length - 1;
              const place = premier ? { left: 0 } : dernier ? { right: 0 }
                : { left: `${((i + 0.5) / serie.length) * 100}%` as const, marginLeft: -32 };
              return (
                <Texte key={i} taille={10} ton="pale" numberOfLines={1}
                       style={{ position: "absolute", width: 64, textAlign: premier ? "left" : dernier ? "right" : "center", ...place }}>
                  {etiquetteDuPas(serie[i].cle, pas, langue)}
                </Texte>
              );
            })}
          </View>
        </View>
      </View>
      <Texte taille={textes.legende} ton="pale">
        {coupee && debut ? `${t.debutDeLaCaisse(jourCourtVolumes(debut, langue))} · ` : ""}{t.toucherUneBarre}
      </Texte>
    </Carte>
  );
}

function Cles({ langue }: { langue: Langue }) {
  const t = textesVolumes[langue];
  return (
    <View style={{ flexDirection: "row", gap: espaces.md }}>
      {[[t.entrees, couleurs.entree], [t.sorties, couleurs.sortie]].map(([n, c]) => (
        <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: c }} />
          <Texte taille={textes.legende} ton="doux">{n}</Texte>
        </View>
      ))}
    </View>
  );
}

// --- Avec qui ----------------------------------------------------------------

function MiniBarre({ valeur, max, couleur, ton, langue }: {
  valeur: number; max: number; couleur: string; ton: "positif" | "negatif"; langue: Langue;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
      <View style={{ flex: 1 }}>
        <View style={{ height: 8, borderRadius: 3, backgroundColor: couleur, width: `${Math.max(2, (valeur / max) * 100)}%` }} />
      </View>
      <Texte taille={textes.legende} poids="demi" ton={ton} chiffresAlignes>{francs(valeur, langue)}</Texte>
    </View>
  );
}

function Avatar({ nom, taille = 40 }: { nom: string; taille?: number }) {
  return (
    <View style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: couleurs.surface2,
                   alignItems: "center", justifyContent: "center" }}>
      <Texte taille={taille > 44 ? textes.intertitre : textes.petit} poids="gras" ton="doux">{initialesDe(nom) || "·"}</Texte>
    </View>
  );
}

function AvecQui({ r, langue, onQui }: { r: ReponseVolumes; langue: Langue; onQui: (cle: string) => void }) {
  const t = textesVolumes[langue];
  const [tous, setTous] = useState(false);
  const liste = tous ? r.volumes.correspondants : r.volumes.correspondants.slice(0, 5);
  if (!liste.length) return null;
  const max = Math.max(1, ...liste.map((q) => Math.max(q.recu, q.envoye)));
  return (
    <Carte style={{ paddingHorizontal: espaces.lg, paddingTop: espaces.md, paddingBottom: espaces.sm }}>
      <Titre droite={<Texte taille={textes.legende} ton="pale">{t.parVolume}</Texte>}>{t.avecQui}</Titre>
      {liste.map((q, i) => (
        <View key={q.cle}>
          {i > 0 ? <Filet /> : null}
          <Pressable accessibilityRole="button" onPress={() => onQui(q.cle)}
                     style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: espaces.md,
                                                paddingVertical: espaces.md, opacity: pressed ? 0.6 : 1 })}>
            <Avatar nom={q.nom} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Texte taille={textes.petit} poids="demi" numberOfLines={1}>{q.nom || formaterNumero(q.numero) || t.sansNom}</Texte>
              {q.recu > 0 ? <MiniBarre valeur={q.recu} max={max} couleur={couleurs.entree} ton="positif" langue={langue} /> : null}
              {q.envoye > 0 ? <MiniBarre valeur={q.envoye} max={max} couleur={couleurs.sortie} ton="negatif" langue={langue} /> : null}
            </View>
            <Texte taille={textes.legende} ton="pale">{t.op(q.nRecu + q.nEnvoye)}</Texte>
          </Pressable>
        </View>
      ))}
      {r.volumes.nbCorrespondants > 5 ? (
        <Pressable accessibilityRole="button" onPress={() => setTous(!tous)}
                   style={({ pressed }) => ({ borderTopWidth: 1, borderTopColor: couleurs.trait,
                                              paddingVertical: espaces.md, alignItems: "center", opacity: pressed ? 0.6 : 1 })}>
          <Texte taille={textes.petit} poids="demi">{tous ? t.voirMoins : t.voirTous(r.volumes.nbCorrespondants)}</Texte>
        </Pressable>
      ) : null}
    </Carte>
  );
}

// --- Les anneaux -------------------------------------------------------------

function Anneau({ parts }: { parts: { valeur: number; couleur: string }[] }) {
  const R = 58, r = 40, c = 70, total = parts.reduce((s, x) => s + x.valeur, 0) || 1, ecart = 0.035;
  let a = -Math.PI / 2;
  const pt = (rr: number, t: number) => `${c + rr * Math.cos(t)},${c + rr * Math.sin(t)}`;
  return (
    <Svg width={104} height={104} viewBox="0 0 140 140">
      {parts.length === 1 ? (
        <Circle cx={c} cy={c} r={(R + r) / 2} fill="none" stroke={parts[0].couleur} strokeWidth={R - r} />
      ) : parts.map((x, i) => {
        const da = (x.valeur / total) * 2 * Math.PI;
        const a1 = a + ecart / 2, a2 = a + da - ecart / 2, grand = da > Math.PI ? 1 : 0;
        a += da;
        if (a2 <= a1) return null;
        return <Path key={i} fill={x.couleur}
                     d={`M${pt(R, a1)} A${R},${R} 0 ${grand} 1 ${pt(R, a2)} L${pt(r, a2)} A${r},${r} 0 ${grand} 0 ${pt(r, a1)} Z`} />;
      })}
    </Svg>
  );
}

function Anneaux({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const cote = (sens: "in" | "out", titre: string, total: number, ton: "positif" | "negatif") => {
    const f = famillesDe(r.volumes, sens);
    const somme = f.reduce((s, x) => s + x.montant, 0) || 1;
    return (
      <Carte style={{ flexDirection: "row", alignItems: "center", gap: espaces.lg, padding: espaces.lg }}>
        {f.length ? <Anneau parts={f.map((x) => ({ valeur: x.montant, couleur: COULEUR_FAMILLE[x.famille] }))} />
          : <View style={{ width: 104, height: 104, borderRadius: 52, borderWidth: 14, borderColor: couleurs.surface2 }} />}
        <View style={{ flex: 1, gap: espaces.sm }}>
          <View>
            <Texte taille={textes.petit} poids="demi">{titre}</Texte>
            <Texte taille={textes.petit} poids="gras" ton={ton} chiffresAlignes numberOfLines={1}
                   adjustsFontSizeToFit minimumFontScale={0.7}>{francs(total, langue)}</Texte>
          </View>
          {f.map((x) => (
            <View key={x.famille} style={{ flexDirection: "row", alignItems: "flex-start", gap: espaces.sm }}>
              <View style={{ marginTop: 5 }}><Point couleur={COULEUR_FAMILLE[x.famille]} /></View>
              <Texte taille={textes.petit} ton="doux" style={{ flex: 1 }}>{nomDeFamille(langue, sens, x.famille, x.types)}</Texte>
              <Texte taille={textes.petit} poids="demi" chiffresAlignes>
                {x.montant / somme < 0.01 ? "<1" : Math.round((x.montant / somme) * 100)} %
              </Texte>
            </View>
          ))}
        </View>
      </Carte>
    );
  };
  return (
    <View style={{ gap: espaces.md }}>
      <Titre>{t.dOuVaLArgent}</Titre>
      {cote("in", t.entrees, r.volumes.totaux.entrees, "positif")}
      {cote("out", t.sorties, r.volumes.totaux.sorties, "negatif")}
    </View>
  );
}

// --- Par carte ---------------------------------------------------------------

function Badge({ ecart, langue }: { ecart: number | null; langue: Langue }) {
  const t = textesVolumes[langue];
  const [fond, ton, texte] = ecart == null ? [couleurs.surface2, "doux" as const, t.soldeNonConnu]
    : Math.abs(ecart) < 1 ? [couleurs.positifFond, "positif" as const, `✓ ${t.soldesJustes}`]
    : [couleurs.alerteFond, "alerte" as const, `⚠ ${t.ecartDe(francs(Math.abs(ecart), langue))}`];
  return (
    <View style={{ backgroundColor: fond, borderRadius: rayons.rond, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Texte taille={textes.legende} poids="demi" ton={ton}>{texte}</Texte>
    </View>
  );
}

function ParCarte({ r, langue, onCarte }: { r: ReponseVolumes; langue: Langue; onCarte: (iccid: string) => void }) {
  const t = textesVolumes[langue];
  const max = Math.max(1, ...r.volumes.parCarte.flatMap((c) => [c.totaux.entrees, c.totaux.sorties]));
  return (
    <Carte style={{ paddingHorizontal: espaces.lg, paddingTop: espaces.md, paddingBottom: espaces.md }}>
      <Titre>{t.parCarte}</Titre>
      {r.volumes.parCarte.map((c, i) => (
        <View key={c.iccid}>
          {i > 0 ? <Filet /> : null}
          <Pressable accessibilityRole="button" onPress={() => onCarte(c.iccid)}
                     style={({ pressed }) => ({ paddingVertical: espaces.md, gap: 6, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: espaces.sm }}>
              <NomDeCarte carte={c} />
              <View style={{ marginLeft: "auto" }}><Badge ecart={c.soldes.ecart} langue={langue} /></View>
            </View>
            {c.totaux.n === 0 ? <Texte taille={textes.legende} ton="pale">{t.rien}</Texte> : <>
              <MiniBarre valeur={c.totaux.entrees} max={max} couleur={couleurs.entree} ton="positif" langue={langue} />
              <MiniBarre valeur={c.totaux.sorties} max={max} couleur={couleurs.sortie} ton="negatif" langue={langue} />
            </>}
          </Pressable>
        </View>
      ))}
      {r.volumes.interne.n > 0 ? (
        <Texte taille={textes.legende} ton="pale" style={{ marginTop: espaces.sm }}>
          ⇄ {t.entreVosCartes(francs(r.volumes.interne.montant, langue))}
        </Texte>
      ) : null}
    </Carte>
  );
}

// --- Le solde d'une carte ----------------------------------------------------

function LeSolde({ r, carte, langue }: { r: ReponseVolumes; carte: CarteVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const c = r.volumes.parCarte.find((x) => x.iccid === carte.iccid);
  if (!c) return null;
  const { ouverture, cloture, attendu, ecart } = c.soldes;
  const e = c.totaux.entrees, s = c.totaux.sorties + c.totaux.frais;
  // Les frais descendent le solde avec les sorties : la marche le DIT, sans
  // quoi « Sorties » y valait plus que les « Sorties » du haut de l'écran.
  const nomSorties = c.totaux.frais ? t.sortiesEtFrais : t.sorties;
  const marches = ouverture == null ? [] : [
    { nom: t.debut, de: 0, a: ouverture, couleur: "#a8a8a8", valeur: ouverture, signe: false },
    { nom: t.entrees, de: ouverture, a: ouverture + e, couleur: couleurs.entree, valeur: e, signe: true },
    { nom: nomSorties, de: ouverture + e, a: ouverture + e - s, couleur: couleurs.sortie, valeur: -s, signe: true },
    ...(cloture != null ? [{ nom: t.fin, de: 0, a: cloture, couleur: couleurs.encre, valeur: cloture, signe: false }] : []),
  ];
  const haut = Math.max(1, ...marches.flatMap((m) => [m.de, m.a]));
  const H = 140;
  const derniere = c.ruptures.at(-1);
  return (
    <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
      <Titre droite={<Badge ecart={ecart} langue={langue} />}>{t.leSolde}</Titre>
      {marches.length ? (
        <>
          {/* Les marches portent un montant COURT (« 33 M ») : en entier,
              quatre montants d'un milliard ne tiennent pas côte à côte. Les
              montants entiers sont juste dessous. */}
          <View style={{ flexDirection: "row", height: H + 20 }}>
            {marches.map((m) => {
              const bas = (Math.min(m.de, m.a) / haut) * H, h = Math.max(2, (Math.abs(m.a - m.de) / haut) * H);
              return (
                <View key={m.nom} style={{ flex: 1 }}>
                  <Texte taille={10} poids="gras" chiffresAlignes numberOfLines={1}
                         style={{ position: "absolute", left: 0, right: 0, textAlign: "center", bottom: bas + h + 3 }}>
                    {(m.signe && m.valeur > 0 ? "+" : "") + francsCourts(m.valeur, langue)}
                  </Texte>
                  <View style={{ position: "absolute", left: "18%", right: "18%", bottom: bas, height: h,
                                 borderRadius: 5, backgroundColor: m.couleur }} />
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: espaces.sm, borderTopWidth: 1,
                         borderTopColor: couleurs.trait, paddingTop: espaces.md }}>
            {marches.map((m) => (
              <View key={m.nom} style={{ width: "50%", paddingRight: espaces.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: m.couleur }} />
                  <Texte taille={textes.legende} ton="doux" numberOfLines={1}>{m.nom}</Texte>
                </View>
                <Texte taille={textes.petit} poids="demi" chiffresAlignes numberOfLines={1}
                       adjustsFontSizeToFit minimumFontScale={0.7}>{francs(m.valeur, langue, m.signe)}</Texte>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {ecart != null && Math.abs(ecart) >= 1 ? (
        <View style={{ flexDirection: "row", gap: espaces.sm, padding: espaces.md, borderRadius: rayons.carte,
                       backgroundColor: couleurs.alerteFond }}>
          <IconeAlerte />
          <View style={{ flex: 1 }}>
            <Texte taille={textes.petit}>
              {(ecart < 0 ? t.ilManque : t.enTrop)(francs(Math.abs(ecart), langue),
                derniere ? `${jourCourtVolumes(derniere.jusquaJour, langue)} ${derniere.depuis}–${derniere.jusqua}`
                  : nomDeLaPeriode(r.volumes.periode, langue))}
            </Texte>
            {attendu != null ? <Texte taille={textes.legende} ton="pale">{t.attendu(francs(attendu, langue))}</Texte> : null}
          </View>
        </View>
      ) : null}
    </Carte>
  );
}

// --- Les heures de pointe ----------------------------------------------------

function HeuresDePointe({ heures, langue }: { heures: number[][]; langue: Langue }) {
  const t = textesVolumes[langue];
  const tranches = [6, 8, 10, 12, 14, 16, 18, 20];
  const valeur = (j: number, h: number) => (heures[j]?.[h] ?? 0) + (heures[j]?.[h + 1] ?? 0);
  const max = Math.max(1, ...heures.flatMap((_, j) => tranches.map((h) => valeur(j, h))));
  const teinte = (n: number) => TEINTES_POINTE[n === 0 ? 0 : Math.min(5, Math.ceil((n / max) * 5))];
  const pic = creneauLePlusCharge(heures);
  return (
    <Carte style={{ padding: espaces.lg, gap: espaces.sm }}>
      <Titre>{t.heuresDePointe}</Titre>
      <View style={{ flexDirection: "row", gap: 3, paddingLeft: 34 }}>
        {tranches.map((h) => <Texte key={h} taille={9} ton="pale" style={{ flex: 1, textAlign: "center" }}>{h}h</Texte>)}
      </View>
      {t.jours.map((jour, j) => (
        <View key={jour} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Texte taille={textes.legende} ton="doux" style={{ width: 31 }}>{jour}</Texte>
          {tranches.map((h) => (
            <View key={h} accessibilityLabel={`${t.joursLongs[j]} ${h}h ${valeur(j, h)}`}
                  style={{ flex: 1, height: 22, borderRadius: 3, backgroundColor: teinte(valeur(j, h)) }} />
          ))}
        </View>
      ))}
      {pic ? (
        <Texte taille={textes.petit} style={{ marginTop: espaces.xs }}>
          {t.lePlusCharge} <Texte taille={textes.petit} poids="demi">{t.creneau(t.joursLongs[pic.jour], pic.heure)}</Texte>
        </Texte>
      ) : null}
    </Carte>
  );
}

// --- La fiche d'un correspondant ---------------------------------------------

function FicheCorrespondant({ r, langue, deux }: { r: ReponseVolumes; langue: Langue; deux: boolean }) {
  const t = textesVolumes[langue];
  const f = r.volumes.fiche;
  if (!f) return <Vide titre={t.rien} detail={t.rienDetail} />;
  const max = Math.max(1, ...f.parCarte.flatMap((c) => [c.recu, c.envoye]));
  const tuile = (nom: string, valeur: number, n: number, couleur: string, ton: "positif" | "negatif") => (
    <Carte style={{ flex: 1, padding: espaces.md, gap: 3 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Point couleur={couleur} />
        <Texte taille={textes.petit} ton="doux">{nom}</Texte>
      </View>
      <Texte taille={textes.intertitre} poids="gras" ton={ton} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {francs(valeur, langue)}
      </Texte>
      <Texte taille={textes.legende} ton="pale">{t.operations(n)}</Texte>
    </Carte>
  );
  return (
    <Colonnes2 deux={deux}
      gauche={<>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
          <Avatar nom={f.nom} taille={54} />
          <View style={{ flex: 1 }}>
            <Texte taille={textes.intertitre} poids="gras">{f.nom || t.sansNom}</Texte>
            <Texte taille={textes.petit} ton="pale">
              {formaterNumero(f.numero)}{f.numero ? " · " : ""}{nomDeLaPeriode(r.volumes.periode, langue)}
            </Texte>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: espaces.sm }}>
          {tuile(t.recuDe, f.recu, f.nRecu, couleurs.entree, "positif")}
          {tuile(t.envoyeA, f.envoye, f.nEnvoye, couleurs.sortie, "negatif")}
        </View>
        <Carte style={{ paddingHorizontal: espaces.lg, paddingVertical: espaces.md }}>
          <Titre>{t.avecChaqueCarte}</Titre>
          {f.parCarte.map((pc, i) => {
            const c = r.cartes.find((x) => x.iccid === pc.iccid);
            return (
              <View key={pc.iccid} style={{ gap: 6, paddingVertical: espaces.md, borderTopWidth: i ? 1 : 0, borderTopColor: couleurs.trait }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
                  {c ? <View style={{ flex: 1 }}><NomDeCarte carte={c} /></View>
                    : <Texte taille={textes.petit} poids="demi" style={{ flex: 1 }}>{pc.iccid}</Texte>}
                  <Texte taille={textes.legende} ton="pale">{t.op(pc.n)}</Texte>
                </View>
                {pc.recu > 0 ? <MiniBarre valeur={pc.recu} max={max} couleur={couleurs.entree} ton="positif" langue={langue} /> : null}
                {pc.envoye > 0 ? <MiniBarre valeur={pc.envoye} max={max} couleur={couleurs.sortie} ton="negatif" langue={langue} /> : null}
              </View>
            );
          })}
        </Carte>
      </>}
      droite={<Graphe serie={f.serie} pas={r.volumes.periode.pas} langue={langue} titre={t.serie[r.volumes.periode.pas]}
                      debut={r.volumes.debutDeLHistorique} />}
    />
  );
}

// --- Les documents : le relevé, le bilan ------------------------------------

function Documents({ langue, onReleve }: { langue: Langue; onReleve: () => void }) {
  const r = textesReleve[langue];
  const a = textesAnalyse[langue];
  const [occupe, setOccupe] = useState<number | null>(null);
  const [refus, setRefus] = useState(false);
  const exporter = async (jours: number) => {
    if (occupe != null) return;
    setOccupe(jours);
    setRefus(false);
    try {
      const { url } = await lienBilan(jours);
      await partagerDocument(url, nomDeFichier(`Bilan-TOTEM-${jours}-jours`, "csv"), "csv", a.exporterBilan);
    } catch {
      setRefus(true);
    } finally {
      setOccupe(null);
    }
  };
  return (
    <View style={{ gap: espaces.md }}>
      <Pressable accessibilityRole="button" onPress={onReleve}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", gap: espaces.md, padding: espaces.lg,
          borderRadius: rayons.bouton, borderWidth: 1, borderColor: couleurs.trait,
          backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
        })}>
        <Icone nom="Doc" taille={18} couleur={couleurs.encre} />
        <View style={{ flex: 1, gap: 2 }}>
          <Texte poids="demi">{r.titre}</Texte>
          <Texte taille={textes.legende} ton="pale">{r.explication}</Texte>
        </View>
      </Pressable>
      <Texte taille={textes.petit} poids="demi">{a.exporterBilan}</Texte>
      <View style={{ flexDirection: "row", gap: espaces.sm }}>
        {[{ jours: 7, libelle: a.exportSemaine }, { jours: 30, libelle: a.exportJours(30) },
          { jours: 90, libelle: a.exportJours(90) }].map((p) => (
          <Pressable key={p.jours} accessibilityRole="button" onPress={() => void exporter(p.jours)} disabled={occupe != null}
            style={({ pressed }) => ({
              flex: 1, alignItems: "center", paddingVertical: espaces.md, borderRadius: rayons.bouton,
              borderWidth: 1, borderColor: couleurs.trait,
              backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
              opacity: occupe != null && occupe !== p.jours ? 0.5 : 1,
            })}>
            <Texte taille={textes.petit} poids="moyen">{occupe === p.jours ? "…" : p.libelle}</Texte>
          </Pressable>
        ))}
      </View>
      {refus ? <Texte taille={textes.legende} ton="negatif">{a.exportImpossible}</Texte> : null}
    </View>
  );
}

// --- L'attente, le vide ------------------------------------------------------

function Attente() {
  const bloc = (h: number) => <View style={{ height: h, borderRadius: rayons.carte, backgroundColor: couleurs.surface2 }} />;
  return <View style={{ gap: espaces.lg }}>{bloc(190)}{bloc(220)}{bloc(160)}</View>;
}

function Vide({ titre, detail }: { titre: string; detail: string }) {
  return (
    <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm, borderStyle: "dashed" }}>
      <Texte poids="demi">{titre}</Texte>
      <Texte taille={textes.petit} ton="doux" style={{ textAlign: "center" }}>{detail}</Texte>
    </Carte>
  );
}
