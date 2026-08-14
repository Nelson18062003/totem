"use client";

import { useMemo, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesSms } from "@/lib/textes/sms";
import { type Categorie, fcfa, jourDouala, type Paiement } from "@/lib/types";
// La fiche d'un SMS et ses pastilles vivent dans un module partagé : la même
// fiche s'ouvre ici et depuis les derniers SMS de l'accueil.
import { catDe, CatIcone, FicheSms } from "../fiche-sms";
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

  // « Aujourd'hui » se décide sur la clé stable du jour (`p.jour`, fuseau de
  // Douala) — jamais sur le libellé `p.date`, qui change avec la langue.
  const aujourdhui = jourDouala(new Date());
  const entrees = liste.filter((p) => p.sens === "in" && p.montant != null && p.jour === aujourdhui);
  const totalIn = entrees.reduce((s, p) => s + (p.montant ?? 0), 0);

  // Regroupement par la clé stable du jour ; le libellé traduit (`p.date`)
  // ne sert qu'à écrire l'en-tête du groupe.
  const parJour = liste.reduce<Record<string, Paiement[]>>((acc, p) => {
    (acc[p.jour] ||= []).push(p); return acc;
  }, {});

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {enAttente > 0 && (
        <p className="rounded-card border border-line bg-surface-2 px-4 py-2.5 text-small text-ink-soft">
          {t.enCoursDeTransmission(enAttente)}
        </p>
      )}

      <section>
        <p className="text-small text-ink-soft">{t.recuAujourdhui}</p>
        <p className="mt-1 text-display font-semibold tabnums tracking-tight">{fcfa(totalIn, langue)}</p>
        <p className="mt-1 text-small text-ink-faint">{t.nbPaiements(entrees.length)}</p>
      </section>

      {/* Recherche et filtres — une seule ligne dès que la largeur le permet */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2.5 rounded-btn border border-line bg-surface-raised px-3.5">
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
      </div>

      {/* Filtre par catégorie — seulement celles réellement reçues */}
      {categories.length > 1 && (
        <div className="-mt-3 flex flex-wrap gap-1.5">
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
              {items.map((p) => (
                <li key={p.id} className="flex items-start gap-3 py-3.5">
                  <button onClick={() => setDetail(p)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left transition hover:opacity-70">
                    <span title={t.cat[catDe(p)]}
                      className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
                      <CatIcone c={catDe(p)} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        {/* Qui, quand — la source du SMS, brève. Le point plein
                            devant = pas encore ouvert. */}
                        <span className="flex min-w-0 items-center gap-1.5 truncate text-small text-ink-soft">
                          {p.nonLu && (
                            <span aria-label={t.nonLu}
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
                            {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant, langue)}
                          </span>
                        )}
                      </span>
                      {/* Le SMS EN ENTIER : c'est lui qu'on vient lire. Jamais
                          tronqué, jamais reformulé, jamais traduit — le message
                          d'origine, tel que la carte l'a reçu. Un non-lu se lit
                          un cran plus appuyé, comme dans une boîte mail. */}
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
                      title={t.telechargerRecu}
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
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-small transition ${
        actif
          ? "border-ink bg-ink font-medium text-white"
          : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}
