"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { textesConnexion } from "@noyau/textes/connexion";
import { useLangue } from "@/app/langue";
import { Symbole } from "../marque";
import { COURRIEL_EN_ATTENTE } from "../connexion/attente";

/**
 * Créer le compte du propriétaire — le tout premier, sur une plateforme neuve.
 *
 * Un courriel, et c'est tout. Un code part vers cette boîte ; on le tape sur
 * l'écran de connexion, qui s'ouvre directement à l'étape du code. Ainsi la
 * toute première entrée prouve déjà qu'on tient la boîte : un courriel mal
 * tapé à l'installation se voit tout de suite, au lieu de se découvrir le
 * jour où il faudrait recevoir un code.
 *
 * Dès qu'un compte existe, cet écran ne mène plus qu'à un refus — et le lien
 * qui y mène disparaît de l'écran de connexion. Les comptes suivants, c'est
 * le propriétaire qui les crée.
 */
export default function Inscription() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesConnexion[langue];

  const [courriel, setCourriel] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!courriel || etat === "envoi") return;
    setEtat("envoi");
    setMessage("");
    try {
      const r = await fetch("/api/inscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courriel }),
      });
      const corps = await r.json().catch(() => ({}));
      if (r.ok) {
        // L'écran de connexion reprend à l'étape du code. Le courriel passe
        // par la mémoire de l'onglet, pas par l'adresse : une adresse se
        // garde dans l'historique, se copie, se partage.
        try { sessionStorage.setItem(COURRIEL_EN_ATTENTE, courriel); } catch { /* rien */ }
        router.replace("/connexion");
        return;
      }
      setEtat("erreur");
      setMessage(corps?.erreur || t.connexionImpossible);
    } catch {
      setEtat("erreur");
      setMessage(t.connexionImpossible);
    }
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
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">{t.premierCompte}</p>
      </div>

      <form onSubmit={creer} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.courriel}</span>
          <input
            type="email"
            name="courriel"
            value={courriel}
            onChange={(e) => setCourriel(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
            className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink"
          />
        </label>

        <button
          type="submit"
          disabled={!courriel || etat === "envoi"}
          className="mt-2 rounded-btn bg-ink py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35"
        >
          {etat === "envoi" ? t.verification : t.creerUnCompte}
        </button>

        {etat === "erreur" && <p className="text-small text-negative" role="alert">{message}</p>}
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
