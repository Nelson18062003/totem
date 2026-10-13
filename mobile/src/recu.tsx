// LE REÇU D'UN SMS D'ARGENT — un seul système, dans chaque fiche.
//
// Il vivait dans la fiche d'un SMS, et nulle part ailleurs : la fiche d'un
// paiement (l'onglet Paiements) n'avait pas de PDF. « Pourquoi il n'est
// plus le PDF ? C'est hyper important sur chaque transaction », a dit le
// propriétaire. Le même code sert maintenant les deux fiches : établir,
// attendre celui qui arrive tout seul, PARTAGER (le geste pour lequel un
// reçu existe), VOIR, TÉLÉCHARGER, REFAIRE.
//
// Les leçons écrites dans la fiche du SMS suivent le code :
//
//   — LA FICHE FERMÉE NE PARLE PLUS. Chaque attente (le terminal, un lien,
//     un téléchargement) est suivie de la même question : la fiche est-elle
//     encore là ? Sinon, le silence — ni vibration, ni partage par-dessus un
//     autre écran.
//   — UN SEUL REÇU PAR APPUI (`useGesteUnique`), et une clé d'intention :
//     deux appuis rapprochés ne déposent pas deux commandes.
//   — LE REÇU QUI ARRIVE TOUT SEUL s'attend, il ne se refait pas (voir
//     `recuAttendu`).
//   — « DÉJÀ À JOUR », c'est le boîtier qui le dit, après avoir comparé
//     l'empreinte du document — jamais l'égalité des numéros.

import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { Texte } from "@/ui";
import { nouvelleCle, useGesteUnique } from "@/geste";
import { Icone, type NomIcone } from "@/icones";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { enregistrerDocument, nomDeFichier, partagerDocument, voirDocument } from "@/partage";
import { deposerCommande, lienRecu, lireCommande, recuDuSms } from "@/api/guichet";
import { useRetouche } from "@/donnees";
import { etatDeLaReponseRecu, FENETRE_DU_RECU_MS, recuACherche, recuAttendu } from "@noyau/sms";
import { textesSms } from "@noyau/textes/sms";
import type { Categorie, Paiement } from "@noyau/types";
import type { Langue } from "@noyau/langue";

const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Ce que la fiche fait de son reçu. */
export type Recu = ReturnType<typeof useRecu>;

/**
 * L'état et les gestes du reçu d'un SMS.
 *
 * `nature` — celle que la fiche affiche (le choix du propriétaire, s'il en
 * a posé un) : c'est elle qui donne son titre au document.
 * `onChange` — relire EN SILENCE après un changement (`actualiser()` du
 * cahier, jamais `recharger()` : la roue n'appartient qu'au doigt).
 * `onRetouche` — pour un écran qui tient sa PROPRE copie des SMS (une
 * période demandée à part) ; le cahier, lui, est retouché ici même.
 */
