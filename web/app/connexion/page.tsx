"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUES, type Langue } from "@/lib/langue";
import { textesConnexion } from "@/lib/textes/connexion";
import { changerLangue, useLangue } from "@/app/langue";
import { Logo } from "../marque";
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
    /* LE PREMIER ÉCRAN DE L'APPLICATION, RÉGLÉ AU POUCE.
     *
     * Trois défauts mesurés sur 390 × 844, et ce qu'on en a fait :
     *
     *   1. LE BLOC ÉTAIT CENTRÉ : 210 px de vide au-dessus, 210 en dessous, et
     *      le bouton « Se connecter » à 366 px du bord bas — hors de portée du
     *      pouce (arc FACILE ≤ 270). Le bloc de saisie est maintenant ANCRÉ EN
     *      BAS (`mt-auto`) et la marque tient le haut : on lit du haut vers le
     *      bas, on agit là où la main est. Sur grand écran, où il n'y a pas de
     *      pouce, l'ancrage se défait et le bloc reprend le milieu.
     *
     *   2. LA MARQUE FAISAIT 24 × 24, plus petite que le mot « Connexion »
     *      (28), collée dans l'angle. C'était une vignette. C'est désormais le
     *      VERROUILLAGE horizontal de `docs/IDENTITE.md` §5 — symbole latérite
     *      et mot, aux proportions de `brand/generer.py` — posé seul en haut,
     *      avec la zone de protection que la charte lui doit.
     *
     *   3. À 1440, le bloc de 384 px laissait 528 px de vide DE CHAQUE CÔTÉ,
     *      posé nulle part. Au-dessus de `md`, il devient une carte du système
     *      — surface, filet, rayon — centrée dans la page : le vide autour
     *      cesse d'être une colonne perdue pour devenir la marge d'un objet.
     */
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col py-8 md:max-w-md md:justify-center md:py-12">
      {/* LA SIGNATURE — en haut, seule. La zone de protection de la charte
          vaut la largeur du symbole ; `p-6` (24) la tient largement. */}
      <div className="flex justify-center p-6 md:mb-4">
        <Logo />
      </div>

      {/* LE BLOC DE SAISIE — poussé en bas au téléphone, recentré au-delà. */}
      <div className="mt-auto flex flex-col gap-6 md:mt-0 md:rounded-card md:border md:border-line md:bg-surface-raised md:p-8">
        <div>
          <h1 className="text-title">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
          {/* La promesse sur le code PIN se lit AVANT de taper, pas après :
              elle dit lequel des deux mots de passe on demande ici. Elle
              traînait tout en bas de l'écran, sous le choix de la langue. */}
          <p className="mt-4 max-w-lecture text-caption text-ink-faint">{t.notePin}</p>
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

          {/* L'ACTION EST VIVANTE DÈS L'OUVERTURE. Elle naissait éteinte — fond
              gris, texte gris — tant que le champ était vide : le premier écran
              de l'application était un bouton mort, et rien ne disait pourquoi.
              Elle ne s'éteint plus que pendant qu'elle travaille. Le champ est
              `required` : un envoi à vide est refusé PAR LA TENTATIVE, et
              l'erreur se dit après elle, jamais avant. */}
          <Bouton
            type="submit"
            variante="primaire"
            pleineLargeur
            desactive={etat === "envoi"}
          >
            {etat === "envoi" ? t.verification : t.seConnecter}
          </Bouton>

          {etat === "erreur" && (
            <p className="text-small text-negative">{message}</p>
          )}
        </form>
      </div>

      {/* Le choix de la langue — chaque nom dans sa propre langue. Les deux
          boutons étaient du texte nu de 16 px de haut ; le groupe de segments
          pose 44 px une fois, et les deux segments l'occupent. Il vient APRÈS
          l'action : on change de langue une fois dans sa vie, on se connecte
          tous les jours. */}
      <div className="mt-6 flex justify-center">
        <GroupeSegments
          libelle={t.langue}
          options={LANGUES.map(({ code, libelle }) => ({ valeur: code, libelle }))}
          valeur={langue}
          surChangement={(code) => changerLangue(code as Langue)}
        />
      </div>
    </div>
  );
}
