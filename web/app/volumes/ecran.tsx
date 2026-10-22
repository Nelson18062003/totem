"use client";

// L'ÉCRAN DES VOLUMES, VIVANT.
//
// La première version était une page du serveur : chaque appui (une
// période, une flèche, une carte, un correspondant) repartait au serveur,
// recalculait tout, et renvoyait une page entière. Sur un téléphone à
// Douala, une à trois secondes sans rien qui bouge, puis tout qui saute —
// « c'est trop lent, ça bugue, aucune transition », a dit le propriétaire.
//
// Ici, la page ne se recharge plus :
//   — chaque réponse se GARDE (même période, même carte : rien ne repart) ;
//   — dès qu'une période s'affiche, ses voisines se chargent EN SILENCE (‹ ›,
//     et les autres durées pour le même jour) : le prochain appui est
//     immédiat ;
//   — l'appui répond tout de suite : la pastille, le nom de la période ;
//     les chiffres arrivent en glissant du côté où l'on va ;
//   — l'adresse suit (un rechargement, un lien partagé, rouvrent la même vue).
//
// Rien n'est calculé ici : la plateforme rend le calcul du noyau
// (`/api/volumes`), le même que celui du téléphone.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  francs, francsCourts, jourCourtVolumes, nomDeFamille, textesVolumes,
} from "@noyau/textes/volumes";
import {
  colonneParDefaut, creneauLePlusCharge, ecartLisible, etiquetteDuPas, famillesDe, GENRES_PERIODE,
  graduations, nomDeLaColonne, nomDeLaPeriode, periodeVoisine, serieVisible,
  cleDeLaDemande, demandeDeLaPeriode, periodeDeLaDemande, voisinesAPrecharger,
  type CarteVolumes, type DemandeDeVolumes, type FamilleVolume, type GenrePeriode, type Pas, type PeriodeVolumes,
  type PointDeSerie, type ReponseVolumes,
} from "@noyau/volumes";
import { formaterNumero } from "@noyau/numero";
import { initialesDe } from "@noyau/flux";
import type { Langue } from "@noyau/langue";
import { MenuDeCarte, NomDeCarte, PanneauDeDates } from "./selecteurs";
import { IconCalendrier, IconChevron, IconDownload } from "../icons";

export type DemandeVolumes = DemandeDeVolumes;
const periodeDe = periodeDeLaDemande;
const cleDe = cleDeLaDemande;

const COULEUR_FAMILLE: Record<FamilleVolume, string> = {
  argent: "var(--color-famille-argent)", especes: "var(--color-famille-especes)",
  transferts: "var(--color-famille-transferts)", commissions: "var(--color-famille-commissions)",
};

/** Un montant qui tient TOUJOURS dans sa boîte. Six mois de la vraie caisse
 *  font « 1 156 121 864,58 F » : à taille fixe, la page débordait et coupait
 *  les chiffres (« 1 156 12 »). La taille suit la largeur de la boîte
 *  (`@container`), entre un plancher et la taille d'origine. */
function Montant({ valeur, langue, signe = false, ton = "", min = 1, vise = 8.5, max = 2.25, className = "" }: {
  valeur: number; langue: Langue; signe?: boolean; ton?: string;
  min?: number; vise?: number; max?: number; className?: string;
}) {
  return (
    <span className={`block whitespace-nowrap font-bold leading-tight tracking-tight tabnums ${ton} ${className}`}
          style={{ fontSize: `clamp(${min}rem, ${vise}cqi, ${max}rem)` }}>
      {francs(valeur, langue, signe)}
    </span>
  );
}

