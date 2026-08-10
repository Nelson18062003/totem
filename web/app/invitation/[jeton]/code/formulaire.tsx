"use client";

// Le champ des six chiffres, et les quatre refus de la porte.
//
// UN SEUL CHAMP, JAMAIS SIX CASES
// Six cases séparées se photographient bien et se vivent mal : on n'y colle
// pas, on n'y corrige pas une faute de frappe sans tout reprendre, et un
// lecteur d'écran y annonce six champs sans nom. Un champ unique accepte le
// collage depuis la boîte mail, l'espace du milieu, la correction — et se lit
// à voix haute d'un seul tenant (WCAG 2.2 §3.3.8).
//
// PAS DE `maxLength`, ET C'EST VOULU
// Le clavier d'un téléphone insère parfois un caractère invisible en collant.
// Un champ qui refuse silencieusement le septième caractère donne alors un
// code amputé, et la personne relit six chiffres justes en se demandant ce
// qu'elle a fait de travers. On accepte tout, et on ne garde que les chiffres.
//
// PAS DE MASQUAGE NON PLUS. Un code à usage unique reçu il y a trente
// secondes ne se cache pas : le masquer empêche de le relire pour vérifier,
// sans rien protéger — celui qui regarde par-dessus l'épaule voit déjà l'écran
// du téléphone où le message est arrivé.
//
// LES REFUS SONT DES ÉTATS DE CET ÉCRAN, PAS D'AUTRES PAGES
// Changer de page ferait perdre le champ, le contenu tapé et la place dans le
// geste. Le message s'affiche sous le champ, le champ reste, et le geste
// suivant est toujours à portée de pouce.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLangue } from "@/app/langue";
import {
  attenteEnMots, compteARebours, textesCode, type GenreRefus,
} from "@/lib/textes/code";
import { IconLock, IconRefresh } from "@/app/icons";

type Refus = { genre: GenreRefus; attente: number } | null;

/** Ce que les deux routes répondent. Le code n'y figure jamais. */
type Reponse = {
  ok?: boolean;
  vers?: string;
  refus?: GenreRefus | "invitation";
  attente?: number;
  avantRenvoi?: number;
};

