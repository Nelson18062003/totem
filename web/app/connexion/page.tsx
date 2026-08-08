"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { LANGUES } from "@/lib/langue";
import { textesConnexion } from "@/lib/textes/connexion";
import { changerLangue, useLangue } from "@/app/langue";
import { EntrerAvecLeTelephone } from "@/app/cle-boutons";
import { Symbole } from "../marque";

/**
 * L'écran de connexion — le verrou réel de la plateforme.
 *
 * DEUX CHEMINS, ET L'ORDRE EST UNE DÉCISION
 * Le doigt est en haut parce que c'est le chemin de tous les jours : un geste,
 * rien à retenir, et un faux site ne peut pas s'en servir. Le mot de passe est
 * en dessous parce qu'il sert les jours d'exception — et parce qu'un chemin
 * qu'on relègue en bas de page est un chemin qu'on n'ose plus prendre.
 *
 * Le bouton du haut ne s'affiche QUE si le navigateur sait faire : un bouton
 * qui échoue toujours se lit comme une panne de TOTEM.
 *
 * Le mot de passe reste celui du propriétaire (variables d'environnement du
 * déploiement, jamais dans le code). Ce n'est PAS le code PIN Mobile Money :
 * celui-là ne se saisit qu'au moment d'une opération, et n'est enregistré
 * nulle part.
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
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center py-10">
      <div className="mb-9">
        <Symbole size={34} className="text-laterite" />
        <h1 className="mt-5 text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">
          {t.sousTitre}
        </p>
      </div>

      {/* Le chemin de tous les jours, en premier. */}
      <div className="mb-6">
        <EntrerAvecLeTelephone
          t={t}
          apres={() => { router.replace("/"); router.refresh(); }}
        />
      </div>

      {/* Un séparateur, pas un titre : les deux chemins se valent, celui du
          bas n'est pas un rattrapage honteux. */}
      <div className="mb-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="text-caption text-ink-faint">{t.ouBien}</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={entrer} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.motDePasse}</span>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            className="rounded-btn border border-line-control bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink"
          />
        </label>

        <button
          type="submit"
          disabled={!motDePasse || etat === "envoi"}
          className="mt-2 rounded-btn bg-ink py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35"
        >
          {etat === "envoi" ? t.verification : t.seConnecter}
        </button>

        {etat === "erreur" && (
          <p className="text-small text-negative">{message}</p>
        )}
      </form>

      {/* Le choix de la langue — chaque nom dans sa propre langue */}
      <div className="mt-8 flex items-center justify-center gap-2 text-caption" aria-label={t.langue}>
        {LANGUES.map(({ code, libelle }, i) => (
          <Fragment key={code}>
            {i > 0 && <span aria-hidden className="text-ink-faint">·</span>}
            <button
              type="button"
              onClick={() => changerLangue(code)}
              aria-current={code === langue || undefined}
              className={
                code === langue
                  ? "font-medium text-ink"
                  : "text-ink-faint transition hover:text-ink-soft"
              }
            >
              {libelle}
            </button>
          </Fragment>
        ))}
      </div>

      <p className="mt-10 text-caption leading-relaxed text-ink-faint">
        {t.notePin}
      </p>
    </div>
  );
}
