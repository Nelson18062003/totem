"use client";

// Les deux gestes de « je n'arrive plus à entrer » : demander le lien qui
// ferme tout, et s'en servir.
//
// Ce qui compte ici et qu'une relecture rapide ne verrait pas : le formulaire
// de demande n'a AUCUN champ de mot de passe et n'en aura jamais. Il demande
// une adresse, rien de plus, et la réponse affichée est la même quoi qu'il
// arrive — c'est la route qui garantit qu'elle ne peut pas être différente,
// et l'écran ne connaît qu'une seule phrase à montrer.

import { useState } from "react";
import { useLangue } from "@/app/langue";
import { textesRetour } from "@/lib/textes/retour";
import { IconClose, IconLock } from "@/app/icons";

export function DemandeDeFermeture() {
  const langue = useLangue();
  const t = textesRetour[langue];
  const [courriel, setCourriel] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "envoye" | "erreur">("repos");

  async function demander() {
    if (!courriel.includes("@")) return;
    setEtat("envoi");
    try {
      const rep = await fetch("/api/retour/fermeture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courriel }),
      });
      // « envoyé » quel que soit le contenu de la réponse : la route n'a
      // qu'une seule réponse à donner, et l'écran n'a donc qu'un seul état à
      // afficher. Seule une panne de réseau se distingue.
      setEtat(rep.ok ? "envoye" : "erreur");
    } catch {
      setEtat("erreur");
    }
  }

  if (etat === "envoye") {
    return (
      <div className="mt-4 rounded-btn bg-surface-2 px-4 py-4">
        <p className="text-small leading-relaxed">{t.fermerEnvoye}</p>
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">{t.fermerNeDitPas}</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <label htmlFor="courriel-fermeture" className="text-small font-medium">
        {t.fermerAdresse}
      </label>
      <input
        id="courriel-fermeture"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        value={courriel}
        disabled={etat === "envoi"}
        onChange={(e) => setCourriel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && demander()}
        placeholder={t.fermerExemple}
        className="mt-2 h-12 w-full rounded-btn border border-line-control bg-surface-raised
                   px-3 text-body outline-none transition focus:border-ink disabled:opacity-50"
      />
      <button
        onClick={demander}
        disabled={etat === "envoi" || !courriel.includes("@")}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-btn
                   border-2 border-negative px-4 text-body font-medium text-negative
                   transition hover:bg-surface-2 disabled:opacity-40"
      >
        <IconClose size={18} />
        {etat === "envoi" ? t.fermerEnvoi : t.fermerBouton}
      </button>
      {etat === "erreur" && (
        <p className="mt-2 text-small leading-relaxed text-negative">{t.fermerRate}</p>
      )}
      <p className="mt-3 text-caption leading-relaxed text-ink-faint">
        {t.fermerPourquoiUnLien}
      </p>
    </div>
  );
}

/**
 * Le geste porté par le lien reçu par courriel.
 *
 * POURQUOI UN BOUTON, ET PAS LE LIEN LUI-MÊME.
 * Le jeton ne sert qu'une fois. Si l'ouverture du lien le consommait, le
 * premier antivirus de messagerie qui va voir où mènent les liens brûlerait
 * le seul lien de la personne — et elle trouverait « ce lien ne marche plus »
 * sans que rien n'ait été fermé. Le lien ouvre donc une page qui ne lit rien ;
 * c'est ce bouton, et lui seul, qui ferme.
 */
export function BoutonDeFermeture({ jeton }: { jeton: string }) {
  const langue = useLangue();
  const t = textesRetour[langue];
  const [etat, setEtat] = useState<"repos" | "envoi" | "fait" | "rate">("repos");

  async function fermer() {
    setEtat("envoi");
    try {
      const rep = await fetch(`/api/retour/fermeture/${encodeURIComponent(jeton)}`, {
        method: "POST",
      });
      const corps = await rep.json().catch(() => null);
      setEtat(rep.ok && corps?.ok ? "fait" : "rate");
    } catch {
      setEtat("rate");
    }
  }

  if (etat === "fait") {
    return (
      <div className="rounded-card bg-surface-raised px-5 py-6 shadow-sm">
        <h1 className="text-title font-semibold tracking-tight text-balance">
          {t.lienFaitTitre}
        </h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.lienFaitDit}</p>
        <a
          href="/connexion"
          className="mt-4 flex h-12 w-full items-center justify-center rounded-btn bg-accent
                     px-4 text-body font-medium text-white transition hover:bg-accent-hover"
        >
          {t.allerEntrer}
        </a>
      </div>
    );
  }

  if (etat === "rate") {
    return (
      <div className="rounded-card bg-surface-raised px-5 py-6 shadow-sm">
        <h1 className="text-title font-semibold tracking-tight text-balance">
          {t.lienRateTitre}
        </h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.lienRateDit}</p>
        <a
          href="/retour"
          className="mt-4 flex h-12 w-full items-center justify-center rounded-btn
                     border border-line-control px-4 text-body font-medium transition
                     hover:border-ink-faint"
        >
          {t.lienRetour}
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-card border-2 border-negative bg-surface-raised p-5">
      <div className="flex items-start gap-3">
        <IconLock size={20} className="mt-0.5 shrink-0 text-negative" />
        <div>
          <h1 className="text-heading font-semibold">{t.lienTitre}</h1>
          <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.lienDit}</p>
        </div>
      </div>
      <button
        onClick={fermer}
        disabled={etat === "envoi"}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-btn
                   border-2 border-negative px-4 text-body font-medium text-negative
                   transition hover:bg-surface-2 disabled:opacity-40"
      >
        <IconClose size={18} />
        {etat === "envoi" ? t.lienEnCours : t.lienBouton}
      </button>
    </div>
  );
}
