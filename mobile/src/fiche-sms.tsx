// La fiche d'un SMS — une feuille, jamais un écran entier.
//
// L'essentiel en tête, les détails, le message d'origine, et UN geste
// principal choisi par la nature du message. Le reçu ne se propose que pour
// un mouvement d'argent : un reçu atteste d'argent, pas d'une publicité.
//
// Les règles — quelle catégorie fait foi, qui a droit à un reçu, et surtout
// le masquage des codes à usage unique — viennent de `@noyau/sms`, partagées
// avec la plateforme et tenues par des tests. Ici, seulement le dessin.

import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { Feuille } from "@/feuille";
import { Carte, Filet, Texte, appuiTexte, avecAppui } from "@/ui";
import { nouvelleCle, useGesteUnique } from "@/geste";
import { Icone, type NomIcone } from "@/icones";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { nomDeFichier, partagerDocument } from "@/partage";
import {
  definirNature, deposerCommande, lienRecu, lireCommande, marquerLu, recuDuSms,
} from "@/api/guichet";
import { useMaintenant, useRetouche } from "@/donnees";
import { useLangue } from "@/langue";
import { NATURES } from "@noyau/natures";
import { libelleJour } from "@noyau/periodes";
import {
  categorieDe, estArgent, etatDeLaReponseRecu, FENETRE_DU_RECU_MS,
  ICONE_CATEGORIE, LONG_MESSAGE, recuAttendu, texteSurEcran,
} from "@noyau/sms";
import { textesSms } from "@noyau/textes/sms";
import {
  FUSEAU_DEFAUT, fcfa, jourLocal, type Categorie, type Paiement,
} from "@noyau/types";

const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Les schémas de couleur des étiquettes : vert pour l'argent qui entre,
 *  ambre pour ce qui mérite un coup d'œil. Le reste demeure neutre — une
 *  sortie d'argent n'est pas un danger, c'est le métier. */
const SCHEMA: Partial<Record<Categorie, { fond: string; encre: string }>> = {
  encaissement: { fond: "#cff7d3", encre: "#02542d" },
  depot: { fond: "#cff7d3", encre: "#02542d" },
  publicite: { fond: "#fff1c2", encre: "#522504" },
  echec: { fond: "#fff1c2", encre: "#522504" },
  illisible: { fond: "#fff1c2", encre: "#522504" },
};

export function couleursCategorie(c: Categorie) {
  return SCHEMA[c] ?? { fond: couleurs.surface2, encre: couleurs.encreDouce };
}

export const icone = (c: Categorie) => ICONE_CATEGORIE[c] as NomIcone;