export function useRecu(p: Paiement, { nature, onChange, onRetouche }: {
  nature?: Categorie | null;
  onChange?: () => void;
  onRetouche?: (id: string, champs: Partial<Paiement>) => void;
}) {
  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => { vivant.current = false; };
  }, []);

  // CE QUE LA FICHE SAIT, LA LISTE LE MONTRE TOUT DE SUITE : le cahier est
  // corrigé SUR PLACE, la relecture discrète qui suit confirme.
  const retoucheCahier = useRetouche();
  const retoucher = (champs: Partial<Paiement>) => {
    retoucheCahier((d) => {
      const lignes = Array.isArray(d.paiements) ? d.paiements : [];
      if (!lignes.some((x) => x.id === p.id)) return d;
      return { ...d, paiements: lignes.map((x) => (x.id === p.id ? { ...x, ...champs } : x)) };
    });
    onRetouche?.(p.id, champs);
  };

  const [etabli, setEtabli] = useState<"repos" | "envoi" | "fait" | "refus">("repos");
  // Le geste en cours sur le document lui-même : partager, voir, télécharger.
  const [ouverture, setOuverture] = useState<{ geste: GesteDocument | null; refus: boolean;
                                               enregistre: boolean }>(
    { geste: null, refus: false, enregistre: false });
  // Le numéro du reçu : celui de la ligne, ou celui que le robot vient de
  // rendre (voir `etablir`).
  const [recu, setRecu] = useState<string | null>(p.recu);

  // LE REÇU QUI ARRIVE TOUT SEUL. Un SMS d'argent tout juste reçu a son
  // reçu en route : le boîtier le dépose dans les secondes qui suivent.
  // Pendant la fenêtre où il doit arriver, la fiche l'ATTEND et demande à la
  // plateforme, toutes les trois secondes, s'il est là. Bornée : la
  // fenêtre, et la fiche ouverte. Jamais un pouls.
  const [attendu, setAttendu] = useState(() => recuAttendu(p, Date.now()));
  useEffect(() => {
    if (!attendu || recu) return;
    const fin = Date.parse(p.recuLe) + FENETRE_DU_RECU_MS;
    const renoncer = new AbortController();
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const guetter = async () => {
      if (renoncer.signal.aborted) return;
      const n = await recuDuSms(Number(p.id), renoncer.signal).catch(() => null);
      if (renoncer.signal.aborted) return;
      if (n) {
        setRecu(n);
        retoucher({ recu: n });
        setAttendu(false);
        return;
      }
      if (Date.now() >= fin) { setAttendu(false); return; }
      minuterie = setTimeout(guetter, Math.min(3000, Math.max(0, fin - Date.now())));
    };
    void guetter();
    return () => { renoncer.abort(); if (minuterie) clearTimeout(minuterie); };
    // Une fois par SMS ouvert ; `retoucher` change à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, attendu]);
  const enPreparation = attendu && !recu && etabli === "repos";

  // LE REÇU QUI EXISTE DÉJÀ. La liste ne connaît que les reçus récents :
  // un paiement d'avril, sur une caisse qui tourne depuis des mois, arrivait
  // ici sans son numéro, et la fiche proposait « Établir le reçu » pour un
  // document établi depuis longtemps (voir `recuACherche`). Elle le demande
  // UNE fois, en ouvrant ; pendant ce temps, le bouton dit qu'elle cherche —
  // un appui ne déposerait qu'une commande inutile. Introuvable, ou pas de
  // réseau : « Établir le reçu », comme avant — et le boîtier, qui a le
  // document, rend celui qui existe sans le refaire.
  const [cherche, setCherche] = useState(() => recuACherche(
    nature !== undefined ? { ...p, nature } : p, Date.now()));
  useEffect(() => {
    if (!cherche) return;
    const renoncer = new AbortController();
    recuDuSms(Number(p.id), renoncer.signal)
      .then((n) => {
        if (renoncer.signal.aborted || !n) return;
        setRecu((avant) => avant ?? n);
        retoucher({ recu: n });
      })
      .catch(() => {})
      .finally(() => { if (!renoncer.signal.aborted) setCherche(false); });
    return () => renoncer.abort();
    // Une fois par SMS ouvert ; `retoucher` change à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, cherche]);
  const enRecherche = cherche && !recu && etabli === "repos";

  /** Le document lui-même : le lien signé, puis le geste demandé. */
  const document = async (geste: GesteDocument, titre: string) => {
    if (!recu || ouverture.geste) return;
    setOuverture({ geste, refus: false, enregistre: false });
    try {
      // Un reçu tout juste établi met quelques secondes à être archivé : le
      // premier essai peut tomber avant lui. On réessaie un peu, sans bruit.
      let issue: string | undefined;
      for (let essai = 0; ; essai++) {
        try {
          const { url } = await lienRecu(recu);
          // Fermée entre-temps : rien ne s'ouvre par-dessus un écran qui
          // n'a rien demandé. Et la question se repose APRÈS le
          // téléchargement, qui prend plusieurs secondes sur un réseau lent.
          if (!vivant.current) return;
          const nom = nomDeFichier(`Recu-${recu}`, "pdf");
          if (geste === "voir") await voirDocument(url);
          else if (geste === "telecharger") {
            issue = await enregistrerDocument(url, nom, "pdf", titre, () => vivant.current);
          } else await partagerDocument(url, nom, "pdf", titre, () => vivant.current);
          break;
        } catch (e) {
          if (!vivant.current) return;
          if (essai >= 5) throw e;
          await attendre(2000);
          if (!vivant.current) return;
        }
      }
      // « Enregistré » ne se dit que d'un fichier ÉCRIT dans un dossier
      // choisi — pas d'une feuille de partage qu'on a pu refermer.
      if (vivant.current) {
        setOuverture({ geste: null, refus: false,
                       enregistre: geste === "telecharger" && issue === "fichier" });
      }
    } catch {
      if (vivant.current) setOuverture({ geste: null, refus: true, enregistre: false });
    }
  };

  // UN SEUL REÇU PAR APPUI. Le verrou de `useGesteUnique` se ferme à
  // l'instant de l'appui ; la clé d'intention pare la réponse perdue, où la
  // personne recommence de bonne foi.
  const gesteRecu = useGesteUnique();

  // « Refaire » SANS rien changer : le boîtier rend le document en place,
  // tout de suite, et c'est LUI qui dit « déjà à jour ».
  const [dejaAJour, setDejaAJour] = useState(false);
  /** Établir (ou refaire) le reçu. La nature VOULUE voyage explicitement
   *  quand elle vient d'être choisie : l'état React de ce rendu porte encore
   *  l'ancienne valeur. */
  const etablir = (natureVoulue?: Categorie | null) => gesteRecu.lancer(async (cle) => {
    if (p.sourceId == null) return;
    const natureDemandee = natureVoulue ?? nature;
    setDejaAJour(false);
    setEtabli("envoi");
    // Chaque `return;` sans verdict ci-dessous est la fiche FERMÉE : un
    // silence. La demande, elle, est déjà partie — le terminal fabrique le
    // reçu, et la prochaine relecture du cahier en rapporte le numéro.
    try {
      const { id } = await deposerCommande(
        "recu", { source_id: p.sourceId, nature: natureDemandee ?? undefined },
        p.terminal, cle);
      if (!vivant.current) return;
      for (let i = 0; i < 25; i++) {
        await attendre(1200);
        if (!vivant.current) return;
        const c = await lireCommande(id).catch(() => null);
        if (!vivant.current) return;
        if (c?.etat === "faite") {
          // Le robot répond « Reçu TM-2026-1003-1193 en fabrication… » : le
          // numéro y est, et le partage se propose TOUT DE SUITE.
          const n = /\bT[A-Z]-\d{4}-\d{4}-\d+\b/.exec(c.resultat ?? "")?.[0];
          if (n) { setRecu(n); retoucher({ recu: n }); }
          setDejaAJour(etatDeLaReponseRecu(c.resultat) === "inchange");
          setEtabli("fait"); onChange?.(); return true;
        }
        if (c?.etat === "echouee") { setEtabli("refus"); return false; }
      }
      // Vingt-cinq essais, trente secondes : le terminal n'a pas répondu.
      setEtabli("refus");
      return false;
    } catch {
      if (!vivant.current) return;
      setEtabli("refus");
      return false;
    }
  });

  /** La demande part même fiche fermée — sa propre clé avec elle. Sert à la
   *  fiche du SMS quand la nature est rechoisie après la fermeture. */
  const etablirEnSilence = (n: Categorie | null) => {
    if (p.sourceId == null) return;
    void deposerCommande("recu", { source_id: p.sourceId, nature: n ?? undefined },
                         p.terminal, nouvelleCle()).catch(() => {});
  };

  return {
    vivant, retoucher, recu, enPreparation, enRecherche, etabli, ouverture, dejaAJour,
    occupe: gesteRecu.occupe, etablir, etablirEnSilence,
    partager: (titre: string) => document("partager", titre),
    voir: (titre: string) => document("voir", titre),
    telecharger: (titre: string) => document("telecharger", titre),
  };
}

type GesteDocument = "partager" | "voir" | "telecharger";

/**
 * LES GESTES DU REÇU, au pied d'une fiche. Le geste principal suit ce qui
 * existe : un reçu établi se PARTAGE — c'est pour cela qu'il existe ; sans
 * reçu, on l'ÉTABLIT. Dessous, trois gestes courts : voir, télécharger,
 * refaire.
 *
 * LE SUCCÈS SE DIT. Après « faite », la fiche ouverte garde l'ancien
 * paiement (un cliché) : le bouton disait de nouveau « Établir le reçu »,
 * indiscernable d'un échec — et réappuyer déposait une SECONDE commande.
 * L'état du reçu vit donc ici, pas dans le cliché.
 */
export function PiedRecu({ r, p, langue }: { r: Recu; p: Paiement; langue: Langue }) {
  const t = textesSms[langue];
  const { recu, etabli, ouverture, enPreparation, enRecherche } = r;
  const occupe = ouverture.geste != null;
  return (
    <View style={{ gap: espaces.sm }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => void (recu ? r.partager(t.partagerRecu) : r.etablir())}
        disabled={occupe || etabli === "envoi" || enPreparation || enRecherche
                  || r.occupe || (!recu && etabli === "fait")}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", justifyContent: "center",
          gap: espaces.sm, paddingVertical: espaces.md,
          borderRadius: rayons.bouton,
          backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
        })}
      >
        <Icone nom={recu ? "Partage" : "Doc"} taille={17} couleur={couleurs.surfaceHaute} />
        {/* `flexShrink` : un libellé long se replie DANS le bouton. */}
        <Texte poids="demi" taille={textes.petit} numberOfLines={2}
               style={{ color: couleurs.surfaceHaute, flexShrink: 1, textAlign: "center" }}>
          {recu
            ? (ouverture.geste === "partager" ? t.preparationRecu : t.partagerRecu)
            : enPreparation ? t.recuEnPreparation
            : enRecherche ? t.rechercheDuRecu
            : etabli === "envoi" ? t.demandeAuTerminal
            : etabli === "fait" ? t.recuEtabli
            : t.etablirRecu}
        </Texte>
      </Pressable>

      {/* VOIR, TÉLÉCHARGER, REFAIRE : trois gestes courts, de même poids.
          « Refaire » sert quand la nature vient d'être rechoisie — même
          numéro, document neuf ; sans rien changer, le boîtier dit « déjà
          à jour ». */}
      {recu ? (
        <View style={{ flexDirection: "row", gap: espaces.sm }}>
          {/* Celui qui travaille garde sa couleur et prend « … » ; les
              autres s'éteignent le temps qu'il finisse. */}
          <GesteCourt icone="Eye" libelle={t.voirRecuCourt} enCours={ouverture.geste === "voir"}
                      desactive={occupe && ouverture.geste !== "voir"}
                      onPress={() => void r.voir(t.partagerRecu)} />
          <GesteCourt icone="Download" libelle={t.telechargerRecuCourt}
                      enCours={ouverture.geste === "telecharger"}
                      desactive={occupe && ouverture.geste !== "telecharger"}
                      onPress={() => void r.telecharger(t.telechargerRecu)} />
          {p.sourceId != null ? (
            <GesteCourt icone="Refresh" libelle={t.refaireRecuCourt} enCours={etabli === "envoi"}
                        desactive={etabli !== "envoi" && (r.occupe || occupe)}
                        onPress={() => void r.etablir()} />
          ) : null}
        </View>
      ) : null}

      {/* Ce que le dernier geste a donné, en une ligne. */}
      {etabli === "fait" && recu ? (
        <Texte taille={textes.legende} ton="positif" style={{ textAlign: "center" }}>
          {r.dejaAJour ? t.recuDejaAJour : p.recu ? t.regenerationFaite : t.recuEtabli}
        </Texte>
      ) : null}
      {ouverture.enregistre ? (
        <Texte taille={textes.legende} ton="positif" style={{ textAlign: "center" }}>
          {t.recuEnregistre}
        </Texte>
      ) : null}
      {etabli === "refus" ? (
        <Texte taille={textes.legende} ton="negatif">{t.terminalMuet}</Texte>
      ) : null}
      {ouverture.refus ? (
        <Texte taille={textes.legende} ton="negatif">{t.lienRecuImpossible}</Texte>
      ) : null}
    </View>
  );
}

