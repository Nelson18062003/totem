"use client";

// La page Flux du site — le pendant de l'onglet Flux du téléphone. La règle
// (types, effets, suite des soldes) vit dans le noyau : les deux surfaces
// rangent et comptent pareil.
//
// PEU DE MOTS, UNE STRUCTURE. En tête : ce qui est entré, ce qui est sorti,
// le solde annoncé de chaque carte. Une seule ligne d'alerte, seulement s'il
// y a lieu. Le tableau dit QUI, COMBIEN et le SOLDE annoncé ; tout le reste
// vit dans la fiche, qui s'ouvre à droite.
//
// Le signe et la couleur disent ce que l'opération fait au solde : « + » en
// vert, « − » à l'encre. Le ROUGE est réservé aux soldes qui ne se suivent
// pas ; l'AMBRE à ce qui attend une décision.

import { Fragment, useEffect, useMemo, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesFlux, NOMS_TYPES, NOMS_CORRECTION } from "@noyau/textes/flux";
import { textesSms } from "@noyau/textes/sms";
import {
  fluxDe, totauxFlux, etatDesCartes, parJour, correspondFlux, dansFamille, montantSigne, initialesDe,
  FAMILLES_FLUX, type Flux, type FamilleFlux, type Ecart, type TypeFlux,
} from "@noyau/flux";
import { jourLocal, nombre, type Paiement, type Sim } from "@noyau/types";
import { bornesDe, dansBornes, jourCourt, jourDuReleve, libelleJour, type Periode } from "@noyau/periodes";
import { formaterNumero } from "@noyau/numero";
import { IconBubble, IconCheck, IconChevron, IconClose, IconCopy, IconCrayon, IconList, IconLock, IconPhone, IconSearch, IconTransfer } from "../icons";
import { couleurOperateur, LogoOperateur } from "../logos-operateurs";

type Initial = { q: string; periode: string; carte: string; type: string; t: string };
type Langue = "fr" | "en";

const PERIODES = ["aujourdhui", "hier", "semaine", "mois", "tout"] as const;
const operateurDe = (libelle: string) => libelle.split(/[\s·]/)[0] || libelle;

