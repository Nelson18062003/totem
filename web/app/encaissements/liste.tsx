"use client";

import { useEffect, useMemo, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesSms } from "@/lib/textes/sms";
import { type Categorie, fcfa, type Paiement } from "@/lib/types";
// La fiche d'un SMS et ses pastilles vivent dans un module partagé : la même
// fiche s'ouvre ici et depuis les derniers SMS de l'accueil.
import { catDe, CatIcone, classeCat, FicheSms } from "../fiche-sms";
import { IconClose, IconDoc, IconSearch } from "../icons";
import { Vide } from "../vide";

// L'ordre des filtres de catégorie : les mouvements d'argent d'abord.
const ORDRE_CAT: Categorie[] = [
  "encaissement", "envoi", "transfert", "depot", "retrait",
  "solde", "code", "publicite", "message", "inconnu",
];

// Les valeurs-sentinelles des filtres. Ce sont des états internes, jamais
// affichés tels quels : leur libellé vient du dictionnaire.
const TOUS = "Tous";
const TOUTES = "Toutes";

// Combien de SMS se montrent d'un coup — le reste attend « Afficher plus ».
const PAGE = 60;

/**
 * Tous les SMS reçus par les cartes, tels quels — c'est par eux que tout
 * arrive. Ceux que le robot a compris portent leur montant ; ceux qui ont un
 * reçu PDF archivé se téléchargent d'un geste, directement sur la ligne.
 */
