"use client";

import { useState } from "react";

/**
 * Écran de connexion — maquette.
 *
 * Le verrou réel viendra à la phase 4 (Supabase Auth) : cet écran en dessine
 * la forme et le ton. Rien n'est vérifié ici, aucun mot de passe n'est envoyé
 * nulle part.
 */
export default function Connexion() {
  const [etape, setEtape] = useState<"identifiants" | "code">("identifiants");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center py-10">
      <div className="mb-9">
        <span className="grid size-10 place-items-center rounded-sm bg-ink text-body font-semibold text-white">
          T
        </span>
        <h1 className="mt-5 text-title font-semibold tracking-tight">
          {etape === "identifiants" ? "Connexion" : "Vérification"}
        </h1>
        <p className="mt-1 text-small text-ink-soft">
          {etape === "identifiants"
            ? "Accès réservé au propriétaire du terminal."
            : "Saisissez le code envoyé sur votre Telegram."}
        </p>
      </div>

      {etape === "identifiants" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setEtape("code");
          }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-small text-ink-soft">Adresse e-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-small text-ink-soft">Mot de passe</span>
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
              required
              className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink"
            />
          </label>

          <button
            type="submit"
            disabled={!email || !motDePasse}
            className="mt-2 rounded-btn bg-ink py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35"
          >
            Continuer
          </button>

          <button type="button" className="text-small text-ink-soft underline-offset-4 hover:underline">
            Mot de passe oublié
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
          }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-small text-ink-soft">Code à six chiffres</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              className="rounded-btn border border-line bg-surface-raised px-3.5 py-3 text-center text-title tabnums tracking-[0.4em] outline-none transition focus:border-ink"
            />
          </label>

          <button
            type="submit"
            disabled={code.length < 6}
            className="rounded-btn bg-ink py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35"
          >
            Se connecter
          </button>

          <button
            type="button"
            onClick={() => setEtape("identifiants")}
            className="text-small text-ink-soft underline-offset-4 hover:underline"
          >
            Revenir en arrière
          </button>
        </form>
      )}

      <p className="mt-10 text-caption leading-relaxed text-ink-faint">
        Le code PIN Mobile Money n’est jamais demandé ici. Il ne se saisit qu’au
        moment d’une opération, et n’est enregistré nulle part.
      </p>
    </div>
  );
}
