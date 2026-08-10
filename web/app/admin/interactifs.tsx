"use client";

// Les gestes de la porte : les boutons, et rien d'autre.
//
// Les pages restent des composants serveur — elles lisent, elles n'agissent
// pas. Tout ce qui appuie vit ici. C'est ce qui permet à une page de faire sa
// garde AVANT toute lecture, sans que le navigateur ait à télécharger de quoi
// afficher un tableau.
//
// TROIS RÈGLES COMMUNES À TOUS CES BOUTONS
//
// 1. UN GESTE QUI RETIRE DEMANDE POURQUOI. Pas pour freiner : pour que la
//    ligne du journal soit lisible dans six mois par quelqu'un qui n'était pas
//    là. « a quitté la société » se relit, « révocation » non.
// 2. UN REFUS S'AFFICHE DANS SA SECTION, et ne remplace jamais l'écran. La
//    route répond déjà dans la langue de la personne : on montre tel quel.
// 3. RIEN NE DISPARAÎT DE L'ÉCRAN AVANT QUE LE SERVEUR AIT DIT OUI. Une ligne
//    qui s'efface par optimisme fait croire qu'un appareil est retiré alors
//    qu'il ouvre encore.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PoserUneCle } from "@/app/cle-boutons";
import { useLangue } from "@/app/langue";
import { textesAdminPorte } from "@/lib/textes/admin-porte";

const CLASSE_SECONDAIRE =
  "flex h-11 items-center justify-center rounded-btn border border-line-control "
  + "bg-surface-raised px-3.5 text-small font-medium transition hover:bg-surface-2 "
  + "disabled:opacity-40";

const CLASSE_PRIMAIRE =
  "flex h-12 w-full items-center justify-center rounded-btn bg-accent px-4 text-body "
  + "font-medium text-white transition hover:bg-accent-hover disabled:opacity-40";

const CLASSE_CHAMP =
  "h-11 w-full rounded-btn border border-line-control bg-surface-raised px-3.5 "
  + "text-small outline-none transition focus:border-ink";

function Refus({ dit }: { dit: string }) {
  if (!dit) return null;
  return (
    <p role="alert" className="mt-2 text-caption leading-relaxed text-negative">{dit}</p>
  );
}

// --- A6 : retirer un appareil ----------------------------------------------

/**
 * Retirer un appareil, avec son pourquoi.
 *
 * Replié tant qu'on n'a pas appuyé : une liste d'appareils où chaque ligne
 * porte un champ de texte ouvert se lit comme un formulaire, alors qu'on vient
 * ici pour REGARDER, neuf fois sur dix.
 */
export function RetirerCetAppareil({ id, appareil }: { id: number; appareil: string }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAdminPorte[langue];
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi">("repos");
  const [rate, setRate] = useState("");

  async function retirer(e: React.FormEvent) {
    e.preventDefault();
    if (etat === "envoi") return;
    setEtat("envoi");
    setRate("");
    try {
      const r = await fetch("/api/admin/appareils/retirer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, motif }),
      });
      if (r.ok) { setOuvert(false); router.refresh(); return; }
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setEtat("repos");
      setRate(erreur || t.refus.indisponible);
    } catch {
      setEtat("repos");
      setRate(t.refus.reseau);
    }
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label={t.appareils.retirerCe(appareil)}
        className={CLASSE_SECONDAIRE}
      >
        {t.appareils.retirer}
      </button>
    );
  }

  return (
    <form onSubmit={retirer} className="flex flex-col gap-2">
      <label htmlFor={`motif-${id}`} className="text-caption text-ink-soft">
        {t.appareils.retirerMotif}
      </label>
      <input
        id={`motif-${id}`}
        type="text"
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        className={CLASSE_CHAMP}
      />
      <div className="flex gap-2">
        <button type="submit" disabled={etat === "envoi"} className={CLASSE_SECONDAIRE}>
          {t.appareils.retirerCe(appareil)}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className={CLASSE_SECONDAIRE}>
          {t.ajouter.plusTard}
        </button>
      </div>
      <Refus dit={rate} />
    </form>
  );
}