export function ListeEncaissements({
  paiements,
  operateurs,
  enAttente = 0,
  rechercheInitiale = "",
}: {
  paiements: Paiement[];
  operateurs: string[];
  enAttente?: number;
  // La recherche posée d'avance quand on arrive d'ailleurs (un client de
  // l'Analyse) — effaçable d'un geste, comme une recherche tapée.
  rechercheInitiale?: string;
}) {
  const langue = useLangue();
  const t = textesSms[langue];
  const [filtre, setFiltre] = useState(TOUS);
  const [categorie, setCategorie] = useState<Categorie | typeof TOUTES>(TOUTES);
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [detail, setDetail] = useState<Paiement | null>(null);
  // La liste s'affiche par pages : mille lignes d'un coup mettent un
  // téléphone à genoux. « Afficher plus » déroule la suite.
  const [visibles, setVisibles] = useState(PAGE);
  // Les répétitions dépliées à la main (relevés de solde en rafale…).
  const [deplies, setDeplies] = useState<Set<string>>(new Set());
  useEffect(() => {
    setVisibles(PAGE);
    setDeplies(new Set());
  }, [recherche, filtre, categorie]);

  // La recherche fouille TOUT l'historique, pas seulement les lignes
  // chargées : dès deux caractères, la base répond (350 ms de calme après la
  // dernière frappe). En attendant, le filtre local donne l'instantané.
  const [historique, setHistorique] = useState<Paiement[] | null>(null);
  const [chercheAuLoin, setChercheAuLoin] = useState(false);
  useEffect(() => {
    const q = recherche.trim();
    if (q.length < 2) {
      setHistorique(null);
      setChercheAuLoin(false);
      return;
    }
    setChercheAuLoin(true);
    const minuterie = setTimeout(async () => {
      try {
        const r = await fetch(`/api/recherche?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (r.ok) {
          const { paiements: trouves } = (await r.json()) as { paiements: Paiement[] };
          setHistorique(trouves);
        }
      } catch {
        /* réseau absent : le filtre local reste en place */
      }
      setChercheAuLoin(false);
    }, 350);
    return () => clearTimeout(minuterie);
  }, [recherche]);

  // Les catégories réellement présentes, dans l'ordre voulu — on ne propose
  // pas un filtre pour une catégorie qu'on n'a jamais reçue.
  const categories = useMemo(() => {
    const vues = new Set(paiements.map(catDe));
    return ORDRE_CAT.filter((c) => vues.has(c));
  }, [paiements]);

  const liste = useMemo(() => {
    // Deux formes de la requête : telle quelle, et sans espaces. Un espace ne
    // doit jamais faire échouer : « PRIX MONO » trouve « PRIX MONO SARL »,
    // « 20 000 » trouve le montant 20000, « 699 12 34 » trouve le numéro.
    const brute = recherche.trim().toLowerCase();
    const serree = brute.replace(/\s/g, "");
    const compacte = (s: string) => s.toLowerCase().replace(/\s/g, "");
    // La source : les trouvailles de l'historique complet quand la base a
    // répondu, sinon les lignes déjà chargées.
    const source = historique ?? paiements;
    return source.filter((p) => {
      if (filtre !== TOUS && p.sim !== filtre) return false;
      if (categorie !== TOUTES && catDe(p) !== categorie) return false;
      if (!brute) return true;
      return compacte(p.nom).includes(serree)
        || compacte(p.numero).includes(serree)
        || String(p.montant ?? "").includes(serree)
        || compacte(p.reference).includes(serree)
        || p.smsBrut.toLowerCase().includes(brute)
        || compacte(p.smsBrut).includes(serree);
    });
  }, [paiements, historique, filtre, categorie, recherche]);

  // Les répétitions consécutives d'un même message SANS montant (relevés de
  // solde en rafale, publicités) se replient en une ligne « ×N », dépliable.
  // Seule la présentation se replie : chaque SMS reste au journal, et un
  // message qui porte un montant ne se regroupe jamais.
  type Entree = { p: Paiement; groupe: Paiement[] };
  const entrees: Entree[] = [];
  for (const p of liste) {
    const d = entrees[entrees.length - 1];
    if (
      d && d.p.montant == null && p.montant == null &&
      d.p.nom === p.nom && d.p.smsBrut === p.smsBrut && d.p.jour === p.jour
    ) {
      d.groupe.push(p);
    } else {
      entrees.push({ p, groupe: [p] });
    }
  }

  // Regroupement par la clé stable du jour ; le libellé traduit (`p.date`)
  // ne sert qu'à écrire l'en-tête du groupe. Seule la page visible se rend.
  const restants = Math.max(0, entrees.length - visibles);
  const parJour = entrees.slice(0, visibles).reduce<Record<string, Entree[]>>((acc, e) => {
    (acc[e.p.jour] ||= []).push(e); return acc;
  }, {});

  return (
    <div className="flex flex-col gap-7">
      {/* Le titre seul — la liste parle d'elle-même. */}
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
      </header>

      {enAttente > 0 && (
        <p className="rounded-card border border-line bg-surface-2 px-4 py-2.5 text-small text-ink-soft">
          {t.enCoursDeTransmission(enAttente)}
        </p>
      )}

      {/* Recherche et filtres — une seule ligne dès que la largeur le permet */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Le champ de recherche du système : une pilule pleine largeur. */}
        <div className="flex flex-1 items-center gap-2.5 rounded-full border border-line bg-surface-raised px-4">
          <IconSearch size={16} className="text-ink-faint" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder={t.recherchePlaceholder}
            className="flex-1 bg-transparent py-2.5 text-body outline-none placeholder:text-ink-faint" />
          {recherche && (
            <button onClick={() => setRecherche("")} className="text-ink-faint transition hover:text-ink"
              aria-label={t.effacerRecherche}>
              <IconClose size={15} />
            </button>
          )}
        </div>
        {/* Le filtre d'opérateur ne se montre que s'il y a un choix à faire :
            avec une seule carte, il n'était que du bruit. */}
        {operateurs.length > 1 && (
          <div className="flex gap-1.5">
            {[TOUS, ...operateurs].map((f) => (
              <button key={f} onClick={() => setFiltre(f)}
                className={`rounded-btn border px-3.5 py-1.5 text-small transition sm:py-2.5 ${
                  filtre === f
                    ? "border-ink bg-ink font-medium text-white"
                    : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
                }`}>{f === TOUS ? t.tousLesOperateurs : f}</button>
            ))}
          </div>
        )}
      </div>

      {/* Le fil de la recherche : elle fouille TOUT l'historique, et le dit. */}
      {recherche.trim().length >= 2 && (
        <p className="-mt-4 text-caption text-ink-faint" aria-live="polite">
          {chercheAuLoin
            ? t.rechercheEnCours
            : historique !== null
              ? t.rechercheHistorique(liste.length)
              : null}
        </p>
      )}

      {/* Filtre par catégorie — seulement celles réellement reçues, sur UNE
          ligne qui glisse du doigt : fini les trois rangs de puces. */}
      {categories.length > 1 && (
        <div className="-mt-3 -mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
          <Chip actif={categorie === TOUTES} onClick={() => setCategorie(TOUTES)}>
            {t.toutesLesCategories}
          </Chip>
          {categories.map((c) => (
            <Chip key={c} actif={categorie === c} onClick={() => setCategorie(c)}>
              <CatIcone c={c} size={13} /> {t.cat[c]}
            </Chip>
          ))}
        </div>
      )}

      {/* La liste des SMS */}
      {Object.keys(parJour).length === 0 ? (
        recherche || filtre !== TOUS || categorie !== TOUTES ? (
          <Vide
            titre={t.aucunResultatTitre}
            detail={t.aucunResultatDetail}
            action={
              <button
                onClick={() => { setRecherche(""); setFiltre(TOUS); setCategorie(TOUTES); }}
                className="rounded-btn border border-line px-4 py-2 text-small font-medium transition hover:border-ink-faint"
              >
                {t.toutAfficher}
              </button>
            }
          />
        ) : (
          <Vide titre={t.aucunSmsTitre} detail={t.aucunSmsDetail} />
        )
      ) : (
        Object.entries(parJour).map(([jour, items]) => (
          <section key={jour}>
            <p className="mb-1 text-caption uppercase tracking-wider text-ink-faint">{items[0].p.date}</p>
            <ul className="divide-hair">
              {items.flatMap(({ p: premier, groupe }) => {
                const deplie = deplies.has(premier.id);
                const affiches = deplie ? groupe : [premier];
                return affiches.map((p) => (
                <li key={p.id} className="flex items-start gap-3 py-3.5">
                  <button onClick={() => setDetail(p)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left transition hover:opacity-70">
                    {/* La pastille prend l'étiquette du système : rayon de 8,
                        schéma de couleur selon la catégorie. */}
                    <span title={t.cat[catDe(p)]}
                      className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-btn ${classeCat(catDe(p))}`}>
                      <CatIcone c={catDe(p)} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        {/* QUI d'abord, en évidence. Le point plein devant =
                            pas encore ouvert. */}
                        <span className="flex min-w-0 items-center gap-1.5 text-body font-medium">
                          {p.nonLu && (
                            <span aria-label={t.nonLu}
                              className="size-1.5 shrink-0 rounded-full bg-ink" />
                          )}
                          <span className="truncate">{p.nom}</span>
                        </span>
                        {/* Montant complet, jamais abrégé ; sans signe quand le
                            sens n'est pas établi. */}
                        {p.montant != null && (
                          <span className={`shrink-0 text-body font-medium tabnums ${
                            p.sens === "in" ? "text-positive" : p.sens === "out" ? "text-ink" : "text-ink-soft"
                          }`}>
                            {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant, langue)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-caption tabnums text-ink-faint">
                        {p.sim} · {p.heure}
                      </span>
                      {/* Le début du message suffit à la liste — DEUX lignes au
                          plus, jamais reformulées. Le texte entier vit sur la
                          fiche : une liste n'est pas une lecture. */}
                      <span className={`mt-1 line-clamp-2 break-words text-small leading-relaxed ${
                        p.nonLu ? "font-medium text-ink" : "text-ink-soft"
                      }`}>
                        {p.smsBrut}
                      </span>
                    </span>
                  </button>
                  {/* Les répétitions repliées : « ×5 » les déplie. */}
                  {!deplie && groupe.length > 1 && (
                    <button
                      onClick={() => setDeplies((s) => new Set(s).add(premier.id))}
                      aria-label={t.repetitions(groupe.length)}
                      title={t.repetitions(groupe.length)}
                      className="mt-0.5 grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-surface-2 px-1.5 text-small font-medium tabnums text-ink-soft transition hover:bg-surface-3">
                      ×{groupe.length}
                    </button>
                  )}
                  {/* Le reçu PDF, à portée de main quand il existe. */}
                  {p.recu && (
                    <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
                      title={t.telechargerRecu}
                      className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft transition hover:border-ink hover:text-ink">
                      <IconDoc size={16} />
                    </a>
                  )}
                </li>
                ));
              })}
            </ul>
          </section>
        ))
      )}

      {/* La suite, à la demande — le compte dit ce qui reste. */}
      {restants > 0 && (
        <button
          onClick={() => setVisibles((v) => v + PAGE)}
          className="rounded-btn border border-line bg-surface-raised py-3 text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink"
        >
          {t.afficherPlus(restants)}
        </button>
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
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-small transition ${
        actif
          ? "border-ink bg-ink font-medium text-white"
          : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}
