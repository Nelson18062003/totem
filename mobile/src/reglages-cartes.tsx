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
// tous au même endroit. Le boîtier dit « fait » : l'écran le montre tout de
// suite (`useRetouche`), et le cahier relu en silence le confirme.
//
// UNE CARTE DONT ON NE SAIT RIEN N'EST PAS UNE CARTE RETIRÉE. Quand le
// boîtier de la boutique se tait — une coupure de courant de dix minutes —,
// on ne sait plus si la puce est là. Les cartes étaient alors toutes
// grisées, intouchables, comme sorties du berceau. Seule une carte qu'on
// SAIT retirée se grise maintenant ; les autres restent à leur place.

import { useState } from "react";
import { Pressable, View } from "react-native";

import { ChampTexte, Carte, Filet, Texte } from "@/ui";
import { Squelette } from "@/animations";
import { Icone } from "@/icones";
import { Feuille } from "@/feuille";
import { useGesteUnique } from "@/geste";
import { useRetouche } from "@/donnees";
import { deposerCommande, ErreurGuichet, lireCommande } from "@/api/guichet";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { formaterNumero } from "@noyau/numero";
import { textesReglages } from "@noyau/textes/reglages";
import { textesAccueil } from "@noyau/textes/accueil";
import type { Langue } from "@noyau/langue";
import type { Sim } from "@noyau/types";

/**
 * Une carte qu'on SAIT retirée — la seule qui se grise ou se dit « absente ».
 *
 * « inconnue » (le boîtier qui la porte se tait) n'en est pas une : il est le
 * seul à voir la puce, et un boîtier muet ne voit plus rien. Une plateforme
 * d'avant `presence` ne dit que `enPlace` : on la croit, faute de mieux.
 */
export function carteRetiree(s: { enPlace: boolean; presence?: Sim["presence"] }): boolean {
  return s.presence ? s.presence === "retiree" : !s.enPlace;
}

/** Ce que dit la plateforme quand elle refuse — « le boîtier ne donne plus
 *  de nouvelles : rien n'est parti » vaut mieux que « la demande n'a pas pu
 *  partir », qui fait chercher une panne de réseau.
 *
 *  SEULEMENT CE QUE LE GUICHET A DIT. Il ne rend que des phrases pour le
 *  propriétaire, dans la langue de l'écran — la raison de la plateforme, ou
 *  celle du dictionnaire quand le réseau a manqué. Tout le reste (un
 *  « TypeError: Network request failed », un « Aborted ») est un message de
 *  machine : on dit alors la phrase de l'écran, jamais celle-là. Cinq gestes
 *  des Réglages et des bénéficiaires affichaient encore `e.message` tel
 *  quel. */
export function motDuRefus(e: unknown, defaut: string): string {
  return e instanceof ErreurGuichet && e.message ? e.message : defaut;
}

/** Combien de temps on attend, en tout, que le boîtier dise « fait ». */
const ATTENTE_COMMANDE_MS = 40_000;
const PAS_MS = 1_500;

/** Attend l'issue d'une demande déposée pour le robot — QUARANTE SECONDES
 *  AU PLUS, montre en main. On comptait vingt-six relectures, en croyant
 *  compter quarante secondes : une relecture qui traîne jusqu'à l'échéance
 *  du guichet (trente secondes) en faisait treize minutes, bouton « OK »
 *  resté sur « … ». C'est l'heure qui borne, plus le nombre d'essais. */
export async function attendreCommande(id: number) {
  const fin = Date.now() + ATTENTE_COMMANDE_MS;
  while (Date.now() < fin) {
    await new Promise((r) => setTimeout(r, PAS_MS));
    const reste = fin - Date.now();
    if (reste <= 0) break;
    const c = await Promise.race([
      lireCommande(id).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), reste)),
    ]);
    if (c && (c.etat === "faite" || c.etat === "echouee")) return c;
  }
  return null;
}

