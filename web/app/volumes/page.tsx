import Link from "next/link";
import { redirect } from "next/navigation";
import { langueServeur } from "@/lib/langue-serveur";
import { volumesMontres } from "@/lib/volumes";
import {
  francs, jourCourtVolumes, nomDeFamille, textesVolumes,
} from "@noyau/textes/volumes";
import {
  creneauLePlusCharge, etiquetteDuPas, famillesDe, GENRES_PERIODE, nomDeLaPeriode, periodeVoisine,
  variation, type CarteVolumes, type FamilleVolume, type PointDeSerie, type ReponseVolumes,
} from "@noyau/volumes";
import { formaterNumero } from "@noyau/numero";
import { initialesDe } from "@noyau/flux";
import type { Langue } from "@noyau/langue";
import { ChoixDeCarte, ChoixDeDates } from "./choix";
import { Documents } from "./documents";

export const dynamic = "force-dynamic";

// LES VOLUMES — ce qui est entré et sorti des cartes, sur la période qu'on
// choisit. Le propriétaire a refusé deux versions : la première « trop
// complexe, mal structurée », la seconde « pas assez visuelle ». Celle-ci
// montre d'abord DEUX BARRES (entrées, sorties), puis des dessins ; les mots
// sont des titres.
//
// Rien n'est calculé ici : `lib/volumes.ts` lit toute la période, le noyau
// compte (`noyau/volumes.ts`), le téléphone reçoit le même calcul.
//
// LES TAILLES D'ÉCRAN : une colonne sur un téléphone et une tablette (le menu
// du site y prend déjà un tiers de la largeur), deux sur un petit
// ordinateur, trois sur un grand — la période et les deux barres en tête.

type Params = { periode?: string; jour?: string; de?: string; a?: string; carte?: string; qui?: string; tous?: string };

const COULEUR_FAMILLE: Record<FamilleVolume, string> = {
  argent: "var(--color-famille-argent)", especes: "var(--color-famille-especes)",
  transferts: "var(--color-famille-transferts)", commissions: "var(--color-famille-commissions)",
};
const COULEUR_OPERATEUR = (op: string) =>
  op.toUpperCase().startsWith("MTN") ? "var(--color-op-mtn)"
    : op.toUpperCase().startsWith("ORANGE") ? "var(--color-op-orange)" : "var(--color-ink-faint)";

const nomDeCarte = (c: CarteVolumes) => `${c.operateur} ${formaterNumero(c.numero) || c.libelle.replace(/^\S+\s*/, "")}`;

/** L'adresse d'une autre vue, en gardant le reste. */
function lien(r: ReponseVolumes, change: Partial<Record<keyof Params, string | null>>): string {
  const p = r.volumes.periode;
  const q = new URLSearchParams();
  const v: Params = {
    periode: p.genre, jour: p.genre === "dates" ? undefined : p.de,
    de: p.genre === "dates" ? p.de : undefined, a: p.genre === "dates" ? p.a : undefined,
    carte: r.carte,
  };
  for (const [k, x] of Object.entries({ ...v, ...change })) if (x) q.set(k, x);
  return `/volumes?${q.toString()}`;
}

export default async function Volumes({ searchParams }: { searchParams: Promise<Params> }) {
  const langue = await langueServeur();
  const t = textesVolumes[langue];
  const q = await searchParams;
  const r = await volumesMontres(langue, {
    genre: q.periode, repere: q.jour, de: q.de, a: q.a, carte: q.carte, correspondant: q.qui,
  });
  // Une adresse qui ne se lit pas (une carte qui n'est pas la sienne, une
  // date dans le futur) ramène au mois en cours, sans rien montrer d'autre.
  if (!r) redirect("/volumes");

  const v = r.volumes;
  const p = v.periode;
  const carteChoisie = r.carte === "tout" ? null : r.cartes.find((c) => c.iccid === r.carte) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <EnTete r={r} langue={langue} />

      {r.cartes.length === 0 ? (
        <Vide titre={t.pasDeCarte} detail={t.pasDeCarteDetail} />
      ) : v.fiche !== undefined ? (
        <FicheCorrespondant r={r} langue={langue} />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <Duel r={r} langue={langue} />
            {carteChoisie && <LeSolde r={r} carte={carteChoisie} langue={langue} />}
            <Colonnes serie={v.serie} pas={p.pas} langue={langue} titre={t.serie[p.pas]} />
          </div>
          <div className="flex flex-col gap-5 lg:col-span-2 xl:col-span-1">
            <Avertissements r={r} langue={langue} />
            <ChiffresCles r={r} langue={langue} />
          </div>
          {v.totaux.n === 0 ? (
            <div className="lg:col-span-2 xl:col-span-3"><Vide titre={t.rien} detail={t.rienDetail} /></div>
          ) : (
            <>
              <AvecQui r={r} langue={langue} tous={q.tous === "1"} />
              <Anneaux r={r} langue={langue} />
              <div className="flex flex-col gap-5">
                {r.carte === "tout" && <ParCarte r={r} langue={langue} />}
                <HeuresDePointe heures={v.heures} langue={langue} />
              </div>
            </>
          )}
        </div>
      )}

      {r.cartes.length > 0 && v.fiche === undefined && (
        <div className="mt-4 border-t border-line pt-8">
          <Documents langue={langue} sims={r.cartes} />
        </div>
      )}
    </div>
  );
}

