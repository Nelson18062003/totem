"use client";

// Les trois gestes de l'écran des gens : donner une clé, annuler une
// invitation, reprendre une clé (et fermer un appareil).
//
// POURQUOI TOUT EST ICI ET RIEN N'EST DANS LA PAGE
// La page est un écran serveur : elle lit, elle date, elle n'appuie sur rien.
// Ces trois-là appuient, donc ils vivent côté navigateur — et ils ne
// reçoivent que des données déjà mises en forme. Une date à formater dans le
// navigateur donnerait l'heure du téléphone ; l'argent vit à Douala.
//
// LA DÉCISION QUI TIENT TOUT LE FICHIER
// Aucune conséquence ne se découvre après coup. Le rôle qu'on s'apprête à
// donner montre ce qu'il permet ET ce qu'il interdit avant qu'on valide ; la
// clé qu'on s'apprête à reprendre montre ses quatre suites avant qu'on
// appuie. Un écran qui explique après est un écran qui a menti avant.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLangue } from "@/app/langue";
import { textesGens } from "@/lib/textes/gens";
import type { Role } from "@/lib/session";
import { IconClose, IconCopy, IconDoc, IconLock, IconPhone, IconPlus } from "@/app/icons";

/** Un appareil ouvert, tel que la propriétaire le reconnaîtra. */
export type Appareil = {
  id: string;
  nom: string;
  lieu: string | null;
  vue: string;
  partage: boolean;
};

export type Fiche = {
  personne: number;
  nom: string;
  role: Role;
  moi: boolean;
  depuis: string;
  /** Datée dès que la clé est reprise — la ligne reste, elle ne disparaît pas. */
  retireLe: string | null;
  vue: string | null;
  appareils: Appareil[];
  cles: number;
};

export type Attente = {
  id: number;
  nom: string;
  role: Role;
  invitee: string;
  /** Le lien a été ouvert avant que la personne visée ne le reçoive. */
  ouvertAvant: boolean;
};

const ROLES_DONNABLES: readonly Role[] = ["operateur", "lecteur", "proprietaire"];

