"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type Categorie, fcfa, type Paiement } from "@/lib/types";
import { IconClose, IconCopy, IconDoc, IconSearch } from "../icons";
import { Vide } from "../vide";

// Chaque catégorie de SMS a sa pastille et son libellé, comme une boîte de
// réception. La catégorie n'est qu'une aide : le SMS reste lisible en entier.
const CAT: Record<Categorie, { emoji: string; label: string }> = {
  encaissement: { emoji: "💰", label: "Encaissement" },
  envoi: { emoji: "↗️", label: "Envoi" },
  transfert: { emoji: "🔁", label: "Transfert" },
  depot: { emoji: "📥", label: "Dépôt" },
  retrait: { emoji: "📤", label: "Retrait" },
  solde: { emoji: "📊", label: "Solde" },
  code: { emoji: "🔑", label: "Code" },
  publicite: { emoji: "📢", label: "Pub" },
  message: { emoji: "💬", label: "Message" },
  inconnu: { emoji: "✉️", label: "SMS" },
};

// L'ordre des filtres de catégorie : les mouvements d'argent d'abord.
const ORDRE_CAT: Categorie[] = [
  "encaissement", "envoi", "transfert", "depot", "retrait",
  "solde", "code", "publicite", "message", "inconnu",
];

// Les natures que le propriétaire peut choisir à la main (elles donnent un reçu).
const NATURES: Categorie[] = ["depot", "retrait", "transfert", "solde"];

// La catégorie effective : la nature choisie par le propriétaire l'emporte sur
// la catégorie devinée par le terminal.
const catDe = (p: Paiement): Categorie => p.nature ?? p.categorie;

/**
 * Tous les SMS reçus par les cartes, tels quels — c'est par eux que tout
 * arrive. Ceux que le robot a compris portent leur montant ; ceux qui ont un
 * reçu PDF archivé se téléchargent d'un geste, directement sur la ligne.
 */
