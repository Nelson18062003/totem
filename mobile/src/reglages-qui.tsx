// Qui peut se connecter — la gestion des comptes, sur le téléphone.
//
// Le pendant mobile de « SectionQui » (web/app/reglages/interactifs.tsx).
// La section ne s'affiche que pour le propriétaire : la liste des comptes
// lui est réservée (403 pour les autres), et l'écran se tait alors de
// lui-même — un invité ne voit même pas qu'elle existe.
//
// L'inscription est publique : chacun crée son compte dans l'application.
// Créer un compte ICI sert au propriétaire qui pose lui-même quelqu'un : il
// donne le prénom, le nom, le courriel, et choisit le mot de passe qu'il
// transmettra. Une puce envoyée par un inscrit s'attribue d'après le CODE DE
// COMPTE joint à la puce — jamais d'après une adresse e-mail.
//
// LES CARTES DE CHACUN. Un invité ne voit que les cartes qu'on lui confie
// ici, et rien du tout tant qu'on ne lui en a confié aucune. L'avertissement
// vient AVANT le champ — le dire après la création ferait croire à un accès
// cassé.
//
// clavier : protégé par app/reglages.tsx — la section vit dans l'écran des
// réglages, dont le KeyboardAvoidingView pousse le formulaire au-dessus du
// clavier (vérifié par scripts/verifier-le-clavier.mjs).
//
// SA PLACE EST GARDÉE PENDANT QU'ELLE ARRIVE. La section rendait `null` tant
// que la liste n'était pas là, puis surgissait une à trois secondes plus
// tard — titre, aide, une rangée par compte — AU-DESSUS de « Sécurité » et
// de « Se déconnecter », qu'elle poussait d'un bloc, environ 250 points,
// juste au moment où le doigt pouvait s'en approcher. Elle montre
// maintenant son titre et des formes grises à la hauteur du dernier nombre
// de comptes connu.
//
// ET CE NOMBRE EST GARDÉ SUR LE TÉLÉPHONE. Le premier jet ne le gardait
// qu'en mémoire — perdue à chaque lancement. Or on vient ici une fois par
// mois : presque chaque visite était une « première », la forme prenait la
// hauteur de deux comptes, et « Sécurité » remontait de deux cents points
// pour le propriétaire seul, ou descendait d'autant avec trois comptes. Un
// nombre de comptes n'est ni un secret ni une donnée personnelle : il se
// range avec les réglages ordinaires (`api/reglage.ts`).

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";

import { Accroc, ChampTexte, Carte, Filet, Texte } from "@/ui";
import { Squelette } from "@/animations";
import { carteRetiree, motDuRefus } from "@/reglages-cartes";
import { useGesteUnique } from "@/geste";
import * as Reglage from "@/api/reglage";
import { agirSurCompte, ErreurGuichet, listerComptes,
         type CarteAConfier, type CompteInscrit } from "@/api/guichet";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { dateVue, type Sim } from "@noyau/types";
import { textesReglages } from "@noyau/textes/reglages";
import type { Langue } from "@noyau/langue";

/** Le nombre de comptes à la dernière lecture — rien d'autre n'est gardé
 *  d'une visite à l'autre : la liste elle-même est relue à chaque fois, et
 *  une session suivante ne doit pas apercevoir celle d'avant. Il vit en
 *  mémoire ET sur le téléphone : la mémoire se perd à chaque lancement. */
const CLE_NOMBRE = "totem.qui.comptes";
let nombreConnu: number | null = null;
let relecture: Promise<void> | null = null;

/** Relire le nombre rangé sur le téléphone — une fois par lancement. Elle
 *  part dès le chargement de ce fichier, bien avant qu'on ouvre les
 *  Réglages : la forme a sa bonne hauteur dès le premier rendu. */
function relireLeNombre(): Promise<void> {
  relecture ??= Reglage.lire(CLE_NOMBRE).then((v) => {
    const n = Number(v);
    if (nombreConnu === null && v !== null && Number.isInteger(n) && n >= 1) nombreConnu = n;
  }).catch(() => { /* rien de rangé : on fera sans */ });
  return relecture;
}
void relireLeNombre();

function retenirLeNombre(n: number) {
  if (n === nombreConnu) return;
  nombreConnu = n;
  void Reglage.ecrire(CLE_NOMBRE, String(n));
}