/** Les deux listes du rôle, côte à côte : ce qu'il permet, ce qu'il interdit. */
function CeQueLeRoleFait({ role }: { role: Role }) {
  const langue = useLangue();
  const t = textesGens[langue];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <h3 className="text-caption font-semibold uppercase tracking-wider text-ink-faint">
          {t.ceQuIlPourra}
        </h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {t.permet[role].map((l) => (
            <li key={l} className="flex gap-2 text-small leading-relaxed">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-positive" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-caption font-semibold uppercase tracking-wider text-ink-faint">
          {t.ceQuIlNePourraPas}
        </h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {t.interdit[role].map((l) => (
            <li key={l} className="flex gap-2 text-small leading-relaxed text-ink-soft">
              <IconClose size={14} className="mt-1 shrink-0 text-ink-faint" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// --- Donner une clé ---------------------------------------------------------

export function Inviter() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesGens[langue];
  const [ouvert, ouvrir] = useState(false);
  const [nom, setNom] = useState("");
  const [courriel, setCourriel] = useState("");
  const [role, setRole] = useState<Role>("operateur");
  const [etat, etablir] = useState<"repos" | "envoi" | "rate">("repos");
  const [message, dire] = useState("");
  // Le lien en clair. Il n'existe QUE dans cet état, et il disparaît avec la
  // page : la base n'en garde que l'empreinte.
  const [lien, setLien] = useState<{ url: string; nom: string } | null>(null);
  const [copie, setCopie] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    etablir("envoi");
    dire("");
    try {
      const r = await fetch("/api/gens/inviter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom, courriel, role }),
      });
      const reponse = await r.json().catch(() => ({}));
      if (!r.ok) {
        etablir("rate");
        dire(reponse?.erreur || t.rate);
        return;
      }
      setLien({ url: `${window.location.origin}${reponse.chemin}`, nom: reponse.nom });
      etablir("repos");
      setNom("");
      setCourriel("");
      router.refresh();
    } catch {
      etablir("rate");
      dire(t.rate);
    }
  }

  if (lien) {
    return (
      <section className="rounded-card border border-line bg-surface-raised p-4">
        <h2 className="text-heading font-semibold">{t.lienTitre(lien.nom)}</h2>
        <p className="mt-1.5 text-small leading-relaxed text-ink-soft">{t.lienDit}</p>
        <p className="mt-3 rounded-btn bg-surface-2 px-3 py-2.5 text-small break-all">
          {lien.url}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(lien.url);
                setCopie(true);
              } catch {
                setCopie(false);
              }
            }}
            className="flex h-11 items-center gap-2 rounded-btn border border-line-control px-4 text-small font-medium transition hover:border-ink-faint"
          >
            <IconCopy size={16} />
            {copie ? t.copie : t.copier}
          </button>
          <button
            type="button"
            onClick={() => { setLien(null); ouvrir(false); setCopie(false); }}
            className="flex h-11 items-center rounded-btn border border-line-control px-4 text-small font-medium transition hover:border-ink-faint"
          >
            {t.fini}
          </button>
        </div>
        <p className="mt-3 text-caption leading-relaxed text-ink-faint">{t.lienSeul}</p>
      </section>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => ouvrir(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-btn bg-accent px-4 text-body font-medium text-white transition hover:bg-accent-hover"
      >
        <IconPlus size={18} />
        {t.donner}
      </button>
    );
  }

  return (
    <form onSubmit={envoyer} className="rounded-card border border-line bg-surface-raised p-4">
      <h2 className="text-heading font-semibold">{t.donnerTitre}</h2>

      <label className="mt-4 block text-small font-medium" htmlFor="gens-nom">{t.nom}</label>
      <input
        id="gens-nom" value={nom} onChange={(e) => setNom(e.target.value)}
        autoComplete="off" required
        className="mt-1.5 h-11 w-full rounded-btn border border-line-control bg-surface-raised px-3 text-body"
      />
      <p className="mt-1 text-caption text-ink-faint">{t.nomAide}</p>

      <label className="mt-4 block text-small font-medium" htmlFor="gens-courriel">{t.courriel}</label>
      <input
        id="gens-courriel" value={courriel} onChange={(e) => setCourriel(e.target.value)}
        type="email" inputMode="email" autoComplete="off" required
        className="mt-1.5 h-11 w-full rounded-btn border border-line-control bg-surface-raised px-3 text-body"
      />
      <p className="mt-1 text-caption leading-relaxed text-ink-faint">{t.courrielAide}</p>

      <label className="mt-4 block text-small font-medium" htmlFor="gens-role">{t.quelRole}</label>
      <select
        id="gens-role" value={role} onChange={(e) => setRole(e.target.value as Role)}
        className="mt-1.5 h-11 w-full rounded-btn border border-line-control bg-surface-raised px-3 text-body"
      >
        {ROLES_DONNABLES.map((r) => (
          <option key={r} value={r}>{t.role[r]}</option>
        ))}
      </select>

      {/* Ce que ce rôle permet et interdit, AVANT de valider. */}
      <div className="mt-4 rounded-btn bg-surface-2 p-3">
        <CeQueLeRoleFait role={role} />
      </div>

      {etat === "rate" && (
        <p role="alert" className="mt-3 text-small text-negative">{message}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit" disabled={etat === "envoi"}
          className="h-11 flex-1 rounded-btn bg-accent px-4 text-body font-medium text-white transition hover:bg-accent-hover disabled:opacity-40"
        >
          {etat === "envoi" ? t.envoiEnCours : t.envoyer}
        </button>
        <button
          type="button" onClick={() => { ouvrir(false); etablir("repos"); }}
          className="h-11 rounded-btn border border-line-control px-4 text-small font-medium transition hover:border-ink-faint"
        >
          {t.renoncer}
        </button>
      </div>
    </form>
  );
}

// --- Une personne, ses appareils, et la reprise de sa clé -------------------

export function Personne({ fiche }: { fiche: Fiche }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesGens[langue];
  const [ouvert, ouvrir] = useState(false);
  const [confirme, confirmer] = useState(false);
  const [etat, etablir] = useState<"repos" | "travail" | "rate">("repos");
  const [message, dire] = useState("");

  const ici = fiche.appareils.length > 0;

  async function appeler(chemin: string, corps: unknown) {
    etablir("travail");
    dire("");
    try {
      const r = await fetch(chemin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corps),
      });
      if (!r.ok) {
        const { erreur } = await r.json().catch(() => ({ erreur: "" }));
        etablir("rate");
        dire(erreur || t.rate);
        return;
      }
      etablir("repos");
      confirmer(false);
      ouvrir(false);
      router.refresh();
    } catch {
      etablir("rate");
      dire(t.rate);
    }
  }

  return (
    <li className={fiche.retireLe ? "opacity-70" : undefined}>
      <div className="flex min-h-14 items-center gap-3 py-3">
        <span aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-small font-medium text-ink-soft">
          {fiche.nom.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium">
            {fiche.nom}
            {fiche.moi && <span className="text-ink-faint"> — {t.vous}</span>}
          </p>
          {/* Deux lignes plutôt qu'une : sur 390 px, « au comptoir · depuis le
              4 mars · vue il y a 3 h » se coupe, et c'est la fin — celle qui
              dit si la personne est là — qui disparaîtrait. */}
          <p className="truncate text-small text-ink-soft">
            {t.role[fiche.role]}
            {fiche.depuis && ` · ${t.depuis(fiche.depuis)}`}
          </p>
          <p className="truncate text-small text-ink-faint">
            {fiche.retireLe
              ? t.retireLe(fiche.retireLe)
              : ici
                ? t.ici
                : fiche.vue ? t.vuLe(fiche.vue) : t.jamaisVu}
          </p>
        </div>
        {!fiche.retireLe && !fiche.moi && (
          <button
            type="button" onClick={() => ouvrir(!ouvert)} aria-expanded={ouvert}
            className="h-11 shrink-0 rounded-btn border border-line-control px-3 text-small font-medium transition hover:border-ink-faint"
          >
            {t.saCle}
          </button>
        )}
      </div>

      {ouvert && (
        <div className="mb-3 rounded-card bg-surface-2 p-4">
          {/* Les appareils d'abord : fermer celui qu'on a laissé ouvert au
              comptoir suffit souvent, et ne coûte pas sa clé à quelqu'un. */}
          <h3 className="text-caption font-semibold uppercase tracking-wider text-ink-faint">
            {t.appareils}
          </h3>
          {fiche.appareils.length === 0 ? (
            <p className="mt-2 text-small text-ink-soft">{t.aucunAppareil}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {fiche.appareils.map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <IconPhone size={16} className="shrink-0 text-ink-soft" />
                  <span className="min-w-0 flex-1 text-small">
                    <span className="block truncate">{a.nom}</span>
                    <span className="block truncate text-caption text-ink-faint">
                      {[a.lieu, a.vue, a.partage ? t.appareilPartage : null]
                        .filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <button
                    type="button" disabled={etat === "travail"}
                    onClick={() => appeler("/api/gens/appareil", { session: a.id })}
                    className="h-11 shrink-0 rounded-btn border border-line-control px-3 text-small transition hover:border-ink-faint disabled:opacity-40"
                  >
                    {etat === "travail" ? t.fermetureEnCours : t.fermerAppareil}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fiche.cles > 0 && (
            <p className="mt-2 flex items-center gap-2 text-caption text-ink-faint">
              <IconLock size={14} className="shrink-0" />
              {t.avecLeTelephone(fiche.cles)}
            </p>
          )}

          <div className="mt-4 border-t border-line pt-4">
            {!confirme ? (
              <button
                type="button" onClick={() => confirmer(true)}
                className="h-11 w-full rounded-btn border border-line-control px-4 text-small font-medium text-negative transition hover:border-negative"
              >
                {t.reprendreTitre(fiche.nom)}
              </button>
            ) : (
              <>
                <p className="text-body font-medium">{t.reprendreTitre(fiche.nom)}</p>
                <p className="mt-1 text-small text-ink-soft">
                  {t.reprendreDit(fiche.appareils.length)}
                </p>
                {/* Les quatre suites, lues avant le geste. La première est
                    toute la différence entre une case cochée et une sécurité. */}
                <ul className="mt-3 flex flex-col gap-2">
                  {t.consequences.map((c, i) => (
                    <li key={c} className="flex gap-2.5 text-small leading-relaxed">
                      {i === 0 ? <IconClose size={16} className="mt-1 shrink-0 text-negative" />
                        : i === 1 ? <IconLock size={16} className="mt-1 shrink-0 text-ink-faint" />
                        : <IconDoc size={16} className="mt-1 shrink-0 text-ink-faint" />}
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button" onClick={() => confirmer(false)}
                    className="h-11 flex-1 rounded-btn border border-line-control px-4 text-small font-medium transition hover:border-ink-faint"
                  >
                    {t.garder}
                  </button>
                  {/* Action dangereuse : contour rouge, jamais un aplat. */}
                  <button
                    type="button" disabled={etat === "travail"}
                    onClick={() => appeler("/api/gens/retirer", { personne: fiche.personne })}
                    className="h-11 flex-1 rounded-btn border border-negative px-4 text-small font-medium text-negative transition hover:bg-surface-raised disabled:opacity-40"
                  >
                    {etat === "travail" ? t.repriseEnCours : t.reprendreMaintenant}
                  </button>
                </div>
              </>
            )}
          </div>

          {etat === "rate" && (
            <p role="alert" className="mt-3 text-small text-negative">{message}</p>
          )}
        </div>
      )}
    </li>
  );
}

// --- Une invitation qui attend ----------------------------------------------

export function InvitationEnAttente({ inv }: { inv: Attente }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesGens[langue];
  const [etat, etablir] = useState<"repos" | "travail" | "rate">("repos");
  const [message, dire] = useState("");

  async function annuler() {
    etablir("travail");
    dire("");
    try {
      const r = await fetch("/api/gens/annuler", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitation: inv.id }),
      });
      if (!r.ok) {
        const { erreur } = await r.json().catch(() => ({ erreur: "" }));
        etablir("rate");
        dire(erreur || t.rate);
        return;
      }
      router.refresh();
    } catch {
      etablir("rate");
      dire(t.rate);
    }
  }

  return (
    <li className="py-3">
      <div className="flex min-h-14 items-center gap-3">
        <span aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-sable text-small font-medium text-laterite">
          {inv.nom.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium">{inv.nom}</p>
          <p className="truncate text-small text-ink-faint">
            {t.role[inv.role]} · {t.inviteeLe(inv.invitee)} · {t.pasRepondu}
          </p>
        </div>
        <button
          type="button" onClick={annuler} disabled={etat === "travail"}
          className="h-11 shrink-0 rounded-btn border border-line-control px-3 text-small font-medium transition hover:border-ink-faint disabled:opacity-40"
        >
          {etat === "travail" ? t.annulEnCours : t.annuler}
        </button>
      </div>

      {/* Le signal qui compte, et il ne se dit pas en petit : quelqu'un a
          ouvert ce lien avant la personne visée. */}
      {inv.ouvertAvant && (
        <div className="mt-2 rounded-card bg-sable px-3.5 py-3">
          <p className="text-small font-medium">{t.ouvertAvant}</p>
          <p className="mt-1 text-caption leading-relaxed text-ink-soft">{t.ouvertAvantDit}</p>
        </div>
      )}

      {etat === "rate" && (
        <p role="alert" className="mt-2 text-small text-negative">{message}</p>
      )}
    </li>
  );
}
