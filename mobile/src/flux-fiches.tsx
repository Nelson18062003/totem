// Les feuilles du module Flux : la fiche d'une transaction, « Corriger », et
// « Que s'est-il passé ? » pour un écart de la suite des soldes.
//
// LA FICHE SE RANGE COMME LE REÇU PDF : le montant, qui, la référence, la
// carte, la date, puis les soldes — l'annoncé avec sa coche, le calculé
// écrit « (calculé) » et JAMAIS coché. Le SMS d'origine est en bas, mot pour
// mot : c'est lui qui fait foi.
//
// « CORRIGER » N'ENREGISTRE PAS ENCORE. Le journal signé des corrections est
// une livraison à part ; d'ici là, le bouton est éteint et le dit. Un bouton
// qui ferait semblant d'enregistrer serait un mensonge sur de l'argent.

import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";

import { Carte, ChampTexte, Filet, Texte, avecAppui } from "@/ui";
import { Icone } from "@/icones";
import { Feuille } from "@/feuille";
import { LogoOperateur } from "@/logos-operateurs";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useLangue } from "@/langue";
import { copierTexte } from "@/presse-papiers";
import { textesFlux, NOMS_TYPES, NOMS_CORRECTION } from "@noyau/textes/flux";
import { textesSms } from "@noyau/textes/sms";
import { montantSigne, type Flux, type Ecart, type TypeFlux } from "@noyau/flux";
import { nombre, type Sim } from "@noyau/types";
import { formaterNumero } from "@noyau/numero";
import { jourCourt, jourDuReleve } from "@noyau/periodes";

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

function Rangee({ libelle, children, dernier }: { libelle: string; children: React.ReactNode; dernier?: boolean }) {
  return (
    <>
      <View style={{ flexDirection: "row", gap: espaces.md, paddingVertical: espaces.md,
                     paddingHorizontal: espaces.lg, alignItems: "flex-start" }}>
        <Texte taille={textes.petit} ton="pale" style={{ width: 108 }}>{libelle}</Texte>
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end", gap: 2 }}>{children}</View>
      </View>
      {dernier ? null : <Filet />}
    </>
  );
}

function Copier({ texte, langue }: { texte: string; langue: "fr" | "en" }) {
  const [fait, setFait] = useState(false);
  return (
    <Pressable accessibilityRole="button" hitSlop={8}
               onPress={() => { if (copierTexte(texte)) { setFait(true); setTimeout(() => setFait(false), 1500); } }}
               style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <Texte taille={textes.legende} ton="doux" poids="moyen" style={{ textDecorationLine: "underline" }}>
        {fait ? "✓" : textesFlux[langue].copier}
      </Texte>
    </Pressable>
  );
}