export function FormulaireCode({ jeton, adresse }:
                               { jeton: string; adresse: string }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesCode[langue];

  const [code, setCode] = useState("");
  const [refus, setRefus] = useState<Refus>(null);
  const [verification, setVerification] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [parti, setParti] = useState(false);
  const [reste, setReste] = useState(0);

  const chiffres = code.replace(/\D/g, "");
  const complet = chiffres.length === 6;

  const demander = useCallback(async (premier: boolean) => {
    setEnvoi(true);
    setParti(false);
    try {
      const r = await fetch("/api/code/demander", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jeton }),
      });
      const d = (await r.json().catch(() => ({}))) as Reponse;
      if (r.ok) {
        setRefus(null);
        setParti(!premier);
        setReste(Math.ceil((d.avantRenvoi ?? 60000) / 1000));
        return;
      }
      if (d.refus === "invitation") {
        // L'invitation elle-même n'ouvre plus : sa page sait dire laquelle des
        // quatre situations c'est, et à qui parler.
        router.replace(`/invitation/${jeton}`);
        return;
      }
      setRefus({ genre: d.refus ?? "indisponible", attente: d.attente ?? 0 });
      if (d.refus === "trop") setReste(Math.ceil((d.attente ?? 0) / 1000));
    } catch {
      setRefus({ genre: "indisponible", attente: 0 });
    } finally {
      setEnvoi(false);
    }
  }, [jeton, router]);

  // Le premier code part à l'arrivée : la page précédente vient d'annoncer
  // « six chiffres partent vers… », et un écran qui demanderait d'appuyer sur
  // un bouton pour cela démentirait la phrase qu'on vient de lire.
  const dejaDemande = useRef(false);
  useEffect(() => {
    if (dejaDemande.current) return;
    dejaDemande.current = true;
    void demander(true);
  }, [demander]);

  // Le compte à rebours du bouton « renvoyer ». Il DIT le temps qui reste :
  // un bouton grisé sans explication se martèle, un bouton qui annonce
  // « 0:48 » s'attend.
  useEffect(() => {
    if (reste <= 0) return;
    const minuteur = setInterval(() => setReste((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(minuteur);
  }, [reste]);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!complet || verification) return;
    setVerification(true);
    try {
      const r = await fetch("/api/code/verifier", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jeton, code: chiffres }),
      });
      const d = (await r.json().catch(() => ({}))) as Reponse;
      if (r.ok && d.ok) {
        router.replace(d.vers ?? `/invitation/${jeton}/facon`);
        router.refresh();
        return;
      }
      if (d.refus === "invitation") {
        router.replace(`/invitation/${jeton}`);
        return;
      }
      setRefus({ genre: d.refus ?? "indisponible", attente: d.attente ?? 0 });
    } catch {
      setRefus({ genre: "indisponible", attente: 0 });
    } finally {
      setVerification(false);
    }
  }

  function saisir(v: string) {
    setCode(v);
    // Un message qui parle des chiffres qu'on vient de remplacer ne parle plus
    // de rien. Les autres refus, eux, restent vrais tant que le temps n'a pas
    // passé : on les laisse.
    if (refus?.genre === "faux") setRefus(null);
  }

  return (
    <>
      <p className="text-small leading-relaxed text-ink-soft">
        {t.envoyeA}{" "}
        <span className="font-semibold text-ink">{adresse}</span>{". "}
        {t.colle}
      </p>

      <form onSubmit={valider} className="mt-6">
        <label htmlFor="code"
               className="block text-caption font-semibold uppercase tracking-wider text-ink-faint">
          {t.libelle}
        </label>
        {/* Un seul champ : pas de `maxLength`, pas de masquage, pas de six
            cases. « 408 913 » s'y colle avec son espace. */}
        <input
          id="code"
          name="code"
          type="text"
          value={code}
          onChange={(e) => saisir(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          enterKeyHint="done"
          placeholder={t.exemple}
          aria-invalid={refus?.genre === "faux" || undefined}
          aria-describedby={refus ? "refus" : undefined}
          className={`tabnums mt-2 h-12 w-full rounded-btn border bg-surface-raised
                      text-center text-title font-semibold tracking-[0.3em]
                      outline-none transition placeholder:text-body
                      placeholder:font-normal placeholder:tracking-normal
                      placeholder:text-ink-faint focus:border-ink
                      ${refus?.genre === "faux" ? "border-negative" : "border-line-control"}`}
        />

        {refus && <MessageDeRefus refus={refus} langue={langue} onGeste={() => demander(false)} />}

        {parti && !refus && (
          <p className="mt-3 text-small leading-relaxed text-positive" role="status">
            {t.renvoiParti}
          </p>
        )}

        {/* Le compte à rebours et le renvoi, sous le champ : on les lit avant
            d'appuyer sur « continuer », c'est-à-dire au moment où l'on
            s'aperçoit que rien n'est arrivé. */}
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
          {/* Pas de `aria-live` : une phrase relue à voix haute à chaque
              seconde couvrirait tout le reste de l'écran. Le bouton dit déjà
              qu'il n'est pas disponible. */}
          <span className="text-caption leading-snug text-ink-faint">
            {reste > 0 ? t.renvoyerDans(compteARebours(reste)) : null}
          </span>
          <button
            type="button"
            onClick={() => demander(false)}
            disabled={reste > 0 || envoi}
            className="flex h-11 shrink-0 items-center gap-2 rounded-btn border
                       border-line-control px-4 text-small font-medium
                       transition hover:bg-surface-2 disabled:opacity-40"
          >
            <IconRefresh size={16} />
            {envoi ? t.renvoiEnCours : t.renvoyer}
          </button>
        </div>

        {/* « Continuer » ne se désarme JAMAIS parce que la porte est lente :
            l'attente s'écoule sans que rien ne se passe à l'écran, et un
            bouton mort au bout de cinq minutes serait un cul-de-sac. On
            laisse réessayer — la porte redira l'attente qui reste. */}
        <button
          type="submit"
          disabled={!complet || verification}
          className="mt-3 h-12 w-full rounded-btn bg-accent text-body font-medium
                     text-white transition hover:bg-accent-hover disabled:opacity-35"
        >
          {verification ? t.verification : t.continuer}
        </button>
      </form>

      <Aide adresse={adresse} langue={langue} />

      <section className="mt-4 flex gap-3 rounded-card bg-surface-2 px-4 py-4">
        <IconLock size={20} className="mt-0.5 shrink-0 text-ink-faint" />
        <div className="text-caption leading-relaxed text-ink-soft">
          <p>{t.portee}</p>
          <p className="mt-2">{t.jamaisPin}</p>
        </div>
      </section>
    </>
  );
}

/**
 * Le refus, sous le champ — et le champ reste.
 *
 * `role="alert"` : la phrase est lue à voix haute au moment où elle
 * apparaît. Sans cela, quelqu'un qui n'a pas les yeux sur l'écran appuie une
 * deuxième fois sur « continuer » sans savoir que la porte a déjà répondu.
 */
function MessageDeRefus({ refus, langue, onGeste }: {
  refus: NonNullable<Refus>; langue: "en" | "fr"; onGeste: () => void;
}) {
  const t = textesCode[langue];
  const duree = attenteEnMots(refus.attente, langue);

  const titre =
    refus.genre === "lent" ? t.refus.lent.titre(duree) : t.refus[refus.genre].titre;
  const dit =
    refus.genre === "trop" ? t.refus.trop.dit(duree) : t.refus[refus.genre].dit;
  const note =
    refus.genre === "faux" ? t.refus.faux.note
    : refus.genre === "lent" ? t.refus.lent.note
    : refus.genre === "trop" ? t.refus.trop.note
    : null;
  // Un refus n'est jamais un cul-de-sac : celui qui peut porter un bouton en
  // porte un, les autres portent la phrase qui dit à qui parler.
  const geste =
    refus.genre === "expire" ? t.refus.expire.geste
    : refus.genre === "indisponible" ? t.refus.indisponible.geste
    : null;

  return (
    <div id="refus" role="alert"
         className="mt-3 rounded-card border border-line bg-surface-raised px-4 py-3">
      <p className={`text-small font-semibold ${
        refus.genre === "faux" || refus.genre === "ferme"
          ? "text-negative" : "text-alert"}`}>
        {titre}
      </p>
      <p className="mt-1 text-caption leading-relaxed text-ink-soft">{dit}</p>
      {note && <p className="mt-2 text-caption leading-relaxed text-ink-faint">{note}</p>}
      {geste && (
        <button type="button" onClick={onGeste}
                className="mt-3 h-11 w-full rounded-btn border border-line-control
                           text-small font-medium transition hover:bg-surface-2">
          {geste}
        </button>
      )}
    </div>
  );
}

/** « Je n'ai rien reçu » — trois gestes, brefs, dans l'ordre où on les fait. */
function Aide({ adresse, langue }: { adresse: string; langue: "en" | "fr" }) {
  const t = textesCode[langue];
  return (
    <details className="mt-6 overflow-hidden rounded-card border border-line bg-surface-raised">
      <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3
                          text-small font-medium [&::-webkit-details-marker]:hidden">
        {t.aideTitre}
      </summary>
      <div className="divide-hair border-t border-line">
        <Piste titre={t.aide.indesirables.titre} dit={t.aide.indesirables.dit} />
        <Piste titre={t.aide.adresse.titre(adresse)} dit={t.aide.adresse.dit} />
        <Piste titre={t.aide.prevenir.titre} dit={t.aide.prevenir.dit} />
      </div>
    </details>
  );
}

function Piste({ titre, dit }: { titre: string; dit: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-small">{titre}</div>
      <p className="mt-1 text-caption leading-relaxed text-ink-faint">{dit}</p>
    </div>
  );
}
