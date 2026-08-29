"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { textesConnexion } from "@noyau/textes/connexion";
import { useLangue } from "@/app/langue";
import { Symbole } from "../marque";

/**
 * Créer un compte.
 *
 * Cet écran est OUVERT à tout le monde, et ce n'est pas une négligence : ce
 * qui protège la plateforme n'est pas l'impossibilité de s'inscrire, c'est ce
 * qu'un compte neuf peut faire — c'est-à-dire rien. Il est créé, il attend,
 * et le propriétaire décide de lui ouvrir ou non.
 *
 * Une seule exception, et elle est logique : le TOUT PREMIER compte est celui
 * du propriétaire. Personne n'est là pour l'approuver, et l'attente serait
 * sans fin. C'est celui qui installe la plateforme.
 *
 * Le mot de passe se demande DEUX fois. Une faute de frappe dans un champ
 * masqué ne se voit pas, et l'on découvrirait le problème à la connexion
 * suivante, sans savoir lequel des deux caractères a glissé.
 */
export default function Inscription() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesConnexion[langue];

  const [courriel, setCourriel] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [repete, setRepete] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur" | "attente">("repos");
  const [message, setMessage] = useState("");

  const assezLong = motDePasse.length >= 12;
  const pareils = motDePasse === repete;
  const complet = Boolean(courriel) && assezLong && pareils;

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!complet || etat === "envoi") return;
    setEtat("envoi");
    setMessage("");
    try {
      const r = await fetch("/api/inscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courriel, motdepasse: motDePasse }),
      });
      const corps = await r.json().catch(() => ({}));
      if (r.ok && corps.proprietaire) {
        // Le propriétaire entre immédiatement : il vient de créer la maison.
        router.replace("/");
        router.refresh();
        return;
      }
      if (r.ok || r.status === 202) {
        setEtat("attente");
        return;
      }
      setEtat("erreur");
      setMessage(corps?.erreur || t.connexionImpossible);
    } catch {
      setEtat("erreur");
      setMessage(t.connexionImpossible);
    }
  }

  if (etat === "attente") {
    return (
      <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center py-10">
        <Symbole size={34} className="text-laterite" />
        <h1 className="mt-5 text-title font-semibold tracking-tight">
          {t.compteEnAttenteTitre}
        </h1>
        <p className="mt-3 text-small leading-relaxed text-ink-soft">
          {t.compteEnAttenteTexte}
        </p>
        <a
          href="/connexion"
          className="mt-8 rounded-btn border border-line py-3 text-center text-body font-medium text-ink-soft transition hover:border-ink-faint"
        >
          {t.jAiDejaUnCompte}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center py-10">
      <div className="mb-9">
        <Symbole size={34} className="text-laterite" />
        <h1 className="mt-5 text-title font-semibold tracking-tight">
          {t.inscriptionTitre}
        </h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">
          {t.inscriptionSousTitre}
        </p>
      </div>

      <form onSubmit={creer} className="flex flex-col gap-4">
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

        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.motDePasse}</span>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="new-password"
            required
            className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink"
          />
          <span className={`text-caption ${
            motDePasse && !assezLong ? "text-negative" : "text-ink-faint"
          }`}>
            {t.motDePasseConseil}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.confirmerMotDePasse}</span>
          <input
            type="password"
            value={repete}
            onChange={(e) => setRepete(e.target.value)}
            autoComplete="new-password"
            required
            className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink"
          />
          {repete && !pareils && (
            <span className="text-caption text-negative">{t.motsDePasseDifferents}</span>
          )}
        </label>

        <button
          type="submit"
          disabled={!complet || etat === "envoi"}
          className="mt-2 rounded-btn bg-ink py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35"
        >
          {etat === "envoi" ? t.verification : t.creerUnCompte}
        </button>

        {etat === "erreur" && <p className="text-small text-negative">{message}</p>}
      </form>

      <a
        href="/connexion"
        className="mt-6 text-center text-small font-medium text-ink underline underline-offset-4"
      >
        {t.jAiDejaUnCompte}
      </a>

      <p className="mt-10 text-caption leading-relaxed text-ink-faint">{t.notePin}</p>
    </div>
  );
}
