"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesSms } from "@/lib/textes/sms";
import { type Categorie, fcfa, type Paiement } from "@/lib/types";
import { BoutonFermer, useEchap } from "./fermer";
import {
  IconArrowDown, IconArrowUp, IconBank, IconBubble, IconChart,
  IconCopy, IconDoc, IconLock, IconMail, IconMegaphone, IconPlus, IconTransfer,
} from "./icons";
import { reveillerLaVeille } from "./veille";

// Chaque catégorie de SMS a son icône au trait, comme une boîte de réception.
// Son libellé, lui, vit dans le dictionnaire bilingue (lib/textes/sms.ts) —
// les clés ("encaissement", "depot"…) sont des données et ne se traduisent
// pas. La catégorie n'est qu'une aide : le SMS reste lisible en entier.
export const CAT: Record<Categorie, typeof IconArrowDown> = {
  encaissement: IconArrowDown,
  envoi: IconArrowUp,
  transfert: IconTransfer,
  depot: IconPlus,
  retrait: IconBank,
  solde: IconChart,
  code: IconLock,
  publicite: IconMegaphone,
  message: IconBubble,
  inconnu: IconMail,
};

/** L'icône d'une catégorie, prête à poser dans une pastille ou une puce. */
export function CatIcone({
  c, size = 16, className,
}: { c: Categorie; size?: number; className?: string }) {
  // Filet de sécurité : la colonne « categorie » est du texte libre en base.
  // Une valeur inconnue (robot plus récent que la plateforme) ne doit jamais
  // faire planter la liste entière — elle s'affiche en simple message.
  const Icone = CAT[c] ?? IconBubble;
  return <Icone size={size} className={className} />;
}

// Les schémas de couleur des étiquettes du Simple Design System, relevés du
// fichier : vert « positif » pour l'argent qui entre, ambre « attention »
// pour la publicité. Le reste demeure neutre — une sortie d'argent n'est pas
// un danger, c'est le métier.
const SCHEMA_CAT: Partial<Record<Categorie, string>> = {
  encaissement: "bg-[#cff7d3] text-[#02542d]",
  depot: "bg-[#cff7d3] text-[#02542d]",
  publicite: "bg-[#fff1c2] text-[#522504]",
};

/** Les couleurs de la pastille d'une catégorie — schéma SDS, neutre sinon. */
export const classeCat = (c: Categorie): string =>
  SCHEMA_CAT[c] ?? "border border-line text-ink-soft";

// Les natures que le propriétaire peut choisir à la main (elles donnent un reçu).
const NATURES: Categorie[] = ["depot", "retrait", "transfert", "solde"];

// La catégorie effective : la nature choisie par le propriétaire l'emporte sur
// la catégorie devinée par le terminal. Une valeur qui n'est pas du référentiel
// (colonne libre en base, robot plus récent) retombe sur « message » : mieux
// vaut une pastille neutre qu'un écran qui plante.
export const catDe = (p: Paiement): Categorie => {
  const brute = p.nature ?? p.categorie;
  return brute in CAT ? brute : "message";
};

/**
 * La fiche d'un SMS : le message en entier, ses détails, sa nature (qui
 * établit le reçu), la copie du texte et le reçu PDF.
 *
 * C'est LA même fiche partout — boîte de réception ou accueil : un SMS
 * cliqué raconte la même chose et permet les mêmes gestes, où qu'il soit.
 */
