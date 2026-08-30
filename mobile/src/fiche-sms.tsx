// La fiche d'un SMS — une feuille, jamais un écran entier.
//
// L'essentiel en tête, les détails, le message d'origine, et UN geste
// principal choisi par la nature du message. Le reçu ne se propose que pour
// un mouvement d'argent : un reçu atteste d'argent, pas d'une publicité.
//
// Les règles — quelle catégorie fait foi, qui a droit à un reçu, et surtout
// le masquage des codes à usage unique — viennent de `@noyau/sms`, partagées
// avec la plateforme et tenues par des tests. Ici, seulement le dessin.

import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Feuille } from "@/feuille";
import { Carte, Filet, Texte } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import * as Navigateur from "expo-web-browser";
import {
  definirNature, deposerCommande, lienRecu, lireCommande, marquerLu,
} from "@/api/guichet";
import { useLangue } from "@/langue";
import { NATURES } from "@noyau/natures";
import {
  categorieDe, estArgent, ICONE_CATEGORIE, LONG_MESSAGE, texteSurEcran,
} from "@noyau/sms";
import { textesSms } from "@noyau/textes/sms";
import { fcfa, type Categorie, type Paiement } from "@noyau/types";

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

export function FicheSms({ paiement: p, onFermer, onChange }: {
  paiement: Paiement;
  onFermer: () => void;
  /** Après un changement (nature posée, reçu établi) : relire les données. */
  onChange?: () => void;
}) {
  const langue = useLangue();
  const t = textesSms[langue];

  const [nature, setNature] = useState(p.nature);
  const [choisirType, setChoisirType] = useState(false);
  const [etabli, setEtabli] = useState<"repos" | "envoi" | "fait" | "refus">("repos");
  const [deplie, setDeplie] = useState(false);

  // Ouvrir la fiche, c'est lire le message : la pastille du menu s'éteint.
  // Un échec ici ne se montre pas — c'est du confort, pas de l'argent.
  useEffect(() => {
    if (p.nonLu) marquerLu(Number(p.id)).then(() => onChange?.()).catch(() => {});
  }, [p.id, p.nonLu]);

  const cat = categorieDe({ ...p, nature });
  const argent = estArgent({ ...p, nature });
  // Le masque des codes se pose ICI, à l'affichage — pas seulement en base.
  const texte = texteSurEcran(p);
  const long = texte.length > LONG_MESSAGE;
  const schema = couleursCategorie(cat);

  /** Poser une nature : c'est le propriétaire qui sait ce qu'était
   *  l'opération ; le robot n'a que le texte du SMS. */
  const poserNature = async (n: Categorie | null) => {
    setNature(n as Paiement["nature"]);
    setChoisirType(false);
    try {
      await definirNature(Number(p.id), n);
      onChange?.();
    } catch { /* l'écran garde le choix ; la prochaine lecture tranchera */ }
  };

  /** Demander le reçu au terminal QUI A REÇU ce SMS — jamais au dernier qui
   *  a donné signe de vie : `sourceId` ne veut rien dire dans un autre
   *  journal, et le reçu porterait sur une autre opération. */
  // OUVRIR le reçu — le geste pour lequel un reçu existe : le montrer, le
  // partager. Le PDF s'ouvre dans le navigateur du système, muni d'un lien
  // signé de dix minutes (voir web/lib/lien-signe.ts) : de là, le partage
  // d'Android fait le reste — WhatsApp compris.
  const [ouverture, setOuverture] = useState<"repos" | "envoi" | "refus">("repos");
  const ouvrirRecu = async () => {
    if (!p.recu || ouverture === "envoi") return;
    setOuverture("envoi");
    try {
      const { url } = await lienRecu(p.recu);
      await Navigateur.openBrowserAsync(url);
      setOuverture("repos");
    } catch {
      setOuverture("refus");
    }
  };

  const etablirRecu = async () => {
    if (p.sourceId == null) return;
    setEtabli("envoi");
    try {
      const { id } = await deposerCommande(
        "recu", { source_id: p.sourceId, nature: nature ?? undefined }, p.terminal);
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        const c = await lireCommande(id).catch(() => null);
        if (c?.etat === "faite") { setEtabli("fait"); onChange?.(); return; }
        if (c?.etat === "echouee") { setEtabli("refus"); return; }
      }
      setEtabli("refus");
    } catch {
      setEtabli("refus");
    }
  };

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
          <Texte taille={textes.intertitre} poids="demi" numberOfLines={1}
                 style={{ marginTop: espaces.xs }}>
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
            <Pressable
              onPress={p.recu ? ouvrirRecu : etablirRecu}
              disabled={ouverture === "envoi" || etabli === "envoi"}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "center",
                gap: espaces.sm, paddingVertical: espaces.md,
                borderRadius: rayons.bouton,
                backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
              })}
            >
              <Icone nom="Doc" taille={17} couleur={couleurs.surfaceHaute} />
              <Texte poids="demi" taille={textes.petit}
                     style={{ color: couleurs.surfaceHaute }}>
                {p.recu
                  ? (ouverture === "envoi" ? t.ouvertureRecu : t.ouvrirRecu)
                  : (etabli === "envoi" ? t.demandeAuTerminal : t.etablirRecu)}
              </Texte>
            </Pressable>

            {/* REFAIRE le reçu : le second geste, discret. Il sert quand la
                nature vient d'être rechoisie — même numéro, document neuf. */}
            {p.recu && p.sourceId != null ? (
              <Pressable
                onPress={etablirRecu}
                disabled={etabli === "envoi"}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: espaces.sm, paddingVertical: espaces.md,
                  borderRadius: rayons.bouton, borderWidth: 1,
                  borderColor: couleurs.trait,
                  backgroundColor: pressed ? couleurs.surface2 : "transparent",
                })}
              >
                <Texte poids="moyen" taille={textes.petit} ton="doux">
                  {etabli === "envoi" ? t.demandeAuTerminal
                    : etabli === "fait" ? t.regenerationFaite : t.refaireRecu}
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
        <Rangee libelle={t.date} valeur={t.dateEtHeure(p.date, p.heure)} />
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
                <Pressable key={n} onPress={() => poserNature(n)}
                           style={{
                             flexDirection: "row", alignItems: "center", gap: espaces.xs,
                             paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                             borderRadius: rayons.rond,
                             borderWidth: nature === n ? 0 : 1, borderColor: couleurs.trait,
                             backgroundColor: nature === n ? couleurs.accent : couleurs.surfaceHaute,
                           }}>
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
            <Pressable onPress={() => setChoisirType(true)}
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
          <Pressable onPress={() => setDeplie((d) => !d)} hitSlop={8}>
            <Texte taille={textes.petit} ton="doux" poids="moyen">
              {deplie ? t.replierMessage : t.toutLeMessage}
            </Texte>
          </Pressable>
        ) : null}
      </View>
    </Feuille>
  );
}

function Rangee({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md,
                   padding: espaces.lg }}>
      <Texte taille={textes.petit} ton="doux">{libelle}</Texte>
      <Texte taille={textes.petit} chiffresAlignes numberOfLines={1}
             style={{ flex: 1, textAlign: "right" }}>
        {valeur}
      </Texte>
    </View>
  );
}
