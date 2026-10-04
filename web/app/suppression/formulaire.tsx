"use client";

import { useRef, useState } from "react";
import type { textesSuppression } from "@noyau/textes/suppression";

type Textes = (typeof textesSuppression)["fr"];

/**
 * Supprimer son compte depuis la page web, sans l'application.
 *
 * Deux temps, et l'ordre compte : on OUVRE d'abord une session avec le
 * courriel et le mot de passe (`/api/connexion`, qui pose le cookie), puis
 * on demande la suppression (`/api/moi/suppression`), qui revérifie le mot
 * de passe et referme la session. Ouvrir d'abord remplace aussi une session
 * déjà présente dans ce navigateur : sans cela, la suppression viserait le
 * compte de cette AUTRE session, avec le mot de passe de celui-ci.
 *
 * Le propriétaire de la plateforme et la vitrine reçoivent la phrase de la
 * plateforme qui dit pourquoi ils ne se suppriment pas par ici.
 */
export function FormulaireDeSuppression({ t, langue }: { t: Textes; langue: string }) {
  const [courriel, setCourriel] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "fait" | "erreur">("repos");
  const [message, setMessage] = useState("");
  const enVol = useRef(false);

  async function supprimer(e: React.FormEvent) {
    e.preventDefault();
    if (!courriel || !motDePasse || enVol.current) return;
    enVol.current = true;
    setEtat("envoi");
    setMessage("");
    try {
      const entree = await fetch(`/api/connexion?langue=${langue}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courriel, motdepasse: motDePasse }),
      });
      if (!entree.ok) {
        const c = await entree.json().catch(() => ({}));
        setEtat("erreur");
        setMessage(c?.erreur || t.impossible);
        return;
      }
      const r = await fetch(`/api/moi/suppression?langue=${langue}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ motdepasse: motDePasse }),
      });
      const c = await r.json().catch(() => ({}));
      if (r.ok && c.ok) {
        setEtat("fait");
        setMotDePasse("");
        return;
      }
      setEtat("erreur");
      setMessage(c?.erreur || t.impossible);
    } catch {
      setEtat("erreur");
      setMessage(t.impossible);
    } finally {
      enVol.current = false;
    }
  }

  if (etat === "fait") {
    return <p className="font-medium text-ink" role="status">{t.fait}</p>;
  }

  const champ =
    "rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-ink";

  return (
    <form onSubmit={supprimer} className="flex max-w-sm flex-col gap-3">
      <p>{t.formulaireAide}</p>
      <label className="flex flex-col gap-1.5">
        <span>{t.courriel}</span>
        <input type="email" value={courriel} onChange={(e) => setCourriel(e.target.value)}
          autoComplete="username" autoCapitalize="none" required className={champ} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span>{t.motDePasse}</span>
        <input type="password" value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          autoComplete="current-password" required className={champ} />
      </label>
      <button
        type="submit"
        disabled={!courriel || !motDePasse || etat === "envoi"}
        className="mt-1 rounded-btn bg-negative py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35"
      >
        {etat === "envoi" ? t.enCours : t.confirmer}
      </button>
      {etat === "erreur" && <p className="text-negative" role="alert">{message}</p>}
    </form>
  );
}