export function FicheFlux({ f, sims, maintenant, fuseau, onFermer, onCorriger }: {
  f: Flux; sims: Sim[]; maintenant: number; fuseau: string;
  onFermer: () => void; onCorriger: () => void;
}) {
  const langue = useLangue();
  const t = textesFlux[langue];
  const p = f.p;
  const op = operateurDe(p.sim);
  const sim = sims.find((s) => s.iccid === p.carte);
  const [sms, setSms] = useState(false);
  const entree = f.effet != null && f.effet > 0;
  const etat = f.etat === "comptee" ? t.reussie : f.etat === "echouee" ? t.echouee : t.aVerifierEtat;
  const tonEtat = f.etat === "comptee" ? "positif" : f.etat === "echouee" ? "pale" : "alerte";
  const date = quandAnnonce(p.recuLe, p.heure, maintenant, fuseau, langue);
  return (
    <Feuille visible libelleFermer={textesSms[langue].fermer} onFermer={onFermer}
             entete={
               <View style={{ gap: 2 }}>
                 <Texte taille={textes.display} poids="gras" chiffresAlignes
                        ton={f.etat === "a_verifier" ? "alerte" : entree ? "positif" : "normal"}>
                   {montantSigne(f, langue, nombre)} F
                 </Texte>
                 <Texte ton="doux">
                   {NOMS_TYPES[langue][f.type]} · <Texte poids="demi" ton={tonEtat}>{etat}</Texte>
                 </Texte>
               </View>
             }>
      <View style={{ gap: espaces.md }}>
        <Carte style={{ padding: 0 }}>
          {p.tiers || p.numero ? (
            <Rangee libelle={entree ? t.de : t.a}>
              {/* Dans une fiche, on ne coupe jamais un nom. */}
              <Texte poids="moyen" style={{ textAlign: "right" }}>{p.tiers || "—"}</Texte>
              {p.numero ? (
                <View style={{ flexDirection: "row", gap: espaces.sm, alignItems: "center" }}>
                  <Texte taille={textes.petit} ton="doux" chiffresAlignes>{formaterNumero(p.numero)}</Texte>
                  <Copier texte={p.numero} langue={langue} />
                </View>
              ) : null}
            </Rangee>
          ) : null}
          {p.reference ? (
            <Rangee libelle={t.reference}>
              <Texte chiffresAlignes style={{ textAlign: "right" }}>{p.reference}</Texte>
              <Copier texte={p.reference} langue={langue} />
            </Rangee>
          ) : null}
          <Rangee libelle={t.carte}>
            <View style={{ flexDirection: "row", gap: espaces.sm, alignItems: "center" }}>
              <LogoOperateur operateur={op} taille={16} />
              <Texte>{op}{sim?.numero ? ` · ${formaterNumero(sim.numero)}` : ` · ${p.sim}`}</Texte>
            </View>
          </Rangee>
          <Rangee libelle={t.date}>
            <Texte style={{ textAlign: "right" }}>{date}</Texte>
            <Texte taille={textes.legende} ton="pale">{t.heureOperateur(op)}</Texte>
          </Rangee>
          {p.frais != null ? (
            <Rangee libelle={t.frais}><Texte chiffresAlignes>{nombre(p.frais, langue)} F</Texte></Rangee>
          ) : null}
          {p.commission ? (
            <Rangee libelle={t.commissions}>
              <Texte chiffresAlignes>{nombre(p.commission, langue)} F</Texte>
              <Texte taille={textes.legende} ton="pale">{t.commissionNonComptee}</Texte>
            </Rangee>
          ) : null}
          {p.soldeApres != null ? (
            <Rangee libelle={t.solde} dernier={f.soldeAvantCalcule == null}>
              <Texte chiffresAlignes poids="demi">
                {nombre(p.soldeApres, langue)} F{f.verdict === "suit"
                  ? <Texte ton="positif" poids="demi"> ✓</Texte> : null}
              </Texte>
              <Texte taille={textes.legende} ton="pale">{t.soldeApresAnnonce(op)}</Texte>
            </Rangee>
          ) : null}
          {f.soldeAvantCalcule != null ? (
            <Rangee libelle={t.soldeAvant} dernier>
              <Texte chiffresAlignes ton="doux" style={{ fontStyle: "italic" }}>
                {nombre(f.soldeAvantCalcule, langue)} F ({t.calcule})
              </Texte>
            </Rangee>
          ) : null}
        </Carte>

        <Carte style={{ padding: 0 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: sms }}
                     onPress={() => setSms(!sms)}
                     style={avecAppui({ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                                        padding: espaces.md, paddingHorizontal: espaces.lg })}>
            <View style={{ transform: [{ rotate: sms ? "90deg" : "0deg" }] }}>
              <Icone nom="Chevron" taille={13} couleur={couleurs.encrePale} />
            </View>
            <Texte taille={textes.petit} poids="demi" ton="doux">{t.ceQueDitLeSms}</Texte>
          </Pressable>
          {sms ? (
            <Texte selectable taille={textes.petit} ton="doux"
                   style={{ paddingHorizontal: espaces.lg, paddingBottom: espaces.md, lineHeight: 20 }}>
              {p.smsBrut}
            </Texte>
          ) : null}
        </Carte>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
          <BoutonPilule libelle={t.corriger} plein onPress={onCorriger} />
          {p.numero ? (
            <BoutonPilule libelle={t.toutesAvecCeNumero} onPress={() => {
              onFermer();
              router.push({ pathname: "/flux", params: { recherche: p.numero, moment: String(Date.now()) } });
            }} />
          ) : null}
          <BoutonPilule libelle={t.voirLeSms} onPress={() => {
            onFermer();
            router.push({ pathname: "/encaissements",
                          params: { recherche: p.reference || p.tiers || p.numero, moment: String(Date.now()) } });
          }} />
        </View>
      </View>
    </Feuille>
  );
}