// --- A6 : fermer une session, ou toutes ------------------------------------

export function FermerLaSession({ session, ici }: { session: string; ici: boolean }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAdminPorte[langue];
  const [etat, setEtat] = useState<"repos" | "envoi">("repos");
  const [rate, setRate] = useState("");

  async function fermer() {
    if (etat === "envoi") return;
    setEtat("envoi");
    setRate("");
    try {
      const r = await fetch("/api/admin/sessions/fermer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session }),
      });
      if (r.ok) {
        // Fermer celle-ci, c'est se mettre dehors. On va à la porte plutôt que
        // de rafraîchir une page qui n'existe plus pour nous.
        if (ici) { router.replace("/admin/entree"); return; }
        router.refresh();
        return;
      }
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setEtat("repos");
      setRate(erreur || t.refus.indisponible);
    } catch {
      setEtat("repos");
      setRate(t.refus.reseau);
    }
  }

  return (
    <div>
      <button type="button" onClick={fermer} disabled={etat === "envoi"} className={CLASSE_SECONDAIRE}>
        {t.appareils.fermer}
      </button>
      <Refus dit={rate} />
    </div>
  );
}

/**
 * Tout fermer, partout — y compris ici.
 *
 * Aucune confirmation, aucun code de plus. Voir l'en-tête de
 * `/api/admin/sessions/fermer` : celui qui appuie vient de lire dans sa boîte
 * mail une entrée qu'il n'a pas faite, et il a zéro patience.
 */
export function ToutFermer() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAdminPorte[langue];
  const [etat, setEtat] = useState<"repos" | "envoi">("repos");
  const [rate, setRate] = useState("");

  async function tout() {
    if (etat === "envoi") return;
    setEtat("envoi");
    setRate("");
    try {
      const r = await fetch("/api/admin/sessions/fermer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tout: true }),
      });
      if (r.ok) { router.replace("/admin/entree"); return; }
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setEtat("repos");
      setRate(erreur || t.refus.indisponible);
    } catch {
      setEtat("repos");
      setRate(t.refus.reseau);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={tout}
        disabled={etat === "envoi"}
        className="flex h-11 items-center justify-center rounded-btn border border-negative
                   px-3.5 text-small font-medium text-negative transition
                   hover:bg-surface-2 disabled:opacity-40"
      >
        {t.appareils.toutFermer}
      </button>
      <Refus dit={rate} />
    </div>
  );
}

// --- A5 : poser cet appareil ------------------------------------------------

/**
 * Le bouton qui installe l'appareil. Le vrai travail est dans
 * `app/cle-boutons.tsx`, qui ne se réécrit pas : il parle au navigateur, il
 * sait se taire quand celui-ci ne sait pas faire, et il ne prend pas un
 * renoncement pour une erreur.
 *
 * Ce qu'on ajoute ici : rafraîchir la page une fois la clé posée, pour que le
 * compte d'appareils — et donc la réclamation du second — soit à jour tout de
 * suite. Un écran qui continue de réclamer un appareil qu'on vient d'ajouter
 * apprend à ne plus le croire.
 */
export function PoserCetAppareil() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAdminPorte[langue];
  return (
    <PoserUneCle
      t={{
        poser: t.ajouter.poser,
        poserAide: t.ajouter.poserAide,
        poserEnCours: t.ajouter.poserEnCours,
        poserFait: t.ajouter.poserFait,
        poserFaitSauvegardee: t.ajouter.poserFaitSauvegardee,
        poserRate: t.ajouter.poserRate,
        poserImpossible: t.ajouter.poserImpossible,
        plusTard: t.ajouter.plusTard,
      }}
      apres={() => router.refresh()}
    />
  );
}

// --- A3 : demander l'accès, et décider ---------------------------------------

