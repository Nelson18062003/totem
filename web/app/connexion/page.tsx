"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { LANGUES } from "@noyau/langue";
import { textesConnexion } from "@noyau/textes/connexion";
import { changerLangue, useLangue } from "@/app/langue";
import { Symbole } from "../marque";

/**
 * L'écran de connexion — le verrou réel de la plateforme.
 *
 * Un courriel et un mot de passe, vérifiés contre un COMPTE rangé en base.
 * Le mot de passe n'y est jamais : seulement son empreinte, qui ne se remonte
 * pas (voir `lib/motdepasse.ts`).
 *
 * Sous le formulaire, un lien discret : la CLÉ DE SECOURS. C'est l'ancien
 * mot de passe unique, posé dans les variables d'environnement de
 * l'hébergement. Il reste là pour une raison précise — les comptes vivent
 * dans Supabase, et si Supabase ne répond pas, plus personne n'entre, pas
 * même pour constater la panne. Discret, parce que ce n'est pas le chemin de
 * tous les jours ; présent, parce qu'une base injoignable ne doit pas être
 * un verrou sur sa propre maison.
 *
 * Ce n'est PAS le code PIN Mobile Money : celui-là ne se saisit qu'au moment
 * d'une opération, et n'est enregistré nulle part.
 */
export default function Connexion() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesConnexion[langue];
  const [courriel, setCourriel] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  // La clé de secours se demande explicitement : sans courriel, la porte
  // comprend qu'on présente la clé de l'hébergement.
  const [secours, setSecours] = useState(false);
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");

  async function entrer(e: React.FormEvent) {
    e.preventDefault();
    if (!motDePasse || etat === "envoi") return;
    if (!secours && !courriel) return;
    setEtat("envoi");
    setMessage("");
    try {
      const r = await fetch("/api/connexion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          secours ? { motdepasse: motDePasse }
                  : { courriel, motdepasse: motDePasse }),
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
        {/* La présentation en une phrase : c'est le seul écran qu'un visiteur
            verra jamais — il doit dire ce qu'est TOTEM, pas seulement
            demander un mot de passe. */}
        <p className="mt-2 text-small leading-relaxed text-ink-soft">
          {t.sousTitre}
        </p>
        <p className="mt-2 text-caption text-ink-faint">{t.reserve}</p>
      </div>

      <form onSubmit={entrer} className="flex flex-col gap-4">
        {!secours && (
          <label className="flex flex-col gap-1.5">
            <span className="text-small text-ink-soft">{t.courriel}</span>
            <input
              type="email"
              value={courriel}
              onChange={(e) => setCourriel(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              required
              className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.motDePasse}</span>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            autoFocus={secours}
            required
            className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink"
          />
        </label>

        {secours && (
          <p className="text-caption leading-relaxed text-ink-faint">
            {t.cleDeSecoursAide}
          </p>
        )}

        <button
          type="submit"
          disabled={!motDePasse || (!secours && !courriel) || etat === "envoi"}
          className="mt-2 rounded-btn bg-ink py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35"
        >
          {etat === "envoi" ? t.verification : t.seConnecter}
        </button>

        {etat === "erreur" && (
          <p className="text-small text-negative">{message}</p>
        )}
      </form>

      <div className="mt-6 flex flex-col items-center gap-3 text-small">
        <a href="/inscription" className="font-medium text-ink underline underline-offset-4">
          {t.creerUnCompte}
        </a>
        {/* La clé de secours ne s'annonce pas plus fort que cela : ce n'est
            pas le chemin de tous les jours. */}
        <button
          type="button"
          onClick={() => { setSecours((v) => !v); setMessage(""); setEtat("repos"); }}
          className="text-caption text-ink-faint transition hover:text-ink-soft"
        >
          {secours ? t.retourAuCompte : t.cleDeSecours}
        </button>
      </div>

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