/** Un geste court : une icône, et son nom DESSOUS — trois côte à côte
 *  tiennent ainsi sur le plus petit téléphone sans couper « Télécharger ».
 *  Éteint, il SE VOIT éteint : un bouton qui a l'air vivant et ne répond
 *  pas est un mensonge. */
function GesteCourt({ icone, libelle, onPress, desactive, enCours }: {
  icone: NomIcone; libelle: string; onPress: () => void; desactive?: boolean; enCours?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={libelle}
      accessibilityState={{ disabled: !!(desactive || enCours), busy: !!enCours }}
      disabled={desactive || enCours} onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, alignItems: "center", justifyContent: "center",
        gap: 4, paddingVertical: espaces.sm, paddingHorizontal: espaces.xs,
        borderRadius: rayons.bouton, borderWidth: 1, borderColor: couleurs.trait,
        opacity: desactive ? 0.4 : 1,
        backgroundColor: pressed || enCours ? couleurs.surface2 : "transparent",
      })}
    >
      <Icone nom={icone} taille={18} couleur={couleurs.encre} />
      <Texte poids="moyen" taille={textes.legende} ton="doux" style={{ textAlign: "center" }}>
        {enCours ? `${libelle}…` : libelle}
      </Texte>
    </Pressable>
  );
}
