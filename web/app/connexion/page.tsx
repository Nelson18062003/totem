"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUES, type Langue } from "@/lib/langue";
import { textesConnexion } from "@/lib/textes/connexion";
import { changerLangue, useLangue } from "@/app/langue";
import { Symbole } from "../marque";
import { Bouton } from "../ui/bouton";
import { Champ } from "../ui/champ";
import { GroupeSegments } from "../ui/selecteurs";

/**
 * L'écran de connexion — le verrou réel de la plateforme.
 *
 * Un seul mot de passe, celui du propriétaire (défini dans les variables
 * d'environnement du déploiement, jamais dans le code). Ce n'est PAS le code
 * PIN Mobile Money : celui-là ne se saisit qu'au moment d'une opération, et
 * n'est enregistré nulle part.
 */
export default function Connexion() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesConnexion[langue];
  const [motDePasse, setMotDePasse] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");

  async function entrer(e: React.FormEvent) {
    e.preventDefault();
    if (!motDePasse || etat === "envoi") return;
    setEtat("envoi");
    setMessage("");
    try {
      const r = await fetch("/api/connexion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ motdepasse: motDePasse }),
      });
      if (r.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      // La route répond déjà dans la langue de l'écran : afficher tel quel.
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setEtat("erreur");
      setMessage(erreur || t.motDePasseIncorrect);
    } catch {
      setEtat("erreur");
      setMessage(t.connexionImpossible);
    }
  }

  return (
    // Le centrage est écrit : la colonne occupe la hauteur de la fenêtre et
    // pousse son contenu au milieu. Elle portait une hauteur minimale de
    // 70 % de l'écran qui ne servait qu'à ça — une dimension inventée pour
    // obtenir un alignement qu'on peut simplement demander.
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center py-12">
      <div className="mb-8">
        <Symbole size={24} className="text-laterite" />
        <h1 className="mt-6 text-title">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">
          {t.sousTitre}
        </p>
      </div>

      <form onSubmit={entrer} className="flex flex-col gap-4">
        {/* Le mot de passe passe par le champ du système : hauteur posée (44),
            contour porteur, libellé associé. Il n'est ni affiché ni journalisé —
            `type="password"` et rien d'autre ne le touche. */}
        <Champ
          libelle={t.motDePasse}
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />

        {/* L'action principale est indigo et fait 48 : c'est ce qui coûte cher
            à rater. Éteinte, elle change de couleur — jamais d'opacité. */}
        <Bouton
          type="submit"
          variante="primaire"
          pleineLargeur
          desactive={!motDePasse || etat === "envoi"}
        >
          {etat === "envoi" ? t.verification : t.seConnecter}
        </Bouton>

        {etat === "erreur" && (
          <p className="text-small text-negative">{message}</p>
        )}
      </form>

      {/* Le choix de la langue — chaque nom dans sa propre langue. Les deux
          boutons étaient du texte nu de 16 px de haut ; le groupe de segments
          pose 44 px une fois, et les deux segments l'occupent. */}
      <div className="mt-8 flex justify-center">
        <GroupeSegments
          libelle={t.langue}
          options={LANGUES.map(({ code, libelle }) => ({ valeur: code, libelle }))}
          valeur={langue}
          surChangement={(code) => changerLangue(code as Langue)}
        />
      </div>

      <p className="mt-12 text-caption text-ink-faint">
        {t.notePin}
      </p>
    </div>
  );
}
