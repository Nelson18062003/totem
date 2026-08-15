"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesSms } from "@/lib/textes/sms";
import { type Categorie, fcfa, type Paiement } from "@/lib/types";
// La fiche d'un SMS et ses pastilles vivent dans un module partagé : la même
// fiche s'ouvre ici et depuis les derniers SMS de l'accueil.
import { catDe, CatIcone, classeCat, FicheSms, texteSurEcran } from "../fiche-sms";
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

// La liste se dévoile par pages au fil du défilement : mille SMS ne font
// jamais mille lignes d'un coup à l'écran.
const PAGE = 60;

// Une ligne de la liste, ou un pli de consultations de solde répétées : les
// vérifications identiques se replient derrière la plus récente — rien ne se
// supprime, tout reste à un geste.
type Rangee =
  | { genre: "sms"; p: Paiement }
  | { genre: "soldes"; recent: Paiement; anciens: Paiement[] };

function plierLesSoldes(items: Paiement[]): Rangee[] {
  const rangees: Rangee[] = [];
  for (const p of items) {
    const derniere = rangees[rangees.length - 1];
    if (catDe(p) === "solde" && p.montant == null) {
      if (derniere?.genre === "soldes") {
        derniere.anciens.push(p);
        continue;
      }
      rangees.push({ genre: "soldes", recent: p, anciens: [] });
      continue;
    }
    rangees.push({ genre: "sms", p });
  }
  return rangees;
}

