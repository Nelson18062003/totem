"use client";

// La page Flux du site — le pendant de l'onglet Flux du téléphone, avec les
// colonnes du relevé. La règle (types, effets, suite des soldes) vit dans le
// noyau : les deux surfaces rangent et comptent pareil.
//
// Le signe et la couleur disent ce que l'opération fait au solde : crédit
// en vert, débit à l'encre. Le ROUGE est réservé aux soldes qui ne se
// suivent pas ; l'AMBRE à ce qui attend une décision.

import { Fragment, useEffect, useMemo, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesFlux, NOMS_TYPES, NOMS_CORRECTION } from "@noyau/textes/flux";
import { textesSms } from "@noyau/textes/sms";
import {
  fluxDe, totauxFlux, etatDesCartes, parJour, correspondFlux, dansFamille, montantSigne,
  FAMILLES_FLUX, type Flux, type FamilleFlux, type Ecart, type TypeFlux,
} from "@noyau/flux";
import { jourLocal, nombre, type Paiement, type Sim } from "@noyau/types";
import { bornesDe, dansBornes, jourCourt, jourDuReleve, libelleJour, type Periode } from "@noyau/periodes";
import { formaterNumero } from "@noyau/numero";
import { IconArrowDown, IconArrowUp, IconChevron, IconClose, IconLock, IconSearch, IconTransfer } from "../icons";
import { LogoOperateur } from "../logos-operateurs";

type Initial = { q: string; periode: string; carte: string; type: string; t: string };
type Langue = "fr" | "en";

const PERIODES = ["aujourdhui", "hier", "semaine", "mois", "tout"] as const;
const operateurDe = (libelle: string) => libelle.split(/[\s·]/)[0] || libelle;

function quandAnnonce(iso: string, heure: string, maintenant: number, fuseau: string, langue: Langue) {
  const j = jourDuReleve(iso, maintenant, fuseau);
  if (!j) return heure;
  if (langue === "en") {
    if (j.genre === "aujourdhui") return `today at ${heure}`;
    if (j.genre === "hier") return `yesterday at ${heure}`;
    return `on ${jourCourt(j.cle, langue)} at ${heure}`;
  }
  if (j.genre === "aujourdhui") return `aujourd'hui à ${heure}`;
  if (j.genre === "hier") return `hier à ${heure}`;
  return `le ${jourCourt(j.cle, langue)} à ${heure}`;
}