// --- La tête : la période, la carte ------------------------------------------

function EnTete({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const p = r.volumes.periode;
  const avant = periodeVoisine(p, -1, r.aujourdhui);
  const apres = periodeVoisine(p, 1, r.aujourdhui);
  const versVoisine = (x: typeof p | null) => x && lien(r, {
    jour: x.genre === "dates" ? null : x.de, de: x.genre === "dates" ? x.de : null,
    a: x.genre === "dates" ? x.a : null, qui: null,
  });
  const fleche = "grid h-10 w-10 place-items-center rounded-btn border border-line bg-surface-raised text-ink transition hover:border-ink-faint";
  const releve = `/api/releve?carte=${encodeURIComponent(r.carte)}&de=${p.de}&a=${p.jusqua}&format=pdf`;
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-title font-semibold tracking-tight">{t.titre}</h1>
        <a href={releve} download title={t.telechargerReleve} aria-label={t.telechargerReleve}
           className={fleche}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        </a>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Chaque pastille part de la largeur de son nom : à parts égales, à
            320 points, « Semaine » passait sous « Mois » et « 6 mois » sur
            deux lignes. */}
        <nav className="flex gap-1 min-[360px]:gap-1.5 lg:w-[30rem]" aria-label={t.titre}>
          {GENRES_PERIODE.map((g) => {
            const choisi = g === p.genre;
            const href = g === "dates"
              ? lien(r, { periode: "dates", jour: null, de: p.de, a: p.jusqua, qui: null })
              : lien(r, { periode: g, jour: r.aujourdhui, de: null, a: null, qui: null });
            return (
              <Link key={g} href={href} aria-current={choisi ? "page" : undefined}
                    className={`flex-auto whitespace-nowrap rounded-full border px-2 py-2 text-center text-caption font-medium transition min-[360px]:text-small ${
                      choisi ? "border-accent bg-accent text-white" : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"}`}>
                {t.periodes[g]}
              </Link>
            );
          })}
        </nav>
        <span className="hidden flex-1 lg:block" />
        {r.cartes.length > 0 && (
          <div className="lg:w-72">
            <ChoixDeCarte cartes={r.cartes.map((c) => ({ iccid: c.iccid, nom: nomDeCarte(c) }))}
                          choisie={r.carte} toutes={t.toutesLesCartes}
                          base={lien(r, { carte: null, qui: null })} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {avant ? <Link href={versVoisine(avant)!} aria-label={t.precedente} className={fleche}>‹</Link>
          : <span className={`${fleche} opacity-30`} aria-hidden>‹</span>}
        <p className="flex-1 text-center text-heading font-semibold">{nomDeLaPeriode(p, langue)}</p>
        {apres ? <Link href={versVoisine(apres)!} aria-label={t.suivante} className={fleche}>›</Link>
          : <span className={`${fleche} opacity-30`} aria-hidden>›</span>}
      </div>
      {p.genre === "dates" && (
        <ChoixDeDates de={p.de} a={p.a} max={r.aujourdhui} carte={r.carte}
                      mots={{ du: t.du, au: t.au, voir: t.voir }} />
      )}
    </header>
  );
}

// --- Les deux barres ---------------------------------------------------------

function Variation({ maintenant, avant }: { maintenant: number; avant: number }) {
  const x = variation(maintenant, avant);
  if (x == null) return null;
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-caption font-semibold text-ink-soft tabnums">
      {x >= 0 ? "▲" : "▼"} {Math.abs(x)} %
    </span>
  );
}

