// SUPPRIMER MON COMPTE — depuis l'application, sans écrire à personne.
//
// Apple l'exige de toute application où l'on peut créer un compte, et c'est
// juste : on doit pouvoir partir aussi simplement qu'on est venu. Avant,
// supprimer son compte voulait dire envoyer un courriel (voir la page
// `/suppression` de la plateforme) ; c'est maintenant un geste.
//
// LE MOT DE PASSE EST REDEMANDÉ. Un téléphone prêté, déverrouillé, ne doit
// pas suffire à effacer le compte de quelqu'un.
//
// ON DIT CE QUI S'EFFACE — et ce qui ne s'efface pas : l'argent n'est jamais
// chez TOTEM, il reste chez l'opérateur. C'est la première question qu'on se
// pose devant un bouton rouge.
//
// La plateforme refuse le propriétaire de la plateforme et la vitrine, avec
// une phrase : l'écran la montre telle quelle. En cas de succès, la session
// se ferme par la MÊME porte que la déconnexion (`fermer`), pour que le
// cahier du téléphone se ferme avec — sans quoi les chiffres d'un compte
// supprimé resteraient lisibles sur l'appareil.

import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Feuille } from "@/feuille";
import { BoutonIcone, Carte, ChampTexte, Texte } from "@/ui";
import { Icone } from "@/icones";
import { useGesteUnique } from "@/geste";
import { useSession } from "@/session";
import { supprimerMonCompte, versErreurGuichet } from "@/api/guichet";
import { contacter } from "@/ajouter-ma-carte";
import { textesReglages } from "@noyau/textes/reglages";
import { textesConnexion } from "@noyau/textes/connexion";
import type { Langue } from "@noyau/langue";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";

export function FicheSupprimerMonCompte({ langue, onFermer }: {
  langue: Langue; onFermer: () => void;
}) {
  const t = textesReglages[langue];
  const tc = textesConnexion[langue];
  const { fermer } = useSession();
  const geste = useGesteUnique();
  const [motdepasse, setMotdepasse] = useState("");
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const supprimer = () => {
    if (!motdepasse) { setErreur(t.supprimerManque); return; }
    void geste.lancer(async () => {
      setErreur(null);
      try {
        await supprimerMonCompte(motdepasse, langue);
      } catch (e) {
        // La phrase de la plateforme — « le propriétaire ne se supprime pas
        // ici », « mot de passe incorrect » —, dans la langue de l'écran.
        setErreur(versErreurGuichet(e, langue).message);
        return false;
      }
      // Le compte n'existe plus : la session se ferme, le cahier avec, et
      // la racine ramène à la connexion.
      // La connexion le DIRA en revenant : « votre compte a été supprimé ».
      await fermer("compteSupprime").catch(() => {});
      return true;
    }).catch(() => {});
  };

  return (
    <Feuille
      visible
      libelleFermer={t.annuler}
      onFermer={() => { if (!geste.occupe) onFermer(); }}
      entete={
        <Texte taille={textes.intertitre} poids="demi" ton="negatif">
          {t.supprimerTitre}
        </Texte>
      }
      pied={
        <View style={{ gap: espaces.sm }}>
          {/* LE REFUS SE DIT DANS LE PIED, toujours visible. Écrit sous le
              champ, il tombait hors de l'écran sur un téléphone de 320
              points — vu sur la capture : on appuyait, et rien ne
              semblait se passer. Le pied grandit vers le haut : le bouton
              rouge reste où était le doigt. */}
          {erreur ? (
            <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
              {erreur}
            </Texte>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={supprimer}
            disabled={geste.occupe}
            style={({ pressed }) => ({
              flexDirection: "row", gap: espaces.sm,
              alignItems: "center", justifyContent: "center",
              paddingVertical: espaces.md, borderRadius: rayons.bouton,
              backgroundColor: pressed ? couleurs.encre : couleurs.negatif,
            })}
          >
            {geste.occupe ? <ActivityIndicator size="small" color={couleurs.surfaceHaute} /> : null}
            <Texte poids="demi" style={{ color: couleurs.surfaceHaute }}>
              {geste.occupe ? t.supprimerEnCours : t.supprimerBouton}
            </Texte>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => { if (!geste.occupe) onFermer(); }}
            style={({ pressed }) => ({
              alignItems: "center", justifyContent: "center",
              paddingVertical: espaces.md, borderRadius: rayons.bouton,
              borderWidth: 1, borderColor: couleurs.trait,
              backgroundColor: pressed ? couleurs.surface2 : "transparent",
            })}
          >
            <Texte poids="moyen" ton="doux">{t.annuler}</Texte>
          </Pressable>
        </View>
      }
    >
      <View style={{ gap: espaces.md }}>
        <Texte style={{ lineHeight: 22 }}>{t.supprimerEfface}</Texte>
        <Carte style={{ padding: espaces.lg, flexDirection: "row", gap: espaces.md }}>
          <Icone nom="Check" taille={18} couleur={couleurs.positif} />
          <Texte taille={textes.petit} style={{ flex: 1, lineHeight: 20 }}>
            {t.supprimerArgent}
          </Texte>
        </Carte>
        <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>
          {t.supprimerPuce}
        </Texte>
        {/* « Écrivez-nous » sans adresse ne menait nulle part : le même
            chemin que « Contacter TOTEM » sur l'accueil. */}
        <Pressable
          accessibilityRole="link"
          onPress={() => void contacter()}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", gap: espaces.sm,
            alignSelf: "flex-start", minHeight: 44, opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icone nom="Mail" taille={16} couleur={couleurs.accent} />
          <Texte taille={textes.petit} poids="moyen" style={{ color: couleurs.accent }}>
            {t.ecrireATotem}
          </Texte>
        </Pressable>

        <Texte taille={textes.petit} ton="doux" poids="moyen">{t.supprimerMotDePasse}</Texte>
        <View style={{
          flexDirection: "row", alignItems: "center",
          borderWidth: 1, borderColor: erreur ? couleurs.negatif : couleurs.trait,
          borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
          paddingHorizontal: espaces.md,
        }}>
          <ChampTexte
            value={motdepasse}
            onChangeText={(v) => { setMotdepasse(v); setErreur(null); }}
            secureTextEntry={!visible}
            autoCapitalize="none" autoCorrect={false}
            autoComplete="current-password" textContentType="password"
            editable={!geste.occupe}
            onSubmitEditing={supprimer}
            returnKeyType="done"
            style={{
              flex: 1, paddingVertical: espaces.md,
              fontFamily: polices.corps, fontSize: textes.corps, color: couleurs.encre,
            }}
          />
          <BoutonIcone
            nom={visible ? "EyeOff" : "Eye"}
            couleur={couleurs.encrePale}
            etiquette={visible ? tc.masquerMotDePasse : tc.montrerMotDePasse}
            onPress={() => setVisible((v) => !v)}
          />
        </View>
      </View>
    </Feuille>
  );
}
