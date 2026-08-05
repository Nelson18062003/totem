"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesSms } from "@/lib/textes/sms";
import { type Categorie, fcfa, type Paiement } from "@/lib/types";
import { IconClose, IconCopy, IconDoc } from "./icons";
import { reveillerLaVeille } from "./veille";

// Chaque catégorie de SMS a sa pastille, comme une boîte de réception. Son
// libellé, lui, vit dans le dictionnaire bilingue (lib/textes/sms.ts) — les
// clés ("encaissement", "depot"…) sont des données et ne se traduisent pas.
// La catégorie n'est qu'une aide : le SMS reste lisible en entier.
export const CAT: Record<Categorie, string> = {
  encaissement: "💰",
  envoi: "↗️",
  transfert: "🔁",
  depot: "📥",
  retrait: "📤",
  solde: "📊",
  code: "🔑",
  publicite: "📢",
  message: "💬",
  inconnu: "✉️",
};

// Les natures que le propriétaire peut choisir à la main (elles donnent un reçu).
const NATURES: Categorie[] = ["depot", "retrait", "transfert", "solde"];

// La catégorie effective : la nature choisie par le propriétaire l'emporte sur
// la catégorie devinée par le terminal.
export const catDe = (p: Paiement): Categorie => p.nature ?? p.categorie;

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
  const etablirRecu = async () => {
    if (etabli === "envoi" || p.sourceId == null) return;
    setEtabli("envoi");
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
          setMot(c.resultat || "");
          setEtabli(c.etat === "faite" ? "fait" : "refus");
          if (c.etat === "faite") {
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
      <div className="surgit w-full max-w-md rounded-t-card border border-line bg-surface-raised p-6 md:rounded-card"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
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
            <p className="mt-1 text-body text-ink-soft">{p.nom}</p>
          </div>
          <button onClick={onFermer} className="text-ink-faint transition hover:text-ink"><IconClose size={18} /></button>
        </div>

        <dl className="mt-6 divide-hair">
          <L t={t.categorie} v={`${CAT[catDe(p)]} ${t.cat[catDe(p)]}`} />
          <L t={t.operateur} v={p.sim} />
          {p.numero && <L t={t.numero} v={p.numero} />}
          <L t={t.date} v={t.dateEtHeure(p.date, p.heure)} />
          {p.reference && <L t={t.reference} v={p.reference} />}
          {p.soldeApres != null && <L t={t.soldeApres} v={fcfa(p.soldeApres, langue)} />}
        </dl>

        <div className="mt-5">
          <p className="mb-1.5 text-caption uppercase tracking-wider text-ink-faint">
            {t.natureTitre}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {NATURES.map((n) => (
              <button key={n} onClick={() => classer(n)} disabled={classe}
                className={`rounded-btn border px-3 py-1.5 text-small transition disabled:opacity-40 ${
                  nature === n
                    ? "border-ink bg-ink font-medium text-white"
                    : "border-line text-ink-soft hover:border-ink-faint"
                }`}>
                {CAT[n]} {t.cat[n]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-caption leading-relaxed text-ink-faint">
            {t.natureAide}
          </p>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-caption uppercase tracking-wider text-ink-faint">{t.messageRecu}</p>
          <p className="rounded-card bg-surface-2 p-3.5 text-small leading-relaxed text-ink-soft">{p.smsBrut}</p>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => navigator.clipboard?.writeText(p.smsBrut)}
            className="flex flex-1 items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium transition hover:border-ink-faint">
            <IconCopy size={15} /> {t.copierSms}
          </button>
          {p.recu ? (
            <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
              className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
              <IconDoc size={15} /> {t.recuPdf}
            </a>
          ) : (
            p.sourceId != null && etabli !== "fait" && (
              <button onClick={etablirRecu} disabled={etabli === "envoi"}
                className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-40">
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
