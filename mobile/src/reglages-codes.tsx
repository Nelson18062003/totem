// Les codes USSD, réglables depuis le téléphone — bouton par bouton.
//
// Le pendant mobile de « SectionCodes » (web/app/reglages/interactifs.tsx).
// Chaque bouton standard du guichet a sa ligne — remplie ou À REMPLIR :
// c'est ici qu'un opérateur tout neuf reçoit ses codes. Ce qui s'enregistre
// part dans le CARNET DU ROBOT (demande « raccourci », comme au web) puis
// revient par la base : l'accueil, le guichet et le cadran l'utilisent
// aussitôt, pour toute carte de cet opérateur.
//
// Un code se saisit à plat : le parcours, étapes séparées par des virgules
// (« *126#, 1, 1 »). Les ACCOLADES passent — « *126*1*{numero}*{montant}# »
// — et n'atteignent jamais le modem : le guichet les remplace par des
// chiffres avant de composer. Jamais le code secret : il a son pavé.

import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Carte, Filet, Texte } from "@/ui";
import { Icone } from "@/icones";
import { Feuille } from "@/feuille";
import { useGesteUnique } from "@/geste";
import { deposerCommande } from "@/api/guichet";
import { attendreCommande } from "@/reglages-cartes";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { aDesVariables, codesUssd, CLES_GUICHET, type CodeUssd } from "@noyau/codes";
import { textesReglages } from "@noyau/textes/reglages";
import type { Langue } from "@noyau/langue";
import type { RaccourciAppris } from "@noyau/types";

// Les mêmes règles de saisie que le web (interactifs.tsx) : rien d'autre
// que ce qu'un parcours USSD peut porter.
const proprerEtapes = (v: string) => v.replace(/[^0-9#*,\s{}a-zA-Z_]/g, "");
const decouperEtapes = (v: string) =>
  v.split(",").map((p) => p.replace(/[^0-9#*{}a-zA-Z_]/g, "")).filter(Boolean);
// « Mon numéro » → « mon_numero » : la clé d'un bouton créé à la main.
const deriverCle = (nom: string) =>
  nom.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);

type Rang = { cle: string; libelle: string; etapes: string[]; defini: boolean };

export function SectionCodes({ operateur, enPlace, appris, langue, terminal, onChange }: {
  operateur: string;
  enPlace: boolean;
  appris: RaccourciAppris[];
  langue: Langue;
  terminal: string | null;
  onChange: () => void;
}) {
  const t = textesReglages[langue];
  const [ouvert, setOuvert] = useState<Rang | "ajout" | null>(null);

  const parNom = new Map(appris.map((r) => [r.nom, r]));
  const statiques = new Map(
    (codesUssd[operateur] ?? []).map((c: CodeUssd) => [c.cle, c.code]));

  // Chaque bouton standard a sa ligne — remplie ou à remplir — puis les
  // boutons créés à la main.
  const rangs: Rang[] = [
    ...CLES_GUICHET.map((cle) => ({
      cle,
      libelle: t.libellesCodes[cle] ?? cle,
      etapes: parNom.get(cle)?.etapes
        ?? (statiques.get(cle) ? [statiques.get(cle)!] : []),
      defini: parNom.has(cle),
    })),
    ...appris
      .filter((r) => !(CLES_GUICHET as readonly string[]).includes(r.nom))
      .map((r) => ({ cle: r.nom, libelle: r.libelle || r.nom,
                     etapes: r.etapes, defini: true })),
  ];

  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi">
        {t.codesUssd} · {enPlace ? t.carteEnPlace(operateur) : operateur}
      </Texte>
      <Carte>
        {rangs.map((r, i) => (
          <View key={r.cle}>
            {i > 0 ? <Filet /> : null}
            <Pressable
              onPress={() => setOuvert(r)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: espaces.md,
                padding: espaces.lg,
                backgroundColor: pressed ? couleurs.surface2 : "transparent",
              })}
            >
              <Icone nom="Hash" taille={16} couleur={couleurs.encrePale} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center",
                               gap: espaces.sm }}>
                  <Texte poids="moyen" numberOfLines={1}>{r.libelle}</Texte>
                  {/* Le code dit lui-même sa façon de faire : avec des trous
                      il part complet d'un coup, sans trous il ouvre le menu. */}
                  {r.etapes.length ? (
                    <View style={{
                      paddingHorizontal: espaces.xs + 2, paddingVertical: 1,
                      borderRadius: rayons.petit,
                      backgroundColor: aDesVariables(r.etapes)
                        ? couleurs.encre : "transparent",
                      borderWidth: aDesVariables(r.etapes) ? 0 : 1,
                      borderColor: couleurs.trait,
                    }}>
                      <Texte taille={10}
                             ton={aDesVariables(r.etapes) ? "normal" : "pale"}
                             style={aDesVariables(r.etapes)
                               ? { color: couleurs.surfaceHaute } : undefined}>
                        {aDesVariables(r.etapes) ? t.modeDirect : t.modeGuide}
                      </Texte>
                    </View>
                  ) : null}
                </View>
                <Texte taille={textes.legende} chiffresAlignes numberOfLines={1}
                       ton={r.etapes.length ? "pale" : "doux"}
                       poids={r.etapes.length ? "normal" : "moyen"}>
                  {r.etapes.length ? r.etapes.join(", ") : t.attribuer}
                </Texte>
              </View>
              <Icone nom="Chevron" taille={16} couleur={couleurs.encrePale} />
            </Pressable>
          </View>
        ))}
        <Filet />
        <Pressable
          onPress={() => setOuvert("ajout")}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center",
            gap: espaces.sm, padding: espaces.lg,
            backgroundColor: pressed ? couleurs.surface2 : "transparent",
          })}
        >
          <Icone nom="Plus" taille={16} couleur={couleurs.encreDouce} />
          <Texte taille={textes.petit} poids="moyen">{t.ajouterRaccourci}</Texte>
        </Pressable>
      </Carte>
      <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
        {t.noteCodes}
      </Texte>

      {ouvert ? (
        <FicheCode
          operateur={operateur}
          rang={ouvert === "ajout" ? null : ouvert}
          langue={langue}
          terminal={terminal}
          onFermer={() => setOuvert(null)}
          onChange={onChange}
        />
      ) : null}
    </View>
  );
}

