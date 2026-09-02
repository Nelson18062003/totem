// Les cartes, dans les réglages : le nom et le numéro de chacune.
//
// Le pendant mobile de « ReglageNom » / « ReglageNumero »
// (web/app/reglages/interactifs.tsx). C'est ICI que s'inscrit ce que la
// fiche des coordonnées montre — le nom commercial et le numéro qu'on donne
// pour être payé. Ni la puce ni le réseau ne les connaissent : seul le
// propriétaire peut les dire.
//
// Le réglage part au TERMINAL (une demande « identite », comme au web) puis
// revient par la base : la plateforme, le téléphone et les reçus le lisent
// tous au même endroit. Rien ne s'écrit localement.

import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Carte, Filet, Texte } from "@/ui";
import { Icone } from "@/icones";
import { Feuille } from "@/feuille";
import { useGesteUnique } from "@/geste";
import { deposerCommande, lireCommande } from "@/api/guichet";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { formaterNumero } from "@noyau/numero";
import { textesReglages } from "@noyau/textes/reglages";
import { textesAccueil } from "@noyau/textes/accueil";
import type { Langue } from "@noyau/langue";
import type { Sim } from "@noyau/types";

/** Attend l'issue d'une demande déposée pour le robot (≈40 s au plus). */
export async function attendreCommande(id: number) {
  for (let i = 0; i < 26; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const c = await lireCommande(id).catch(() => null);
    if (c && (c.etat === "faite" || c.etat === "echouee")) return c;
  }
  return null;
}

export function SectionCartes({ sims, langue, terminal, onChange }: {
  sims: Sim[];
  langue: Langue;
  terminal: string | null;
  onChange: () => void;
}) {
  const t = textesReglages[langue];
  const [ouverte, setOuverte] = useState<Sim | null>(null);

  if (!sims.length) return null;

  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi">{t.comptes}</Texte>
      <Carte>
        {sims.map((s, i) => (
          <View key={s.iccid}>
            {i > 0 ? <Filet /> : null}
            <Pressable
              accessibilityRole="button"
              disabled={!s.enPlace}
              onPress={() => setOuverte(s)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: espaces.md,
                padding: espaces.lg,
                backgroundColor: pressed ? couleurs.surface2 : "transparent",
                opacity: s.enPlace ? 1 : 0.55,
              })}
            >
              <Icone nom="Wallet" taille={18} couleur={couleurs.encreDouce} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Texte poids="moyen" numberOfLines={1}
                       ton={s.nom ? "normal" : "pale"}>
                  {s.nom || t.nomARenseigner}
                </Texte>
                <Texte taille={textes.legende} ton="pale" chiffresAlignes
                       numberOfLines={1}>
                  {s.numero ? formaterNumero(s.numero) : t.numeroARenseigner}
                  {" · "}{s.libelle}
                </Texte>
              </View>
              {s.enPlace ? (
                <Icone nom="Chevron" taille={16} couleur={couleurs.encrePale} />
              ) : (
                <Texte taille={textes.legende} ton="pale">—</Texte>
              )}
            </Pressable>
          </View>
        ))}
      </Carte>
      <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
        {t.noteIccid}
      </Texte>

      {ouverte ? (
        <FicheCarte sim={ouverte} langue={langue} terminal={terminal}
                    onFermer={() => setOuverte(null)}
                    onChange={onChange} />
      ) : null}
    </View>
  );
}