export function FicheSms({ p, onFermer }: { p: Paiement; onFermer: () => void }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesSms[langue];
  const [etabli, setEtabli] = useState<"repos" | "envoi" | "fait" | "refus">("repos");
  const [mot, setMot] = useState("");
  const [nature, setNature] = useState<Paiement["nature"]>(p.nature);
  const [classe, setClasse] = useState(false);

  // Échap ferme la fiche — une lecture n'a rien à protéger.
  useEchap(onFermer);

  // Ouvrir la fiche, c'est lire le message : le point de la ligne s'éteint et
  // la pastille du menu se met à jour dans la foulée. Si la base n'a pas
  // encore la migration, l'appel échoue en silence — rien ne casse.
  useEffect(() => {
    if (!p.nonLu) return;
    fetch("/api/lu", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: Number(p.id) }),
    })
      .then((r) => { if (r.ok) { reveillerLaVeille(); router.refresh(); } })
      .catch(() => {});
  }, [p.id, p.nonLu, router]);

  // Le propriétaire décide la nature d'un SMS (dépôt/retrait/transfert/solde) :
  // elle s'affiche ainsi partout, et son reçu s'établit dans la foulée.
  const classer = async (n: Categorie) => {
    if (classe) return;
    setClasse(true);
    setNature(n);
    try {
      await fetch("/api/nature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: Number(p.id), nature: n }),
      });
      if (p.sourceId != null && !p.recu) await etablirRecu();
      router.refresh();
    } catch {
      /* l'échec reste visible via l'état du reçu */
    }
    setClasse(false);
  };

  // Le reçu d'un message passé : le terminal le refabrique depuis le SMS,
  // qui fait foi — même numéro, à la demande. La nature choisie voyage avec
  // la demande : c'est ELLE qui décide du document (un transfert marqué
  // « transfert » ne peut pas revenir en reçu de solde).
  // La date d'établissement du reçu, lue dans le cloud : elle avance quand le
  // terminal a VRAIMENT remplacé le document — c'est elle qu'on guette.
  const ficheRecu = async (): Promise<string | null> => {
    if (!p.recu) return null;
    try {
      const r = await fetch(`/api/recu/${p.recu}/fiche`, { cache: "no-store" });
      if (!r.ok) return null;
      const corps = (await r.json()) as { etabliLe: string | null };
      return corps.etabliLe;
    } catch {
      return null;
    }
  };

  const etablirRecu = async () => {
    if (etabli === "envoi" || p.sourceId == null) return;
    setEtabli("envoi");
    const etabliAvant = await ficheRecu();
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "recu",
          parametres: { source_id: p.sourceId, ...(nature ? { nature } : {}) },
        }),
      });
      if (!r.ok) throw new Error();
      const { id } = (await r.json()) as { id: number };
      for (let i = 0; i < 20; i++) {
        await new Promise((res) => setTimeout(res, 1300));
        const c = await fetch(`/api/commande/${id}`, { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);
        if (c && (c.etat === "faite" || c.etat === "echouee")) {
          setEtabli(c.etat === "faite" ? "fait" : "refus");
          if (c.etat !== "faite") {
            setMot(c.resultat || "");
            return;
          }
          if (p.recu) {
            // RÉGÉNÉRATION d'un document existant : le terminal fabrique
            // (délai volontaire de dix secondes) puis remplace l'archive.
            // On ne promet RIEN sur un minuteur : on guette la date
            // d'établissement dans le cloud, et on ne dit « c'est le
            // nouveau » que quand elle a vraiment avancé.
            setMot(t.regenerationEnCours);
            if (!etabliAvant) {
              // Le repère d'avant n'a pas pu être lu : impossible de
              // CONSTATER le remplacement — alors on ne le certifie pas.
              // Message d'attente honnête, et la main revient.
              await new Promise((res) => setTimeout(res, 15000));
              setMot(t.regenerationEnRoute);
              setEtabli("repos");
              router.refresh();
              return;
            }
            for (let attente = 0; attente < 30; attente++) {
              await new Promise((res) => setTimeout(res, 3000));
              const etabliApres = await ficheRecu();
              if (etabliApres && etabliApres !== etabliAvant) {
                setMot(t.regenerationFaite);
                setEtabli("repos");
                router.refresh();
                return;
              }
            }
            // Toujours rien après une minute et demie : on le dit sans
            // prétendre que c'est fait.
            setMot(t.regenerationLente);
            setEtabli("repos");
          } else {
            setMot(c.resultat || "");
            // Laisser au terminal le temps d'archiver, puis relire la base :
            // l'icône de téléchargement apparaîtra sur la ligne.
            setTimeout(() => router.refresh(), 8000);
          }
          return;
        }
      }
      throw new Error();
    } catch {
      setMot(t.terminalMuet);
      setEtabli("refus");
    }
  };

  return (
    <div className="voile fixed inset-0 z-30 flex items-end justify-center bg-ink/25 md:items-center md:p-4" onClick={onFermer}>
      {/* La fiche peut être longue (un SMS entier, les détails, les gestes) :
          elle défile dans sa propre hauteur, jamais coupée sans recours. */}
      <div role="dialog" aria-modal="true" aria-label={p.nom}
        className="surgit max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-card border border-line bg-surface-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:max-h-[85dvh] md:rounded-card md:pb-6"
        onClick={(e) => e.stopPropagation()}>
        {/* L'ESSENTIEL d'abord : qui, combien, quand — et une fermeture
            qu'on ne cherche pas. Les détails techniques attendent sous un
            pli, ils n'ont pas à se faire lire. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-small text-ink-soft">
              {p.montant == null
                ? t.smsRecu
                : p.sens === "in" ? t.paiementRecu : p.sens === "out" ? t.paiementEnvoye : t.sensAConfirmer}
            </p>
            {p.montant != null && (
              <p className="mt-1 text-display font-semibold tabnums tracking-tight">
                {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant, langue)}
              </p>
            )}
            <p className="mt-1 truncate text-body font-medium">{p.nom}</p>
            <p className="mt-0.5 text-small tabnums text-ink-faint">
              {p.sim} · {t.dateEtHeure(p.date, p.heure)}
            </p>
          </div>
          <BoutonFermer onClick={onFermer} label={t.fermerFiche} />
        </div>

        {/* Le message en entier — c'est lui qu'on vient lire. `break-words` :
            une référence ou une adresse sans espace ne déborde jamais. */}
        <p className="mt-5 whitespace-pre-line break-words rounded-card bg-surface-2 p-4 text-body leading-relaxed">
          {p.smsBrut}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => navigator.clipboard?.writeText(p.smsBrut)}
            className="flex min-w-[45%] flex-1 items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium transition hover:border-ink-faint">
            <IconCopy size={15} /> {t.copierSms}
          </button>
          {p.recu ? (
            // Le document existe : on peut l'ouvrir tel quel — ET le refaire
            // à neuf avec la lecture et le type d'aujourd'hui. Avant, ce
            // bouton n'était qu'un lien : impossible de régénérer un reçu
            // depuis l'écran, l'ancien document était servi pour toujours.
            <>
              <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
                className="flex min-w-[45%] flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
                <IconDoc size={15} /> {t.telechargerPdf}
              </a>
              {p.sourceId != null && (
                <button onClick={etablirRecu} disabled={etabli === "envoi" || etabli === "fait"}
                  className="flex min-w-[45%] flex-1 items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium transition hover:border-ink-faint disabled:opacity-40">
                  <IconDoc size={15} />
                  {etabli === "envoi" ? t.demandeAuTerminal : t.regenererPdf}
                </button>
              )}
            </>
          ) : (
            p.sourceId != null && etabli !== "fait" && (
              <button onClick={etablirRecu} disabled={etabli === "envoi"}
                className="flex min-w-[45%] flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-40">
                <IconDoc size={15} />
                {etabli === "envoi" ? t.demandeAuTerminal : t.etablirRecu}
              </button>
            )
          )}
        </div>
        {mot && (
          <p className={`mt-3 text-caption leading-relaxed ${etabli === "refus" ? "text-negative" : "text-ink-soft"}`}>
            {mot}
          </p>
        )}

        {/* La nature — le geste qui établit le reçu */}
        <div className="mt-5">
          <p className="mb-1.5 text-caption uppercase tracking-wider text-ink-faint">
            {t.natureTitre}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {NATURES.map((n) => (
              <button key={n} onClick={() => classer(n)} disabled={classe}
                className={`flex items-center gap-1.5 rounded-btn border px-3 py-1.5 text-small transition disabled:opacity-40 ${
                  nature === n
                    ? "border-ink bg-ink font-medium text-white"
                    : "border-line text-ink-soft hover:border-ink-faint"
                }`}>
                <CatIcone c={n} size={14} /> {t.cat[n]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-caption leading-relaxed text-ink-faint">
            {t.natureAide}
          </p>
        </div>

        {/* Les détails techniques, sous un pli — pour qui les cherche */}
        {(p.numero || p.reference || p.soldeApres != null) && (
          <details className="mt-5">
            <summary className="cursor-pointer text-small font-medium text-ink-soft transition hover:text-ink">
              {t.voirDetails}
            </summary>
            <dl className="mt-1 divide-hair">
              {p.numero && <L t={t.numero} v={p.numero} />}
              {p.reference && <L t={t.reference} v={p.reference} />}
              {p.soldeApres != null && <L t={t.soldeApres} v={fcfa(p.soldeApres, langue)} />}
            </dl>
          </details>
        )}
      </div>
    </div>
  );
}

function L({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-small text-ink-soft">{t}</dt>
      <dd className="text-small font-medium tabnums">{v}</dd>
    </div>
  );
}