/** La fiche d'un code : le parcours à plat — et, pour un bouton défini,
 *  le retrait (retour au code d'usine, s'il existe). */
function FicheCode({ operateur, rang, langue, terminal, onFermer, onChange }: {
  operateur: string;
  rang: Rang | null;              // null : on crée un bouton
  langue: Langue;
  terminal: string | null;
  onFermer: () => void;
  onChange: () => void;
}) {
  const t = textesReglages[langue];
  const [nom, setNom] = useState(rang?.libelle ?? "");
  const [etapes, setEtapes] = useState(rang?.etapes.join(", ") ?? "");
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");

  // Un appui, une demande. L'état React ne se ferme qu'au rendu suivant :
  // deux appuis rapprochés partaient tous les deux.
  const geste = useGesteUnique();

  const poser = (action: "definir" | "supprimer", corps: string[]) =>
    geste.lancer(async (cleIntention) => {
    setEtat("envoi");
    setMessage("");
    try {
      const cle = rang ? rang.cle : deriverCle(nom);
      const libelle = rang ? rang.libelle : nom.trim();
      const { id } = await deposerCommande("raccourci",
        { operateur, cle, libelle, etapes: corps, action }, terminal,
        cleIntention);
      const resultat = await attendreCommande(id);
      if (!resultat) { setEtat("erreur"); setMessage(t.pasRepondu); return; }
      if (resultat.etat !== "faite") {
        setEtat("erreur");
        setMessage(/inconnue/i.test(resultat.resultat || "")
          ? t.majRequise
          : (resultat.resultat || t.aRefuse));
        return;
      }
      onChange();
      onFermer();
    } catch {
      setEtat("erreur");
      setMessage(t.pasPartie);
    }
  });

  const enregistrer = () => {
    const corps = decouperEtapes(etapes);
    if (!corps.length || (rang == null && !deriverCle(nom))) return;
    void poser("definir", corps);
  };

  const pret = decouperEtapes(etapes).length > 0
    && (rang != null || deriverCle(nom).length > 0);

  return (
    <Feuille
      visible
      libelleFermer={t.annuler}
      onFermer={onFermer}
      entete={
        <>
          <Texte taille={textes.legende} ton="pale"
                 style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            {operateur}
          </Texte>
          <Texte taille={textes.intertitre} poids="demi"
                 style={{ marginTop: espaces.xs }}>
            {rang ? rang.libelle : t.ajouterRaccourci}
          </Texte>
        </>
      }
      pied={
        <View style={{ gap: espaces.sm }}>
          <Pressable
            onPress={enregistrer}
            disabled={etat === "envoi" || !pret}
            style={({ pressed }) => ({
              alignItems: "center", paddingVertical: espaces.md,
              borderRadius: rayons.bouton,
              backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
              opacity: etat === "envoi" || !pret ? 0.4 : 1,
            })}
          >
            <Texte poids="demi" taille={textes.petit}
                   style={{ color: couleurs.surfaceHaute }}>
              {etat === "envoi" ? t.enregistrement : "OK"}
            </Texte>
          </Pressable>
          {rang?.defini ? (
            <Pressable
              onPress={() => void poser("supprimer", [])}
              disabled={etat === "envoi"}
              style={({ pressed }) => ({
                alignItems: "center", paddingVertical: espaces.md,
                borderRadius: rayons.bouton, borderWidth: 1,
                borderColor: couleurs.trait,
                backgroundColor: pressed ? couleurs.surface2 : "transparent",
              })}
            >
              <Texte taille={textes.petit} ton="negatif" poids="moyen">
                {t.retirerBouton}
              </Texte>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <View style={{ gap: espaces.lg }}>
        {rang == null ? (
          <View style={{ gap: espaces.xs }}>
            <TextInput
              value={nom}
              onChangeText={(v) => setNom(v.slice(0, 40))}
              placeholder={t.nomExemple}
              placeholderTextColor={couleurs.encrePale}
              style={styleChamp}
            />
          </View>
        ) : null}
        <View style={{ gap: espaces.xs }}>
          <TextInput
            value={etapes}
            onChangeText={(v) => setEtapes(proprerEtapes(v))}
            placeholder={t.exempleEtapes}
            placeholderTextColor={couleurs.encrePale}
            autoCapitalize="none"
            autoCorrect={false}
            style={styleChamp}
          />
        </View>
        {etat === "erreur" ? (
          <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
            {message}
          </Texte>
        ) : null}
      </View>
    </Feuille>
  );
}

const styleChamp = {
  borderWidth: 1, borderColor: couleurs.trait,
  borderRadius: rayons.bouton, paddingHorizontal: espaces.md,
  paddingVertical: espaces.md, fontFamily: polices.corps,
  fontSize: 16, color: couleurs.encre,
  backgroundColor: couleurs.surfaceHaute,
} as const;