export function FicheSms({ paiement: p, onFermer, onChange, onRetouche, fuseau }: {
  paiement: Paiement;
  onFermer: () => void;
  /** Après un changement (SMS lu, nature posée, reçu établi) : relire EN
   *  SILENCE — `actualiser()` du cahier, jamais `recharger()`. La roue
   *  n'appartient qu'au doigt qui tire ; un geste dans une fiche qui la
   *  faisait tourner faisait aussi descendre tout l'écran sur iPhone. */
  onChange?: () => void;
  /** Ce que la fiche vient de changer, pour un écran qui tient sa PROPRE
   *  copie des SMS (la période demandée à part par la boîte de réception).
   *  Le cahier, lui, est retouché ici même. */
  onRetouche?: (id: string, champs: Partial<Paiement>) => void;
  /** Le fuseau de la caisse — celui qui dit si ce SMS est d'aujourd'hui. */
  fuseau?: string;
}) {
  const langue = useLangue();
  const t = textesSms[langue];
  const aujourdhui = jourLocal(new Date(useMaintenant()), fuseau || FUSEAU_DEFAUT);
  // Une clé de jour illisible (une plateforme d'avant `jour`) ne fait pas
  // tomber la fiche : on retombe sur ce que la plateforme avait écrit.
  const jourDit = /^\d{4}-\d{2}-\d{2}$/.test(p.jour ?? "")
    ? libelleJour(p.jour, aujourdhui, langue) : p.date;

  const [nature, setNature] = useState(p.nature);
  const [choisirType, setChoisirType] = useState(false);
  const [etabli, setEtabli] = useState<"repos" | "envoi" | "fait" | "refus">("repos");
  const [deplie, setDeplie] = useState(false);

  // LA FICHE FERMÉE NE PARLE PLUS. Elle attendait le terminal (« Demande au
  // terminal… », trente secondes), un lien de reçu, une réponse : on la
  // refermait, et quelques secondes plus tard le téléphone VIBRAIT, la
  // liste derrière se rechargeait, ou la feuille de partage s'ouvrait
  // par-dessus un autre écran — pour un geste qu'on croyait abandonné.
  // Chaque attente est donc suivie de la même question : la fiche est-elle
  // encore là ? Sinon, le silence — ni vibration, ni relecture, ni partage.
  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => { vivant.current = false; };
  }, []);

  // CE QUE LA FICHE SAIT, LA LISTE LE MONTRE TOUT DE SUITE. Un SMS lu, une
  // nature posée, un reçu établi : le cahier est corrigé SUR PLACE, sans
  // attendre la plateforme — c'est la relecture discrète qui suit
  // (`onChange`) qui confirme. Avant, c'était un rechargement complet, avec
  // la roue, pour éteindre un point bleu.
  const retoucheCahier = useRetouche();
  const retoucher = (champs: Partial<Paiement>) => {
    retoucheCahier((d) => {
      const lignes = Array.isArray(d.paiements) ? d.paiements : [];
      if (!lignes.some((x) => x.id === p.id)) return d;
      return { ...d, paiements: lignes.map((x) => (x.id === p.id ? { ...x, ...champs } : x)) };
    });
    onRetouche?.(p.id, champs);
  };

  // Ouvrir la fiche, c'est lire le message : la pastille du menu s'éteint —
  // tout de suite. Un échec ici ne se montre pas : c'est du confort, pas de
  // l'argent, et la relecture suivante remettra le point si la base ne l'a
  // pas retenu.
  useEffect(() => {
    if (!p.nonLu) return;
    retoucher({ nonLu: false });
    marquerLu(Number(p.id))
      .then(() => { if (vivant.current) onChange?.(); })
      .catch(() => {});
    // Une fois par SMS ouvert ; `retoucher` et `onChange` changent à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, p.nonLu]);

  const cat = categorieDe({ ...p, nature });
  const argent = estArgent({ ...p, nature });
  // Le texte du SMS, tel qu'il est arrivé — codes compris, rien de masqué.
  const texte = texteSurEcran(p);
  const long = texte.length > LONG_MESSAGE;
  const schema = couleursCategorie(cat);

  /** Poser une nature : c'est le propriétaire qui sait ce qu'était
   *  l'opération ; le robot n'a que le texte du SMS. Et le reçu SUIT dans
   *  la foulée — établi s'il n'existe pas, refabriqué s'il existe sous une
   *  autre nature : c'est ce que l'aide de l'écran promet, et le web fait
   *  déjà. Sans cela, la liste disait « Retrait » et le PDF déjà émis
   *  disait encore « Reçu de dépôt ». */
  const poserNature = async (n: Categorie | null) => {
    const avant = nature;
    setNature(n as Paiement["nature"]);
    setChoisirType(false);
    // La liste derrière la fiche change d'icône et de couleur TOUT DE SUITE.
    retoucher({ nature: n as Paiement["nature"] });
    try {
      await definirNature(Number(p.id), n);
    } catch {
      // La nature n'est pas retenue : l'écran la rend — jamais une pastille
      // que la base n'a pas, ni dans la fiche ni dans la liste. Et pas de
      // reçu pour un classement raté.
      retoucher({ nature: avant });
      if (vivant.current) setNature(avant);
      return;
    }
    const recuASuivre = n != null && p.sourceId != null
      && (!recu || n !== (avant ?? p.categorie));
    if (!vivant.current) {
      // LA FICHE A ÉTÉ FERMÉE pendant que la base enregistrait la nature.
      // Rien ne se montre plus, rien ne vibre — mais le reçu SUIT quand
      // même : c'est ce que l'aide de l'écran a promis, et un PDF qui dirait
      // encore « Reçu de dépôt » sous un SMS rangé en « Retrait » serait une
      // pièce fausse. La demande part, sa propre clé d'intention avec elle ;
      // le cahier apprendra le numéro à sa prochaine relecture.
      if (recuASuivre && p.sourceId != null) {
        void deposerCommande("recu", { source_id: p.sourceId, nature: n },
                             p.terminal, nouvelleCle())
          .catch(() => {});
      }
      return;
    }
    onChange?.();
    if (recuASuivre) await etablirRecu(n);
  };

  /** Demander le reçu au terminal QUI A REÇU ce SMS — jamais au dernier qui
   *  a donné signe de vie : `sourceId` ne veut rien dire dans un autre
   *  journal, et le reçu porterait sur une autre opération. */
  // PARTAGER le reçu — le geste pour lequel un reçu existe. Le PDF est
  // téléchargé dans le téléphone puis part par la feuille de partage, comme
  // un vrai fichier : WhatsApp reçoit le document, pas un lien vers une
  // page (voir src/partage.ts).
  const [ouverture, setOuverture] = useState<"repos" | "envoi" | "refus">("repos");
  // Le numéro du reçu : celui de la ligne, ou celui que le robot vient de
  // rendre (voir `etablirRecu`).
  const [recu, setRecu] = useState<string | null>(p.recu);

  // LE REÇU QUI ARRIVE TOUT SEUL. Un SMS d'argent tout juste reçu a son
  // reçu en route : le boîtier le dépose sur la plateforme dans les
  // secondes qui suivent. La fiche disait pourtant « Établir le reçu » —
  // le téléphone apprend l'arrivée du SMS, jamais celle du reçu — et l'on
  // refaisait à la main un document déjà en chemin, parfois déjà dans
  // Telegram. Pendant la fenêtre où il doit arriver, la fiche l'ATTEND
  // (« Reçu en préparation… ») et demande à la plateforme, toutes les
  // trois secondes, s'il est là. Bornée : la fenêtre, et la fiche ouverte.
  // Jamais un pouls — fermée ou la fenêtre passée, elle se tait.
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

  const ouvrirRecu = async () => {
    if (!recu || ouverture === "envoi") return;
    setOuverture("envoi");
    try {
      // Un reçu tout juste établi met quelques secondes à être archivé : le
      // premier essai peut tomber avant lui. On réessaie un peu, sans bruit.
      for (let essai = 0; ; essai++) {
        try {
          const { url } = await lienRecu(recu);
          // Fermée entre-temps : la feuille de partage ne s'ouvre pas
          // par-dessus un écran qui n'a rien demandé. Et la question se
          // repose APRÈS le téléchargement du PDF, qui prend plusieurs
          // secondes sur un réseau lent — c'est là qu'on referme la fiche.
          if (!vivant.current) return;
          await partagerDocument(url, nomDeFichier(`Recu-${recu}`, "pdf"), "pdf",
                                 t.partagerRecu, () => vivant.current);
          break;
        } catch (e) {
          if (!vivant.current) return;
          if (essai >= 5) throw e;
          await attendre(2000);
          if (!vivant.current) return;
        }
      }
      if (vivant.current) setOuverture("repos");
    } catch {
      if (vivant.current) setOuverture("refus");
    }
  };

  // La nature VOULUE voyage explicitement quand elle vient d'être choisie :
  // l'état React de ce rendu porte encore l'ancienne valeur.
  // UN SEUL REÇU PAR APPUI. Le bouton se grisait sur un état React, qui ne
  // change qu'au rendu SUIVANT : deux appuis rapprochés lisaient tous les
  // deux « repos » et déposaient tous les deux leur commande. Deux reçus pour
  // un seul encaissement, deux numéros de référence — et les numéros de reçu
  // se cognent. Le verrou de `useGesteUnique` se ferme à l'instant de
  // l'appui ; la clé d'intention pare l'autre cas, celui où la réponse s'est
  // perdue et où la personne recommence de bonne foi.
  const gesteRecu = useGesteUnique();

  // « Refaire » SANS rien changer : le boîtier rend le document en place,
  // tout de suite, sans le refabriquer — et c'est LUI qui le dit (« déjà à
  // jour »), après avoir comparé l'empreinte du document. La fiche le
  // déduisait de l'égalité des numéros ; or un document refait (identité
  // des Réglages, autre langue) garde son numéro.
  const [dejaAJour, setDejaAJour] = useState(false);
  const etablirRecu = (natureVoulue?: Categorie) => gesteRecu.lancer(async (cle) => {
    if (p.sourceId == null) return;
    const natureDemandee = natureVoulue ?? nature;
    setDejaAJour(false);
    setEtabli("envoi");
    // Chaque `return;` sans verdict ci-dessous est la fiche FERMÉE : un
    // silence, que `useGesteUnique` ne traduit en aucune vibration. La
    // demande, elle, est déjà partie — le terminal fabrique le reçu, et la
    // prochaine relecture du cahier en rapporte le numéro.
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
          // numéro y est. La fiche peut donc proposer le partage TOUT DE
          // SUITE — elle demandait avant de la refermer et de la rouvrir.
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

  return (
    <Feuille
      visible
      libelleFermer={t.fermerFiche}
      onFermer={onFermer}
      entete={
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
            <View style={{
              paddingHorizontal: espaces.sm, paddingVertical: 3,
              borderRadius: rayons.petit, backgroundColor: schema.fond,
              flexDirection: "row", alignItems: "center", gap: espaces.xs,
            }}>
              <Icone nom={icone(cat)} taille={13} couleur={schema.encre} />
              <Texte taille={textes.legende} poids="moyen" style={{ color: schema.encre }}>
                {t.cat[cat]}
              </Texte>
            </View>
            <Texte taille={textes.legende} ton="pale" chiffresAlignes>{p.sim}</Texte>
          </View>
          {/* ON TRONQUE DANS UNE LISTE, JAMAIS DANS UNE FICHE.
              Dans la boîte de réception, les lignes doivent s'aligner : un
              nom trop long se coupe, et c'est juste. Ici, on a OUVERT la
              fiche — pour tout voir. « NKENGAFAC MBOUNGOU J… » ne dit pas
              qui a payé, et c'est justement la question qu'on se pose en
              ouvrant. Le nom passe donc à la ligne.
              « Deux lignes suffisent à tout nom d'état civil », disait ce
              commentaire — et c'était faux pour les RAISONS SOCIALES, qui
              sont justement les gros clients : « NKENGAFAC MBOUNGOU
              JEANNE-CLAIRE EPSE … » sur un téléphone de 360 points. Le nom
              passe donc en entier ; long, il se fait plus petit, pour que
              l'en-tête ne pousse pas le contenu hors de l'écran.
              `verifier-l-affichage` refuse tout texte abrégé dans une fiche. */}
          <Texte taille={(p.tiers || p.nom).length > 32 ? textes.corps + 1 : textes.intertitre}
                 poids="demi" selectable style={{ marginTop: espaces.xs }}>
            {p.tiers || p.nom}
          </Texte>
        </>
      }
      pied={
        argent && (p.recu || p.sourceId != null) ? (
          <View style={{ gap: espaces.sm }}>
            {/* LE GESTE PRINCIPAL suit ce qui existe. Un reçu déjà établi
                s'OUVRE — c'est pour être montré et partagé qu'il existe, et
                c'est ce que ce bouton ne savait pas faire : il redemandait
                la fabrication au terminal, et le PDF restait inaccessible.
                Sans reçu, on l'ÉTABLIT, comme avant. */}
            {/* LE SUCCÈS SE DISAIT PAR RIEN DU TOUT. `p` est un cliché :
                après « faite », le rafraîchissement met à jour la LISTE,
                mais la fiche ouverte garde l'ancien paiement, donc `p.recu`
                reste nul. Le bouton reprenait donc son libellé « Établir le
                reçu » après trente secondes d'attente — indiscernable d'un
                échec, sauf qu'un échec, lui, affiche une ligne rouge. Et
                comme il restait actif, le geste naturel — réappuyer —
                déposait une SECONDE commande pour le même SMS. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => void (recu ? ouvrirRecu() : etablirRecu())}
              disabled={ouverture === "envoi" || etabli === "envoi" || enPreparation
                        || gesteRecu.occupe || (!recu && etabli === "fait")}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "center",
                gap: espaces.sm, paddingVertical: espaces.md,
                borderRadius: rayons.bouton,
                backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
              })}
            >
              <Icone nom={recu ? "Partage" : "Doc"} taille={17} couleur={couleurs.surfaceHaute} />
              {/* `flexShrink` : un libellé long se replie DANS le bouton.
                  Sans lui, il poussait l'icône hors du bouton, à gauche. */}
              <Texte poids="demi" taille={textes.petit} numberOfLines={2}
                     style={{ color: couleurs.surfaceHaute, flexShrink: 1, textAlign: "center" }}>
                {recu
                  ? (ouverture === "envoi" ? t.preparationRecu : t.partagerRecu)
                  : enPreparation ? t.recuEnPreparation
                  : etabli === "envoi" ? t.demandeAuTerminal
                  : etabli === "fait" ? t.recuEtabli
                  : t.etablirRecu}
              </Texte>
            </Pressable>

            {/* REFAIRE le reçu : le second geste, discret. Il sert quand la
                nature vient d'être rechoisie — même numéro, document neuf. */}
            {recu && p.sourceId != null ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void etablirRecu()}
                disabled={etabli === "envoi" || gesteRecu.occupe}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: espaces.sm, paddingVertical: espaces.md,
                  borderRadius: rayons.bouton, borderWidth: 1,
                  borderColor: couleurs.trait,
                  backgroundColor: pressed ? couleurs.surface2 : "transparent",
                })}
              >
                <Texte poids="moyen" taille={textes.petit} ton="doux"
                       style={{ flexShrink: 1, textAlign: "center" }}>
                  {etabli === "envoi" ? t.demandeAuTerminal
                    // Établi pour la première fois, ou refait : deux mots.
                    : etabli === "fait"
                      ? (dejaAJour ? t.recuDejaAJour
                        : p.recu ? t.regenerationFaite : t.recuEtabli)
                    : t.refaireRecu}
                </Texte>
              </Pressable>
            ) : null}

            {etabli === "refus" ? (
              <Texte taille={textes.legende} ton="negatif">{t.terminalMuet}</Texte>
            ) : null}
            {ouverture === "refus" ? (
              <Texte taille={textes.legende} ton="negatif">{t.lienRecuImpossible}</Texte>
            ) : null}
          </View>
        ) : null
      }
    >
      {/* Le montant, s'il y en a un. C'est ce qu'on vient vérifier. */}
      {p.montant != null ? (
        <View style={{ alignItems: "center", paddingVertical: espaces.sm }}>
          <Texte taille={32} poids="demi" chiffresAlignes
                 ton={p.sens === "in" ? "positif" : p.sens === "out" ? "negatif" : "normal"}>
            {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant, langue)}
          </Texte>
          {p.sens === "?" ? (
            <Texte taille={textes.legende} ton="alerte" style={{ marginTop: espaces.xs }}>
              {t.sensAConfirmer}
            </Texte>
          ) : null}
        </View>
      ) : null}

      {/* Les détails. */}
      <Carte>
        {/* LE JOUR SE DIT ICI, À L'HEURE DE L'ÉCRAN. `p.date` est écrit par
            la plateforme au moment où elle répond, et rangé tel quel dans le
            cahier : relu le lendemain matin, un paiement d'hier disait
            « Aujourd'hui à 18:32 ». */}
        <Rangee libelle={t.date} valeur={t.dateEtHeure(jourDit, p.heure)} />
        {p.numero ? <><Filet /><Rangee libelle={t.numero} valeur={p.numero} /></> : null}
        {p.reference ? <><Filet /><Rangee libelle={t.reference} valeur={p.reference} /></> : null}
        {p.soldeApres != null ? (
          <><Filet /><Rangee libelle={t.soldeApres} valeur={fcfa(p.soldeApres, langue)} /></>
        ) : null}
      </Carte>

      {/* Le type, que le propriétaire peut corriger — c'est lui qui sait. */}
      {argent ? (
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.legende} ton="pale"
                 style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
            {t.typeTitre}
          </Texte>
          {choisirType ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
              {NATURES.map((n) => (
                <Pressable
                           accessibilityRole="button" key={n} onPress={() => poserNature(n)}
                           style={avecAppui({
                             flexDirection: "row", alignItems: "center", gap: espaces.xs,
                             paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                             borderRadius: rayons.rond,
                             borderWidth: nature === n ? 0 : 1, borderColor: couleurs.trait,
                             backgroundColor: nature === n ? couleurs.accent : couleurs.surfaceHaute,
                           })}>
                  <Icone nom={icone(n)} taille={14}
                         couleur={nature === n ? couleurs.surfaceHaute : couleurs.encreDouce} />
                  <Texte taille={textes.petit} poids="moyen" ton={nature === n ? "normal" : "doux"}
                         style={nature === n ? { color: couleurs.surfaceHaute } : undefined}>
                    {t.cat[n]}
                  </Texte>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable
                       accessibilityRole="button" onPress={() => setChoisirType(true)}
                       style={({ pressed }) => ({
                         flexDirection: "row", alignItems: "center", gap: espaces.sm,
                         padding: espaces.lg, borderRadius: rayons.carte,
                         borderWidth: 1, borderColor: couleurs.trait,
                         backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
                       })}>
              <Icone nom={icone(cat)} taille={17} couleur={couleurs.encreDouce} />
              <Texte style={{ flex: 1 }}>{t.cat[cat]}</Texte>
              <Texte taille={textes.petit} ton="doux">{t.modifierType}</Texte>
            </Pressable>
          )}
          <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
            {t.natureAide}
          </Texte>
        </View>
      ) : null}

      {/* Le message d'origine, mot pour mot. C'est la preuve. */}
      <View style={{ gap: espaces.sm }}>
        <Texte taille={textes.legende} ton="pale"
               style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
          {t.messageRecu}
        </Texte>
        <View style={{
          backgroundColor: couleurs.surface2, borderRadius: rayons.carte,
          padding: espaces.lg,
        }}>
          <Texte style={{ lineHeight: 23 }}
                 numberOfLines={long && !deplie ? 6 : undefined}>
            {texte}
          </Texte>
        </View>
        {long ? (
          <Pressable accessibilityRole="button" onPress={() => setDeplie((d) => !d)}
                     hitSlop={8} style={appuiTexte}>
            <Texte taille={textes.petit} ton="doux" poids="moyen">
              {deplie ? t.replierMessage : t.toutLeMessage}
            </Texte>
          </Pressable>
        ) : null}
      </View>
    </Feuille>
  );
}

/** Une ligne « libellé · valeur » de la fiche.
 *
 *  LA VALEUR NE SE COUPE PAS. Elle portait `numberOfLines={1}` : la
 *  RÉFÉRENCE de l'opérateur — « PP240829.1042.A31245 » — s'affichait
 *  tronquée. Or c'est exactement le numéro qu'on recopie pour réclamer
 *  auprès de MTN ou d'Orange quand une opération est contestée. Une
 *  référence coupée ne sert à rien ; elle donne même l'illusion de l'avoir.
 *
 *  Elle est aussi SÉLECTIONNABLE : un appui long la copie. C'était la seule
 *  façon de la sortir de l'application, et il n'y en avait aucune. */
function Rangee({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: espaces.md,
                   padding: espaces.lg }}>
      <Texte taille={textes.petit} ton="doux">{libelle}</Texte>
      <Texte taille={textes.petit} chiffresAlignes selectable
             style={{ flex: 1, textAlign: "right" }}>
        {valeur}
      </Texte>
    </View>
  );
}