export function ListeEncaissements({
  paiements,
  operateurs,
  enAttente = 0,
}: {
  paiements: Paiement[];
  operateurs: string[];
  enAttente?: number;
}) {
  const [filtre, setFiltre] = useState("Tous");
  const [categorie, setCategorie] = useState<Categorie | "Toutes">("Toutes");
  const [recherche, setRecherche] = useState("");
  const [detail, setDetail] = useState<Paiement | null>(null);

  // Les catégories réellement présentes, dans l'ordre voulu — on ne propose
  // pas un filtre pour une catégorie qu'on n'a jamais reçue.
  const categories = useMemo(() => {
    const vues = new Set(paiements.map(catDe));
    return ORDRE_CAT.filter((c) => vues.has(c));
  }, [paiements]);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase().replace(/\s/g, "");
    return paiements.filter((p) => {
      if (filtre !== "Tous" && p.sim !== filtre) return false;
      if (categorie !== "Toutes" && catDe(p) !== categorie) return false;
      if (!q) return true;
      return p.nom.toLowerCase().includes(q) || p.numero.replace(/\s/g, "").includes(q)
        || String(p.montant ?? "").includes(q) || p.reference.toLowerCase().includes(q)
        || p.smsBrut.toLowerCase().includes(q);
    });
  }, [paiements, filtre, categorie, recherche]);

  const entrees = liste.filter((p) => p.sens === "in" && p.montant != null && p.date === "Aujourd’hui");
  const totalIn = entrees.reduce((s, p) => s + (p.montant ?? 0), 0);

  const parDate = liste.reduce<Record<string, Paiement[]>>((acc, p) => {
    (acc[p.date] ||= []).push(p); return acc;
  }, {});

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-title font-semibold tracking-tight">SMS reçus</h1>
        <p className="mt-1 text-small text-ink-soft">
          Tout ce que les cartes reçoivent, tel quel. C’est le message d’origine
          qui fait foi — et son reçu se télécharge quand il existe.
        </p>
      </header>

      {enAttente > 0 && (
        <p className="rounded-card border border-line bg-surface-2 px-4 py-2.5 text-small text-ink-soft">
          ⏳ Le terminal a {enAttente} message{enAttente > 1 ? "s" : ""} en cours
          de transmission — cette liste n’est peut-être pas encore complète.
          Elle se met à jour toute seule.
        </p>
      )}

      <section>
        <p className="text-small text-ink-soft">Reçu aujourd’hui</p>
        <p className="mt-1 text-display font-semibold tabnums tracking-tight">{fcfa(totalIn)}</p>
        <p className="mt-1 text-small text-ink-faint">{entrees.length} paiements</p>
      </section>

      {/* Recherche et filtres — une seule ligne dès que la largeur le permet */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2.5 rounded-btn border border-line bg-surface-raised px-3.5">
          <IconSearch size={16} className="text-ink-faint" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, numéro, montant, texte du SMS"
            className="flex-1 bg-transparent py-2.5 text-body outline-none placeholder:text-ink-faint" />
          {recherche && (
            <button onClick={() => setRecherche("")} className="text-ink-faint transition hover:text-ink"
              aria-label="Effacer la recherche">
              <IconClose size={15} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {["Tous", ...operateurs].map((f) => (
            <button key={f} onClick={() => setFiltre(f)}
              className={`rounded-btn border px-3.5 py-1.5 text-small transition sm:py-2.5 ${
                filtre === f
                  ? "border-ink bg-ink font-medium text-white"
                  : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
              }`}>{f}</button>
          ))}
        </div>
      </div>

      {/* Filtre par catégorie — seulement celles réellement reçues */}
      {categories.length > 1 && (
        <div className="-mt-3 flex flex-wrap gap-1.5">
          <Chip actif={categorie === "Toutes"} onClick={() => setCategorie("Toutes")}>
            Toutes
          </Chip>
          {categories.map((c) => (
            <Chip key={c} actif={categorie === c} onClick={() => setCategorie(c)}>
              {CAT[c].emoji} {CAT[c].label}
            </Chip>
          ))}
        </div>
      )}

      {/* La liste des SMS */}
      {Object.keys(parDate).length === 0 ? (
        recherche || filtre !== "Tous" || categorie !== "Toutes" ? (
          <Vide
            titre="Aucun SMS ne correspond"
            detail="Essayez un autre mot, un autre montant, ou retirez un filtre."
            action={
              <button
                onClick={() => { setRecherche(""); setFiltre("Tous"); setCategorie("Toutes"); }}
                className="rounded-btn border border-line px-4 py-2 text-small font-medium transition hover:border-ink-faint"
              >
                Tout afficher
              </button>
            }
          />
        ) : (
          <Vide
            titre="Aucun SMS pour l’instant"
            detail="Chaque message reçu par une carte apparaîtra ici. Si la carte devrait en recevoir et que rien n'arrive, vérifiez le terminal : un silence prolongé n'est pas normal."
          />
        )
      ) : (
        Object.entries(parDate).map(([date, items]) => (
          <section key={date}>
            <p className="mb-1 text-caption uppercase tracking-wider text-ink-faint">{date}</p>
            <ul className="divide-hair">
              {items.map((p) => (
                <li key={p.id} className="flex items-start gap-3 py-3.5">
                  <button onClick={() => setDetail(p)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left transition hover:opacity-70">
                    <span title={CAT[catDe(p)].label}
                      className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-line text-body">
                      {CAT[catDe(p)].emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        {/* Qui, quand — la source du SMS, brève. */}
                        <span className="truncate text-small text-ink-soft">
                          {p.sim} · {p.heure}
                        </span>
                        {/* Montant complet, jamais abrégé ; sans signe quand le
                            sens n'est pas établi. */}
                        {p.montant != null && (
                          <span className={`shrink-0 text-body font-medium tabnums ${
                            p.sens === "in" ? "text-positive" : p.sens === "out" ? "text-ink" : "text-ink-soft"
                          }`}>
                            {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant)}
                          </span>
                        )}
                      </span>
                      {/* Le SMS EN ENTIER : c'est lui qu'on vient lire. Jamais
                          tronqué, jamais reformulé — le message d'origine, tel
                          que la carte l'a reçu. */}
                      <span className="mt-1 block whitespace-pre-wrap break-words text-body text-ink">
                        {p.smsBrut}
                      </span>
                    </span>
                  </button>
                  {/* Le reçu PDF, à portée de main quand il existe. */}
                  {p.recu && (
                    <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
                      title="Télécharger le reçu PDF"
                      className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft transition hover:border-ink hover:text-ink">
                      <IconDoc size={16} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {detail && <Detail p={detail} onFermer={() => setDetail(null)} />}
    </div>
  );
}

function Detail({ p, onFermer }: { p: Paiement; onFermer: () => void }) {
  const router = useRouter();
  const [etabli, setEtabli] = useState<"repos" | "envoi" | "fait" | "refus">("repos");
  const [mot, setMot] = useState("");
  const [nature, setNature] = useState<Paiement["nature"]>(p.nature);
  const [classe, setClasse] = useState(false);

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
  // qui fait foi — même numéro, même document, à la demande.
  const etablirRecu = async () => {
    if (etabli === "envoi" || p.sourceId == null) return;
    setEtabli("envoi");
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "recu", parametres: { source_id: p.sourceId } }),
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
      setMot("Le terminal n’a pas répondu — est-il allumé, et à jour ?");
      setEtabli("refus");
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/25 md:items-center md:p-4" onClick={onFermer}>
      <div className="w-full max-w-md rounded-t-card border border-line bg-surface-raised p-6 md:rounded-card"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-small text-ink-soft">
              {p.montant == null
                ? "SMS reçu"
                : p.sens === "in" ? "Paiement reçu" : p.sens === "out" ? "Paiement envoyé" : "Mouvement — sens à confirmer"}
            </p>
            {p.montant != null && (
              <p className="mt-1 text-display font-semibold tabnums tracking-tight">
                {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant)}
              </p>
            )}
            <p className="mt-1 text-body text-ink-soft">{p.nom}</p>
          </div>
          <button onClick={onFermer} className="text-ink-faint transition hover:text-ink"><IconClose size={18} /></button>
        </div>

        <dl className="mt-6 divide-hair">
          <L t="Catégorie" v={`${CAT[catDe(p)].emoji} ${CAT[catDe(p)].label}`} />
          <L t="Opérateur" v={p.sim} />
          {p.numero && <L t="Numéro" v={p.numero} />}
          <L t="Date" v={`${p.date} à ${p.heure}`} />
          {p.reference && <L t="Référence" v={p.reference} />}
          {p.soldeApres != null && <L t="Solde après" v={fcfa(p.soldeApres)} />}
        </dl>

        <div className="mt-5">
          <p className="mb-1.5 text-caption uppercase tracking-wider text-ink-faint">
            Nature — pour le reçu
          </p>
          <div className="flex flex-wrap gap-1.5">
            {NATURES.map((n) => (
              <button key={n} onClick={() => classer(n)} disabled={classe}
                className={`rounded-btn border px-3 py-1.5 text-small transition disabled:opacity-40 ${
                  nature === n
                    ? "border-ink bg-ink font-medium text-white"
                    : "border-line text-ink-soft hover:border-ink-faint"
                }`}>
                {CAT[n].emoji} {CAT[n].label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-caption leading-relaxed text-ink-faint">
            Choisir une nature l’affiche ainsi partout et établit son reçu.
          </p>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-caption uppercase tracking-wider text-ink-faint">Message reçu</p>
          <p className="rounded-card bg-surface-2 p-3.5 text-small leading-relaxed text-ink-soft">{p.smsBrut}</p>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => navigator.clipboard?.writeText(p.smsBrut)}
            className="flex flex-1 items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium transition hover:border-ink-faint">
            <IconCopy size={15} /> Copier le SMS
          </button>
          {p.recu ? (
            <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
              className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
              <IconDoc size={15} /> Reçu PDF
            </a>
          ) : (
            p.sourceId != null && etabli !== "fait" && (
              <button onClick={etablirRecu} disabled={etabli === "envoi"}
                className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-40">
                <IconDoc size={15} />
                {etabli === "envoi" ? "Demande au terminal…" : "Établir le reçu"}
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

function Chip({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-small transition ${
        actif
          ? "border-ink bg-ink font-medium text-white"
          : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
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