export function PageFlux({ paiements, sims, fuseau, initial }: {
  paiements: Paiement[]; sims: Sim[]; fuseau: string; initial: Initial;
}) {
  const langue = useLangue() as Langue;
  const t = textesFlux[langue];
  const ts = textesSms[langue];
  const [maintenant] = useState(() => Date.now());
  const [recherche, setRecherche] = useState(initial.q);
  const [periode, setPeriode] = useState<string>(PERIODES.includes(initial.periode as never) ? initial.periode : "aujourdhui");
  const [carte, setCarte] = useState(initial.carte);
  const [famille, setFamille] = useState<string>(FAMILLES_FLUX.includes(initial.type as never) ? initial.type : "");
  const [ouverte, setOuverte] = useState(initial.t);
  const [corriger, setCorriger] = useState<Flux | null>(null);
  const [ecart, setEcart] = useState<{ f: Flux; e: Ecart } | null>(null);

  // L'ADRESSE RETIENT LA VUE : une vue se garde en favori, s'envoie à un associé.
  useEffect(() => {
    const u = new URLSearchParams();
    if (recherche) u.set("q", recherche);
    if (periode !== "aujourdhui") u.set("periode", periode);
    if (carte) u.set("carte", carte);
    if (famille) u.set("type", famille);
    if (ouverte) u.set("t", ouverte);
    const s = u.toString();
    window.history.replaceState(null, "", s ? `/flux?${s}` : "/flux");
  }, [recherche, periode, carte, famille, ouverte]);

  const tous = useMemo(() => fluxDe(paiements), [paiements]);
  const bornes = bornesDe({ genre: periode } as Periode, maintenant, fuseau);
  const vus = useMemo(() => tous.filter((f) =>
    dansBornes(f.p, bornes)
    && (!carte || (f.p.carte || f.p.sim) === carte)
    && dansFamille(f, (famille || null) as FamilleFlux | null)
    && correspondFlux(f, recherche)),
  [tous, bornes?.de, bornes?.a, carte, famille, recherche]);
  const totaux = totauxFlux(vus);
  const jours = parJour(vus);
  const aujourdhui = jourLocal(new Date(maintenant), fuseau);
  const cartes = useMemo(() => etatDesCartes(paiements, tous), [paiements, tous]);
  const cartesVues = [...cartes.values()].filter((c) => !carte || c.carte === carte);
  const fiche = ouverte ? tous.find((f) => f.p.id === ouverte) ?? null : null;
  const nomPeriode = (p: string) => p === "aujourdhui" ? ts.periodeAujourdhui : p === "hier" ? ts.periodeHier
    : p === "semaine" ? ts.periodeSemaine : p === "mois" ? ts.periodeMois : ts.periodeTout;
  const variation = totaux.entrees - totaux.sorties - totaux.frais;
  const nomCarte = (cle: string) => sims.find((s) => s.iccid === cle)?.libelle ?? cle;

  return (
    <div className="relative flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* LES FILTRES, EN UNE RANGÉE. */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <label className="flex flex-1 items-center gap-2.5 rounded-full border border-line bg-surface-raised px-4">
          <IconSearch size={16} className="text-ink-faint" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={t.rechercher}
                 aria-label={t.rechercher}
                 className="flex-1 bg-transparent py-2.5 text-body outline-none placeholder:text-ink-faint" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Choix etiquette={t.periode} valeur={periode} onChange={setPeriode}
                 options={PERIODES.map((p) => ({ cle: p, libelle: nomPeriode(p) }))} actif={periode !== "tout"} />
          <Choix etiquette={t.cartes} valeur={carte} onChange={setCarte} actif={!!carte}
                 options={[{ cle: "", libelle: t.toutesLesCartes }, ...sims.map((s) => ({ cle: s.iccid, libelle: s.libelle }))]} />
          <Choix etiquette={t.type} valeur={famille} onChange={setFamille} actif={!!famille}
                 options={[{ cle: "", libelle: t.tous }, ...FAMILLES_FLUX.map((f) => ({ cle: f, libelle: t.familles[f] }))]} />
        </div>
      </div>

      {/* LE RÉSUMÉ : le solde annoncé de chaque carte, puis les totaux. */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="divide-hair rounded-card border border-line bg-surface-raised px-4">
          {cartesVues.map((c) => {
            const op = operateurDe(nomCarte(c.carte));
            const sim = sims.find((s) => s.iccid === c.carte);
            return (
              <div key={c.carte} className="flex flex-col gap-0.5 py-3">
                <span className="flex items-center gap-2 text-small font-semibold">
                  <LogoOperateur operateur={op} size={18} />
                  {op} · {sim?.numero ? formaterNumero(sim.numero) : nomCarte(c.carte)}
                </span>
                <span className="text-heading font-bold tabnums">
                  {c.solde != null ? `${nombre(c.solde, langue)} F` : "—"}
                </span>
                {c.recuLe && (
                  <span className="text-caption text-ink-faint">
                    {t.annonceA(op, quandAnnonce(c.recuLe, c.heure ?? "", maintenant, fuseau, langue))}
                  </span>
                )}
                <span className={`text-caption font-medium ${c.ecarts ? "text-negative" : c.suitDepuis ? "text-positive" : "text-ink-soft"}`}>
                  {c.ecarts ? t.ecartsCarte(c.ecarts) : c.suitDepuis ? `✓ ${t.toutSeSuit(c.suitDepuis)}` : t.pasDeSolde}
                </span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-surface-raised sm:grid-cols-3">
          <Tuile libelle={t.entrees} valeur={`+${nombre(totaux.entrees, langue)}`} classe="text-positive" />
          <Tuile libelle={t.sorties} valeur={`−${nombre(totaux.sorties, langue)}`} />
          <Tuile libelle={t.frais} valeur={nombre(totaux.frais, langue)} />
          <Tuile libelle={t.variation} valeur={`${variation >= 0 ? "+" : "−"}${nombre(Math.abs(variation), langue)}`} />
          <Tuile libelle={`${t.commissions} (${t.commissionsAPart})`} valeur={nombre(totaux.commissions, langue)} />
          <Tuile libelle={t.familles.a_verifier} valeur={String(totaux.aVerifier)} classe={totaux.aVerifier ? "text-alert" : ""} />
        </div>
      </section>

      {vus.length === 0 && (
        <p className="py-10 text-center text-ink-soft">{t.aucuneTransaction}</p>
      )}

      {/* GRAND ÉCRAN : le tableau, aux colonnes du relevé. */}
      {vus.length > 0 && (
        // La référence n'a pas de colonne : elle est dans la fiche, entière et
        // copiable, et la recherche la trouve. Avec elle, le solde annoncé —
        // la colonne qui vérifie tout — sortait du cadre.
        <div className="hidden overflow-x-auto rounded-card border border-line bg-surface-raised md:block">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="text-left text-caption uppercase tracking-wider text-ink-faint">
                <th className="px-3 py-2.5 font-medium">{langue === "fr" ? "Heure" : "Time"}</th>
                <th className="px-3 py-2.5 font-medium">{langue === "fr" ? "Transaction" : "Transaction"}</th>
                <th className="px-3 py-2.5 font-medium">{langue === "fr" ? "De / À" : "From / To"}</th>
                <th className="px-3 py-2.5 text-right font-medium">{langue === "fr" ? "Débit" : "Debit"}</th>
                <th className="px-3 py-2.5 text-right font-medium">{langue === "fr" ? "Crédit" : "Credit"}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t.frais}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{langue === "fr" ? "Solde annoncé" : "Balance"}</th>
                <th className="w-8 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {jours.map((j) => (
                <Fragment key={j.jour}>
                  <tr className="border-t border-line bg-surface">
                    <td colSpan={8} className="px-3 py-2 text-caption font-semibold uppercase tracking-wider text-ink-soft">
                      {libelleJour(j.jour, aujourdhui, langue)} · {t.transactions(j.totaux.nombre)} ·{" "}
                      <span className="tabnums">{t.entrees.toLowerCase()} +{nombre(j.totaux.entrees, langue)} · {t.sorties.toLowerCase()} −{nombre(j.totaux.sorties, langue)}</span>
                    </td>
                  </tr>
                  {j.flux.map((f) => (
                    <Fragment key={f.p.id}>
                      {f.ecartApres && <RangeeEcartTable e={f.ecartApres} t={t} onOuvrir={() => setEcart({ f, e: f.ecartApres! })} />}
                      <LigneTable f={f} langue={langue} choisie={ouverte === f.p.id} onOuvrir={() => setOuverte(f.p.id)} />
                      {f.ecartAvant && <RangeeEcartTable e={f.ecartAvant} t={t} onOuvrir={() => setEcart({ f, e: f.ecartAvant! })} />}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PETIT ÉCRAN : la même liste que le téléphone. */}
      <div className="flex flex-col gap-4 md:hidden">
        {jours.map((j) => (
          <section key={j.jour} className="flex flex-col gap-2">
            <p className="px-1 text-caption font-semibold uppercase tracking-wider text-ink-soft">
              {libelleJour(j.jour, aujourdhui, langue)} · {t.transactions(j.totaux.nombre)}
            </p>
            <ul className="divide-hair overflow-hidden rounded-card border border-line bg-surface-raised">
              {j.flux.map((f) => (
                <li key={f.p.id}>
                  {f.ecartApres && <BandeauEcart e={f.ecartApres} t={t} onOuvrir={() => setEcart({ f, e: f.ecartApres! })} />}
                  <LigneListe f={f} langue={langue} onOuvrir={() => setOuverte(f.p.id)} />
                  {f.ecartAvant && <BandeauEcart e={f.ecartAvant} t={t} onOuvrir={() => setEcart({ f, e: f.ecartAvant! })} />}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {fiche && (
        <PanneauFiche f={fiche} sims={sims} maintenant={maintenant} fuseau={fuseau} langue={langue}
                      onFermer={() => setOuverte("")} onCorriger={() => setCorriger(fiche)} />
      )}
      {corriger && <BoiteCorriger f={corriger} langue={langue} onFermer={() => setCorriger(null)} />}
      {ecart && <BoiteEcart f={ecart.f} e={ecart.e} tous={tous} langue={langue} onFermer={() => setEcart(null)} />}
    </div>
  );
}

function Choix({ etiquette, valeur, options, onChange, actif }: {
  etiquette: string; valeur: string; options: { cle: string; libelle: string }[];
  onChange: (v: string) => void; actif: boolean;
}) {
  return (
    <label className={`relative flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-small font-medium transition ${
      actif ? "border-ink bg-ink text-surface-raised" : "border-line bg-surface-raised text-ink"}`}>
      <span className="sr-only">{etiquette}</span>
      <select value={valeur} onChange={(e) => onChange(e.target.value)} aria-label={etiquette}
              className="cursor-pointer appearance-none bg-transparent pr-4 outline-none">
        {options.map((o) => <option key={o.cle} value={o.cle} className="text-ink">{o.libelle}</option>)}
      </select>
      <IconChevron size={12} className="pointer-events-none absolute right-3 rotate-90" />
    </label>
  );
}

function Tuile({ libelle, valeur, classe = "" }: { libelle: string; valeur: string; classe?: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-r border-line p-3.5 [&:nth-child(3n)]:sm:border-r-0">
      <span className="text-caption text-ink-faint">{libelle}</span>
      <span className={`text-heading font-semibold tabnums ${classe}`}>{valeur}</span>
    </div>
  );
}

function IconeSens({ f, taille = 34 }: { f: Flux; taille?: number }) {
  const entree = f.effet != null && f.effet > 0;
  const attend = f.etat === "a_verifier";
  const echouee = f.etat === "echouee";
  const classe = echouee ? "bg-surface-2 text-ink-faint" : attend ? "bg-[rgba(151,81,2,0.10)] text-alert"
    : entree ? "bg-[rgba(2,84,45,0.09)] text-positive" : "bg-surface-2 text-ink";
  const Icone = echouee ? IconClose : attend ? IconTransfer : entree ? IconArrowDown : IconArrowUp;
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${classe}`} style={{ width: taille, height: taille }}>
      <Icone size={Math.round(taille * 0.47)} />
    </span>
  );
}

function LigneTable({ f, langue, choisie, onOuvrir }: { f: Flux; langue: Langue; choisie: boolean; onOuvrir: () => void }) {
  const t = textesFlux[langue];
  const p = f.p;
  const echouee = f.etat === "echouee";
  const attend = f.etat === "a_verifier";
  const debit = f.effet != null && f.effet < 0 ? nombre(-f.effet - (p.frais ?? 0), langue) : "";
  const credit = f.effet != null && f.effet > 0 ? nombre(f.effet, langue) : "";
  return (
    <tr onClick={onOuvrir}
        className={`cursor-pointer border-t border-line transition hover:bg-surface ${choisie ? "bg-surface-2" : ""} ${attend ? "bg-[rgba(151,81,2,0.06)]" : ""}`}>
      <td className="px-3 py-2.5 tabnums text-ink-soft">{p.heure}</td>
      <td className="px-3 py-2.5">
        <button type="button" onClick={onOuvrir} className="flex items-center gap-2.5 text-left">
          <IconeSens f={f} taille={28} />
          <span className="flex flex-col">
            <span className={`whitespace-nowrap font-medium ${echouee ? "text-ink-faint line-through" : ""}`}>
              {NOMS_TYPES[langue][f.type]}
              {attend && <span className="ml-1.5 rounded-full bg-[rgba(151,81,2,0.10)] px-2 py-0.5 text-caption font-semibold text-alert">{t.aVerifierEtat}</span>}
            </span>
            <span className="flex items-center gap-1 text-caption text-ink-faint">
              <LogoOperateur operateur={operateurDe(p.sim)} size={12} />{p.sim}
            </span>
          </span>
        </button>
      </td>
      <td className="max-w-[200px] truncate px-3 py-2.5">{p.tiers || formaterNumero(p.numero) || "—"}</td>
      {attend ? (
        <td colSpan={2} className="px-3 py-2.5 text-right text-alert tabnums">
          <span className="block whitespace-nowrap font-medium">{nombre(p.montant ?? 0, langue)} ?</span>
          {f.lesSoldesDisent && <span className="block whitespace-nowrap text-caption">{t.lesSoldesDisent(f.lesSoldesDisent)}</span>}
        </td>
      ) : (
        <>
          <td className={`whitespace-nowrap px-3 py-2.5 text-right tabnums ${echouee ? "text-ink-faint line-through" : ""}`}>{debit || (echouee ? nombre(p.montant ?? 0, langue) : "")}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-right tabnums text-positive">{credit}</td>
        </>
      )}
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabnums text-ink-soft">{p.frais != null ? nombre(p.frais, langue) : ""}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabnums">{p.soldeApres != null ? nombre(p.soldeApres, langue) : <span className="text-ink-faint">—</span>}</td>
      <td className="px-2 py-2.5 text-center">
        {f.verdict === "suit" ? <span className="font-bold text-positive">✓</span>
          : f.verdict === "rupture" ? <span className="text-negative">⚠</span> : null}
      </td>
    </tr>
  );
}

function RangeeEcartTable({ e, t, onOuvrir }: { e: Ecart; t: (typeof textesFlux)["fr"]; onOuvrir: () => void }) {
  const m = nombre(Math.abs(e.montant), "fr");
  return (
    <tr className="border-y border-dashed border-negative bg-[rgba(192,15,12,0.06)] text-negative">
      <td colSpan={8} className="px-3 py-2.5">
        ⚠ {e.montant < 0 ? t.ecart(m, e.depuis, e.jusqua) : t.ecartPlus(m, e.depuis, e.jusqua)}{" "}
        <button type="button" onClick={onOuvrir} className="font-semibold underline underline-offset-4">{t.queSEstIlPasse}</button>
      </td>
    </tr>
  );
}

function BandeauEcart({ e, t, onOuvrir }: { e: Ecart; t: (typeof textesFlux)["fr"]; onOuvrir: () => void }) {
  const m = nombre(Math.abs(e.montant), "fr");
  return (
    <button type="button" onClick={onOuvrir}
            className="block w-full border-y border-dashed border-negative bg-[rgba(192,15,12,0.06)] px-4 py-2.5 text-left text-small text-negative">
      ⚠ {e.montant < 0 ? t.ecart(m, e.depuis, e.jusqua) : t.ecartPlus(m, e.depuis, e.jusqua)}{" "}
      <span className="font-semibold underline underline-offset-4">{t.queSEstIlPasse}</span>
    </button>
  );
}

function LigneListe({ f, langue, onOuvrir }: { f: Flux; langue: Langue; onOuvrir: () => void }) {
  const t = textesFlux[langue];
  const p = f.p;
  const entree = f.effet != null && f.effet > 0;
  const attend = f.etat === "a_verifier";
  return (
    <button type="button" onClick={onOuvrir} className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-surface">
      <IconeSens f={f} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="flex-1 truncate font-semibold">{NOMS_TYPES[langue][f.type]}</span>
          <span className={`font-semibold tabnums ${attend ? "text-alert" : entree ? "text-positive" : ""}`}>{montantSigne(f, langue, nombre)}</span>
        </span>
        <span className="truncate text-small text-ink-soft">{p.tiers || formaterNumero(p.numero) || "—"}</span>
        <span className="flex items-center gap-1 text-caption text-ink-faint tabnums">
          <LogoOperateur operateur={operateurDe(p.sim)} size={12} />
          {p.sim.replace(/^\S+\s*/, "")} · {p.heure} · {p.soldeApres != null ? `${t.solde} ${nombre(p.soldeApres, langue)} F` : t.sansSolde}
          {f.verdict === "suit" && <span className="font-bold text-positive">✓</span>}
        </span>
        {attend && f.lesSoldesDisent && (
          <span className="text-caption text-alert">{t.lesSoldesDisent(f.lesSoldesDisent)}</span>
        )}
      </span>
    </button>
  );
}

function Rang({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <span className="w-28 shrink-0 text-small text-ink-faint">{libelle}</span>
      <span className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-right">{children}</span>
    </div>
  );
}

function Copier({ texte, langue }: { texte: string; langue: Langue }) {
  const [fait, setFait] = useState(false);
  return (
    <button type="button" className="text-caption text-ink-soft underline underline-offset-4 hover:text-ink"
            onClick={async () => { try { await navigator.clipboard.writeText(texte); setFait(true); setTimeout(() => setFait(false), 1500); } catch { /* sélectionnable à la souris */ } }}>
      {fait ? "✓" : textesFlux[langue].copier}
    </button>
  );
}

function PanneauFiche({ f, sims, maintenant, fuseau, langue, onFermer, onCorriger }: {
  f: Flux; sims: Sim[]; maintenant: number; fuseau: string; langue: Langue;
  onFermer: () => void; onCorriger: () => void;
}) {
  const t = textesFlux[langue];
  const p = f.p;
  const op = operateurDe(p.sim);
  const sim = sims.find((s) => s.iccid === p.carte);
  const entree = f.effet != null && f.effet > 0;
  const [sms, setSms] = useState(false);
  const etat = f.etat === "comptee" ? t.reussie : f.etat === "echouee" ? t.echouee : t.aVerifierEtat;
  const quand = quandAnnonce(p.recuLe, p.heure, maintenant, fuseau, langue);
  return (
    <aside aria-label={NOMS_TYPES[langue][f.type]}
           className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col gap-4 overflow-y-auto border-l border-line bg-surface-raised p-5">
      <button type="button" onClick={onFermer} className="flex items-center gap-1.5 self-start text-small font-medium text-ink-soft hover:text-ink">
        <IconChevron size={14} className="rotate-180" /> {t.retour}
      </button>
      <div className="flex flex-col gap-1">
        <span className={`text-display font-bold tabnums ${f.etat === "a_verifier" ? "text-alert" : entree ? "text-positive" : ""}`}>
          {montantSigne(f, langue, nombre)} F
        </span>
        <span className="text-ink-soft">
          {NOMS_TYPES[langue][f.type]} · <span className={`font-semibold ${f.etat === "comptee" ? "text-positive" : f.etat === "echouee" ? "text-ink-faint" : "text-alert"}`}>{etat}</span>
        </span>
      </div>
      <div className="divide-hair rounded-card border border-line">
        {(p.tiers || p.numero) && (
          <Rang libelle={entree ? t.de : t.a}>
            <span className="font-medium">{p.tiers || "—"}</span>
            {p.numero && <span className="flex items-center gap-2 text-small text-ink-soft tabnums">{formaterNumero(p.numero)} <Copier texte={p.numero} langue={langue} /></span>}
          </Rang>
        )}
        {p.reference && (
          <Rang libelle={t.reference}>
            <span className="font-mono text-small">{p.reference}</span>
            <Copier texte={p.reference} langue={langue} />
          </Rang>
        )}
        <Rang libelle={t.carte}>
          <span className="flex items-center gap-2"><LogoOperateur operateur={op} size={16} />{op} · {sim?.numero ? formaterNumero(sim.numero) : p.sim}</span>
        </Rang>
        <Rang libelle={t.date}>
          <span>{quand.charAt(0).toUpperCase() + quand.slice(1)}</span>
          <span className="text-caption text-ink-faint">{t.heureOperateur(op)}</span>
        </Rang>
        {p.frais != null && <Rang libelle={t.frais}><span className="tabnums">{nombre(p.frais, langue)} F</span></Rang>}
        {p.commission ? (
          <Rang libelle={t.commission}>
            <span className="tabnums">{nombre(p.commission, langue)} F</span>
            <span className="text-caption text-ink-faint">{t.commissionNonComptee}</span>
          </Rang>
        ) : null}
        {p.soldeApres != null && (
          <Rang libelle={t.solde}>
            <span className="font-semibold tabnums">{nombre(p.soldeApres, langue)} F{f.verdict === "suit" && <span className="text-positive"> ✓</span>}</span>
            <span className="text-caption text-ink-faint">{t.soldeApresAnnonce(op)}</span>
          </Rang>
        )}
        {f.soldeAvantCalcule != null && (
          <Rang libelle={t.soldeAvant}>
            <span className="italic text-ink-soft tabnums">{nombre(f.soldeAvantCalcule, langue)} F ({t.calcule})</span>
          </Rang>
        )}
      </div>
      <div className="rounded-card border border-line">
        <button type="button" aria-expanded={sms} onClick={() => setSms(!sms)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-small font-semibold text-ink-soft">
          <IconChevron size={12} className={sms ? "rotate-90" : ""} /> {t.ceQueDitLeSms}
        </button>
        {sms && <p className="whitespace-pre-line break-words px-4 pb-3 text-small text-ink-soft">{p.smsBrut}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCorriger} className="rounded-full bg-ink px-4 py-2 text-small font-semibold text-surface-raised">{t.corriger}</button>
        <a href={`/encaissements?recherche=${encodeURIComponent(p.reference || p.tiers || p.numero)}`}
           className="rounded-full border border-line px-4 py-2 text-small font-semibold hover:border-ink-faint">{t.voirLeSms}</a>
      </div>
    </aside>
  );
}

function Boite({ titre, onFermer, children, pied }: { titre: string; onFermer: () => void; children: React.ReactNode; pied?: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={titre} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-card border border-line bg-surface-raised">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-heading font-semibold">{titre}</h2>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="text-ink-faint hover:text-ink"><IconClose size={18} /></button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">{children}</div>
        {pied && <div className="border-t border-line px-5 py-3">{pied}</div>}
      </div>
    </div>
  );
}

function BoiteCorriger({ f, langue, onFermer }: { f: Flux; langue: Langue; onFermer: () => void }) {
  const t = textesFlux[langue];
  const lu: "in" | "out" | null = f.effet == null ? null : f.effet > 0 ? "in" : "out";
  const [sens, setSens] = useState<"in" | "out">(lu ?? f.lesSoldesDisent ?? "in");
  const [type, setType] = useState<string>(f.type);
  const lus: TypeFlux[] = sens === "in" ? ["argent_recu", "retrait_client", "depot_recu"] : ["argent_envoye", "depot_client", "retrait_especes"];
  const choisis = sens === "in" ? (["paiement_recu", "achat_float"] as const) : (["paiement_effectue", "vente_float"] as const);
  const options = [...lus.map((k) => ({ cle: k as string, libelle: NOMS_TYPES[langue][k] })),
                   ...choisis.map((k) => ({ cle: k as string, libelle: NOMS_CORRECTION[langue][k] }))];
  return (
    <Boite titre={t.corrigerTitre} onFermer={onFermer}
           pied={<div className="flex flex-col items-stretch gap-1">
             <button type="button" disabled className="cursor-not-allowed rounded-full bg-surface-2 px-4 py-2.5 text-small font-semibold text-ink-faint">{t.enregistrer} · {t.signeParVous}</button>
             <span className="text-center text-caption text-ink-faint">{t.bientot}</span>
           </div>}>
      {lu == null && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{t.entreeOuSortie}</p>
          {f.lesSoldesDisent && <p className="text-small text-ink-soft">{t.lesSoldesDisent(f.lesSoldesDisent)}.</p>}
          <div className="grid grid-cols-2 gap-2">
            {(["in", "out"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={sens === s} onClick={() => { setSens(s); setType(""); }}
                      className={`rounded-btn py-3 font-semibold ${sens === s ? "border-2 border-ink" : "border border-line"} ${s === "in" ? "text-positive" : ""}`}>
                {s === "in" ? `+ ${t.entree}` : `− ${t.sortie}`}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="font-semibold">{t.cEstQuoi}</p>
        <div className="divide-hair rounded-card border border-line">
          {options.map((o) => (
            <label key={o.cle} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface">
              <input type="radio" name="type" checked={type === o.cle} onChange={() => setType(o.cle)} className="accent-[#2c2c2c]" />
              <span className={type === o.cle ? "font-semibold" : ""}>{o.libelle}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">{t.ajouterUneNote}</span>
        <textarea maxLength={280} rows={3} placeholder={t.noteVisible}
                  className="rounded-card border border-line bg-surface-raised p-3 text-body outline-none placeholder:text-ink-faint focus:border-ink-faint" />
      </label>
      <div className="rounded-card border border-dashed border-line p-3">
        <p className="text-small font-semibold">{t.plus}</p>
        <p className="text-caption text-ink-faint">{t.plusPourVous}</p>
      </div>
      <p className="flex gap-2 text-caption text-ink-faint"><IconLock size={14} className="shrink-0" />{t.smsIntact}</p>
    </Boite>
  );
}

function BoiteEcart({ f, e, tous, langue, onFermer }: { f: Flux; e: Ecart; tous: Flux[]; langue: Langue; onFermer: () => void }) {
  const t = textesFlux[langue];
  const op = operateurDe(f.p.sim);
  const annonce = f.ecartAvant === e ? f.p.soldeApres : null;
  const attendu = annonce != null ? annonce - e.montant : null;
  const carte = f.p.carte || f.p.sim;
  const echouees = tous.filter((x) => (x.p.carte || x.p.sim) === carte && x.etat === "echouee"
    && x.p.jour === f.p.jour && x.p.heure > e.depuis && x.p.heure < e.jusqua);
  const m = nombre(Math.abs(e.montant), langue);
  return (
    <Boite titre={t.queSEstIlPasse} onFermer={onFermer}
           pied={<div className="flex flex-col gap-2">
             <button type="button" disabled className="cursor-not-allowed rounded-full bg-surface-2 px-4 py-2.5 text-small font-semibold text-ink-faint">{langue === "fr" ? "Écrire une note" : "Write a note"}</button>
             <button type="button" disabled className="cursor-not-allowed rounded-full bg-surface-2 px-4 py-2.5 text-small font-semibold text-ink-faint">{langue === "fr" ? "Ajouter l'opération qui manque" : "Add the missing operation"}</button>
             <span className="text-center text-caption text-ink-faint">{t.bientot}</span>
           </div>}>
      <p className="text-negative">{e.montant < 0 ? t.ecart(m, e.depuis, e.jusqua) : t.ecartPlus(m, e.depuis, e.jusqua)}</p>
      {annonce != null && attendu != null && (
        <div className="divide-hair rounded-card border border-line">
          <Rang libelle={langue === "fr" ? `${op} aurait dû annoncer` : `${op} should have announced`}><span className="italic text-ink-soft tabnums">{nombre(attendu, langue)} F ({t.calcule})</span></Rang>
          <Rang libelle={langue === "fr" ? `${op} a annoncé à ${e.jusqua}` : `${op} announced at ${e.jusqua}`}><span className="font-semibold tabnums">{nombre(annonce, langue)} F</span></Rang>
          <Rang libelle={langue === "fr" ? "Écart" : "Gap"}><span className="font-bold text-negative tabnums">{e.montant < 0 ? "−" : "+"}{m} F</span></Rang>
        </div>
      )}
      {echouees.length > 0 && (
        <div className="flex flex-col gap-1 text-small">
          <p className="font-semibold">{langue === "fr" ? "Dans ce créneau" : "In this window"}</p>
          {echouees.map((x) => (
            <p key={x.p.id} className="text-ink-soft">
              {langue === "fr" ? `1 SMS rangé « Échouée » à ${x.p.heure} (${nombre(x.p.montant ?? 0, langue)} F)` : `1 SMS marked “Failed” at ${x.p.heure} (${nombre(x.p.montant ?? 0, langue)} F)`}
            </p>
          ))}
        </div>
      )}
      <p className="text-small text-ink-soft">
        {langue === "fr"
          ? "L'argent a pu partir par l'application MoMo d'un autre téléphone, au guichet, ou par un SMS perdu pendant une coupure. TOTEM ne dit pas combien d'opérations manquent : personne ne peut le savoir."
          : "The money may have left through the MoMo app on another phone, at a counter, or through an SMS lost during an outage. TOTEM does not say how many operations are missing: nobody can know."}
      </p>
    </Boite>
  );
}