export function EcranVolumes({ initial, demandeInitiale, langue }: {
  initial: ReponseVolumes; demandeInitiale: DemandeVolumes; langue: Langue;
}) {
  const t = textesVolumes[langue];
  const aujourdhui = initial.aujourdhui;
  const cache = useRef(new Map<string, ReponseVolumes>([[cleDe(demandeInitiale, aujourdhui), initial]]));
  const enVol = useRef(new Map<string, Promise<ReponseVolumes>>());
  const numero = useRef(0);
  const [demande, setDemande] = useState(demandeInitiale);
  const [montree, setMontree] = useState({ r: initial, cle: cleDe(demandeInitiale, aujourdhui), sens: 0 as -1 | 0 | 1 });
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [dates, setDates] = useState(false);
  const [tous, setTous] = useState(false);

  /** Une réponse : gardée, ou demandée une seule fois même si on la réclame
   *  deux fois pendant qu'elle voyage. */
  const lire = useCallback((d: DemandeVolumes): Promise<ReponseVolumes> => {
    const k = cleDe(d, aujourdhui);
    const deja = cache.current.get(k);
    if (deja) return Promise.resolve(deja);
    const vol = enVol.current.get(k);
    if (vol) return vol;
    const p = fetch(`/api/volumes?${k}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const r = (await res.json()) as ReponseVolumes;
        cache.current.set(k, r);
        return r;
      })
      .finally(() => enVol.current.delete(k));
    enVol.current.set(k, p);
    return p;
  }, [aujourdhui]);

  const aller = useCallback((change: Partial<DemandeVolumes>, sens: -1 | 0 | 1 = 0) => {
    const d = { ...demande, ...change };
    if (!periodeDe(d, aujourdhui)) return;
    const k = cleDe(d, aujourdhui);
    setDemande(d);
    setErreur(false);
    if (!change.qui) setTous(false);
    try { window.history.replaceState(null, "", `/volumes?${k}`); } catch { /* adresse figée : sans gravité */ }
    const n = ++numero.current;
    const deja = cache.current.get(k);
    if (deja) { setMontree({ r: deja, cle: k, sens }); setAttente(false); return; }
    setAttente(true);
    lire(d).then((r) => {
      if (n !== numero.current) return;
      setMontree({ r, cle: k, sens });
      setAttente(false);
    }).catch(() => {
      if (n !== numero.current) return;
      setAttente(false);
      setErreur(true);
    });
  }, [demande, aujourdhui, lire]);

  // LES VOISINES, EN SILENCE — une à la fois, après l'affichage : la
  // période d'avant et d'après, et les autres durées pour aujourd'hui.
  useEffect(() => {
    const r = montree.r;
    if (r.volumes.fiche !== undefined) return;
    const voisines = voisinesAPrecharger(r.volumes.periode, r.carte, aujourdhui);
    let fini = false;
    const minuteur = window.setTimeout(async () => {
      for (const d of voisines) {
        if (fini) return;
        try { await lire(d); } catch { /* une voisine qui échoue n'empêche rien */ }
      }
    }, 250);
    return () => { fini = true; window.clearTimeout(minuteur); };
  }, [montree.cle, montree.r, aujourdhui, lire]);

  const r = montree.r;
  const v = r.volumes;
  const p = v.periode;
  // La période DEMANDÉE — celle dont l'écran parle dès l'appui.
  const visee = periodeDe(demande, aujourdhui) ?? p;
  const carteChoisie = r.carte === "tout" ? null : r.cartes.find((c) => c.iccid === r.carte) ?? null;
  const releve = `/api/releve?carte=${encodeURIComponent(r.carte)}&de=${p.de}&a=${p.jusqua}&format=pdf`;
  const animation = montree.sens > 0 ? "glisse-gauche" : montree.sens < 0 ? "glisse-droite" : "fondu";

  return (
    <div className="flex flex-col gap-5">
      <EnTete langue={langue} r={r} demande={demande} visee={visee} attente={attente} dates={dates}
              releve={releve}
              onGenre={(g) => {
                if (g === "dates") { setDates((o) => !o); return; }
                setDates(false);
                aller({ periode: g, jour: aujourdhui, de: undefined, a: undefined, qui: null });
              }}
              onVoisine={(sens) => {
                const x = periodeVoisine(visee, sens, aujourdhui);
                if (x) aller({ ...demandeDeLaPeriode(x, demande.carte) }, sens);
              }}
              onCarte={(carte) => aller({ carte, qui: null })} />

      {dates && (
        <PanneauDeDates langue={langue} aujourdhui={aujourdhui}
                        depart={demande.periode === "dates" ? { de: visee.de, a: visee.a } : null}
                        onFermer={() => setDates(false)}
                        onVoir={(b) => {
                          setDates(false);
                          aller({ periode: "dates", jour: undefined, de: b.de, a: b.a, qui: null });
                        }} />
      )}

      {erreur && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-[#e5cfae] bg-[#fbf3e6] px-4 py-3 text-small">
          <span>{t.erreur}</span>
          <button type="button" onClick={() => aller({})}
                  className="rounded-btn bg-ink px-3 py-1.5 text-small font-semibold text-white">{t.reessayer}</button>
        </div>
      )}

      <div aria-busy={attente} className={`transition-opacity duration-200 ${attente ? "pointer-events-none opacity-45" : ""}`}>
        <div key={montree.cle} className={animation} data-vue={montree.cle}>
          {r.cartes.length === 0 ? (
            <Vide titre={t.pasDeCarte} detail={t.pasDeCarteDetail} />
          ) : v.fiche !== undefined ? (
            <FicheCorrespondant r={r} langue={langue} onRetour={() => aller({ qui: null })} />
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
                <Duel r={r} langue={langue} />
                {carteChoisie && <LeSolde r={r} carte={carteChoisie} langue={langue} />}
                <Graphe serie={v.serie} pas={p.pas} langue={langue} titre={t.serie[p.pas]}
                        debut={v.debutDeLHistorique} />
              </div>
              <div className="flex min-w-0 flex-col gap-5 lg:col-span-2 xl:col-span-1">
                <Avertissements r={r} langue={langue} />
                <ChiffresCles r={r} langue={langue} />
              </div>
              {v.totaux.n === 0 ? (
                <div className="lg:col-span-2 xl:col-span-3"><Vide titre={t.rien} detail={t.rienDetail} /></div>
              ) : (
                <>
                  <AvecQui r={r} langue={langue} tous={tous} onTous={() => setTous((x) => !x)}
                           onQui={(qui) => aller({ qui })} />
                  <Anneaux r={r} langue={langue} />
                  <div className="flex min-w-0 flex-col gap-5">
                    {r.carte === "tout" && <ParCarte r={r} langue={langue} onCarte={(carte) => aller({ carte, qui: null })} />}
                    <HeuresDePointe heures={v.heures} langue={langue} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- La tête : la période, la carte ------------------------------------------

function EnTete({ langue, r, demande, visee, attente, dates, releve, onGenre, onVoisine, onCarte }: {
  langue: Langue; r: ReponseVolumes; demande: DemandeVolumes; visee: PeriodeVolumes;
  attente: boolean; dates: boolean; releve: string;
  onGenre: (g: GenrePeriode) => void; onVoisine: (sens: -1 | 1) => void; onCarte: (iccid: string) => void;
}) {
  const t = textesVolumes[langue];
  const avant = periodeVoisine(visee, -1, r.aujourdhui);
  const apres = periodeVoisine(visee, 1, r.aujourdhui);
  const fleche = "grid h-10 w-10 shrink-0 place-items-center rounded-btn border border-line bg-surface-raised text-ink transition hover:border-ink-faint active:scale-95 disabled:opacity-30 disabled:active:scale-100";

  // LA PASTILLE GLISSE d'une durée à l'autre : on voit d'où l'on vient.
  const rangee = useRef<HTMLDivElement>(null);
  const [repere, setRepere] = useState<{ x: number; l: number } | null>(null);
  const choisi = dates ? "dates" : demande.periode;
  useLayoutEffect(() => {
    const placer = () => {
      const b = rangee.current?.querySelector<HTMLElement>(`[data-genre="${choisi}"]`);
      if (b) setRepere({ x: b.offsetLeft, l: b.offsetWidth });
    };
    placer();
    window.addEventListener("resize", placer);
    return () => window.removeEventListener("resize", placer);
  }, [choisi, langue]);

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-title font-semibold tracking-tight">{t.titre}</h1>
        <a href={releve} download title={t.telechargerReleve} aria-label={t.telechargerReleve} className={fleche}>
          <IconDownload size={18} />
        </a>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Chaque pastille part de la largeur de son nom : à parts égales, à
            320 points, « Semaine » passait sous « Mois ». */}
        <div ref={rangee} role="tablist" aria-label={t.titre}
             className="relative flex gap-1 rounded-full bg-surface-2 p-1 min-[360px]:gap-1.5 lg:w-[30rem]">
          {repere && (
            <span aria-hidden className="absolute bottom-1 top-1 rounded-full bg-accent shadow-sm transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
                  style={{ transform: `translateX(${repere.x - 4}px)`, width: repere.l, left: 4 }} />
          )}
          {GENRES_PERIODE.map((g) => {
            const actif = g === choisi;
            return (
              <button key={g} type="button" role="tab" aria-selected={actif} data-genre={g}
                      onClick={() => onGenre(g)}
                      className={`relative z-10 flex flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-2 text-caption font-medium transition-colors duration-300 min-[360px]:text-small ${
                        actif ? "text-white" : "text-ink-soft hover:text-ink"} ${!repere && actif ? "bg-accent" : ""}`}>
                {g === "dates" && <IconCalendrier size={14} className="hidden min-[400px]:block" />}
                {t.periodes[g]}
              </button>
            );
          })}
        </div>
        <span className="hidden flex-1 lg:block" />
        {r.cartes.length > 0 && (
          <div className="lg:w-72">
            <MenuDeCarte langue={langue} choisie={demande.carte} onChoisir={onCarte}
                         cartes={r.cartes.map((c) => ({ iccid: c.iccid, libelle: c.libelle, operateur: c.operateur, numero: c.numero }))} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={!avant} aria-label={t.precedente} onClick={() => onVoisine(-1)} className={fleche}>
          <IconChevron size={16} className="rotate-180" />
        </button>
        <p className="flex flex-1 items-center justify-center gap-2 text-center text-heading font-semibold" aria-live="polite">
          {nomDeLaPeriode(visee, langue)}
          {attente && <span className="tourne inline-block h-4 w-4 rounded-full border-2 border-ink-faint border-t-transparent" aria-label={t.chargement} />}
        </p>
        <button type="button" disabled={!apres} aria-label={t.suivante} onClick={() => onVoisine(1)} className={fleche}>
          <IconChevron size={16} />
        </button>
      </div>
    </header>
  );
}

// --- Les deux barres ---------------------------------------------------------

function Ecart({ maintenant, avant, comparable, langue }: { maintenant: number; avant: number; comparable: boolean; langue: Langue }) {
  const e = ecartLisible(maintenant, avant, langue, comparable);
  if (!e) return null;
  return (
    <span title={textesVolumes[langue].vsAvant}
          className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-caption font-semibold text-ink-soft tabnums">
      {e.texte}
    </span>
  );
}

function Duel({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const { totaux, avant } = r.volumes;
  const comparable = r.volumes.comparable !== false;
  const max = Math.max(totaux.entrees, totaux.sorties, 1);
  const ligne = (nom: string, valeur: number, n: number, avantV: number, couleur: string, ton: string) => (
    // Le montant a SA ligne : à côté du nom, il passait à la ligne dès qu'un
    // écart s'affichait, et la carte changeait de forme d'une période à l'autre.
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-2 text-body font-semibold">
          <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: couleur }} />
          {nom}
          <Ecart maintenant={valeur} avant={avantV} comparable={comparable} langue={langue} />
        </span>
        <span className="ml-auto whitespace-nowrap text-caption text-ink-faint">{t.operations(n)}</span>
      </div>
      <Montant valeur={valeur} langue={langue} ton={ton} vise={9.5} max={2} />
      <div className="mt-1 h-3.5 rounded-md" style={{ background: couleur, width: `${Math.max(1, (valeur / max) * 100)}%` }}
           role="img" aria-label={`${nom} ${francs(valeur, langue)}`} />
    </div>
  );
  return (
    <section className="@container flex flex-col gap-4 rounded-card border border-line bg-surface-raised p-5">
      {ligne(t.entrees, totaux.entrees, totaux.nEntrees, avant.entrees, "var(--color-entree)", "text-positive")}
      {ligne(t.sorties, totaux.sorties, totaux.nSorties, avant.sorties, "var(--color-sortie)", "text-negative")}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-4">
        <span className="text-body font-semibold">{t.reste}</span>
        <Montant valeur={totaux.net} langue={langue} signe vise={9.5} max={2.1} />
      </div>
    </section>
  );
}

// --- Ce qui peut manquer -----------------------------------------------------

function Avertissements({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const a = r.volumes.avertissements;
  const lignes: string[] = [];
  if (r.tronque) lignes.push(t.tronque);
  for (const s of r.silencieuses) {
    const c = r.cartes.find((x) => x.iccid === s.iccid);
    if (c) lignes.push(t.silence(c.libelle));
  }
  if (a.illisibles) lignes.push(t.illisibles(a.illisibles));
  if (a.aVerifier) lignes.push(t.aVerifier(a.aVerifier));
  if (a.ecarts) lignes.push(t.ecarts(a.ecarts));
  if (a.incomplets) lignes.push(t.incomplets(a.incomplets));
  if (lignes.length === 0) return null;
  return (
    <section role="status" className="flex gap-3 rounded-card border border-[#e5cfae] bg-[#fbf3e6] p-4">
      <IconeAlerte />
      <div className="flex flex-col gap-1">
        <p className="text-small font-semibold">{t.incomplet}</p>
        <ul className="flex flex-col gap-0.5 text-small text-ink-soft">
          {lignes.map((l) => <li key={l}>· {l}</li>)}
        </ul>
      </div>
    </section>
  );
}

function IconeAlerte({ taille = 20 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="var(--color-alert)" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

// --- Les chiffres clés -------------------------------------------------------

function ChiffresCles({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const { totaux, cles, nbCorrespondants } = r.volumes;
  const g = cles.plusGrosse;
  const nombre = (n: number) => n.toLocaleString(langue === "en" ? "en-US" : "fr-FR").replace(/[  ]/g, " ");
  const cases: [string, string, string][] = [
    [t.kOperations, nombre(totaux.n), t.kParJour(cles.parJour)],
    [t.kMoyenne, francs(cles.moyenne, langue), t.kParOperation],
    [t.kPlusGrosse, g ? francs(g.montant, langue) : "—",
     g ? (g.sens === "in" ? t.kRecueLe : t.kEnvoyeeLe)(jourCourtVolumes(g.jour, langue)) : ""],
    [t.kCorrespondants, String(nbCorrespondants), t.kPersonnes],
    [t.kCommissions, francs(cles.commissions, langue), t.kGagnees],
    [t.kFrais, francs(totaux.frais, langue), t.kPayes],
  ];
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-heading font-semibold">{t.chiffresCles}</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">
        {cases.map(([nom, valeur, sous]) => (
          <div key={nom} className="@container flex min-w-0 flex-col gap-1 rounded-card border border-line bg-surface-raised px-4 py-3">
            <span className="text-small text-ink-soft">{nom}</span>
            <span className="whitespace-nowrap font-bold tracking-tight tabnums"
                  style={{ fontSize: "clamp(0.9rem, 13cqi, 1.25rem)" }}>{valeur}</span>
            <span className="text-caption text-ink-faint">{sous}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Le graphe : chaque jour (heure, semaine, mois) --------------------------

/**
 * LE GRAPHE, refait pour se LIRE.
 *
 * L'ancien mettait les entrées en haut, les sorties en bas, sans aucun
 * chiffre : « je ne sais pas comment l'interpréter ». Ici :
 *   — en tête, en MOTS, la colonne choisie : son nom, ses entrées, ses
 *     sorties, son reste. Par défaut, la plus récente qui a bougé : le
 *     résumé n'est jamais vide ;
 *   — deux barres côte à côte par colonne, entrée à gauche, sortie à droite,
 *     posées sur la même ligne de base ;
 *   — un axe gradué en montants ronds (« 50 M »), pour lire une hauteur ;
 *   — la courbe commence au premier SMS : pas douze semaines vides avant la
 *     caisse.
 * Les couleurs sont validées pour les daltoniens (vert foncé, corail clair :
 * la clarté les sépare quand la teinte ne suffit pas), et la position (gauche
 * = entrée) le dit aussi.
 */
function Graphe({ serie: brute, pas, langue, titre, debut }: {
  serie: PointDeSerie[]; pas: Pas; langue: Langue; titre: string; debut?: string | null;
}) {
  const t = textesVolumes[langue];
  const { serie, coupee } = serieVisible(brute, pas, debut);
  const [choisie, setChoisie] = useState(() => colonneParDefaut(serie));
  useEffect(() => setChoisie(colonneParDefaut(serie)), [brute]); // eslint-disable-line react-hooks/exhaustive-deps
  if (serie.length === 0) return null;
  const c = serie[Math.min(choisie, serie.length - 1)];
  const haut = Math.max(1, ...serie.map((x) => Math.max(x.entrees, x.sorties)));
  const marques = graduations(haut);
  const sommet = marques.at(-1)!;
  const etiquettes = new Set([0, Math.floor((serie.length - 1) / 3), Math.floor(((serie.length - 1) * 2) / 3), serie.length - 1]);
  const H = 170;

  return (
    <section className="rounded-card border border-line bg-surface-raised p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-heading font-semibold">{titre}</h2>
        <Cles entrees={t.entrees} sorties={t.sorties} />
      </div>

      {/* Le résumé EN MOTS de la colonne choisie — une ligne par chiffre :
          en trois colonnes, un « Reste » de sept chiffres se lisait
          « −1 616 949… ». Un montant ne se coupe jamais. */}
      <div className="mb-4 rounded-btn bg-surface px-3 py-2.5" aria-live="polite">
        <p className="mb-1 text-small font-semibold">{nomDeLaColonne(c.cle, pas, langue)}</p>
        <dl className="flex flex-col gap-0.5 text-caption text-ink-soft">
          {([[t.entrees, francs(c.entrees, langue), "text-positive"],
             [t.sorties, francs(c.sorties, langue), "text-negative"],
             [t.reste, francs(c.entrees - c.sorties, langue, true), ""]] as const).map(([nom, valeur, ton]) => (
            <div key={nom} className="flex items-baseline justify-between gap-3">
              <dt>{nom}</dt>
              <dd className={`text-right text-small font-semibold tabnums ${ton}`}>{valeur}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex gap-2">
        {/* L'axe : des montants ronds, à droite de rien, discrets. */}
        <div className="relative w-10 shrink-0 text-right text-[0.65rem] text-ink-faint tabnums" style={{ height: H }}>
          {marques.map((m) => (
            <span key={m} className="absolute right-0 -translate-y-1/2" style={{ bottom: (m / sommet) * H - 6 }}>
              {francsCourts(m, langue)}
            </span>
          ))}
          <span className="absolute bottom-0 right-0">0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          {/* Les lignes de l'axe, sous les barres. */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: H }}>
            {marques.map((m) => (
              <span key={m} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: (m / sommet) * H }} />
            ))}
            <span className="absolute inset-x-0 bottom-0 border-t border-surface-3" />
          </div>
          <div className="relative flex" style={{ height: H }} role="list">
            {serie.map((x, i) => {
              const actif = i === choisie;
              return (
                <button key={x.cle} type="button" role="listitem"
                        onClick={() => setChoisie(i)} onPointerEnter={(e) => { if (e.pointerType === "mouse") setChoisie(i); }}
                        aria-label={`${nomDeLaColonne(x.cle, pas, langue)} : ${t.entrees} ${francs(x.entrees, langue)}, ${t.sorties} ${francs(x.sorties, langue)}`}
                        aria-pressed={actif}
                        className={`flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-sm px-[1px] transition-colors ${
                          actif ? "bg-surface-2" : "hover:bg-surface"}`}>
                  <span className="w-full max-w-[10px] rounded-t-[3px] transition-[height] duration-300"
                        style={{ height: `${(x.entrees / sommet) * 100}%`, minHeight: x.entrees > 0 ? 2 : 0, background: "var(--color-entree)" }} />
                  <span className="w-full max-w-[10px] rounded-t-[3px] transition-[height] duration-300"
                        style={{ height: `${(x.sorties / sommet) * 100}%`, minHeight: x.sorties > 0 ? 2 : 0, background: "var(--color-sortie)" }} />
                </button>
              );
            })}
          </div>
          {/* Les repères vivent sous la rangée, pas dans les colonnes. */}
          <div className="relative mt-1 h-4 text-caption text-ink-faint tabnums">
            {[...etiquettes].map((i) => {
              const premier = i === 0, dernier = i === serie.length - 1;
              return (
                <span key={i} className={`absolute whitespace-nowrap ${premier ? "left-0" : dernier ? "right-0" : "-translate-x-1/2"}`}
                      style={premier || dernier ? undefined : { left: `${((i + 0.5) / serie.length) * 100}%` }}>
                  {etiquetteDuPas(serie[i].cle, pas, langue)}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 text-caption text-ink-faint">
        {coupee && debut ? `${t.debutDeLaCaisse(jourCourtVolumes(debut, langue))} · ` : ""}{t.toucherUneBarre}
      </p>
    </section>
  );
}

function Cles({ entrees, sorties }: { entrees: string; sorties: string }) {
  return (
    <span className="flex gap-3 text-caption text-ink-soft">
      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-entree)" }} />{entrees}</span>
      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-sortie)" }} />{sorties}</span>
    </span>
  );
}

// --- Avec qui ----------------------------------------------------------------

function AvecQui({ r, langue, tous, onTous, onQui }: {
  r: ReponseVolumes; langue: Langue; tous: boolean; onTous: () => void; onQui: (cle: string) => void;
}) {
  const t = textesVolumes[langue];
  const liste = tous ? r.volumes.correspondants : r.volumes.correspondants.slice(0, 5);
  if (liste.length === 0) return null;
  const max = Math.max(1, ...liste.map((q) => Math.max(q.recu, q.envoye)));
  return (
    <section className="min-w-0 rounded-card border border-line bg-surface-raised px-5 pb-3 pt-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-heading font-semibold">{t.avecQui}</h2>
        <span className="text-caption text-ink-faint">{t.parVolume}</span>
      </div>
      <ul className="divide-hair">
        {liste.map((q) => (
          <li key={q.cle}>
            <button type="button" onClick={() => onQui(q.cle)}
                    className="flex w-full items-center gap-3 py-3 text-left transition hover:opacity-70">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-small font-bold text-ink-soft">
                {initialesDe(q.nom) || "·"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-small font-semibold">{q.nom || formaterNumero(q.numero) || t.sansNom}</span>
                {q.recu > 0 && <MiniBarre valeur={q.recu} max={max} couleur="var(--color-entree)" ton="text-positive" langue={langue} />}
                {q.envoye > 0 && <MiniBarre valeur={q.envoye} max={max} couleur="var(--color-sortie)" ton="text-negative" langue={langue} />}
              </span>
              <span className="shrink-0 text-caption text-ink-faint">{t.op(q.nRecu + q.nEnvoye)}</span>
            </button>
          </li>
        ))}
      </ul>
      {r.volumes.nbCorrespondants > 5 && (
        <button type="button" onClick={onTous}
                className="block w-full border-t border-line pt-3 text-center text-small font-semibold">
          {tous ? t.voirMoins : t.voirTous(r.volumes.nbCorrespondants)}
        </button>
      )}
    </section>
  );
}

function MiniBarre({ valeur, max, couleur, ton, langue }: { valeur: number; max: number; couleur: string; ton: string; langue: Langue }) {
  return (
    <span className="flex items-center gap-2">
      <span className="min-w-0 flex-1">
        <i className="block h-2 rounded-sm" style={{ width: `${Math.max(2, (valeur / max) * 100)}%`, background: couleur }} />
      </span>
      <span className={`shrink-0 whitespace-nowrap text-caption font-semibold tabnums ${ton}`}>{francs(valeur, langue)}</span>
    </span>
  );
}

// --- Les anneaux -------------------------------------------------------------

function Anneau({ parts }: { parts: { valeur: number; couleur: string }[] }) {
  const R = 58, r = 40, c = 70, total = parts.reduce((s, x) => s + x.valeur, 0) || 1, ecart = 0.035;
  let a = -Math.PI / 2;
  const pt = (rr: number, t: number) => `${c + rr * Math.cos(t)},${c + rr * Math.sin(t)}`;
  return (
    <svg width="110" height="110" viewBox="0 0 140 140" className="shrink-0" aria-hidden>
      {parts.length === 1 ? (
        <circle cx={c} cy={c} r={(R + r) / 2} fill="none" stroke={parts[0].couleur} strokeWidth={R - r} />
      ) : parts.map((x, i) => {
        const da = (x.valeur / total) * 2 * Math.PI;
        const a1 = a + ecart / 2, a2 = a + da - ecart / 2, grand = da > Math.PI ? 1 : 0;
        a += da;
        if (a2 <= a1) return null;
        return <path key={i} fill={x.couleur}
                     d={`M${pt(R, a1)} A${R},${R} 0 ${grand} 1 ${pt(R, a2)} L${pt(r, a2)} A${r},${r} 0 ${grand} 0 ${pt(r, a1)} Z`} />;
      })}
    </svg>
  );
}

function Anneaux({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const cote = (sens: "in" | "out", titre: string, total: number, ton: string) => {
    const f = famillesDe(r.volumes, sens);
    const somme = f.reduce((s, x) => s + x.montant, 0) || 1;
    return (
      // L'anneau passe au-dessus de sa légende quand elle n'a plus la place à
      // côté (320 points) : un total ne se coupe pas.
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-card border border-line bg-surface-raised p-4">
        {f.length > 0 ? <Anneau parts={f.map((x) => ({ valeur: x.montant, couleur: COULEUR_FAMILLE[x.famille] }))} />
          : <div className="h-[110px] w-[110px] shrink-0 rounded-full border-[14px] border-surface-2" />}
        <div className="@container flex min-w-[10rem] flex-1 flex-col gap-2">
          <p className="text-small font-semibold">{titre}
            <span className={`block whitespace-nowrap tabnums ${ton}`} style={{ fontSize: "clamp(0.8rem, 8.5cqi, 0.875rem)" }}>{francs(total, langue)}</span></p>
          <ul className="flex flex-col gap-1.5 text-small">
            {f.map((x) => (
              <li key={x.famille} className="flex items-start gap-2">
                <i className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COULEUR_FAMILLE[x.famille] }} />
                <span className="min-w-0 flex-1 text-ink-soft">{nomDeFamille(langue, sens, x.famille, x.types)}</span>
                <b className="shrink-0 whitespace-nowrap pl-2 font-semibold tabnums">{x.montant / somme < 0.01 ? "<1" : Math.round((x.montant / somme) * 100)} %</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-heading font-semibold">{t.dOuVaLArgent}</h2>
      <div className="grid gap-2.5">
        {cote("in", t.entrees, r.volumes.totaux.entrees, "text-positive")}
        {cote("out", t.sorties, r.volumes.totaux.sorties, "text-negative")}
      </div>
    </section>
  );
}

// --- Par carte ---------------------------------------------------------------

function Badge({ ecart, langue }: { ecart: number | null; langue: Langue }) {
  const t = textesVolumes[langue];
  if (ecart == null) return <span className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-caption font-semibold text-ink-soft">{t.soldeNonConnu}</span>;
  if (Math.abs(ecart) < 1) {
    return <span className="whitespace-nowrap rounded-full bg-[#e2f4e9] px-2 py-0.5 text-caption font-semibold text-positive">✓ {t.soldesJustes}</span>;
  }
  return <span className="whitespace-nowrap rounded-full bg-[#fbf0df] px-2 py-0.5 text-caption font-semibold text-alert">⚠ {t.ecartDe(francs(Math.abs(ecart), langue))}</span>;
}

function ParCarte({ r, langue, onCarte }: { r: ReponseVolumes; langue: Langue; onCarte: (iccid: string) => void }) {
  const t = textesVolumes[langue];
  const max = Math.max(1, ...r.volumes.parCarte.flatMap((c) => [c.totaux.entrees, c.totaux.sorties]));
  return (
    <section className="rounded-card border border-line bg-surface-raised px-5 pb-4 pt-4">
      <h2 className="mb-1 text-heading font-semibold">{t.parCarte}</h2>
      <ul className="divide-hair">
        {r.volumes.parCarte.map((c) => (
          <li key={c.iccid}>
            <button type="button" onClick={() => onCarte(c.iccid)}
                    className="flex w-full flex-col gap-1.5 py-3 text-left transition hover:opacity-70">
              <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-small">
                <NomDeCarte carte={c} />
                <span className="ml-auto"><Badge ecart={c.soldes.ecart} langue={langue} /></span>
              </span>
              {c.totaux.n === 0 ? (
                <span className="text-caption text-ink-faint">{t.rien}</span>
              ) : (
                <>
                  <MiniBarre valeur={c.totaux.entrees} max={max} couleur="var(--color-entree)" ton="text-positive" langue={langue} />
                  <MiniBarre valeur={c.totaux.sorties} max={max} couleur="var(--color-sortie)" ton="text-negative" langue={langue} />
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
      {r.volumes.interne.n > 0 && (
        <p className="mt-2 text-caption text-ink-faint">⇄ {t.entreVosCartes(francs(r.volumes.interne.montant, langue))}</p>
      )}
    </section>
  );
}

// --- Le solde d'une carte ----------------------------------------------------

function LeSolde({ r, carte, langue }: { r: ReponseVolumes; carte: CarteVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const c = r.volumes.parCarte.find((x) => x.iccid === carte.iccid);
  if (!c) return null;
  const { ouverture, cloture, attendu, ecart } = c.soldes;
  const e = c.totaux.entrees, s = c.totaux.sorties + c.totaux.frais;
  // Les frais descendent le solde avec les sorties : la marche le DIT.
  const nomSorties = c.totaux.frais ? t.sortiesEtFrais : t.sorties;
  const marches = ouverture == null ? [] : [
    { nom: t.debut, de: 0, a: ouverture, couleur: "#a8a8a8", valeur: ouverture, signe: false },
    { nom: t.entrees, de: ouverture, a: ouverture + e, couleur: "var(--color-entree)", valeur: e, signe: true },
    { nom: nomSorties, de: ouverture + e, a: ouverture + e - s, couleur: "var(--color-sortie)", valeur: -s, signe: true },
    ...(cloture != null ? [{ nom: t.fin, de: 0, a: cloture, couleur: "var(--color-ink)", valeur: cloture, signe: false }] : []),
  ];
  const haut = Math.max(1, ...marches.flatMap((m) => [m.de, m.a]));
  const H = 150;
  const derniere = c.ruptures.at(-1);
  return (
    <section className="rounded-card border border-line bg-surface-raised p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading font-semibold">{t.leSolde}</h2>
        <Badge ecart={ecart} langue={langue} />
      </div>
      {marches.length > 0 && (
        <>
          {/* Les marches portent un montant COURT (« 33 M ») : en entier,
              quatre montants d'un milliard ne tiennent pas côte à côte. Les
              montants entiers sont juste dessous. */}
          <div className="relative flex gap-3" style={{ height: H + 22 }}>
            {marches.map((m) => {
              const bas = Math.min(m.de, m.a) / haut * H, h = Math.max(2, Math.abs(m.a - m.de) / haut * H);
              return (
                <div key={m.nom} className="relative min-w-0 flex-1">
                  <span className="absolute inset-x-0 whitespace-nowrap text-center text-caption font-bold tabnums" style={{ bottom: bas + h + 4 }}>
                    {(m.signe && m.valeur > 0 ? "+" : "") + francsCourts(m.valeur, langue)}
                  </span>
                  <div className="absolute inset-x-[18%] rounded-md" style={{ bottom: bas, height: h, background: m.couleur }} />
                </div>
              );
            })}
            {attendu != null && ecart != null && Math.abs(ecart) >= 1 && (
              <div className="absolute right-0 w-1/4 border-t-2 border-dashed" style={{ bottom: attendu / haut * H, borderColor: "var(--color-alert)" }}
                   title={t.attendu(francs(attendu, langue))} />
            )}
          </div>
          {/* Deux colonnes seulement quand un milliard y tient : un montant
              ne se coupe jamais. */}
          <div className="@container mt-3 border-t border-line pt-3">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-small @xs:grid-cols-2">
              {marches.map((m) => (
                <div key={m.nom} className="flex min-w-0 flex-col">
                  <dt className="flex items-center gap-1.5 text-caption text-ink-soft">
                    <i className="inline-block h-2 w-2 rounded-sm" style={{ background: m.couleur }} />{m.nom}
                  </dt>
                  <dd className="whitespace-nowrap font-semibold tabnums">{francs(m.valeur, langue, m.signe)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
      {ecart != null && Math.abs(ecart) >= 1 && (
        <p className="mt-3 flex items-start gap-2 rounded-card bg-[#fbf3e6] p-3 text-small">
          <IconeAlerte taille={18} />
          <span>
            {(ecart < 0 ? t.ilManque : t.enTrop)(francs(Math.abs(ecart), langue),
              derniere ? `${jourCourtVolumes(derniere.jusquaJour, langue)} ${derniere.depuis}–${derniere.jusqua}` : nomDeLaPeriode(r.volumes.periode, langue))}
            {attendu != null && <span className="block text-caption text-ink-faint">{t.attendu(francs(attendu, langue))}</span>}
          </span>
        </p>
      )}
    </section>
  );
}

// --- Les heures de pointe ----------------------------------------------------

function HeuresDePointe({ heures, langue }: { heures: number[][]; langue: Langue }) {
  const t = textesVolumes[langue];
  const tranches = [6, 8, 10, 12, 14, 16, 18, 20];
  const valeur = (j: number, h: number) => (heures[j]?.[h] ?? 0) + (heures[j]?.[h + 1] ?? 0);
  const max = Math.max(1, ...heures.flatMap((_, j) => tranches.map((h) => valeur(j, h))));
  const pic = creneauLePlusCharge(heures);
  // Les six teintes écrites EN ENTIER : une variable dont le nom se
  // fabrique à l'exécution n'est jamais vue par Tailwind.
  const TEINTES = ["var(--color-pointe-0)", "var(--color-pointe-1)", "var(--color-pointe-2)",
                   "var(--color-pointe-3)", "var(--color-pointe-4)", "var(--color-pointe-5)"];
  const teinte = (n: number) => TEINTES[n === 0 ? 0 : Math.min(5, Math.ceil((n / max) * 5))];
  return (
    <section className="rounded-card border border-line bg-surface-raised p-5">
      <h2 className="mb-3 text-heading font-semibold">{t.heuresDePointe}</h2>
      <div className="grid items-center gap-[3px]" style={{ gridTemplateColumns: "2.2rem repeat(8, minmax(0, 1fr))" }}>
        <span />
        {tranches.map((h) => <span key={h} className="text-center text-[0.65rem] text-ink-faint">{h}h</span>)}
        {t.jours.map((jour, j) => [
          <span key={jour} className="text-caption text-ink-soft">{jour}</span>,
          ...tranches.map((h) => (
            <span key={`${jour}${h}`} className="h-6 rounded-sm" style={{ background: teinte(valeur(j, h)) }}
                  title={`${t.joursLongs[j]} ${h}h–${h + 2}h : ${valeur(j, h)}`} />
          )),
        ])}
      </div>
      {pic && (
        <p className="mt-3 text-small">{t.lePlusCharge} <b className="font-semibold">{t.creneau(t.joursLongs[pic.jour], pic.heure)}</b></p>
      )}
    </section>
  );
}

// --- La fiche d'un correspondant ---------------------------------------------

function FicheCorrespondant({ r, langue, onRetour }: { r: ReponseVolumes; langue: Langue; onRetour: () => void }) {
  const t = textesVolumes[langue];
  const f = r.volumes.fiche;
  const retour = (
    <button type="button" onClick={onRetour} aria-label={t.precedente}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-btn border border-line bg-surface-raised transition active:scale-95">
      <IconChevron size={16} className="rotate-180" />
    </button>
  );
  if (!f) return <div className="flex flex-col gap-3">{retour}<Vide titre={t.rien} detail={t.rienDetail} /></div>;
  const max = Math.max(1, ...f.parCarte.flatMap((c) => [c.recu, c.envoye]));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex items-center gap-4 lg:col-span-2">
        {retour}
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-surface-2 text-heading font-bold text-ink-soft">{initialesDe(f.nom) || "·"}</span>
        <div className="min-w-0">
          <p className="text-heading font-bold">{f.nom || t.sansNom}</p>
          <p className="text-small text-ink-faint">{formaterNumero(f.numero)}{f.numero ? " · " : ""}{nomDeLaPeriode(r.volumes.periode, langue)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:col-span-2">
        <div className="@container rounded-card border border-line bg-surface-raised px-4 py-3">
          <p className="flex items-center gap-2 text-small text-ink-soft"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-entree)" }} />{t.recuDe}</p>
          <Montant valeur={f.recu} langue={langue} ton="text-positive" min={0.9} vise={12} max={1.25} />
          <p className="text-caption text-ink-faint">{t.operations(f.nRecu)}</p>
        </div>
        <div className="@container rounded-card border border-line bg-surface-raised px-4 py-3">
          <p className="flex items-center gap-2 text-small text-ink-soft"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-sortie)" }} />{t.envoyeA}</p>
          <Montant valeur={f.envoye} langue={langue} ton="text-negative" min={0.9} vise={12} max={1.25} />
          <p className="text-caption text-ink-faint">{t.operations(f.nEnvoye)}</p>
        </div>
      </div>
      <section className="rounded-card border border-line bg-surface-raised px-5 pb-3 pt-4">
        <h2 className="mb-1 text-heading font-semibold">{t.avecChaqueCarte}</h2>
        <ul className="divide-hair">
          {f.parCarte.map((pc) => {
            const c = r.cartes.find((x) => x.iccid === pc.iccid);
            return (
              <li key={pc.iccid} className="flex flex-col gap-1.5 py-3">
                <span className="flex items-center gap-2 text-small">
                  {c ? <NomDeCarte carte={c} /> : <span className="font-semibold">{pc.iccid}</span>}
                  <span className="ml-auto text-caption font-normal text-ink-faint">{t.op(pc.n)}</span>
                </span>
                {pc.recu > 0 && <MiniBarre valeur={pc.recu} max={max} couleur="var(--color-entree)" ton="text-positive" langue={langue} />}
                {pc.envoye > 0 && <MiniBarre valeur={pc.envoye} max={max} couleur="var(--color-sortie)" ton="text-negative" langue={langue} />}
              </li>
            );
          })}
        </ul>
      </section>
      <Graphe serie={f.serie} pas={r.volumes.periode.pas} langue={langue} titre={t.serie[r.volumes.periode.pas]}
              debut={r.volumes.debutDeLHistorique} />
    </div>
  );
}

function Vide({ titre, detail }: { titre: string; detail: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line bg-surface-raised px-6 py-10 text-center">
      <p className="text-body font-semibold">{titre}</p>
      <p className="text-small text-ink-soft">{detail}</p>
    </div>
  );
}
