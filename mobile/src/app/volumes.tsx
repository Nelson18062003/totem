// LES VOLUMES — ce qui est entré et sorti des cartes, sur la période qu'on
// choisit : un jour, une semaine, un mois, six mois, ou des dates.
//
// Le pendant de `web/app/volumes/page.tsx`. Rien n'est calculé ici : la
// plateforme lit TOUTE la période (et non les mille derniers SMS) et compte
// avec le noyau (`noyau/volumes.ts`) ; le téléphone reçoit les mêmes
// chiffres que le site, au centime.
//
// Le propriétaire a refusé deux versions : la première « trop complexe, mal
// structurée », la seconde « pas assez visuelle ». Celle-ci montre d'abord
// DEUX BARRES (entrées, sorties), puis des dessins ; les mots sont des
// titres.
//
// LES TAILLES : une colonne sur un téléphone (petit, moyen, grand), deux sur
// une tablette couchée — les deux barres toujours en tête.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View, type ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";

import { Defilement, Accroc, BoutonIcone, Carte, Filet, Texte, avecAppui } from "@/ui";
import { Icone } from "@/icones";
import { useEcran } from "@/ecran";
import { couleurs, espaces, rayons, textes, TEINTES_POINTE } from "@/theme/jetons";
import { useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { lienBilan, lienReleve, lireVolumes, versErreurGuichet } from "@/api/guichet";
import { nomDeFichier, partagerDocument } from "@/partage";
import { BoutonFiltre, FeuilleChoix } from "@/filtres";
import { Calendrier } from "@/calendrier";
import { FeuilleReleve } from "@/releve";
import { francs, jourCourtVolumes, nomDeFamille, textesVolumes } from "@noyau/textes/volumes";
import { textesReleve } from "@noyau/textes/releve";
import { textesAnalyse } from "@noyau/textes/analyse";
import { textesUssd } from "@noyau/textes/ussd";
import {
  creneauLePlusCharge, etiquetteDuPas, famillesDe, GENRES_PERIODE, nomDeLaPeriode, periodeVoisine,
  variation, type CarteVolumes, type FamilleVolume, type GenrePeriode, type Pas, type PeriodeVolumes,
  type PointDeSerie, type ReponseVolumes,
} from "@noyau/volumes";
import { formaterNumero } from "@noyau/numero";
import { initialesDe } from "@noyau/flux";
import { jourLocal, FUSEAU_DEFAUT } from "@noyau/types";
import type { Langue } from "@noyau/langue";

type Demande = { periode: GenrePeriode; jour?: string; de?: string; a?: string; carte: string; qui: string | null };

const COULEUR_FAMILLE: Record<FamilleVolume, string> = {
  argent: couleurs.familleArgent, especes: couleurs.familleEspeces,
  transferts: couleurs.familleTransferts, commissions: couleurs.familleCommissions,
};
const couleurOperateur = (op: string) =>
  op.toUpperCase().startsWith("MTN") ? couleurs.opMtn
    : op.toUpperCase().startsWith("ORANGE") ? couleurs.opOrange : couleurs.encrePale;
const nomDeCarte = (c: CarteVolumes) =>
  `${c.operateur} ${formaterNumero(c.numero) || c.libelle.replace(/^\S+\s*/, "")}`;

export default function Volumes() {
  const langue = useLangue();
  const t = textesVolumes[langue];
  const ecran = useEcran();
  const etroit = ecran.largeurContenu < 340;
  const maintenant = useMaintenant();
  const aujourdhui = jourLocal(new Date(maintenant), FUSEAU_DEFAUT);

  const [demande, setDemande] = useState<Demande>({ periode: "mois", jour: aujourdhui, carte: "tout", qui: null });
  const [reponse, setReponse] = useState<ReponseVolumes | null>(null);
  const [attente, setAttente] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choixCarte, setChoixCarte] = useState(false);
  const [calendrier, setCalendrier] = useState(false);
  const [releve, setReleve] = useState(false);
  const enCours = useRef<AbortController | null>(null);
  // Ouvrir la fiche d'un correspondant ou d'une carte remonte en haut : la
  // fiche commence là, et le retour aussi.
  const defilement = useRef<ScrollView>(null);
  useEffect(() => { defilement.current?.scrollTo({ y: 0, animated: false }); }, [demande.qui, demande.carte]);

  // UNE demande à la fois : la précédente est abandonnée, et sa réponse,
  // si elle arrive quand même, n'écrit rien par-dessus la nouvelle.
  const relire = useCallback(async () => {
    enCours.current?.abort();
    const c = new AbortController();
    enCours.current = c;
    setAttente(true);
    try {
      const r = await lireVolumes(demande, c.signal);
      if (c.signal.aborted) return;
      setReponse(r);
      setErreur(null);
    } catch (e) {
      if (c.signal.aborted) return;
      setErreur(versErreurGuichet(e, langue).message);
    } finally {
      if (!c.signal.aborted) setAttente(false);
    }
  }, [demande, langue]);
  useEffect(() => { void relire(); return () => enCours.current?.abort(); }, [relire]);
  const roue = useRoue(relire);

  const changer = (x: Partial<Demande>) => setDemande((d) => ({ ...d, ...x }));
  const p = reponse?.volumes.periode;
  const allerA = (x: PeriodeVolumes | null) => {
    if (!x) return;
    changer(x.genre === "dates" ? { periode: "dates", de: x.de, a: x.a, jour: undefined, qui: null }
      : { periode: x.genre, jour: x.de, de: undefined, a: undefined, qui: null });
  };

  const telecharger = async () => {
    if (!p || !reponse) return;
    try {
      const { url } = await lienReleve(reponse.carte, p.de, p.jusqua, "pdf");
      await partagerDocument(url, nomDeFichier(`Releve-${p.de}_${p.jusqua}`, "pdf"), "pdf", t.telechargerReleve);
    } catch { /* la feuille de partage dit elle-même ce qui n'a pas marché */ }
  };

  const deux = ecran.classe === "etendue" || ecran.classe === "large";
  const v = reponse?.volumes;
  const carteChoisie = reponse && reponse.carte !== "tout"
    ? reponse.cartes.find((c) => c.iccid === reponse.carte) ?? null : null;

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

        {/* La période : cinq pastilles, une ligne. Chacune part de la largeur
            de son nom : à parts égales, à 320 points, « Semaine » n'avait que
            53 points et se lisait « Sema… ». */}
        <View style={{ flexDirection: "row", gap: etroit ? 4 : 6 }}>
          {GENRES_PERIODE.map((g) => {
            const choisi = g === demande.periode;
            return (
              <Pressable key={g} accessibilityRole="button" accessibilityState={{ selected: choisi }}
                onPress={() => (g === "dates" ? setCalendrier(true)
                  : changer({ periode: g, jour: aujourdhui, de: undefined, a: undefined, qui: null }))}
                style={avecAppui({
                  flexGrow: 1, flexShrink: 1, flexBasis: "auto", paddingHorizontal: 6,
                  minHeight: 40, alignItems: "center", justifyContent: "center",
                  borderRadius: rayons.rond, borderWidth: 1,
                  borderColor: choisi ? couleurs.accent : couleurs.trait,
                  backgroundColor: choisi ? couleurs.accent : couleurs.surfaceHaute,
                })}>
                <Texte taille={etroit ? textes.legende : textes.petit} poids={choisi ? "demi" : "moyen"} numberOfLines={1}
                       adjustsFontSizeToFit minimumFontScale={0.75}
                       style={{ color: choisi ? couleurs.surfaceHaute : couleurs.encreDouce }}>
                  {t.periodes[g]}
                </Texte>
              </Pressable>
            );
          })}
        </View>

        {/* ‹ Octobre 2026 › — et la carte. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <BoutonIcone nom="Chevron" etiquette={t.precedente}
                       onPress={() => p && reponse && allerA(periodeVoisine(p, -1, reponse.aujourdhui))}
                       style={{ transform: [{ rotate: "180deg" }] }} />
          <Texte taille={textes.intertitre} poids="demi" style={{ flex: 1, textAlign: "center" }}>
            {p ? nomDeLaPeriode(p, langue) : " "}
          </Texte>
          <View style={{ opacity: p && reponse && periodeVoisine(p, 1, reponse.aujourdhui) ? 1 : 0.25 }}>
            <BoutonIcone nom="Chevron" etiquette={t.suivante}
                         onPress={() => p && reponse && allerA(periodeVoisine(p, 1, reponse.aujourdhui))} />
          </View>
        </View>
        {reponse && reponse.cartes.length > 1 ? (
          <View style={{ flexDirection: "row" }}>
            <BoutonFiltre libelle={carteChoisie ? nomDeCarte(carteChoisie) : t.toutesLesCartes}
                          etiquette={t.carte} actif={!!carteChoisie} icone="PuceSim"
                          onPress={() => setChoixCarte(true)} />
          </View>
        ) : null}

        {!reponse ? (
          erreur ? <Accroc message={erreur} onReessayer={() => void relire()} /> : <Attente />
        ) : reponse.cartes.length === 0 ? (
          <Vide titre={t.pasDeCarte} detail={t.pasDeCarteDetail} />
        ) : (
          // Pendant qu'une autre période se lit, l'écran garde la précédente,
          // pâlie : pas de formes grises qui sautent à chaque appui.
          <View style={{ gap: espaces.lg, opacity: attente ? 0.55 : 1 }}>
            {erreur ? <Accroc message={erreur} onReessayer={() => void relire()} /> : null}
            {v!.fiche !== undefined ? (
              <FicheCorrespondant r={reponse} langue={langue} deux={deux} />
            ) : (
              <Colonnes2 deux={deux}
                gauche={<>
                  <Duel r={reponse} langue={langue} />
                  {carteChoisie ? <LeSolde r={reponse} carte={carteChoisie} langue={langue} /> : null}
                  <Avertissements r={reponse} langue={langue} />
                  <Courbe serie={v!.serie} pas={v!.periode.pas} langue={langue} titre={t.serie[v!.periode.pas]} />
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
          </View>
        )}
      </Defilement>

      {choixCarte && reponse ? (
        <FeuilleChoix
          titre={t.carte}
          options={[{ cle: "tout", libelle: t.toutesLesCartes },
                    ...reponse.cartes.map((c) => ({ cle: c.iccid, libelle: nomDeCarte(c) }))]}
          choisie={reponse.carte}
          onChoisir={(carte) => { setChoixCarte(false); changer({ carte, qui: null }); }}
          onFermer={() => setChoixCarte(false)} />
      ) : null}
      {calendrier ? (
        <Calendrier langue={langue} aujourdhui={aujourdhui}
                    depart={p?.genre === "dates" ? { de: p.de, a: p.a } : null}
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
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi" style={{ flexShrink: 1 }}>{children}</Texte>
      {droite}
    </View>
  );
}

function Point({ couleur, taille = 10 }: { couleur: string; taille?: number }) {
  return <View style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: couleur }} />;
}

// --- Les deux barres ---------------------------------------------------------

function Variation({ maintenant, avant }: { maintenant: number; avant: number }) {
  const x = variation(maintenant, avant);
  if (x == null) return null;
  return (
    <View style={{ backgroundColor: couleurs.surface2, borderRadius: rayons.rond, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Texte taille={textes.legende} poids="demi" ton="doux" chiffresAlignes>
        {x >= 0 ? "▲" : "▼"} {Math.abs(x)} %
      </Texte>
    </View>
  );
}

function Duel({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const { totaux, avant } = r.volumes;
  const max = Math.max(totaux.entrees, totaux.sorties, 1);
  const ligne = (nom: string, valeur: number, n: number, avantV: number, couleur: string, ton: "positif" | "negatif") => (
    <View style={{ gap: espaces.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: espaces.sm }}>
        <Point couleur={couleur} />
        <Texte poids="demi">{nom}</Texte>
        <Variation maintenant={valeur} avant={avantV} />
        <Texte taille={24} poids="gras" ton={ton} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
               style={{ marginLeft: "auto", letterSpacing: -0.5 }}>
          {francs(valeur, langue)}
        </Texte>
      </View>
      <View accessibilityRole="image" accessibilityLabel={`${nom} ${francs(valeur, langue)}`}
            style={{ height: 20, borderRadius: 6, backgroundColor: couleur, width: `${Math.max(1, (valeur / max) * 100)}%` }} />
      <Texte taille={textes.legende} ton="pale">{t.operations(n)}</Texte>
    </View>
  );
  return (
    <Carte style={{ padding: espaces.lg, gap: espaces.lg }}>
      {ligne(t.entrees, totaux.entrees, totaux.nEntrees, avant.entrees, couleurs.entree, "positif")}
      {ligne(t.sorties, totaux.sorties, totaux.nSorties, avant.sorties, couleurs.sortie, "negatif")}
      <Filet />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaces.sm }}>
        <Texte poids="demi">{t.reste}</Texte>
        <Texte taille={28} poids="gras" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
               style={{ flexShrink: 1, letterSpacing: -0.6 }}>
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
    if (c) lignes.push(t.silence(nomDeCarte(c)));
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
    [t.kOperations, totaux.n.toLocaleString(langue === "en" ? "en-US" : "fr-FR").replace(/[  ]/g, " "), t.kParJour(cles.parJour)],
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
            <Texte taille={textes.intertitre} poids="gras" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {valeur}
            </Texte>
            <Texte taille={textes.legende} ton="pale">{sous}</Texte>
          </Carte>
        ))}
      </View>
    </View>
  );
}

// --- Chaque jour -------------------------------------------------------------

function Courbe({ serie, pas, langue, titre }: { serie: PointDeSerie[]; pas: Pas; langue: Langue; titre: string }) {
  const t = textesVolumes[langue];
  const [choisie, setChoisie] = useState<number | null>(null);
  useEffect(() => setChoisie(null), [serie]);
  const max = Math.max(1, ...serie.map((c) => Math.max(c.entrees, c.sorties)));
  const etiquettes = new Set([0, Math.floor((serie.length - 1) / 3), Math.floor(((serie.length - 1) * 2) / 3), serie.length - 1]);
  const c = choisie != null ? serie[choisie] : null;
  return (
    <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
      <Titre droite={<Cles langue={langue} />}>{titre}</Titre>
      {/* Toucher une colonne dit ses chiffres, en entier. */}
      <Texte taille={textes.legende} ton={c ? "normal" : "pale"} chiffresAlignes style={{ minHeight: 16 }}>
        {c ? `${etiquetteDuPas(c.cle, pas, langue)} · ▲ ${francs(c.entrees, langue)} · ▼ ${francs(c.sorties, langue)}`
          : langue === "en" ? "Touch a column to see its figures" : "Touchez une colonne pour voir ses chiffres"}
      </Texte>
      <View style={{ flexDirection: "row", height: 170, gap: 2 }}>
        {serie.map((x, i) => (
          <Pressable key={x.cle} onPress={() => setChoisie(i === choisie ? null : i)}
                     accessibilityRole="button" accessibilityState={{ selected: i === choisie }}
                     accessibilityLabel={`${etiquetteDuPas(x.cle, pas, langue)} ${francs(x.entrees, langue)} ${francs(x.sorties, langue)}`}
                     style={avecAppui({ flex: 1, alignItems: "center", borderRadius: 4,
                              backgroundColor: i === choisie ? couleurs.surface2 : "transparent" })}>
            <View style={{ flex: 1, width: "100%", justifyContent: "flex-end", alignItems: "center" }}>
              <View style={{ width: "70%", maxWidth: 12, height: `${(x.entrees / max) * 100}%`,
                             backgroundColor: couleurs.entree, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
            </View>
            <View style={{ height: 1, width: "100%", backgroundColor: couleurs.surface3 }} />
            <View style={{ flex: 1, width: "100%", alignItems: "center" }}>
              <View style={{ width: "70%", maxWidth: 12, height: `${(x.sorties / max) * 100}%`,
                             backgroundColor: couleurs.sortie, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
            </View>
          </Pressable>
        ))}
      </View>
      {/* Les repères vivent sous la rangée, pas dans les colonnes : une
          colonne d'un mois n'a pas la largeur de « 10 », et « 1.. » ne se
          lit pas. Le premier et le dernier s'appuient sur les bords. */}
      <View style={{ height: 14, marginTop: -espaces.sm }}>
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
    </Carte>
  );
}

function Cles({ langue }: { langue: Langue }) {
  const t = textesVolumes[langue];
  return (
    <View style={{ flexDirection: "row", gap: espaces.md }}>
      {[[t.entrees, couleurs.entree], [t.sorties, couleurs.sortie]].map(([n, c]) => (
        <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Point couleur={c} taille={9} />
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
            <Texte taille={textes.petit} poids="gras" ton={ton} chiffresAlignes>{francs(total, langue)}</Texte>
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
              <Point couleur={couleurOperateur(c.operateur)} />
              <Texte taille={textes.petit} poids="demi">{nomDeCarte(c)}</Texte>
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
  const marches = ouverture == null ? [] : [
    { nom: t.debut, de: 0, a: ouverture, couleur: "#a8a8a8", lib: francs(ouverture, langue) },
    { nom: t.entrees, de: ouverture, a: ouverture + e, couleur: couleurs.entree, lib: francs(e, langue, true) },
    // Les frais descendent le solde avec les sorties : la marche le DIT, sans
    // quoi « Sorties » y valait plus que les « Sorties » du haut de l'écran.
    { nom: c.totaux.frais ? t.sortiesEtFrais : t.sorties, de: ouverture + e, a: ouverture + e - s, couleur: couleurs.sortie, lib: francs(-s, langue, true) },
    ...(cloture != null ? [{ nom: t.fin, de: 0, a: cloture, couleur: couleurs.encre, lib: francs(cloture, langue) }] : []),
  ];
  const haut = Math.max(1, ...marches.flatMap((m) => [m.de, m.a]));
  const H = 150, PIED = 34;
  const derniere = c.ruptures.at(-1);
  return (
    <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
      <Titre droite={<Badge ecart={ecart} langue={langue} />}>{t.leSolde}</Titre>
      {marches.length ? (
        <View style={{ flexDirection: "row", height: H + PIED + 32 }}>
          {marches.map((m) => {
            const bas = (Math.min(m.de, m.a) / haut) * H, h = Math.max(2, (Math.abs(m.a - m.de) / haut) * H);
            return (
              <View key={m.nom} style={{ flex: 1 }}>
                <Texte taille={10} poids="gras" chiffresAlignes numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
                       style={{ position: "absolute", left: 0, right: 0, textAlign: "center", bottom: PIED + bas + h + 3 }}>
                  {m.lib}
                </Texte>
                <View style={{ position: "absolute", left: "18%", right: "18%", bottom: PIED + bas, height: h,
                               borderRadius: 5, backgroundColor: m.couleur }} />
                <Texte taille={textes.legende} ton="doux" numberOfLines={2}
                       style={{ position: "absolute", left: 0, right: 0, top: H + 32 + 4, textAlign: "center" }}>{m.nom}</Texte>
              </View>
            );
          })}
        </View>
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
      <Texte taille={textes.intertitre} poids="gras" ton={ton} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
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
                  <Point couleur={couleurOperateur(c?.operateur ?? "")} />
                  <Texte taille={textes.petit} poids="demi" style={{ flex: 1 }}>{c ? nomDeCarte(c) : pc.iccid}</Texte>
                  <Texte taille={textes.legende} ton="pale">{t.op(pc.n)}</Texte>
                </View>
                {pc.recu > 0 ? <MiniBarre valeur={pc.recu} max={max} couleur={couleurs.entree} ton="positif" langue={langue} /> : null}
                {pc.envoye > 0 ? <MiniBarre valeur={pc.envoye} max={max} couleur={couleurs.sortie} ton="negatif" langue={langue} /> : null}
              </View>
            );
          })}
        </Carte>
      </>}
      droite={<Courbe serie={f.serie} pas={r.volumes.periode.pas} langue={langue} titre={t.serie[r.volumes.periode.pas]} />}
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