function Duel({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const { totaux, avant } = r.volumes;
  const max = Math.max(totaux.entrees, totaux.sorties, 1);
  const ligne = (nom: string, valeur: number, n: number, avantV: number, couleur: string, ton: string) => (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 text-body font-semibold">
          <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: couleur }} />
          {nom}
          <Variation maintenant={valeur} avant={avantV} />
        </span>
        <span className={`text-[1.6rem] font-bold leading-tight tracking-tight ${ton}`}>{francs(valeur, langue)}</span>
      </div>
      <div className="h-5 rounded-md" style={{ background: couleur, width: `${Math.max(1, (valeur / max) * 100)}%` }}
           role="img" aria-label={`${nom} ${francs(valeur, langue)}`} />
      <span className="text-caption text-ink-faint">{t.operations(n)}</span>
    </div>
  );
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface-raised p-5">
      {ligne(t.entrees, totaux.entrees, totaux.nEntrees, avant.entrees, "var(--color-entree)", "text-positive")}
      {ligne(t.sorties, totaux.sorties, totaux.nSorties, avant.sorties, "var(--color-sortie)", "text-negative")}
      <div className="flex items-center justify-between border-t border-line pt-4">
        <span className="text-body font-semibold">{t.reste}</span>
        <span className="text-[1.9rem] font-bold leading-tight tracking-tight">{francs(totaux.net, langue, true)}</span>
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
    if (c) lignes.push(t.silence(nomDeCarte(c)));
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
  const cases: [string, string, string][] = [
    [t.kOperations, totaux.n.toLocaleString(langue === "en" ? "en-US" : "fr-FR").replace(/[  ]/g, " "), t.kParJour(cles.parJour)],
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
          <div key={nom} className="flex flex-col gap-1 rounded-card border border-line bg-surface-raised px-4 py-3">
            <span className="text-small text-ink-soft">{nom}</span>
            <span className="text-heading font-bold tracking-tight">{valeur}</span>
            <span className="text-caption text-ink-faint">{sous}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Chaque jour (heure, semaine, mois) --------------------------------------

function Colonnes({ serie, pas, langue, titre }: { serie: PointDeSerie[]; pas: ReponseVolumes["volumes"]["periode"]["pas"]; langue: Langue; titre: string }) {
  const t = textesVolumes[langue];
  const max = Math.max(1, ...serie.map((c) => Math.max(c.entrees, c.sorties)));
  const etiquettes = new Set([0, Math.floor((serie.length - 1) / 3), Math.floor(((serie.length - 1) * 2) / 3), serie.length - 1]);
  return (
    <section className="rounded-card border border-line bg-surface-raised p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-heading font-semibold">{titre}</h2>
        <Cles entrees={t.entrees} sorties={t.sorties} />
      </div>
      <div className="flex gap-[3px]" style={{ height: 180 }}>
        {serie.map((c, i) => (
          <div key={c.cle} className="flex min-w-0 flex-1 flex-col items-center"
               title={`${etiquetteDuPas(c.cle, pas, langue)} — ${t.entrees} ${francs(c.entrees, langue)} · ${t.sorties} ${francs(c.sorties, langue)}`}>
            <div className="flex w-full flex-1 items-end justify-center">
              <div className="w-full max-w-[14px] rounded-t-[4px]" style={{ height: `${(c.entrees / max) * 100}%`, background: "var(--color-entree)" }} />
            </div>
            <div className="h-px w-full bg-surface-3" />
            <div className="flex w-full flex-1 items-start justify-center">
              <div className="w-full max-w-[14px] rounded-b-[4px]" style={{ height: `${(c.sorties / max) * 100}%`, background: "var(--color-sortie)" }} />
            </div>
          </div>
        ))}
      </div>
      {/* Les repères vivent sous la rangée, pas dans les colonnes : une
          colonne d'un mois n'a pas la largeur de « 14 sept. ». Le premier et
          le dernier s'appuient sur les bords, sans en sortir. */}
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
    </section>
  );
}

function Cles({ entrees, sorties }: { entrees: string; sorties: string }) {
  return (
    <span className="flex gap-3 text-caption text-ink-soft">
      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-entree)" }} />{entrees}</span>
      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-sortie)" }} />{sorties}</span>
    </span>
  );
}

// --- Avec qui ----------------------------------------------------------------