/**
 * Tous les SMS reçus par les cartes — la liste montre la LECTURE (qui, quand,
 * combien) ; le texte d'origine, la preuve, vit dans la fiche. Les mouvements
 * d'argent dominent, les consultations de solde répétées se replient, les
 * publicités s'assourdissent. Rien ne se supprime jamais.
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
  const [visibles, setVisibles] = useState(PAGE);
  const [deplies, setDeplies] = useState<Set<string>>(new Set());
  const sentinelle = useRef<HTMLDivElement>(null);

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
    return paiements.filter((p) => {
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
  }, [paiements, filtre, categorie, recherche]);

  // Le guetteur du bas de page : quand il entre à l'écran, la page suivante
  // se dévoile. Un filtre qui change ramène au début.
  useEffect(() => { setVisibles(PAGE); }, [filtre, categorie, recherche]);
  useEffect(() => {
    const s = sentinelle.current;
    if (!s) return;
    const guetteur = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVisibles((v) => v + PAGE);
    });
    guetteur.observe(s);
    return () => guetteur.disconnect();
  }, [liste.length]);

  const tranche = liste.slice(0, visibles);

  // Regroupement par la clé stable du jour ; le libellé traduit (`p.date`)
  // ne sert qu'à écrire l'en-tête du groupe.
  const parJour = tranche.reduce<Record<string, Paiement[]>>((acc, p) => {
    (acc[p.jour] ||= []).push(p); return acc;
  }, {});

  const basculer = (id: string) =>
    setDeplies((d) => {
      const suite = new Set(d);
      if (suite.has(id)) suite.delete(id); else suite.add(id);
      return suite;
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Le titre seul — la liste parle d'elle-même. */}
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
      </header>

      {enAttente > 0 && (
        <p className="rounded-card border border-line bg-surface-2 px-4 py-2.5 text-small text-ink-soft">
          {t.enCoursDeTransmission(enAttente)}
        </p>
      )}

      {/* Recherche, et le filtre par carte SEULEMENT s'il y a plusieurs
          cartes — une seule carte n'a rien à filtrer. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {/* Le champ de recherche du système : une pilule pleine largeur. */}
        <div className="flex flex-1 items-center gap-2.5 rounded-full border border-line bg-surface-raised px-4">
          <IconSearch size={16} className="text-ink-faint" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder={t.recherchePlaceholder}
            className="flex-1 bg-transparent py-2.5 text-body outline-none placeholder:text-ink-faint" />
          {recherche && (
            <button onClick={() => setRecherche("")} className="-m-2.5 p-2.5 text-ink-faint transition hover:text-ink"
              aria-label={t.effacerRecherche}>
              <IconClose size={15} />
            </button>
          )}
        </div>
        {operateurs.length > 1 && (
          <div className="flex gap-1.5">
            {[TOUS, ...operateurs].map((f) => (
              <button key={f} onClick={() => setFiltre(f)}
                className={`rounded-btn border px-3.5 py-1.5 text-small transition sm:py-2.5 ${
                  filtre === f
                    ? "border-ink bg-ink font-medium text-white"
                    : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
                }`}>{f === TOUS ? t.toutesLesCartes : f}</button>
            ))}
          </div>
        )}
      </div>

      {/* Le filtre par catégorie : UNE rangée qui glisse, jamais un pavé qui
          s'empile — le premier SMS reste au-dessus du pli, même à 320 px. */}
      {categories.length > 1 && (
        <div className="-mt-1 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            <p className="mb-1 text-caption uppercase tracking-wider text-ink-faint">{items[0].date}</p>
            <ul className="divide-hair">
              {plierLesSoldes(items).map((r) =>
                r.genre === "sms" ? (
                  <li key={r.p.id}>
                    <Ligne p={r.p} ouvrir={() => setDetail(r.p)} t={t} langue={langue} />
                  </li>
                ) : (
                  <li key={r.recent.id}>
                    <Ligne p={r.recent} ouvrir={() => setDetail(r.recent)} t={t} langue={langue} />
                    {/* Les consultations identiques d'avant, repliées derrière
                        la plus récente — dépliables d'un geste, jamais perdues. */}
                    {r.anciens.length > 0 && (
                      <div className="pb-3 pl-12">
                        <button onClick={() => basculer(r.recent.id)}
                          className="text-caption text-ink-faint underline underline-offset-4 transition hover:text-ink">
                          {deplies.has(r.recent.id) ? t.replierSoldes : t.soldesRepetes(r.anciens.length)}
                        </button>
                        {deplies.has(r.recent.id) && (
                          <ul className="mt-1 divide-hair">
                            {r.anciens.map((p) => (
                              <li key={p.id}>
                                <Ligne p={p} ouvrir={() => setDetail(p)} t={t} langue={langue} sourdine />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                ),
              )}
            </ul>
          </section>
        ))
      )}

      {/* Le guetteur : tant qu'il reste des SMS, le défilement les dévoile. */}
      {visibles < liste.length && <div ref={sentinelle} className="h-8" />}

      {detail && <FicheSms p={detail} onFermer={() => setDetail(null)} />}
    </div>
  );
}

/**
 * Une ligne de la boîte : la LECTURE d'abord. Un mouvement d'argent montre
 * qui et combien — son texte intégral vit dans la fiche. Un message sans
 * montant montre son début, sur deux lignes au plus. Une publicité parle à
 * voix basse. Un code garde ses chiffres masqués, même en liste.
 */
function Ligne({
  p, ouvrir, t, langue, sourdine = false,
}: {
  p: Paiement;
  ouvrir: () => void;
  t: (typeof textesSms)["fr" | "en"];
  langue: "fr" | "en";
  sourdine?: boolean;
}) {
  const argent = p.montant != null;
  const pub = catDe(p) === "publicite";
  const doux = sourdine || pub;

  return (
    <div className="flex items-start gap-3 py-3">
      <button onClick={ouvrir}
        className="flex min-w-0 flex-1 items-start gap-3 text-left transition hover:opacity-70">
        {/* La pastille prend l'étiquette du système : rayon de 8, schéma de
            couleur selon la catégorie. */}
        <span title={t.cat[catDe(p)]}
          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-btn ${doux ? "border border-line text-ink-faint" : classeCat(catDe(p))}`}>
          <CatIcone c={catDe(p)} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className={`flex min-w-0 items-center gap-1.5 truncate text-small ${doux ? "text-ink-faint" : "text-ink-soft"}`}>
              {/* Le point plein devant = pas encore ouvert. Assez grand pour
                  se voir : c'est lui qui appelle l'œil. */}
              {p.nonLu && (
                <span aria-label={t.nonLu}
                  className="size-2 shrink-0 rounded-full bg-ink" />
              )}
              {argent && p.numero ? `${p.numero} · ` : ""}{p.sim} · {p.heure}
            </span>
            {/* Montant complet, jamais abrégé ; sans signe quand le sens
                n'est pas établi. */}
            {argent && (
              <span className={`shrink-0 text-body font-medium tabnums ${
                p.sens === "in" ? "text-positive" : p.sens === "out" ? "text-ink" : "text-ink-soft"
              }`}>
                {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant!, langue)}
              </span>
            )}
          </span>
          {/* La deuxième ligne : QUI pour un mouvement (le texte intégral vit
              dans la fiche) ; le début du message pour le reste — deux lignes
              au plus, dans le sens d'écriture du texte (dir=auto). */}
          <span dir="auto"
            className={`mt-0.5 block break-words ${
              argent
                ? `truncate text-body ${p.nonLu ? "font-medium" : ""}`
                : `line-clamp-2 whitespace-pre-wrap ${doux ? "text-small text-ink-faint" : `text-body text-ink ${p.nonLu ? "font-medium" : ""}`}`
            }`}>
            {argent ? (p.tiers || p.nom || texteSurEcran(p)) : texteSurEcran(p)}
          </span>
        </span>
      </button>
      {/* Le reçu PDF, à portée de main quand il existe. */}
      {p.recu && (
        <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
          title={t.telechargerRecu}
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft transition hover:border-ink hover:text-ink">
          <IconDoc size={16} />
        </a>
      )}
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
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-small transition ${
        actif
          ? "border-ink bg-ink font-medium text-white"
          : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}
