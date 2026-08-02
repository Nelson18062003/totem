"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Symbole } from "../marque";

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
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setEtat("erreur");
      setMessage(erreur || "Mot de passe incorrect.");
    } catch {
      setEtat("erreur");
      setMessage("Connexion impossible pour l’instant. Réessayez.");
    }
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center py-10">
      <div className="mb-9">
        <Symbole size={34} className="text-laterite" />
        <h1 className="mt-5 text-title font-semibold tracking-tight">Connexion</h1>
        <p className="mt-1 text-small text-ink-soft">
          Accès réservé au propriétaire du terminal.
        </p>
      </div>

      <form onSubmit={entrer} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">Mot de passe</span>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink"
          />
        </label>

        <button
          type="submit"
          disabled={!motDePasse || etat === "envoi"}
          className="mt-2 rounded-btn bg-ink py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35"
        >
          {etat === "envoi" ? "Vérification…" : "Se connecter"}
        </button>

        {etat === "erreur" && (
          <p className="text-small text-negative">{message}</p>
        )}
      </form>

      <p className="mt-10 text-caption leading-relaxed text-ink-faint">
        Le code PIN Mobile Money n’est jamais demandé ici. Il ne se saisit qu’au
        moment d’une opération, et n’est enregistré nulle part.
      </p>
    </div>
  );
}