function AvecQui({ r, langue, tous }: { r: ReponseVolumes; langue: Langue; tous: boolean }) {
  const t = textesVolumes[langue];
  const liste = tous ? r.volumes.correspondants : r.volumes.correspondants.slice(0, 5);
  if (liste.length === 0) return null;
  const max = Math.max(1, ...liste.map((q) => Math.max(q.recu, q.envoye)));
  return (
    <section className="rounded-card border border-line bg-surface-raised px-5 pb-3 pt-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-heading font-semibold">{t.avecQui}</h2>
        <span className="text-caption text-ink-faint">{t.parVolume}</span>
      </div>
      <ul className="divide-hair">
        {liste.map((q) => (
          <li key={q.cle}>
            <Link href={lien(r, { qui: q.cle })} className="flex items-center gap-3 py-3 transition hover:opacity-70">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-small font-bold text-ink-soft">
                {initialesDe(q.nom) || "·"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-small font-semibold">{q.nom || formaterNumero(q.numero) || t.sansNom}</span>
                {q.recu > 0 && <MiniBarre valeur={q.recu} max={max} couleur="var(--color-entree)" ton="text-positive" langue={langue} />}
                {q.envoye > 0 && <MiniBarre valeur={q.envoye} max={max} couleur="var(--color-sortie)" ton="text-negative" langue={langue} />}
              </span>
              <span className="shrink-0 text-caption text-ink-faint">{t.op(q.nRecu + q.nEnvoye)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {r.volumes.nbCorrespondants > 5 && (
        <Link href={lien(r, { tous: tous ? null : "1" })}
              className="block border-t border-line pt-3 text-center text-small font-semibold">
          {tous ? t.voirMoins : t.voirTous(r.volumes.nbCorrespondants)}
        </Link>
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
      // côté (320 points) : un total ne se coupe pas, et c'est lui qui
      // élargissait toute la colonne.
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-card border border-line bg-surface-raised p-4">
        {f.length > 0 ? <Anneau parts={f.map((x) => ({ valeur: x.montant, couleur: COULEUR_FAMILLE[x.famille] }))} />
          : <div className="h-[110px] w-[110px] shrink-0 rounded-full border-[14px] border-surface-2" />}
        <div className="flex min-w-[10rem] flex-1 flex-col gap-2">
          <p className="text-small font-semibold">{titre}
            <span className={`block whitespace-nowrap tabnums ${ton}`}>{francs(total, langue)}</span></p>
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
    <section className="flex flex-col gap-3">
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
  if (ecart == null) return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-caption font-semibold text-ink-soft">{t.soldeNonConnu}</span>;
  if (Math.abs(ecart) < 1) {
    return <span className="rounded-full bg-[#e2f4e9] px-2 py-0.5 text-caption font-semibold text-positive">✓ {t.soldesJustes}</span>;
  }
  return <span className="rounded-full bg-[#fbf0df] px-2 py-0.5 text-caption font-semibold text-alert">⚠ {t.ecartDe(francs(Math.abs(ecart), langue))}</span>;
}

function ParCarte({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const max = Math.max(1, ...r.volumes.parCarte.flatMap((c) => [c.totaux.entrees, c.totaux.sorties]));
  return (
    <section className="rounded-card border border-line bg-surface-raised px-5 pb-4 pt-4">
      <h2 className="mb-1 text-heading font-semibold">{t.parCarte}</h2>
      <ul className="divide-hair">
        {r.volumes.parCarte.map((c) => (
          <li key={c.iccid}>
            <Link href={lien(r, { carte: c.iccid, qui: null })} className="flex flex-col gap-1.5 py-3 transition hover:opacity-70">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COULEUR_OPERATEUR(c.operateur) }} />
                <span className="text-small font-semibold">{nomDeCarte(c)}</span>
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
            </Link>
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
  const marches = ouverture == null ? [] : [
    { nom: t.debut, de: 0, a: ouverture, couleur: "#a8a8a8", lib: francs(ouverture, langue) },
    { nom: t.entrees, de: ouverture, a: ouverture + e, couleur: "var(--color-entree)", lib: francs(e, langue, true) },
    { nom: t.sorties, de: ouverture + e, a: ouverture + e - s, couleur: "var(--color-sortie)", lib: francs(-s, langue, true) },
    ...(cloture != null ? [{ nom: t.fin, de: 0, a: cloture, couleur: "var(--color-ink)", lib: francs(cloture, langue) }] : []),
  ];
  const haut = Math.max(1, ...marches.flatMap((m) => [m.de, m.a]));
  const H = 170;
  const derniere = c.ruptures.at(-1);
  return (
    <section className="rounded-card border border-line bg-surface-raised p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-heading font-semibold">{t.leSolde}</h2>
        <Badge ecart={ecart} langue={langue} />
      </div>
      {marches.length > 0 && (
        <div className="relative flex gap-3" style={{ height: H + 44 }}>
          {marches.map((m) => {
            const bas = Math.min(m.de, m.a) / haut * H, h = Math.max(2, Math.abs(m.a - m.de) / haut * H);
            return (
              <div key={m.nom} className="relative flex-1">
                <span className="absolute inset-x-0 text-center text-caption font-bold tabnums" style={{ bottom: 22 + bas + h + 4 }}>{m.lib}</span>
                <div className="absolute inset-x-[18%] rounded-md" style={{ bottom: 22 + bas, height: h, background: m.couleur }} />
                <span className="absolute inset-x-0 bottom-0 text-center text-caption text-ink-soft">{m.nom}</span>
              </div>
            );
          })}
          {attendu != null && ecart != null && Math.abs(ecart) >= 1 && (
            <div className="absolute right-0 w-1/4 border-t-2 border-dashed" style={{ bottom: 22 + attendu / haut * H, borderColor: "var(--color-alert)" }}
                 title={t.attendu(francs(attendu, langue))} />
          )}
        </div>
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
  // Par tranches de deux heures, de 6 h à 22 h : la nuit est presque vide.
  const tranches = [6, 8, 10, 12, 14, 16, 18, 20];
  const valeur = (j: number, h: number) => (heures[j]?.[h] ?? 0) + (heures[j]?.[h + 1] ?? 0);
  const max = Math.max(1, ...heures.flatMap((_, j) => tranches.map((h) => valeur(j, h))));
  const pic = creneauLePlusCharge(heures);
  // Les six teintes écrites EN ENTIER : une variable dont le nom se
  // fabrique à l'exécution n'est jamais vue par Tailwind, qui ne l'émet pas
  // — et les cases restaient blanches.
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

function FicheCorrespondant({ r, langue }: { r: ReponseVolumes; langue: Langue }) {
  const t = textesVolumes[langue];
  const f = r.volumes.fiche;
  const retour = lien(r, { qui: null });
  if (!f) {
    return <Vide titre={t.rien} detail={t.rienDetail} lien={{ href: retour, texte: "‹" }} />;
  }
  const max = Math.max(1, ...f.parCarte.flatMap((c) => [c.recu, c.envoye]));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex items-center gap-4 lg:col-span-2">
        <Link href={retour} aria-label={t.precedente} className="grid h-10 w-10 place-items-center rounded-btn border border-line bg-surface-raised">‹</Link>
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-heading font-bold text-ink-soft">{initialesDe(f.nom) || "·"}</span>
        <div className="min-w-0">
          <p className="text-heading font-bold">{f.nom || t.sansNom}</p>
          <p className="text-small text-ink-faint">{formaterNumero(f.numero)}{f.numero ? " · " : ""}{nomDeLaPeriode(r.volumes.periode, langue)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:col-span-2">
        <div className="rounded-card border border-line bg-surface-raised px-4 py-3">
          <p className="flex items-center gap-2 text-small text-ink-soft"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-entree)" }} />{t.recuDe}</p>
          <p className="text-heading font-bold text-positive">{francs(f.recu, langue)}</p>
          <p className="text-caption text-ink-faint">{t.operations(f.nRecu)}</p>
        </div>
        <div className="rounded-card border border-line bg-surface-raised px-4 py-3">
          <p className="flex items-center gap-2 text-small text-ink-soft"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-sortie)" }} />{t.envoyeA}</p>
          <p className="text-heading font-bold text-negative">{francs(f.envoye, langue)}</p>
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
                <span className="flex items-center gap-2 text-small font-semibold">
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COULEUR_OPERATEUR(c?.operateur ?? "") }} />
                  <span className="flex-1">{c ? nomDeCarte(c) : pc.iccid}</span>
                  <span className="text-caption font-normal text-ink-faint">{t.op(pc.n)}</span>
                </span>
                {pc.recu > 0 && <MiniBarre valeur={pc.recu} max={max} couleur="var(--color-entree)" ton="text-positive" langue={langue} />}
                {pc.envoye > 0 && <MiniBarre valeur={pc.envoye} max={max} couleur="var(--color-sortie)" ton="text-negative" langue={langue} />}
              </li>
            );
          })}
        </ul>
      </section>
      <Colonnes serie={f.serie} pas={r.volumes.periode.pas} langue={langue} titre={t.serie[r.volumes.periode.pas]} />
    </div>
  );
}

function Vide({ titre, detail, lien: l }: { titre: string; detail: string; lien?: { href: string; texte: string } }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line bg-surface-raised px-6 py-10 text-center">
      <p className="text-body font-semibold">{titre}</p>
      <p className="text-small text-ink-soft">{detail}</p>
      {l && <Link href={l.href} className="mt-2 text-small font-semibold">{l.texte}</Link>}
    </div>
  );
}