function quandAnnonce(iso: string, heure: string, maintenant: number, fuseau: string, langue: Langue) {
  const j = jourDuReleve(iso, maintenant, fuseau);
  if (!j) return heure;
  if (langue === "en") {
    if (j.genre === "aujourdhui") return `Today at ${heure}`;
    if (j.genre === "hier") return `Yesterday at ${heure}`;
    return `${jourCourt(j.cle, langue)} at ${heure}`;
  }
  if (j.genre === "aujourdhui") return `Aujourd'hui à ${heure}`;
  if (j.genre === "hier") return `Hier à ${heure}`;
  return `Le ${jourCourt(j.cle, langue)} à ${heure}`;
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
  const [aRegarder, setARegarder] = useState(false);
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
  const dansLaVue = useMemo(() => tous.filter((f) =>
    dansBornes(f.p, bornes)
    && (!carte || (f.p.carte || f.p.sim) === carte)
    && dansFamille(f, (famille || null) as FamilleFlux | null)
    && correspondFlux(f, recherche)),
  [tous, bornes?.de, bornes?.a, carte, famille, recherche]);
  const totaux = totauxFlux(dansLaVue);
  const vus = aRegarder ? dansLaVue.filter((f) => f.etat === "a_verifier" || f.ecartAvant || f.ecartApres) : dansLaVue;
  const jours = parJour(vus);
  const aujourdhui = jourLocal(new Date(maintenant), fuseau);
  const cartes = useMemo(() => etatDesCartes(paiements, tous), [paiements, tous]);
  const cartesVues = [...cartes.values()].filter((c) => !carte || c.carte === carte);
  const fiche = ouverte ? tous.find((f) => f.p.id === ouverte) ?? null : null;
  const nomPeriode = (p: string) => p === "aujourdhui" ? ts.periodeAujourdhui : p === "hier" ? ts.periodeHier
    : p === "semaine" ? ts.periodeSemaine : p === "mois" ? ts.periodeMois : ts.periodeTout;
  const nomCarte = (cle: string) => sims.find((s) => s.iccid === cle)?.libelle ?? cle;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <FiltreTexte etiquette={t.periode} valeur={periode} onChange={setPeriode}
                         options={PERIODES.map((p) => ({ cle: p, libelle: nomPeriode(p) }))} />
            <FiltreTexte etiquette={t.cartes} valeur={carte} onChange={setCarte}
                         options={[{ cle: "", libelle: t.toutesLesCartes }, ...sims.map((s) => ({ cle: s.iccid, libelle: s.libelle }))]} />
            <FiltreTexte etiquette={t.type} valeur={famille} onChange={setFamille}
                         options={[{ cle: "", libelle: t.tous }, ...FAMILLES_FLUX.map((f) => ({ cle: f, libelle: t.familles[f] }))]} />
          </div>
        </div>
        <label className="flex w-full items-center gap-2 rounded-full border border-line bg-surface-raised px-4 sm:w-72">
          <IconSearch size={16} className="text-ink-faint" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={t.chercher}
                 aria-label={t.rechercher}
                 className="w-full bg-transparent py-2 text-small outline-none placeholder:text-ink-faint" />
        </label>
      </header>

      {/* EN TÊTE : deux chiffres, et le solde annoncé de chaque carte. */}
      <section className="flex flex-col gap-2">
        <div className="grid overflow-hidden rounded-card border border-line bg-surface-raised md:grid-cols-[1fr_1fr_1.3fr]">
          <Chiffre libelle={t.entrees} valeur={`+${nombre(totaux.entrees, langue)}`} classe="text-positive" />
          <Chiffre libelle={t.sorties} valeur={`−${nombre(totaux.sorties, langue)}`} />
          <div className="flex flex-col justify-center gap-2 border-t border-line px-5 py-4 md:border-l md:border-t-0">
            {cartesVues.map((c) => {
              const op = operateurDe(nomCarte(c.carte));
              return (
                <div key={c.carte} className="flex items-center gap-2.5 text-small">
                  <LogoOperateur operateur={op} size={18} />
                  <span className="flex-1 text-ink-soft">{nomCarte(c.carte).replace(/^\S+\s*/, "")}</span>
                  <span className="font-semibold tabnums">{c.solde != null ? `${nombre(c.solde, langue)} F` : "—"}</span>
                  <span className={`w-4 text-center ${c.ecarts ? "text-negative" : "text-positive"}`}
                        title={c.heure ? t.annonceCourt(c.heure) : undefined}>
                    {c.ecarts ? "⚠" : c.suitDepuis ? "✓" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {(totaux.ecarts > 0 || totaux.aVerifier > 0) && (
          <button type="button" aria-pressed={aRegarder} onClick={() => setARegarder(!aRegarder)}
                  className={`flex items-center gap-2.5 self-start rounded-full px-4 py-2 text-small font-medium ${
                    totaux.ecarts ? "bg-[rgba(192,15,12,0.06)] text-negative" : "bg-[rgba(151,81,2,0.10)] text-alert"}`}>
            <span className={`size-2 rounded-full ${totaux.ecarts ? "bg-negative" : "bg-alert"}`} />
            {t.attention(totaux.ecarts, totaux.aVerifier)}
            {aRegarder ? <IconClose size={12} /> : <IconChevron size={12} />}
          </button>
        )}
      </section>

      {vus.length === 0 && <p className="py-10 text-center text-ink-soft">{t.aucuneTransaction}</p>}

      {/* LA LISTE, JOUR PAR JOUR. */}
      {jours.map((j) => {
        const net = j.totaux.entrees - j.totaux.sorties;
        return (
          <section key={j.jour} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-small font-semibold">{libelleJour(j.jour, aujourdhui, langue)}</h2>
              <span className="text-small text-ink-faint tabnums">{net >= 0 ? "+" : "−"}{nombre(Math.abs(net), langue)}</span>
            </div>
            <div className="overflow-hidden rounded-card border border-line bg-surface-raised">
              <table className="w-full border-collapse text-small">
                <tbody>
                  {j.flux.map((f, i) => (
                    <Fragment key={f.p.id}>
                      {f.ecartApres && <RangeeEcart e={f.ecartApres} t={t} langue={langue} onOuvrir={() => setEcart({ f, e: f.ecartApres! })} />}
                      <Ligne f={f} langue={langue} carteCourte={nomCarte(f.p.carte || f.p.sim)} premiere={i === 0 && !f.ecartApres}
                             choisie={ouverte === f.p.id} onOuvrir={() => setOuverte(f.p.id)} />
                      {f.ecartAvant && <RangeeEcart e={f.ecartAvant} t={t} langue={langue} onOuvrir={() => setEcart({ f, e: f.ecartAvant! })} />}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {fiche && (
        <PanneauFiche f={fiche} sims={sims} maintenant={maintenant} fuseau={fuseau} langue={langue}
                      onFermer={() => setOuverte("")} onCorriger={() => setCorriger(fiche)}
                      onNumero={(n) => { setOuverte(""); setRecherche(n); setPeriode("tout"); }} />
      )}
      {corriger && <BoiteCorriger f={corriger} langue={langue} onFermer={() => setCorriger(null)} />}
      {ecart && <BoiteEcart f={ecart.f} e={ecart.e} tous={tous} langue={langue} onFermer={() => setEcart(null)} />}
    </div>
  );
}

/** Un filtre : ce qui est choisi, en texte, et une flèche vers le bas. */
function FiltreTexte({ etiquette, valeur, options, onChange }: {
  etiquette: string; valeur: string; options: { cle: string; libelle: string }[]; onChange: (v: string) => void;
}) {
  return (
    <label className="relative flex items-center gap-1 text-small font-medium text-ink-soft hover:text-ink">
      <select value={valeur} onChange={(e) => onChange(e.target.value)} aria-label={etiquette}
              // La largeur suit le choix affiché, pas l'option la plus longue.
              className="cursor-pointer appearance-none bg-transparent pr-4 outline-none [field-sizing:content]">
        {options.map((o) => <option key={o.cle} value={o.cle}>{o.libelle}</option>)}
      </select>
      <IconChevron size={11} className="pointer-events-none absolute right-0 rotate-90" />
    </label>
  );
}

function Chiffre({ libelle, valeur, classe = "" }: { libelle: string; valeur: string; classe?: string }) {
  return (
    <div className="flex flex-col gap-1 border-line px-5 py-4 [&+&]:border-t md:[&+&]:border-l md:[&+&]:border-t-0">
      <span className="text-small text-ink-soft">{libelle}</span>
      <span className={`text-title font-bold tabnums ${classe}`}>{valeur}</span>
    </div>
  );
}

/** Le rond : les initiales, et un point à la couleur de l'opérateur. */
function Rond({ f, carteCourte, taille = 36 }: { f: Flux; carteCourte: string; taille?: number }) {
  const attend = f.etat === "a_verifier";
  const initiales = initialesDe(f.p.tiers);
  const point = couleurOperateur(operateurDe(carteCourte));
  return (
    <span className="relative inline-grid shrink-0" style={{ width: taille, height: taille }}>
      <span className={`grid place-items-center rounded-full ${attend ? "bg-[rgba(151,81,2,0.10)] text-alert" : "bg-surface-2 text-ink-soft"}`}
            style={{ width: taille, height: taille }}>
        {attend ? <IconTransfer size={Math.round(taille * 0.45)} />
          : initiales ? <span className="font-semibold" style={{ fontSize: Math.round(taille * 0.34) }}>{initiales}</span>
          : <IconPhone size={Math.round(taille * 0.45)} />}
      </span>
      {point && <span className="absolute -bottom-px -right-px rounded-full border-2 border-surface-raised"
                      style={{ width: Math.round(taille * 0.32), height: Math.round(taille * 0.32), background: point }} />}
    </span>
  );
}

function Ligne({ f, langue, carteCourte, premiere, choisie, onOuvrir }: {
  f: Flux; langue: Langue; carteCourte: string; premiere: boolean; choisie: boolean; onOuvrir: () => void;
}) {
  const t = textesFlux[langue];
  const p = f.p;
  const entree = f.effet != null && f.effet > 0;
  const attend = f.etat === "a_verifier";
  const echouee = f.etat === "echouee";
  const titre = p.tiers || formaterNumero(p.numero) || NOMS_TYPES[langue][f.type];
  return (
    <tr onClick={onOuvrir}
        className={`cursor-pointer transition hover:bg-surface ${premiere ? "" : "border-t border-line"} ${choisie ? "bg-surface-2" : ""}`}>
      <td className="w-px py-3 pl-4 pr-3 align-middle"><Rond f={f} carteCourte={carteCourte} /></td>
      <td className="max-w-0 py-3 pr-3">
        <button type="button" onClick={onOuvrir} className="block w-full text-left">
          <span className={`block truncate font-medium ${echouee ? "text-ink-faint" : ""}`}>{titre}</span>
          <span className={`block truncate text-caption ${attend ? "text-alert" : "text-ink-faint"}`}>
            {NOMS_TYPES[langue][f.type]} · {attend ? t.aConfirmer : p.heure}
          </span>
        </button>
      </td>
      <td className="hidden w-px whitespace-nowrap py-3 pr-6 text-caption text-ink-faint lg:table-cell">
        {carteCourte}
      </td>
      <td className="w-px whitespace-nowrap py-3 pr-6 text-right text-caption text-ink-faint tabnums">
        {p.soldeApres != null && (
          <>{nombre(p.soldeApres, langue)} F{f.verdict === "suit" && <span className="text-positive"> ✓</span>}</>
        )}
      </td>
      <td className={`w-px whitespace-nowrap py-3 pr-4 text-right font-semibold tabnums ${
        echouee ? "text-ink-faint line-through" : attend ? "text-alert" : entree ? "text-positive" : ""}`}>
        {montantSigne(f, langue, nombre)}
      </td>
    </tr>
  );
}

function RangeeEcart({ e, t, langue, onOuvrir }: { e: Ecart; t: (typeof textesFlux)["fr"]; langue: Langue; onOuvrir: () => void }) {
  return (
    <tr className="border-t border-line bg-[rgba(192,15,12,0.06)]">
      <td colSpan={5} className="px-4 py-2">
        <button type="button" onClick={onOuvrir} className="flex w-full items-center gap-2 text-left text-small text-negative">
          <span className="size-1.5 rounded-full bg-negative" />
          <span className="flex-1">{t.ecartCourt(nombre(Math.abs(e.montant), langue), e.montant < 0 ? "moins" : "plus", e.depuis, e.jusqua)}</span>
          <IconChevron size={12} />
        </button>
      </td>
    </tr>
  );
}

function Rang({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex-1 text-small text-ink-faint">{libelle}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function Copiable({ texte, affiche }: { texte: string; affiche: string }) {
  const [fait, setFait] = useState(false);
  return (
    <button type="button" className="inline-flex items-center gap-1.5 tabnums hover:text-ink"
            onClick={async () => { try { await navigator.clipboard.writeText(texte); setFait(true); setTimeout(() => setFait(false), 1500); } catch { /* sélectionnable à la souris */ } }}>
      {affiche}
      {fait ? <IconCheck size={14} className="text-positive" /> : <IconCopy size={14} className="text-ink-faint" />}
    </button>
  );
}

function Geste({ Icone, libelle, onClick }: { Icone: typeof IconCopy; libelle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-1 flex-col items-center gap-1.5 text-caption text-ink-soft hover:text-ink">
      <span className="grid size-11 place-items-center rounded-full border border-line"><Icone size={18} /></span>
      {libelle}
    </button>
  );
}

function PanneauFiche({ f, sims, maintenant, fuseau, langue, onFermer, onCorriger, onNumero }: {
  f: Flux; sims: Sim[]; maintenant: number; fuseau: string; langue: Langue;
  onFermer: () => void; onCorriger: () => void; onNumero: (n: string) => void;
}) {
  const t = textesFlux[langue];
  const p = f.p;
  const op = operateurDe(p.sim);
  const sim = sims.find((s) => s.iccid === p.carte);
  const entree = f.effet != null && f.effet > 0;
  const [sms, setSms] = useState(false);
  const etat = f.etat === "comptee" ? t.reussie : f.etat === "echouee" ? t.echouee : t.aVerifierEtat;
  const titre = p.tiers || formaterNumero(p.numero) || NOMS_TYPES[langue][f.type];
  return (
    <aside aria-label={titre}
           className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col gap-6 overflow-y-auto border-l border-line bg-surface-raised p-6">
      <div className="flex items-center gap-3">
        <Rond f={f} carteCourte={p.sim} taille={44} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{titre}</p>
          <p className="text-small text-ink-faint">
            {NOMS_TYPES[langue][f.type]} · <span className={f.etat === "comptee" ? "text-positive" : f.etat === "echouee" ? "" : "text-alert"}>{etat}</span>
          </p>
        </div>
        <button type="button" onClick={onFermer} aria-label={t.retour} className="text-ink-faint hover:text-ink"><IconClose size={18} /></button>
      </div>
      <p className={`text-center text-display font-bold tabnums ${f.etat === "a_verifier" ? "text-alert" : entree ? "text-positive" : ""}`}>
        {montantSigne(f, langue, nombre)} F
      </p>
      <div className="flex">
        <Geste Icone={IconCrayon} libelle={t.corriger} onClick={onCorriger} />
        <Geste Icone={IconBubble} libelle={t.voirLeSms}
               onClick={() => { window.location.href = `/encaissements?recherche=${encodeURIComponent(p.reference || p.tiers || p.numero)}`; }} />
        {p.numero && <Geste Icone={IconList} libelle={t.toutesAvecCeNumero} onClick={() => onNumero(p.numero)} />}
      </div>
      <div className="divide-hair rounded-card border border-line">
        {p.numero && <Rang libelle={langue === "fr" ? "Numéro" : "Number"}><Copiable texte={p.numero} affiche={formaterNumero(p.numero)} /></Rang>}
        {p.reference && <Rang libelle={t.reference}><Copiable texte={p.reference} affiche={p.reference} /></Rang>}
        <Rang libelle={t.carte}>
          <span className="inline-flex items-center gap-2"><LogoOperateur operateur={op} size={16} />{sim?.numero ? formaterNumero(sim.numero) : p.sim}</span>
        </Rang>
        <Rang libelle={t.date}>{quandAnnonce(p.recuLe, p.heure, maintenant, fuseau, langue)}</Rang>
        {p.commission ? <Rang libelle={t.commission}><span className="tabnums">{nombre(p.commission, langue)} F</span></Rang> : null}
        {p.soldeApres != null && (
          <Rang libelle={langue === "fr" ? "Solde après" : "Balance after"}>
            <span className="font-semibold tabnums">{nombre(p.soldeApres, langue)} F{f.verdict === "suit" && <span className="text-positive"> ✓</span>}</span>
          </Rang>
        )}
        {f.soldeAvantCalcule != null && (
          <Rang libelle={t.soldeAvant}><span className="italic text-ink-faint tabnums">{nombre(f.soldeAvantCalcule, langue)} F ({t.calcule})</span></Rang>
        )}
      </div>
      <div className="rounded-card border border-line">
        <button type="button" aria-expanded={sms} onClick={() => setSms(!sms)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-small font-medium text-ink-soft">
          <span className="flex-1">{t.ceQueDitLeSms}</span>
          <IconChevron size={12} className={sms ? "-rotate-90" : "rotate-90"} />
        </button>
        {sms && <p className="whitespace-pre-line break-words px-4 pb-3 text-small text-ink-soft">{p.smsBrut}</p>}
      </div>
    </aside>
  );
}

function Boite({ titre, onFermer, children, pied }: { titre: string; onFermer: () => void; children: React.ReactNode; pied?: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={titre} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-[440px] flex-col overflow-hidden rounded-card border border-line bg-surface-raised">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="text-heading font-semibold">{titre}</h2>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="text-ink-faint hover:text-ink"><IconClose size={18} /></button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-3">{children}</div>
        {pied && <div className="px-5 pb-5 pt-2">{pied}</div>}
      </div>
    </div>
  );
}

function BoutonEteint({ libelle, langue }: { libelle: string; langue: Langue }) {
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" disabled className="cursor-not-allowed rounded-btn bg-surface-2 py-3 text-small font-semibold text-ink-faint">{libelle}</button>
      <span className="text-center text-caption text-ink-faint">{textesFlux[langue].bientot}</span>
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
    <Boite titre={t.corriger} onFermer={onFermer} pied={<BoutonEteint libelle={t.enregistrer} langue={langue} />}>
      {lu == null && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {(["in", "out"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={sens === s} onClick={() => { setSens(s); setType(""); }}
                      className={`rounded-btn py-3 font-semibold ${sens === s ? "border-2 border-ink" : "border border-line"} ${s === "in" ? "text-positive" : ""}`}>
                {s === "in" ? `+ ${t.entree}` : `− ${t.sortie}`}
              </button>
            ))}
          </div>
          {f.lesSoldesDisent && <p className="text-small text-ink-soft">{t.lesSoldesDisent(f.lesSoldesDisent)}</p>}
        </div>
      )}
      <div className="divide-hair rounded-card border border-line">
        {options.map((o) => (
          <button key={o.cle} type="button" role="radio" aria-checked={type === o.cle} onClick={() => setType(o.cle)}
                  className="flex w-full items-center px-4 py-3 text-left hover:bg-surface">
            <span className={`flex-1 ${type === o.cle ? "font-semibold" : ""}`}>{o.libelle}</span>
            {type === o.cle && <IconCheck size={16} />}
          </button>
        ))}
      </div>
      <textarea maxLength={280} rows={2} placeholder={t.ajouterUneNote}
                className="rounded-card border border-line bg-surface-raised p-3 text-body outline-none placeholder:text-ink-faint focus:border-ink-faint" />
      <p className="flex items-center gap-2 text-caption text-ink-faint">
        <IconLock size={13} className="shrink-0" />
        {langue === "fr" ? "Le SMS d'origine ne change jamais." : "The original SMS never changes."}
      </p>
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
           pied={<BoutonEteint libelle={langue === "fr" ? "Ajouter l'opération qui manque" : "Add the missing operation"} langue={langue} />}>
      <div className="flex flex-col items-center gap-1 py-2">
        <span className="text-display font-bold text-negative tabnums">{e.montant < 0 ? "−" : "+"}{m} F</span>
        <span className="text-small text-ink-soft">
          {langue === "fr" ? `sans SMS, entre ${e.depuis} et ${e.jusqua}` : `without SMS, between ${e.depuis} and ${e.jusqua}`}
        </span>
      </div>
      {annonce != null && attendu != null && (
        <div className="divide-hair rounded-card border border-line">
          <Rang libelle={langue === "fr" ? "Attendu" : "Expected"}><span className="italic text-ink-faint tabnums">{nombre(attendu, langue)} F ({t.calcule})</span></Rang>
          <Rang libelle={langue === "fr" ? `Annoncé par ${op} à ${e.jusqua}` : `Announced by ${op} at ${e.jusqua}`}><span className="font-semibold tabnums">{nombre(annonce, langue)} F</span></Rang>
        </div>
      )}
      {echouees.map((x) => (
        <p key={x.p.id} className="text-small text-ink-soft">
          {langue === "fr" ? `Dans ce créneau : 1 opération échouée à ${x.p.heure} (${nombre(x.p.montant ?? 0, langue)} F).`
            : `In this window: 1 failed operation at ${x.p.heure} (${nombre(x.p.montant ?? 0, langue)} F).`}
        </p>
      ))}
      <p className="text-small text-ink-faint">
        {langue === "fr" ? "Souvent un SMS perdu pendant une coupure, ou une opération faite depuis un autre téléphone."
          : "Often an SMS lost during an outage, or an operation made from another phone."}
      </p>
    </Boite>
  );
}