export function DemanderLaPlateforme() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAdminPorte[langue];
  const [motif, setMotif] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "partie">("repos");
  const [rate, setRate] = useState("");

  async function demander(e: React.FormEvent) {
    e.preventDefault();
    if (!motif.trim() || etat === "envoi") return;
    setEtat("envoi");
    setRate("");
    try {
      const r = await fetch("/api/admin/application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geste: "demander", motif }),
      });
      if (r.ok) { setEtat("partie"); router.refresh(); return; }
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setEtat("repos");
      setRate(erreur || t.refus.indisponible);
    } catch {
      setEtat("repos");
      setRate(t.refus.reseau);
    }
  }

  if (etat === "partie") {
    return (
      <p role="status" className="text-small leading-relaxed text-positive">
        {t.application.demandePartie}
      </p>
    );
  }

  return (
    <form onSubmit={demander} className="flex flex-col gap-3">
      <p className="text-caption leading-relaxed text-ink-faint">
        {t.application.demanderAide}
      </p>
      <label htmlFor="motif-demande" className="text-small text-ink-soft">
        {t.application.motif}
      </label>
      <textarea
        id="motif-demande"
        rows={3}
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        required
        className="w-full rounded-btn border border-line-control bg-surface-raised px-3.5
                   py-2.5 text-small leading-relaxed outline-none transition focus:border-ink"
      />
      <button type="submit" disabled={!motif.trim() || etat === "envoi"} className={CLASSE_PRIMAIRE}>
        {etat === "envoi" ? t.application.demandeEnCours : t.application.demander}
      </button>
      <Refus dit={rate} />
    </form>
  );
}

/**
 * Les gestes d'un dossier : accorder, refuser, reprendre.
 *
 * Reprendre demande un motif ; accorder et refuser n'en demandent pas. Ce
 * n'est pas une inégalité de traitement : la demande porte déjà les mots de
 * celui qui demandait, et une reprise n'en a aucun — c'est la seule des trois
 * décisions qui, relue dans un an, serait muette.
 */
export function GestesDuDossier({
  id, etat,
}: {
  id: number;
  etat: "attente" | "accorde";
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAdminPorte[langue];
  const [motif, setMotif] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [rate, setRate] = useState("");

  async function agir(geste: "accorder" | "refuser" | "reprendre") {
    if (envoi) return;
    setEnvoi(true);
    setRate("");
    try {
      const r = await fetch("/api/admin/application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geste, id, motif }),
      });
      if (r.ok) { setOuvert(false); setEnvoi(false); router.refresh(); return; }
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setEnvoi(false);
      setRate(erreur || t.refus.indisponible);
    } catch {
      setEnvoi(false);
      setRate(t.refus.reseau);
    }
  }

  if (etat === "attente") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={envoi} onClick={() => agir("accorder")} className={CLASSE_SECONDAIRE}>
            {t.application.accorder}
          </button>
          <button type="button" disabled={envoi} onClick={() => agir("refuser")} className={CLASSE_SECONDAIRE}>
            {t.application.refuser}
          </button>
        </div>
        <Refus dit={rate} />
      </div>
    );
  }

  if (!ouvert) {
    return (
      <div>
        <button type="button" onClick={() => setOuvert(true)} className={CLASSE_SECONDAIRE}>
          {t.application.reprendre}
        </button>
        <Refus dit={rate} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`reprise-${id}`} className="text-caption text-ink-soft">
        {t.application.motifReprise}
      </label>
      <input
        id={`reprise-${id}`}
        type="text"
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        className={CLASSE_CHAMP}
      />
      <div className="flex gap-2">
        <button type="button" disabled={envoi} onClick={() => agir("reprendre")} className={CLASSE_SECONDAIRE}>
          {t.application.reprendre}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className={CLASSE_SECONDAIRE}>
          {t.ajouter.plusTard}
        </button>
      </div>
      <Refus dit={rate} />
    </div>
  );
}
