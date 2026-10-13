// Les feuilles des Paiements : la fiche d'une transaction, « Corriger », et
// « Que s'est-il passé ? » pour un écart de la suite des soldes.
//
// LA FICHE SE RANGE COMME UN REÇU : le montant en tête, puis qui et quand,
// puis ce que ça a coûté ; le SMS d'origine replié ; le reçu PDF au pied.
// Voir `FicheFlux`.
//
// « CORRIGER » N'ENREGISTRE PAS ENCORE. Le journal signé des corrections est
// une livraison à part ; d'ici là, le bouton est éteint et le dit. Un bouton
// qui ferait semblant d'enregistrer serait un mensonge sur de l'argent.

import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";

import { Carte, ChampTexte, Filet, Texte, avecAppui } from "@/ui";
import { PiedRecu, useRecu } from "@/recu";
import { Icone, type NomIcone } from "@/icones";
import { Feuille } from "@/feuille";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { couleurs, couleurOperateur, espaces, rayons, textes } from "@/theme/jetons";
import { useLangue } from "@/langue";
import { copierTexte } from "@/presse-papiers";
import { textesFlux, NOMS_TYPES, NOMS_CORRECTION } from "@noyau/textes/flux";
import { textesSms } from "@noyau/textes/sms";
import { initialesDe, montantSigne, type Flux, type Ecart, type TypeFlux } from "@noyau/flux";
import { nombre, type Paiement, type Sim } from "@noyau/types";
import { estArgent, texteSurEcran } from "@noyau/sms";
import { formaterNumero } from "@noyau/numero";
import { jourCourt, jourDuReleve } from "@noyau/periodes";

const FOND_ATTENTE = "rgba(151, 81, 2, 0.10)";

/** « MTN ·8901 » → « MTN ». */
export const operateurDe = (libelle: string) => libelle.split(/[\s·]/)[0] || libelle;

/** « aujourd'hui à 14:32 », « hier à 18:05 », « le 3 oct. à 09:10 ». */
export function quandAnnonce(iso: string, heure: string, maintenant: number, fuseau: string,
                             langue: "fr" | "en"): string {
  const j = jourDuReleve(iso, maintenant, fuseau);
  if (!j) return heure;
  if (langue === "en") {
    if (j.genre === "aujourdhui") return `today at ${heure}`;
    if (j.genre === "hier") return `yesterday at ${heure}`;
    return `on ${jourCourt(j.cle, langue)} at ${heure}`;
  }
  if (j.genre === "aujourdhui") return `aujourd'hui à ${heure}`;
  if (j.genre === "hier") return `hier à ${heure}`;
  return `le ${jourCourt(j.cle, langue)} à ${heure}`;
}

/** Le rond d'une transaction : les initiales de la personne, et un point à
 *  la couleur de l'opérateur — une donnée, jamais un aplat. */
export function RondFlux({ f, carteCourte, taille = 40 }: { f: Flux; carteCourte: string; taille?: number }) {
  const attend = f.etat === "a_verifier";
  const initiales = initialesDe(f.p.tiers);
  return (
    <View style={{ width: taille, height: taille }}>
      <View style={{ width: taille, height: taille, borderRadius: rayons.rond,
                     backgroundColor: attend ? FOND_ATTENTE : couleurs.surface2,
                     alignItems: "center", justifyContent: "center" }}>
        {attend ? <Icone nom="Transfer" taille={Math.round(taille * 0.42)} couleur={couleurs.alerte} />
          : initiales ? <Texte taille={Math.round(taille * 0.34)} poids="demi" ton="doux">{initiales}</Texte>
          : <Icone nom="Phone" taille={Math.round(taille * 0.42)} couleur={couleurs.encreDouce} />}
      </View>
      <View style={{ position: "absolute", right: -1, bottom: -1,
                     width: Math.round(taille * 0.32), height: Math.round(taille * 0.32),
                     borderRadius: rayons.rond, backgroundColor: couleurOperateur(operateurDe(carteCourte)),
                     borderWidth: 2, borderColor: couleurs.surfaceHaute }} />
    </View>
  );
}