/** La fiche d'une carte : son nom, son numéro — deux champs, un envoi. */
function FicheCarte({ sim, langue, terminal, onFermer, onChange }: {
  sim: Sim;
  langue: Langue;
  terminal: string | null;
  onFermer: () => void;
  onChange: () => void;
}) {
  const t = textesReglages[langue];
  // « Nom » / « Numéro » : les mêmes étiquettes que la fiche des
  // coordonnées — c'est le même objet qu'on règle ici.
  const ta = textesAccueil[langue];
  const [nom, setNom] = useState(sim.nom);
  const [numero, setNumero] = useState(sim.numero);
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");

  // `if (etat === "envoi") return` ne garde rien contre un double appui :
  // l'état React ne change qu'au rendu SUIVANT, et deux appuis rapprochés
  // lisent tous les deux « repos ». Le verrou de `useGesteUnique`, lui, se
  // ferme à l'instant de l'appui.
  const geste = useGesteUnique();

  const enregistrer = () => geste.lancer(async (cleIntention) => {
    const nomPropre = nom.trim().replace(/\s+/g, " ");
    const numeroPropre = numero.replace(/\D/g, "");
    if (nomPropre && nomPropre.length < 2) {
      setEtat("erreur"); setMessage(t.nomTropCourt); return;
    }
    if (numeroPropre && numeroPropre.length < 8) {
      setEtat("erreur"); setMessage(t.neufChiffres); return;
    }
    // Ce qui n'a pas bougé ne part pas : une demande au terminal se mérite.
    const parametres: Record<string, string> = { iccid: sim.iccid };
    if (nomPropre !== sim.nom) parametres.nom = nomPropre;
    if (numeroPropre !== sim.numero) parametres.numero = numeroPropre;
    if (Object.keys(parametres).length === 1) { onFermer(); return; }

    setEtat("envoi");
    setMessage("");
    try {
      const { id } = await deposerCommande("identite", parametres, terminal,
                                           cleIntention);
      const resultat = await attendreCommande(id);
      if (!resultat) { setEtat("erreur"); setMessage(t.pasRepondu); return; }
      if (resultat.etat === "faite") {
        onChange();
        onFermer();
        return;
      }
      setEtat("erreur");
      setMessage(/inconnue/i.test(resultat.resultat || "")
        ? t.majRequise
        : (resultat.resultat || t.aRefuse));
    } catch {
      setEtat("erreur");
      setMessage(t.pasPartie);
    }
  });

  return (
    <Feuille
      visible
      libelleFermer={t.annuler}
      onFermer={onFermer}
      entete={
        <>
          <Texte taille={textes.legende} ton="pale"
                 style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            {sim.libelle}
          </Texte>
          <Texte taille={textes.intertitre} poids="demi"
                 style={{ marginTop: espaces.xs }}>
            {t.reglerNom(sim.libelle)}
          </Texte>
        </>
      }
      pied={
        <Pressable
          accessibilityRole="button"
          onPress={() => void enregistrer()}
          disabled={etat === "envoi"}
          style={({ pressed }) => ({
            alignItems: "center", paddingVertical: espaces.md,
            borderRadius: rayons.bouton,
            backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
            opacity: etat === "envoi" ? 0.6 : 1,
          })}
        >
          <Texte poids="demi" taille={textes.petit}
                 style={{ color: couleurs.surfaceHaute }}>
            {etat === "envoi" ? "…" : "OK"}
          </Texte>
        </Pressable>
      }
    >
      <View style={{ gap: espaces.lg }}>
        <Champ libelle={ta.coordNom} valeur={nom} onChange={(v) => setNom(v.slice(0, 40))}
               aide={t.nomPlaceholder} />
        <Champ libelle={ta.coordNumero} valeur={numero}
               onChange={(v) => setNumero(v.replace(/[^\d\s]/g, ""))}
               aide="696 10 38 64" clavier="phone-pad" />
        {etat === "erreur" ? (
          <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
            {message}
          </Texte>
        ) : null}
      </View>
    </Feuille>
  );
}

function Champ({ libelle, valeur, onChange, aide, clavier }: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  aide: string;
  clavier?: "phone-pad";
}) {
  return (
    <View style={{ gap: espaces.xs }}>
      <Texte taille={textes.legende} ton="pale"
             style={{ textTransform: "uppercase", letterSpacing: 1 }}>
        {libelle}
      </Texte>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        placeholder={aide}
        placeholderTextColor={couleurs.encrePale}
        keyboardType={clavier}
        style={{
          borderWidth: 1, borderColor: couleurs.trait,
          borderRadius: rayons.bouton, paddingHorizontal: espaces.md,
          paddingVertical: espaces.md, fontFamily: polices.corps,
          fontSize: 16, color: couleurs.encre,
          backgroundColor: couleurs.surfaceHaute,
        }}
      />
    </View>
  );
}