function BoutonPilule({ libelle, plein, onPress, desactive }: {
  libelle: string; plein?: boolean; onPress: () => void; desactive?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!desactive }}
               disabled={desactive} onPress={onPress}
               style={avecAppui({
                 minHeight: 40, paddingHorizontal: espaces.lg, borderRadius: rayons.rond,
                 justifyContent: "center", borderWidth: 1,
                 borderColor: plein ? couleurs.accent : couleurs.trait,
                 backgroundColor: plein ? couleurs.accent : couleurs.surfaceHaute,
                 opacity: desactive ? 0.45 : 1,
               })}>
      <Texte taille={textes.petit} poids="demi"
             style={{ color: plein ? couleurs.surfaceHaute : couleurs.encre }}>{libelle}</Texte>
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
             entete={<Texte taille={textes.intertitre} poids="demi">{t.corrigerTitre}</Texte>}
             pied={
               <View style={{ gap: espaces.xs }}>
                 <BoutonPilule libelle={`${t.enregistrer} · ${t.signeParVous}`} plein desactive onPress={() => {}} />
                 <Texte taille={textes.legende} ton="pale" style={{ textAlign: "center" }}>{t.bientot}</Texte>
               </View>
             }>
      <View style={{ gap: espaces.lg }}>
        {lu == null ? (
          <View style={{ gap: espaces.sm }}>
            <Texte poids="demi">{t.entreeOuSortie}</Texte>
            {f.lesSoldesDisent ? (
              <Texte taille={textes.petit} ton="doux">{t.lesSoldesDisent(f.lesSoldesDisent)}.</Texte>
            ) : null}
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
          </View>
        ) : null}

        <View style={{ gap: espaces.sm }}>
          <Texte poids="demi">{t.cEstQuoi}</Texte>
          <Carte style={{ padding: 0 }}>
            {typesPossibles(sens, langue).map((o, i) => (
              <View key={o.cle}>
                {i > 0 ? <Filet /> : null}
                <Pressable accessibilityRole="radio" accessibilityState={{ checked: type === o.cle }}
                           onPress={() => setType(o.cle)}
                           style={({ pressed }) => ({
                             flexDirection: "row", alignItems: "center", gap: espaces.md, minHeight: 48,
                             paddingHorizontal: espaces.lg,
                             backgroundColor: pressed ? couleurs.surface2 : "transparent",
                           })}>
                  <View style={{ width: 18, height: 18, borderRadius: rayons.rond,
                                 borderWidth: type === o.cle ? 6 : 1.5,
                                 borderColor: type === o.cle ? couleurs.accent : couleurs.surface3 }} />
                  <Texte poids={type === o.cle ? "demi" : "normal"}>{o.libelle}</Texte>
                </Pressable>
              </View>
            ))}
          </Carte>
        </View>

        <View style={{ gap: espaces.xs }}>
          <Texte poids="demi">{t.ajouterUneNote}</Texte>
          <ChampTexte value={note} onChangeText={setNote} multiline maxLength={280}
                      placeholder={t.noteVisible} placeholderTextColor={couleurs.encrePale}
                      style={{ minHeight: 64, borderWidth: 1, borderColor: couleurs.trait,
                               borderRadius: rayons.carte, padding: espaces.md, fontSize: textes.corps,
                               color: couleurs.encre, backgroundColor: couleurs.surfaceHaute,
                               textAlignVertical: "top" }} />
        </View>

        <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: couleurs.trait,
                       borderRadius: rayons.carte, padding: espaces.md, gap: 2 }}>
          <Texte taille={textes.petit} poids="demi">{t.plus}</Texte>
          <Texte taille={textes.legende} ton="pale">{t.plusPourVous}</Texte>
        </View>

        <View style={{ flexDirection: "row", gap: espaces.sm }}>
          <Icone nom="Lock" taille={14} couleur={couleurs.encrePale} />
          <Texte taille={textes.legende} ton="pale" style={{ flex: 1, lineHeight: 17 }}>{t.smsIntact}</Texte>
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
             entete={<Texte taille={textes.intertitre} poids="demi">{t.queSEstIlPasse}</Texte>}>
      <View style={{ gap: espaces.lg }}>
        <Texte ton="negatif" style={{ lineHeight: 22 }}>
          {e.montant < 0 ? t.ecart(m, e.depuis, e.jusqua) : t.ecartPlus(m, e.depuis, e.jusqua)}
        </Texte>
        {annonce != null && attendu != null ? (
          <Carte style={{ padding: 0 }}>
            <Rangee libelle={langue === "fr" ? `${op} aurait dû annoncer` : `${op} should have announced`}>
              <Texte chiffresAlignes ton="doux" style={{ fontStyle: "italic" }}>
                {nombre(attendu, langue)} F ({t.calcule})
              </Texte>
            </Rangee>
            <Rangee libelle={langue === "fr" ? `${op} a annoncé à ${e.jusqua}` : `${op} announced at ${e.jusqua}`}>
              <Texte chiffresAlignes poids="demi">{nombre(annonce, langue)} F</Texte>
            </Rangee>
            <Rangee libelle={langue === "fr" ? "Écart" : "Gap"} dernier>
              <Texte chiffresAlignes poids="gras" ton="negatif">
                {e.montant < 0 ? "−" : "+"}{m} F
              </Texte>
            </Rangee>
          </Carte>
        ) : null}
        {echouees.length ? (
          <View style={{ gap: espaces.xs }}>
            <Texte taille={textes.petit} poids="demi">
              {langue === "fr" ? "Dans ce créneau" : "In this window"}
            </Texte>
            {echouees.map((x) => (
              <Texte key={x.p.id} taille={textes.petit} ton="doux">
                {langue === "fr"
                  ? `1 SMS rangé « Échouée » à ${x.p.heure} (${nombre(x.p.montant ?? 0, langue)} F)`
                  : `1 SMS marked “Failed” at ${x.p.heure} (${nombre(x.p.montant ?? 0, langue)} F)`}
              </Texte>
            ))}
          </View>
        ) : null}
        <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>
          {langue === "fr"
            ? "L'argent a pu partir par l'application MoMo d'un autre téléphone, au guichet, ou par un SMS perdu pendant une coupure. TOTEM ne dit pas combien d'opérations manquent : personne ne peut le savoir."
            : "The money may have left through the MoMo app on another phone, at a counter, or through an SMS lost during an outage. TOTEM does not say how many operations are missing: nobody can know."}
        </Texte>
        <View style={{ gap: espaces.sm }}>
          <BoutonPilule libelle={langue === "fr" ? "Écrire une note" : "Write a note"} plein desactive onPress={() => {}} />
          <BoutonPilule libelle={langue === "fr" ? "Ajouter l'opération qui manque" : "Add the missing operation"}
                        desactive onPress={() => {}} />
          <Texte taille={textes.legende} ton="pale" style={{ textAlign: "center" }}>{t.bientot}</Texte>
        </View>
      </View>
    </Feuille>
  );
}