export function SectionCartes({ sims, langue, terminal, attente, onChange }: {
  sims: Sim[];
  langue: Langue;
  terminal: string | null;
  /** Rien encore au cahier : la place se garde, en formes grises — sans
   *  quoi la section arrivait après coup et poussait tout le bas. */
  attente?: boolean;
  onChange: () => void;
}) {
  const t = textesReglages[langue];
  const [ouverte, setOuverte] = useState<Sim | null>(null);

  // La forme d'attente a la hauteur d'UNE rangée (16 + 20 + 2 + 15 + 16),
  // et la note sous la carte est la vraie : c'est un texte fixe, il n'a rien
  // à attendre — l'oublier faisait descendre tout ce qui suit de quatre-vingt-
  // dix points à l'arrivée des cartes.
  if (!sims.length && attente) {
    return (
      <View style={{ gap: espaces.sm }}>
        <Texte taille={textes.intertitre} poids="demi">{t.comptes}</Texte>
        <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
          <Squelette largeur="55%" hauteur={16} />
          <Squelette largeur="35%" hauteur={12} />
        </Carte>
        <Texte taille={textes.legende} ton="pale" style={{ lineHeight: 18 }}>
          {t.noteIccid}
        </Texte>
      </View>
    );
  }
  if (!sims.length) return null;

  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi">{t.comptes}</Texte>
      <Carte>
        {sims.map((s, i) => {
          const retiree = carteRetiree(s);
          return (
            <View key={s.iccid}>
              {i > 0 ? <Filet /> : null}
              <Pressable
                accessibilityRole="button"
                disabled={retiree}
                onPress={() => setOuverte(s)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: espaces.md,
                  padding: espaces.lg,
                  backgroundColor: pressed ? couleurs.surface2 : "transparent",
                  opacity: retiree ? 0.55 : 1,
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
                  {/* Ni grisée ni « retirée » : on ne sait pas — on dit pourquoi.
                      Sur sa propre ligne, pour que la liste ne la coupe pas. */}
                  {s.presence === "inconnue" ? (
                    <Texte taille={textes.legende} ton="alerte">{t.presenceInconnue}</Texte>
                  ) : null}
                </View>
                {retiree ? (
                  <Texte taille={textes.legende} ton="pale">—</Texte>
                ) : (
                  <Icone nom="Chevron" taille={16} couleur={couleurs.encrePale} />
                )}
              </Pressable>
            </View>
          );
        })}
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
  const retoucher = useRetouche();
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
      setEtat("erreur"); setMessage(t.nomTropCourt); return false;
    }
    if (numeroPropre && numeroPropre.length < 8) {
      setEtat("erreur"); setMessage(t.neufChiffres); return false;
    }
    // Ce qui n'a pas bougé ne part pas : une demande au terminal se mérite.
    const parametres: Record<string, string> = { iccid: sim.iccid };
    if (nomPropre !== sim.nom) parametres.nom = nomPropre;
    if (numeroPropre !== sim.numero) parametres.numero = numeroPropre;
    // RIEN N'A CHANGÉ, donc rien n'est parti : ni réussite, ni échec. On
    // ferme, et le doigt ne sent rien — c'est la vérité de ce geste.
    if (Object.keys(parametres).length === 1) { onFermer(); return; }

    setEtat("envoi");
    setMessage("");
    try {
      const { id } = await deposerCommande("identite", parametres, terminal,
                                           cleIntention);
      const resultat = await attendreCommande(id);
      if (!resultat) { setEtat("erreur"); setMessage(t.pasRepondu); return false; }
      if (resultat.etat === "faite") {
        // Le boîtier l'a pris : le nom et le numéro se voient TOUT DE SUITE,
        // puis le cahier relu en silence le confirme.
        const iccid = sim.iccid;
        retoucher((d) => ({
          ...d,
          sims: d.sims.map((x) => (x.iccid === iccid ? {
            ...x,
            ...(parametres.nom !== undefined ? { nom: parametres.nom } : {}),
            ...(parametres.numero !== undefined ? { numero: parametres.numero } : {}),
          } : x)),
        }));
        onChange();
        onFermer();
        return true;
      }
      setEtat("erreur");
      setMessage(/inconnue/i.test(resultat.resultat || "")
        ? t.majRequise
        : (resultat.resultat || t.aRefuse));
      return false;
    } catch (e) {
      setEtat("erreur");
      setMessage(motDuRefus(e, t.pasPartie));
      return false;
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
        {/* Le boîtier qui porte la carte se tait : le réglage ne partira
            pas — on le dit AVANT qu'on tape, pas après. */}
        {sim.presence === "inconnue" ? (
          <Texte taille={textes.petit} ton="alerte" style={{ lineHeight: 20 }}>
            {ta.horsLigneSansHeure}
          </Texte>
        ) : null}
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
      <ChampTexte
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
