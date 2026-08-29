// Le pavé du code secret.
//
// Les chiffres composés ne vivent que dans l'état de ce composant : jamais
// affichés (des points), jamais journalisés, envoyés au terminal seulement à
// « Valider » — puis aussitôt oubliés ici, et masqués en base par le robot
// sitôt lus. Le journal n'en garde que « •••• ».
//
// Trois choses qu'on serait tenté d'ajouter, et qu'il ne faut PAS :
//
//   — un clavier système. Il propose des suggestions, il garde un
//     historique, et certains claviers tiers renvoient la frappe ailleurs.
//     Des boutons à nous ne laissent aucune trace.
//   — un « afficher le code ». Le pavé sert dans un taxi, dans une file.
//   — un retour haptique par chiffre. Le rythme des vibrations se lit à
//     l'oreille et donne la longueur du code.

import { useState } from "react";
import { Pressable, View } from "react-native";
import { Texte } from "@/ui";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { textesGuichet } from "@noyau/textes/guichet";
import { useLangue } from "@/langue";

const LONGUEUR_MIN = 4;
const LONGUEUR_MAX = 6;

export function PaveSecret({ onValider }: { onValider: (code: string) => void }) {
  const langue = useLangue();
  const t = textesGuichet[langue];
  const [code, setCode] = useState("");

  const appuyer = (c: string) =>
    setCode((v) => (v.length >= LONGUEUR_MAX ? v : v + c));
  const effacer = () => setCode((c) => c.slice(0, -1));
  const valider = () => {
    if (code.length < LONGUEUR_MIN) return;
    onValider(code);
    setCode("");            // rien ne subsiste après l'envoi
  };

  return (
    <View style={{ alignItems: "center", gap: espaces.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
        <Texte taille={textes.petit} ton="doux">{t.paveTitre}</Texte>
        {/* Tout ce qui sera jamais montré : des points. */}
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}
          accessibilityLabel={t.chiffresComposes(code.length)}
        >
          {Array.from({ length: Math.max(LONGUEUR_MIN, code.length) }).map((_, i) => (
            <View
              key={i}
              style={
                i < code.length
                  ? { width: 10, height: 10, borderRadius: rayons.rond,
                      backgroundColor: couleurs.encre }
                  : { width: 8, height: 8, borderRadius: rayons.rond,
                      borderWidth: 1, borderColor: couleurs.encrePale }
              }
            />
          ))}
        </View>
      </View>

      <View style={{
        flexDirection: "row", flexWrap: "wrap", justifyContent: "center",
        gap: espaces.sm, maxWidth: 280,
      }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((c) => (
          <Touche key={c} libelle={c} onPress={() => appuyer(c)} />
        ))}
        <Touche libelle={t.effacer} onPress={effacer} discret
                accessibilityLabel={t.effacerDernier} />
        <Touche libelle="0" onPress={() => appuyer("0")} />
        <Touche
          libelle={t.valider}
          onPress={valider}
          principal
          desactive={code.length < LONGUEUR_MIN}
        />
      </View>
    </View>
  );
}

function Touche({
  libelle, onPress, principal, discret, desactive, accessibilityLabel,
}: {
  libelle: string;
  onPress: () => void;
  principal?: boolean;
  discret?: boolean;
  desactive?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desactive}
      accessibilityLabel={accessibilityLabel ?? libelle}
      style={({ pressed }) => ({
        width: 84,
        paddingVertical: espaces.md,
        alignItems: "center",
        borderRadius: rayons.bouton,
        borderWidth: discret ? 0 : 1,
        borderColor: couleurs.trait,
        backgroundColor: desactive
          ? couleurs.surface3
          : principal
            ? (pressed ? couleurs.accentAppui : couleurs.accent)
            : discret
              ? "transparent"
              : (pressed ? couleurs.surface2 : couleurs.surfaceHaute),
        opacity: desactive ? 0.6 : 1,
      })}
    >
      <Texte
        poids={principal ? "demi" : "moyen"}
        chiffresAlignes
        taille={discret || principal ? textes.petit : textes.corps}
        style={principal ? { color: couleurs.surfaceHaute } : undefined}
        ton={discret ? "doux" : "normal"}
      >
        {libelle}
      </Texte>
    </Pressable>
  );
}
