"use client";

import { useMemo, useState } from "react";
import { type Categorie, fcfa, type Paiement } from "@/lib/types";
// La fiche d'un SMS et ses pastilles vivent dans un module partagé : la même
// fiche s'ouvre ici et depuis les derniers SMS de l'accueil.
import { CAT, catDe, FicheSms } from "../fiche-sms";
import { IconClose, IconDoc, IconSearch } from "../icons";
import { Vide } from "../vide";

// L'ordre des filtres de catégorie : les mouvements d'argent d'abord.
const ORDRE_CAT: Categorie[] = [
  "encaissement", "envoi", "transfert", "depot", "retrait",
  "solde", "code", "publicite", "message", "inconnu",
];

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
                        {/* Qui, quand — la source du SMS, brève. Le point plein
                            devant = pas encore ouvert. */}
                        <span className="flex min-w-0 items-center gap-1.5 truncate text-small text-ink-soft">
                          {p.nonLu && (
                            <span aria-label="non lu"
                              className="size-1.5 shrink-0 rounded-full bg-ink" />
                          )}
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
                          que la carte l'a reçu. Un non-lu se lit un cran plus
                          appuyé, comme dans une boîte mail. */}
                      <span className={`mt-1 block whitespace-pre-wrap break-words text-body text-ink ${
                        p.nonLu ? "font-medium" : ""
                      }`}>
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

      {detail && <FicheSms p={detail} onFermer={() => setDetail(null)} />}
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