/** Une rangée de la fiche : le libellé à gauche, la valeur à droite, et ce
 *  qui la précise dessous, en petit. Dans une fiche, on ne coupe jamais. */
function Rangee({ libelle, children, dernier }: { libelle: string; children: React.ReactNode; dernier?: boolean }) {
  return (
    <>
      <View style={{ flexDirection: "row", gap: espaces.md, paddingVertical: espaces.md,
                     paddingHorizontal: espaces.lg, alignItems: "flex-start" }}>
        <Texte taille={textes.petit} ton="pale" style={{ width: 88 }}>{libelle}</Texte>
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end", gap: 2 }}>{children}</View>
      </View>
      {dernier ? null : <Filet />}
    </>
  );
}

/** « Copier », souligné, à côté de ce qu'on recopie le plus : le numéro du
 *  client, la référence qu'on donne à l'opérateur pour réclamer. */
function Copier({ texte, langue }: { texte: string; langue: "fr" | "en" }) {
  const [fait, setFait] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${textesFlux[langue].copier} ${texte}`}
               hitSlop={8}
               onPress={() => { if (copierTexte(texte)) { setFait(true); setTimeout(() => setFait(false), 1500); } }}
               style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <Texte taille={textes.legende} ton={fait ? "positif" : "doux"} poids="moyen"
             style={{ textDecorationLine: fait ? "none" : "underline" }}>
        {fait ? "✓" : textesFlux[langue].copier}
      </Texte>
    </Pressable>
  );
}

/**
 * LA FICHE D'UNE TRANSACTION — rangée comme un reçu.
 *
 * Le propriétaire préférait celle d'avant, « bien organisée, structurée » :
 * le montant en tête, puis une carte où chaque ligne dit une chose. Elle
 * revient, en deux blocs : QUI ET QUAND (la personne et son numéro, la
 * référence, la carte, la date) et CE QUE ÇA A COÛTÉ (les frais, la
 * commission) — ce que le SMS de l'opérateur porte, lu une fois pour toutes.
 *
 * PAS DE SOLDE ICI. « Il voit son solde sur l'écran d'accueil » : le solde
 * après et le solde avant (calculé) chargeaient la fiche sans rien dire de
 * CETTE transaction. Le solde annoncé reste lisible dans le SMS d'origine,
 * mot pour mot — et la suite des soldes continue de veiller sur la liste
 * (les écarts).
 *
 * LE SMS D'ORIGINE SE REPLIE. Ouvert d'office, il prenait la moitié de
 * l'écran « pour rien » : il s'ouvre d'un geste, entier, sélectionnable.
 *
 * LE REÇU AU PIED, toujours à portée du pouce : partager, voir, télécharger,
 * refaire (`recu.tsx`, le même que dans la fiche d'un SMS). « Corriger » et
 * les autres transactions du même numéro ferment la fiche, en bas : on y va
 * après avoir lu, pas avant.
 */
export function FicheFlux({ f, sims, maintenant, fuseau, onFermer, onCorriger, onChange, onRetouche }: {
  f: Flux; sims: Sim[]; maintenant: number; fuseau: string;
  onFermer: () => void; onCorriger: () => void;
  /** Après un reçu établi : relire EN SILENCE (voir `useRecu`). */
  onChange?: () => void;
  /** Pour une période que l'écran tient à part (voir `useRecu`). */
  onRetouche?: (id: string, champs: Partial<Paiement>) => void;
}) {
  const langue = useLangue();
  const t = textesFlux[langue];
  const ts = textesSms[langue];
  const p = f.p;
  const op = operateurDe(p.sim);
  const sim = sims.find((s) => s.iccid === p.carte);
  const [deplie, setDeplie] = useState(false);
  const r = useRecu(p, { nature: p.nature, onChange, onRetouche });
  const entree = f.effet != null && f.effet > 0;
  const sortie = f.effet != null && f.effet < 0;
  const etat = f.etat === "comptee" ? t.reussie : f.etat === "echouee" ? t.echouee : t.aVerifierEtat;
  const tonEtat = f.etat === "comptee" ? "positif" : f.etat === "echouee" ? "pale" : "alerte";
  const quand = quandAnnonce(p.recuLe, p.heure, maintenant, fuseau, langue);
  const date = quand.charAt(0).toUpperCase() + quand.slice(1);
  // L'autre partie : « De » quand l'argent est entré, « À » quand il est
  // sorti, « Avec » quand le sens attend une décision — jamais un sens deviné.
  const qui = entree ? t.de : sortie ? t.a : t.avec;
  // Le SMS tel qu'il est arrivé — codes compris : il est au propriétaire.
  const texte = texteSurEcran(p);
  const couts = p.frais != null || !!p.commission;
  return (
    <Feuille visible libelleFermer={ts.fermer} onFermer={onFermer}
             pied={estArgent(p) && (r.recu || p.sourceId != null)
               ? <PiedRecu r={r} p={p} langue={langue} /> : undefined}
             entete={
               <View style={{ gap: 2 }}>
                 <Texte taille={textes.display} poids="gras" chiffresAlignes
                        ton={f.etat === "a_verifier" ? "alerte" : entree ? "positif" : "normal"}
                        style={f.etat === "echouee" ? { textDecorationLine: "line-through" } : undefined}>
                   {montantSigne(f, langue, nombre)} F
                 </Texte>
                 <Texte ton="doux">
                   {NOMS_TYPES[langue][f.type]} · <Texte poids="demi" ton={tonEtat}>{etat}</Texte>
                 </Texte>
               </View>
             }>
      <View style={{ gap: espaces.md }}>
        {/* QUI ET QUAND. */}
        <Carte style={{ padding: 0 }}>
          {p.tiers || p.numero ? (
            <Rangee libelle={qui}>
              <Texte poids="moyen" style={{ textAlign: "right" }}>{p.tiers || formaterNumero(p.numero)}</Texte>
              {p.numero && p.tiers ? (
                <View style={{ flexDirection: "row", gap: espaces.sm, alignItems: "center" }}>
                  <Texte taille={textes.petit} ton="doux" chiffresAlignes>{formaterNumero(p.numero)}</Texte>
                  <Copier texte={p.numero} langue={langue} />
                </View>
              ) : p.numero ? <Copier texte={p.numero} langue={langue} /> : null}
            </Rangee>
          ) : null}
          {p.reference ? (
            <Rangee libelle={t.reference}>
              <Texte chiffresAlignes selectable style={{ textAlign: "right" }}>{p.reference}</Texte>
              <Copier texte={p.reference} langue={langue} />
            </Rangee>
          ) : null}
          {/* LE LOGO DIT DÉJÀ L'OPÉRATEUR : à côté, le numéro seul. « MTN ·
              677 12 34 56 » se cassait à 320 points, le numéro coupé en deux
              — un numéro coupé se lit faux. */}
          <Rangee libelle={t.carte}>
            <View style={{ flexDirection: "row", gap: espaces.sm, alignItems: "center" }}>
              <LogoOperateur operateur={op} taille={16} />
              <Texte chiffresAlignes numberOfLines={1} style={{ flexShrink: 1 }}>
                {sim?.numero ? formaterNumero(sim.numero)
                  : operateurReconnu(op) ? p.sim.replace(/^\S+\s*/, "") : p.sim}
              </Texte>
            </View>
          </Rangee>
          <Rangee libelle={t.date} dernier>
            <Texte style={{ textAlign: "right" }}>{date}</Texte>
            <Texte taille={textes.legende} ton="pale">{t.heureOperateur(op)}</Texte>
          </Rangee>
        </Carte>

        {/* CE QUE ÇA A COÛTÉ — seulement ce que le SMS a dit. */}
        {couts ? (
          <Carte style={{ padding: 0 }}>
            {p.frais != null ? (
              <Rangee libelle={t.frais} dernier={!p.commission}>
                <Texte chiffresAlignes>{nombre(p.frais, langue)} F</Texte>
              </Rangee>
            ) : null}
            {p.commission ? (
              <Rangee libelle={t.commission} dernier>
                <Texte chiffresAlignes>{nombre(p.commission, langue)} F</Texte>
                <Texte taille={textes.legende} ton="pale">{t.commissionNonComptee}</Texte>
              </Rangee>
            ) : null}
          </Carte>
        ) : null}

        {/* LE SMS D'ORIGINE, replié : il s'ouvre d'un geste, entier. */}
        <Carte style={{ padding: 0 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: deplie }}
                     onPress={() => setDeplie(!deplie)}
                     style={avecAppui({ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                                        paddingVertical: espaces.md, paddingHorizontal: espaces.lg })}>
            <Icone nom="Bubble" taille={16} couleur={couleurs.encreDouce} />
            <Texte taille={textes.petit} poids="demi" ton="doux" style={{ flex: 1 }}>{t.smsDOrigine}</Texte>
            <View style={{ transform: [{ rotate: deplie ? "-90deg" : "90deg" }] }}>
              <Icone nom="Chevron" taille={13} couleur={couleurs.encrePale} />
            </View>
          </Pressable>
          {deplie ? (
            <View style={{ paddingHorizontal: espaces.lg, paddingBottom: espaces.md }}>
              <View style={{ backgroundColor: couleurs.surface2, borderRadius: rayons.carte, padding: espaces.md }}>
                <Texte selectable taille={textes.petit} style={{ lineHeight: 21 }}>{texte}</Texte>
              </View>
            </View>
          ) : null}
        </Carte>

        {/* LES GESTES, APRÈS LA LECTURE. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
          <BoutonPilule libelle={t.corriger} icone="Crayon" onPress={onCorriger} />
          {p.numero ? (
            <BoutonPilule libelle={t.toutesAvecCeNumero} icone="List" onPress={() => {
              onFermer();
              router.push({ pathname: "/paiements", params: { recherche: p.numero, moment: String(Date.now()) } });
            }} />
          ) : null}
        </View>
      </View>
    </Feuille>
  );
}

/** Un geste de la fiche, en pastille : une icône et son nom. */
function BoutonPilule({ libelle, icone, onPress }: { libelle: string; icone: NomIcone; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
               style={avecAppui({
                 flexDirection: "row", alignItems: "center", gap: espaces.sm,
                 minHeight: 40, paddingHorizontal: espaces.lg, borderRadius: rayons.rond,
                 borderWidth: 1, borderColor: couleurs.trait, backgroundColor: couleurs.surfaceHaute,
               })}>
      <Icone nom={icone} taille={15} couleur={couleurs.encre} />
      <Texte taille={textes.petit} poids="demi">{libelle}</Texte>
    </Pressable>
  );
}

function BoutonPlein({ libelle, onPress, desactive }: { libelle: string; onPress: () => void; desactive?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!desactive }}
               disabled={desactive} onPress={onPress}
               // ÉTEINT, ÇA SE VOIT : un bouton éteint qui garde l'air d'un
               // bouton actif laisse croire qu'on a enregistré.
               style={avecAppui({
                 minHeight: 48, borderRadius: rayons.bouton, alignItems: "center", justifyContent: "center",
                 backgroundColor: desactive ? couleurs.surface2 : couleurs.accent,
               })}>
      <Texte poids="demi" style={{ color: desactive ? couleurs.encrePale : couleurs.surfaceHaute }}>{libelle}</Texte>
    </Pressable>
  );
}

/** Les types qu'on peut choisir, selon le sens. */
function typesPossibles(sens: "in" | "out", langue: "fr" | "en"): { cle: string; libelle: string }[] {
  const n = NOMS_TYPES[langue];
  const c = NOMS_CORRECTION[langue];
  const lus: TypeFlux[] = sens === "in"
    ? ["argent_recu", "retrait_client", "depot_recu"]
    : ["argent_envoye", "depot_client", "retrait_especes"];
  const choisis = sens === "in"
    ? (["paiement_recu", "achat_float"] as const) : (["paiement_effectue", "vente_float"] as const);
  return [...lus.map((k) => ({ cle: k, libelle: n[k] })), ...choisis.map((k) => ({ cle: k, libelle: c[k] }))];
}

export function FeuilleCorriger({ f, onFermer }: { f: Flux; onFermer: () => void }) {
  const langue = useLangue();
  const t = textesFlux[langue];
  const lu: "in" | "out" | null = f.effet == null ? null : f.effet > 0 ? "in" : "out";
  const [sens, setSens] = useState<"in" | "out">(lu ?? f.lesSoldesDisent ?? "in");
  const [type, setType] = useState<string>(f.type);
  const [note, setNote] = useState("");
  return (
    <Feuille visible libelleFermer={textesSms[langue].fermer} onFermer={onFermer}
             entete={<Texte taille={textes.intertitre} poids="demi">{t.corriger}</Texte>}
             pied={
               <View style={{ gap: espaces.xs }}>
                 <BoutonPlein libelle={t.enregistrer} desactive onPress={() => {}} />
                 <Texte taille={textes.legende} ton="pale" style={{ textAlign: "center" }}>{t.bientot}</Texte>
               </View>
             }>
      <View style={{ gap: espaces.lg }}>
        {lu == null ? (
          <View style={{ gap: espaces.sm }}>
            <View style={{ flexDirection: "row", gap: espaces.sm }}>
              {(["in", "out"] as const).map((s) => (
                <Pressable key={s} accessibilityRole="button" accessibilityState={{ selected: sens === s }}
                           onPress={() => { setSens(s); setType(""); }}
                           style={avecAppui({
                             flex: 1, minHeight: 48, borderRadius: rayons.bouton, alignItems: "center",
                             justifyContent: "center", borderWidth: sens === s ? 2 : 1,
                             borderColor: sens === s ? couleurs.accent : couleurs.trait,
                             backgroundColor: couleurs.surfaceHaute,
                           })}>
                  <Texte poids="demi" ton={s === "in" ? "positif" : "normal"}>
                    {s === "in" ? `+ ${t.entree}` : `− ${t.sortie}`}
                  </Texte>
                </Pressable>
              ))}
            </View>
            {f.lesSoldesDisent ? (
              <Texte taille={textes.petit} ton="doux">{t.lesSoldesDisent(f.lesSoldesDisent)}</Texte>
            ) : null}
          </View>
        ) : null}

        <Carte>
          {typesPossibles(sens, langue).map((o, i) => (
            <View key={o.cle}>
              {i > 0 ? <Filet style={{ marginLeft: espaces.lg }} /> : null}
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: type === o.cle }}
                         onPress={() => setType(o.cle)}
                         style={({ pressed }) => ({
                           flexDirection: "row", alignItems: "center", gap: espaces.md, minHeight: 48,
                           paddingHorizontal: espaces.lg,
                           backgroundColor: pressed ? couleurs.surface2 : "transparent",
                         })}>
                <Texte poids={type === o.cle ? "demi" : "normal"} style={{ flex: 1 }}>{o.libelle}</Texte>
                {type === o.cle ? <Icone nom="Check" taille={18} couleur={couleurs.encre} /> : null}
              </Pressable>
            </View>
          ))}
        </Carte>

        <ChampTexte value={note} onChangeText={setNote} multiline maxLength={280}
                    placeholder={t.ajouterUneNote} placeholderTextColor={couleurs.encrePale}
                    style={{ minHeight: 56, borderWidth: 1, borderColor: couleurs.trait,
                             borderRadius: rayons.carte, padding: espaces.md, fontSize: textes.corps,
                             color: couleurs.encre, backgroundColor: couleurs.surfaceHaute,
                             textAlignVertical: "top" }} />

        <View style={{ flexDirection: "row", gap: espaces.sm, alignItems: "center" }}>
          <Icone nom="Lock" taille={14} couleur={couleurs.encrePale} />
          <Texte taille={textes.legende} ton="pale" style={{ flex: 1 }}>
            {langue === "fr" ? "Le SMS d'origine ne change jamais." : "The original SMS never changes."}
          </Texte>
        </View>
      </View>
    </Feuille>
  );
}

export function FeuilleEcart({ f, e, tous, onFermer }: {
  f: Flux; e: Ecart; tous: Flux[]; onFermer: () => void;
}) {
  const langue = useLangue();
  const t = textesFlux[langue];
  const op = operateurDe(f.p.sim);
  // Le solde annoncé qui a révélé l'écart, et celui qu'on attendait.
  const annonce = f.ecartAvant === e ? f.p.soldeApres : null;
  const attendu = annonce != null ? annonce - e.montant : null;
  // Ce que le créneau contient sans compter : les opérations échouées.
  const carte = f.p.carte || f.p.sim;
  const echouees = tous.filter((x) => (x.p.carte || x.p.sim) === carte && x.etat === "echouee"
    && x.p.jour === f.p.jour && x.p.heure > e.depuis && x.p.heure < e.jusqua);
  const m = nombre(Math.abs(e.montant), langue);
  return (
    <Feuille visible libelleFermer={textesSms[langue].fermer} onFermer={onFermer}
             entete={<Texte taille={textes.intertitre} poids="demi">{t.queSEstIlPasse}</Texte>}
             pied={
               <View style={{ gap: espaces.xs }}>
                 <BoutonPlein libelle={langue === "fr" ? "Ajouter l'opération qui manque" : "Add the missing operation"}
                              desactive onPress={() => {}} />
                 <Texte taille={textes.legende} ton="pale" style={{ textAlign: "center" }}>{t.bientot}</Texte>
               </View>
             }>
      <View style={{ gap: espaces.lg }}>
        <View style={{ alignItems: "center", gap: 2 }}>
          <Texte taille={textes.display} poids="gras" ton="negatif" chiffresAlignes>
            {e.montant < 0 ? "−" : "+"}{m} F
          </Texte>
          <Texte taille={textes.petit} ton="doux">
            {langue === "fr" ? `sans SMS, entre ${e.depuis} et ${e.jusqua}` : `without SMS, between ${e.depuis} and ${e.jusqua}`}
          </Texte>
        </View>
        {annonce != null && attendu != null ? (
          <Carte>
            <Rangee libelle={langue === "fr" ? "Attendu" : "Expected"}>
              <Texte chiffresAlignes ton="pale" style={{ fontStyle: "italic" }}>
                {nombre(attendu, langue)} F ({t.calcule})
              </Texte>
            </Rangee>
            <Rangee libelle={langue === "fr" ? `Annoncé par ${op} à ${e.jusqua}` : `Announced by ${op} at ${e.jusqua}`} dernier>
              <Texte chiffresAlignes poids="demi">{nombre(annonce, langue)} F</Texte>
            </Rangee>
          </Carte>
        ) : null}
        {echouees.length ? (
          <Texte taille={textes.petit} ton="doux">
            {echouees.map((x) => langue === "fr"
              ? `Dans ce créneau : 1 opération échouée à ${x.p.heure} (${nombre(x.p.montant ?? 0, langue)} F).`
              : `In this window: 1 failed operation at ${x.p.heure} (${nombre(x.p.montant ?? 0, langue)} F).`).join("\n")}
          </Texte>
        ) : null}
        <Texte taille={textes.petit} ton="pale" style={{ lineHeight: 20 }}>
          {langue === "fr"
            ? "Souvent un SMS perdu pendant une coupure, ou une opération faite depuis un autre téléphone."
            : "Often an SMS lost during an outage, or an operation made from another phone."}
        </Texte>
      </View>
    </Feuille>
  );
}