/** Sans rien de rangé — la toute première visite sur ce téléphone — on
 *  attend UN compte : le propriétaire seul, qui vient d'installer TOTEM et
 *  n'a encore confié de carte à personne. C'est la première visite la plus
 *  probable, et la seule qui reste. */
const NOMBRE_PAR_DEFAUT = 1;
/** Au-delà, la forme ne grandit plus : six comptes, c'est déjà une grande
 *  maison, et une forme plus haute que l'écran n'annonce plus rien. */
const NOMBRE_MAX_DE_FORMES = 6;

export function SectionQui({ langue, proprietaire, sims }: {
  langue: Langue;
  /** D'après le cahier. `false` : la section n'existe pas pour cette
   *  personne — inutile de la montrer en attente pour la retirer ensuite.
   *  Absent (cahier vide, plateforme ancienne) : on demande, on verra. */
  proprietaire?: boolean;
  /** Les cartes du cahier : c'est leur `presence` qui dit si une carte est
   *  vraiment absente, ou si son boîtier se tait. */
  sims: Sim[];
}) {
  const t = textesReglages[langue];
  const [comptes, setComptes] = useState<CompteInscrit[] | null>(null);
  // Combien de rangées la forme d'attente doit tenir. Déjà connu si la
  // relecture du téléphone a fini — c'est presque toujours le cas.
  const [attendus, setAttendus] = useState<number | null>(nombreConnu);
  useEffect(() => {
    if (attendus !== null) return;
    let vivant = true;
    void relireLeNombre().then(() => { if (vivant) setAttendus(nombreConnu); });
    return () => { vivant = false; };
  }, [attendus]);
  const [cartes, setCartes] = useState<CarteAConfier[]>([]);
  // Le compte dont on choisit les cartes, ou aucun.
  const [enChoix, setEnChoix] = useState<number | null>(null);
  // Le code de compte tapé pour chaque compte du grand public (voir
  // web/lib/code-de-compte.ts) : il accompagne chaque attribution.
  const [codes, setCodes] = useState<Record<number, string>>({});
  // La carte dont l'attribution part en ce moment (« compte-iccid »).
  const [bascule, setBascule] = useState<string | null>(null);
  const [permis, setPermis] = useState<boolean | null>(null);
  const [occupe, setOccupe] = useState<number | null>(null);

  const [creationOuverte, setCreationOuverte] = useState(false);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [courriel, setCourriel] = useState("");
  const [motdepasse, setMotdepasse] = useState("");
  const [creation, setCreation] = useState(false);
  const [mot, setMot] = useState<string | null>(null);
  const [rate, setRate] = useState(false);

  // « Pas le propriétaire » et « le réseau a toussé » ne se ressemblent
  // pas : le premier tait la section (403, comme au web), le second se DIT
  // — sinon le propriétaire conclut que l'écran n'existe pas, pendant qu'un
  // invité attend son approbation.
  //
  // La lecture ne peut plus rester en suspens : le guichet borne TOUT
  // l'échange, corps compris, à trente secondes (`api/guichet.ts`). Au-delà,
  // elle échoue — et l'échec se dit ici, avec « Réessayer », au lieu de
  // formes grises qui battraient sans fin au-dessus de « Sécurité ».
  const [accroc, setAccroc] = useState<string | null>(null);
  // LES LECTURES SONT NUMÉROTÉES. Celle de l'ouverture peut revenir APRÈS
  // celle qui suit un geste : elle remettrait la liste d'avant le geste.
  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const n = ++derniere.current;
    try {
      const r = await listerComptes();
      if (n !== derniere.current) return;
      retenirLeNombre((r.comptes ?? []).length);
      setComptes(r.comptes ?? []);
      setCartes(r.cartes ?? []);
      setPermis(true);
      setAccroc(null);
    } catch (e) {
      if (n !== derniere.current) return;
      if (e instanceof ErreurGuichet && e.statut === 403) {
        setPermis(false);
        return;
      }
      setAccroc(motDuRefus(e, t.actionRatee));
    }
  }, [t]);

  useEffect(() => {
    if (proprietaire === false) return;
    void charger();
  }, [charger, proprietaire]);

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
        // Dans les mots du guichet — jamais « Network request failed ».
        setRate(true);
        setMot(motDuRefus(e, t.actionRatee));
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
    // LAISSER ENTRER SE CONFIRME AUSSI. C'est le geste qui ouvre la caisse
    // à quelqu'un, et son bouton est le plus visible de la rangée : un doigt
    // qui le touche en croyant toucher autre chose — l'écran venait de
    // bouger sous lui — ne doit pas suffire. Le courriel se relit dans la
    // question : c'est sur lui qu'on décide.
    Alert.alert(t.approuver, c.courriel, [
      { text: t.annuler, style: "cancel" },
      { text: t.approuver, onPress: () => void faire() },
    ]);
  };

  // `if (creation)` ne garde rien : l'état React ne se ferme qu'au rendu
  // suivant. Deux appuis rapprochés partaient tous les deux ; la base n'en
  // gardait qu'un — c'est elle qui tient la règle — mais le second revenait
  // avec « un compte existe déjà avec ce courriel », juste après une création
  // réussie. Le propriétaire lisait un échec là où tout s'était bien passé.
  const gesteCreer = useGesteUnique();

  const complet = Boolean(prenom.trim() && nom.trim() && courriel.trim())
    && motdepasse.length >= 12;

  const creer = () => gesteCreer.lancer(async () => {
    if (!complet) return;
    setCreation(true);
    setMot(null);
    try {
      const r = await agirSurCompte({
        geste: "creer", prenom: prenom.trim(), nom: nom.trim(),
        courriel: courriel.trim(), motdepasse,
      }) as { id?: number } | null;
      setRate(false);
      setMot(t.creerFait);
      // Le mot de passe ne reste pas à l'écran : il vient d'être transmis.
      setPrenom("");
      setNom("");
      setCourriel("");
      setMotdepasse("");
      setCreationOuverte(false);
      await charger();
      // Le geste qui suit naturellement : choisir ses cartes. Sans cela, le
      // compte neuf ne verrait rien, et l'on croirait l'accès cassé.
      if (typeof r?.id === "number") setEnChoix(r.id);
      return true;
    } catch (e) {
      setRate(true);
      setMot(motDuRefus(e, t.actionRatee));
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
      await agirSurCompte(confiee
        ? { id: c.id, iccid, geste: "retirer" }
        : { id: c.id, iccid, geste: "attribuer", code: codes[c.id] ?? "" });
      setRate(false);
    } catch (e) {
      setRate(true);
      setMot(motDuRefus(e, t.actionRatee));
    } finally {
      await charger();
      setBascule(null);
    }
  };

  const nomDeCarte = (iccid: string) =>
    cartes.find((x) => x.iccid === iccid)?.libelle ?? `··${iccid.slice(-4)}`;

  /** « Absente du terminal » seulement pour une carte qu'on SAIT retirée.
   *  Le cahier sait si le boîtier se tait — et une carte dont on ne sait
   *  rien n'est pas absente : on dit alors que son boîtier ne donne plus de
   *  nouvelles. Une plateforme d'avant `presence` ne dit que `enPlace`. */
  const presenceDite = (carte: CarteAConfier): string => {
    const vue = sims.find((x) => x.iccid === carte.iccid);
    // La liste des comptes porte aussi la présence, quand la plateforme est
    // à jour : elle sert quand le cahier n'a pas encore cette carte.
    const presence = vue?.presence
      ?? (carte as CarteAConfier & { presence?: Sim["presence"] }).presence;
    if (presence === "inconnue") return ` · ${t.presenceInconnue}`;
    return carteRetiree({ enPlace: vue?.enPlace ?? carte.enPlace, presence })
      ? ` · ${t.cartesRetiree}` : "";
  };

  // Pas le propriétaire : la section se tait, comme au web.
  if (permis === false || proprietaire === false) return null;
  // Le premier chargement a raté : on le dit, avec de quoi réessayer —
  // disparaître en silence ferait croire que la section n'existe pas.
  if (accroc && comptes == null) {
    return (
      <View style={{ gap: espaces.sm }}>
        <Texte taille={textes.intertitre} poids="demi">{t.qui}</Texte>
        <Accroc message={accroc} onReessayer={() => void charger()} />
      </View>
    );
  }
  // Encore en route : le titre, l'aide, et une forme par compte attendu, à
  // la hauteur EXACTE de la rangée qu'elle remplace — celle du propriétaire
  // (trois lignes et « toutes les cartes » : 151 points), puis celles des
  // autres (deux boutons, et « Confier des cartes » : 251 points). Les
  // lignes de texte sont des formes posées dans une boîte de la hauteur de
  // la ligne : une forme de 14 points pour une ligne qui en fait 17, trois
  // fois par rangée, et l'écran sautait encore.
  if (comptes == null) {
    const combien = Math.min(Math.max(attendus ?? NOMBRE_PAR_DEFAUT, 1), NOMBRE_MAX_DE_FORMES);
    return (
      <View style={{ gap: espaces.sm }}>
        <Texte taille={textes.intertitre} poids="demi">{t.qui}</Texte>
        <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
          {t.quiAide}
        </Texte>
        <Carte>
          {Array.from({ length: combien }, (_, i) => (
            <View key={i}>
              {i > 0 ? <Filet /> : null}
              <View style={{ padding: espaces.lg, gap: espaces.sm }}>
                <View style={{ gap: 2 }}>
                  <LigneGrise hauteur={17} largeur="45%" />
                  <LigneGrise hauteur={15} largeur="70%" />
                  <LigneGrise hauteur={15} largeur="55%" />
                </View>
                {i > 0 ? <Squelette largeur="50%" hauteur={44} /> : null}
                <Squelette hauteur={i > 0 ? 108 : 60} />
              </View>
            </View>
          ))}
          {/* Seul, le propriétaire a sous sa rangée « aucun autre compte ». */}
          {combien === 1 ? (
            <View style={{ padding: espaces.lg }}>
              <LigneGrise hauteur={15} largeur="50%" />
            </View>
          ) : null}
        </Carte>
        {/* « Créer un compte » : 8 + 17 + 8, et le trait du bord. */}
        <Squelette largeur="40%" hauteur={35} />
      </View>
    );
  }

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
                {c.prenom || c.nom ? (
                  <Texte poids="moyen" taille={textes.petit}>
                    {[c.prenom, c.nom].filter(Boolean).join(" ")}
                  </Texte>
                ) : null}
                <Texte poids={c.prenom || c.nom ? "normal" : "moyen"}
                       taille={c.prenom || c.nom ? textes.legende : textes.petit}
                       ton={c.prenom || c.nom ? "doux" : "normal"} selectable>
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
                    {/* LE CODE DE COMPTE, pour un compte du grand public : la
                        puce va au compte qui porte le code joint à la puce,
                        jamais à celui d'une adresse e-mail. */}
                    {c.codeExige ? (
                      <View style={{ gap: espaces.xs }}>
                        <Saisie libelle={t.codeDeCompteLibelle} valeur={codes[c.id] ?? ""}
                                onChange={(v) => setCodes((d) => ({ ...d, [c.id]: v }))} />
                        <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
                          {t.codeDeCompteAide}
                        </Texte>
                      </View>
                    ) : null}
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
                              {presenceDite(carte)}
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
          <Saisie libelle={t.creerPrenom} valeur={prenom} onChange={setPrenom} mots />
          <Saisie libelle={t.creerNom} valeur={nom} onChange={setNom} mots />
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
              accessibilityRole="button"
              onPress={() => void creer()}
              disabled={creation || !complet}
              style={({ pressed }) => ({
                flex: 1, alignItems: "center", paddingVertical: espaces.md,
                borderRadius: rayons.bouton,
                backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
                opacity: creation || !complet ? 0.35 : 1,
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

/** Une ligne de texte qui n'est pas encore là : une forme fine, posée au
 *  milieu d'une boîte qui a la hauteur de la ligne qu'elle remplace. */
function LigneGrise({ hauteur, largeur }: { hauteur: number; largeur: `${number}%` }) {
  return (
    <View style={{ height: hauteur, justifyContent: "center" }}>
      <Squelette largeur={largeur} hauteur={Math.max(hauteur - 5, 8)} />
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

function Saisie({ libelle, valeur, onChange, clavier, mots }: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  clavier?: "email-address";
  /** Un prénom ou un nom : une majuscule en tête de chaque mot. */
  mots?: boolean;
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
        autoCapitalize={mots ? "words" : "none"}
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
