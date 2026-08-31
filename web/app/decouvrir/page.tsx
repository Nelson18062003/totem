"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { LANGUES } from "@noyau/langue";
import {
  BRIN_A, BRIN_B, COUPE, CROISEMENTS, EPAISSEUR, VUE_BOITE,
} from "@noyau/marque";
import { textesDecouvrir } from "@noyau/textes/decouvrir";
import { changerLangue, useLangue } from "@/app/langue";
import { Symbole } from "../marque";
import {
  IconBubble, IconChevron, IconDoc, IconEyeOff, IconGrid, IconHash,
  IconIdentite, IconInbox, IconLock, IconRefresh,
} from "../icons";

/**
 * La vitrine — la seule page qui présente TOTEM à un visiteur sans compte.
 *
 * C'est une surface de marque au sens de docs/IDENTITE.md : l'encre, la
 * latérite et le sable y ont droit de cité, et le mouvement y est plus ample
 * que dans l'application. Trois gestes de plus que d'habitude, pas dix :
 * la tresse se tisse, le monolithe tourne, les sections se lèvent au
 * défilement — et tout se fige pour qui préfère les interfaces immobiles.
 *
 * Elle ne montre AUCUNE donnée : pas un solde, pas un chiffre inventé, pas
 * un témoignage fabriqué. Elle dit ce que le produit fait, avec les mots du
 * README, et tend la porte de la connexion.
 */

/* ------------------------------------------------------------------------- */
/* Les petits outils de la page                                              */

/** Une apparition au défilement : l'élément se lève quand il entre à l'écran. */
function Revele({
  children, delai = 0, className = "",
}: {
  children: React.ReactNode; delai?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entree]) => {
        if (entree.isIntersecting) {
          el.classList.add("vu");
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`revele ${className}`}
      style={delai ? { transitionDelay: `${delai}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** La bascule de langue, en habit d'encre — même geste que partout ailleurs. */
function BasculeSombre({ etiquette }: { etiquette: string }) {
  const langue = useLangue();
  return (
    <div
      role="group"
      aria-label={etiquette}
      className="inline-flex shrink-0 overflow-hidden rounded-full border vitrine-ligne"
    >
      {LANGUES.map(({ code, libelle, bascule }) => (
        <button
          key={code}
          lang={code}
          onClick={() => code !== langue && changerLangue(code)}
          aria-pressed={code === langue}
          title={code === langue ? undefined : bascule}
          className={`px-3 py-1.5 text-caption font-medium transition ${
            code === langue
              ? "bg-[#f5f5f5] text-[#141414]"
              : "vitrine-texte-doux hover:text-white"
          }`}
        >
          {libelle}
        </button>
      ))}
    </div>
  );
}

/** La Tresse qui se tisse : le même symbole que partout, mais chaque brin se
 *  trace de haut en bas à l'arrivée. La géométrie reste celle de
 *  `@noyau/marque` — on ne redessine rien, on anime le rendu. */
function TresseTracee({ size, className }: { size: number; className?: string }) {
  const id = useId();
  const brin = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: EPAISSEUR,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      viewBox={VUE_BOITE}
      width={size}
      height={size}
      className={`tresse-tracee ${className ?? ""}`}
      aria-hidden
    >
      <defs>
        {(["a", "b"] as const).map((brinId) => (
          <mask
            key={brinId}
            id={`${id}-${brinId}`}
            maskUnits="userSpaceOnUse"
            x={-0.2}
            y={-0.4}
            width={32.4}
            height={32.8}
          >
            <rect x={-0.2} y={-0.4} width={32.4} height={32.8} fill="#fff" />
            {CROISEMENTS.filter((c) => c.dessous === brinId).map((c) => (
              <rect
                key={c.y}
                x={COUPE.x}
                y={COUPE.y}
                width={COUPE.largeur}
                height={COUPE.hauteur}
                fill="#000"
                transform={`translate(16,${c.y}) rotate(${COUPE.rotation})`}
              />
            ))}
          </mask>
        ))}
      </defs>
      {/* pathLength=1 : la longueur du tracé vaut « 1 », quelle que soit sa
          longueur réelle — le tissage s'anime alors d'un seul réglage. */}
      <path d={BRIN_A} pathLength={1} {...brin} mask={`url(#${id}-a)`} />
      <path d={BRIN_B} pathLength={1} {...brin} mask={`url(#${id}-b)`} />
    </svg>
  );
}

/** Le monolithe : un volume qui tourne lentement sur lui-même et s'incline
 *  sous le pointeur. Le tissage fait le tour de l'objet — la tresse sur les
 *  faces d'encre, la claustra sur les tranches de sable. C'est le totem,
 *  debout, qu'on regarde sans pouvoir le toucher. */
function Monolithe() {
  const ref = useRef<HTMLDivElement>(null);

  function incliner(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--inclinaison-x", `${(-y * 14).toFixed(1)}deg`);
    el.style.setProperty("--inclinaison-y", `${(x * 18).toFixed(1)}deg`);
  }
  function reposer() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--inclinaison-x", "0deg");
    el.style.setProperty("--inclinaison-y", "0deg");
  }

  // Largeur 15rem, hauteur 20rem, épaisseur 6rem : les faces se placent à la
  // demi-mesure de chaque côté (3, 7.5 et 10rem).
  const face = "absolute flex items-center justify-center";
  return (
    <div
      ref={ref}
      onPointerMove={incliner}
      onPointerLeave={reposer}
      className="monolithe-scene flex justify-center py-6"
      aria-hidden
    >
      <div className="monolithe-inclinaison">
        <div className="monolithe">
          {/* Devant : l'encre, et la tresse qui se tisse à l'arrivée */}
          <div
            className={`${face} inset-0 flex-col gap-5 rounded-card border border-[#3d332c] bg-[#1b1a19]`}
            style={{ transform: "translateZ(3rem)" }}
          >
            <TresseTracee size={132} className="text-laterite-clair" />
            <span className="font-marque text-small font-bold uppercase tracking-marque text-[#f5f5f5]">
              Totem
            </span>
          </div>
          {/* Derrière : la même face, le tissage déjà posé */}
          <div
            className={`${face} inset-0 flex-col gap-5 rounded-card border border-[#3d332c] bg-[#1b1a19]`}
            style={{ transform: "rotateY(180deg) translateZ(3rem)" }}
          >
            <Symbole size={132} className="text-laterite-clair" />
            <span className="font-marque text-small font-bold uppercase tracking-marque text-[#f5f5f5]">
              Totem
            </span>
          </div>
          {/* Les tranches : la claustra — le mur ajouré fait le tour */}
          {/* Le motif se resserre sur la tranche : à 56 px il lirait trop
              gros sur une face de 6 rem. */}
          <div
            className={`${face} claustra inset-y-0 w-24 rounded-card`}
            style={{ left: "calc(50% - 3rem)", transform: "rotateY(-90deg) translateZ(7.5rem)", backgroundSize: "34px auto" }}
          />
          <div
            className={`${face} claustra inset-y-0 w-24 rounded-card`}
            style={{ left: "calc(50% - 3rem)", transform: "rotateY(90deg) translateZ(7.5rem)", backgroundSize: "34px auto" }}
          />
          {/* Le chapeau et le pied : la latérite pleine */}
          <div
            className={`${face} inset-x-0 h-24 rounded-card bg-laterite`}
            style={{ top: "calc(50% - 3rem)", transform: "rotateX(90deg) translateZ(10rem)" }}
          />
          <div
            className={`${face} inset-x-0 h-24 rounded-card bg-laterite`}
            style={{ top: "calc(50% - 3rem)", transform: "rotateX(-90deg) translateZ(10rem)" }}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* La page                                                                   */

const ICONES_GESTES = [IconHash, IconInbox, IconLock, IconDoc, IconGrid, IconRefresh];
const ICONES_VERROU = [IconLock, IconIdentite, IconEyeOff, IconBubble];

export default function Decouvrir() {
  const langue = useLangue();
  const t = textesDecouvrir[langue];

  return (
    <div className="vitrine min-h-dvh">
      {/* L'en-tête — la marque, la langue, la porte */}
      <header className="sticky top-0 z-40 border-b vitrine-ligne bg-[#141414]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <span className="inline-flex items-center gap-2.5">
            <Symbole size={22} className="text-laterite-clair" />
            <span className="font-marque text-body font-bold uppercase tracking-marque">
              Totem
            </span>
          </span>
          <nav className="hidden items-center gap-6 text-small vitrine-texte-doux md:flex">
            <a href="#fonctionnement" className="transition hover:text-white">
              {t.navFonctionnement}
            </a>
            <a href="#securite" className="transition hover:text-white">
              {t.navSecurite}
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <BasculeSombre etiquette={t.piedLangue} />
            <Link
              href="/connexion"
              className="hidden rounded-full bg-laterite px-4 py-1.5 text-small font-medium text-white transition hover:bg-laterite-clair hover:text-[#141414] sm:block"
            >
              {t.navEntrer}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Le grand écran d'ouverture */}
        <section className="vitrine-foyer relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24 lg:pt-20">
            <div>
              <Revele>
                <p className="text-small font-medium uppercase tracking-[0.14em] text-laterite-clair">
                  {t.heroSur}
                </p>
                <h1 className="mt-4 text-balance text-[clamp(2.4rem,1.6rem+3.4vw,4.2rem)] font-semibold leading-[1.05] tracking-tight">
                  {t.heroTitre1}
                  <br />
                  <span className="text-laterite-clair">{t.heroTitre2}</span>
                </h1>
                <p className="mt-6 max-w-xl text-pretty text-heading font-normal leading-relaxed vitrine-texte-doux">
                  {t.heroSousTitre}
                </p>
              </Revele>
              <Revele delai={140}>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link
                    href="/connexion"
                    className="rounded-btn bg-laterite px-6 py-3.5 text-body font-medium text-white transition hover:bg-laterite-clair hover:text-[#141414]"
                  >
                    {t.heroEntrer}
                  </Link>
                  <a
                    href="#fonctionnement"
                    className="inline-flex items-center gap-1.5 rounded-btn border vitrine-ligne px-6 py-3.5 text-body font-medium transition hover:border-laterite-clair"
                  >
                    {t.heroVoir} <IconChevron size={16} />
                  </a>
                </div>
                <p className="mt-6 flex items-center gap-2 text-small vitrine-texte-doux">
                  <IconLock size={15} className="shrink-0 text-laterite-clair" />
                  {t.heroNote}
                </p>
              </Revele>
            </div>
            <Revele delai={200} className="hidden sm:block">
              <Monolithe />
            </Revele>
          </div>
        </section>

        {/* Le bandeau qui défile — ce qui passe par le totem */}
        <div className="bandeau-defile border-y vitrine-ligne py-5" aria-hidden>
          <div>
            {[0, 1].map((moitie) => (
              <ul key={moitie} className="flex items-center gap-8 pr-8">
                {t.bandeau.map((mot) => (
                  <li key={mot} className="flex items-center gap-8 whitespace-nowrap">
                    <span className="text-heading font-medium text-[#6d6862]">{mot}</span>
                    <span className="text-caption text-laterite">◆</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        {/* Les trois traits — planté, traversé, double */}
        <section id="fonctionnement" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
            <Revele>
              <h2 className="max-w-2xl text-balance text-[clamp(1.8rem,1.3rem+2vw,2.8rem)] font-semibold leading-tight tracking-tight">
                {t.traitsTitre}
              </h2>
              <p className="mt-4 max-w-2xl text-body leading-relaxed vitrine-texte-doux">
                {t.traitsSousTitre}
              </p>
            </Revele>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {t.traits.map((trait, i) => (
                <Revele key={trait.titre} delai={i * 90}>
                  <article className="vitrine-carte h-full rounded-card p-6 transition hover:border-laterite">
                    <Symbole size={26} className="text-laterite-clair" />
                    <h3 className="mt-5 text-heading font-semibold">{trait.titre}</h3>
                    <p className="mt-2.5 text-small leading-relaxed vitrine-texte-doux">
                      {trait.texte}
                    </p>
                  </article>
                </Revele>
              ))}
            </div>
          </div>
        </section>

        {/* Les gestes — sur le clair, comme l'application elle-même */}
        <section className="bg-surface text-ink">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
            <Revele>
              <h2 className="max-w-2xl text-balance text-[clamp(1.8rem,1.3rem+2vw,2.8rem)] font-semibold leading-tight tracking-tight">
                {t.gestesTitre}
              </h2>
              <p className="mt-4 max-w-2xl text-body leading-relaxed text-ink-soft">
                {t.gestesSousTitre}
              </p>
            </Revele>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {t.gestes.map((geste, i) => {
                const Icone = ICONES_GESTES[i];
                return (
                  <Revele key={geste.titre} delai={(i % 3) * 90}>
                    <article className="h-full rounded-card border border-line bg-surface-raised p-6 transition hover:border-laterite">
                      <span className="inline-flex size-11 items-center justify-center rounded-card bg-sable text-laterite">
                        <Icone size={22} />
                      </span>
                      <h3 className="mt-5 text-body font-semibold">{geste.titre}</h3>
                      <p className="mt-2 text-small leading-relaxed text-ink-soft">
                        {geste.texte}
                      </p>
                    </article>
                  </Revele>
                );
              })}
            </div>
          </div>
        </section>

        {/* Le verrou — l'encre, la claustra en voile */}
        <section id="securite" className="claustra-encre scroll-mt-20 border-y vitrine-ligne">
          <div className="relative mx-auto max-w-6xl px-5 py-20 lg:py-28">
            <Revele>
              <h2 className="max-w-2xl text-balance text-[clamp(1.8rem,1.3rem+2vw,2.8rem)] font-semibold leading-tight tracking-tight">
                {t.securiteTitre}
              </h2>
              <p className="mt-4 max-w-2xl text-body leading-relaxed vitrine-texte-doux">
                {t.securiteSousTitre}
              </p>
            </Revele>
            <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2">
              {t.securite.map((point, i) => {
                const Icone = ICONES_VERROU[i];
                return (
                  <Revele key={point.titre} delai={(i % 2) * 90}>
                    <div className="flex items-start gap-4">
                      <span className="mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-card border vitrine-ligne bg-[#1b1a19] text-laterite-clair">
                        <Icone size={22} />
                      </span>
                      <div>
                        <h3 className="text-body font-semibold">{point.titre}</h3>
                        <p className="mt-1.5 text-small leading-relaxed vitrine-texte-doux">
                          {point.texte}
                        </p>
                      </div>
                    </div>
                  </Revele>
                );
              })}
            </div>
          </div>
        </section>

        {/* Les trois portes — le sable, comme une surface de marque */}
        <section className="bg-sable text-ink">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
            <Revele>
              <h2 className="max-w-2xl text-balance text-[clamp(1.8rem,1.3rem+2vw,2.8rem)] font-semibold leading-tight tracking-tight">
                {t.surfacesTitre}
              </h2>
              <p className="mt-4 max-w-2xl text-body leading-relaxed text-ink-soft">
                {t.surfacesSousTitre}
              </p>
            </Revele>
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              {t.surfaces.map((surface, i) => (
                <Revele key={surface.titre} delai={i * 90}>
                  <div className="border-t-2 border-laterite pt-5">
                    <p className="text-caption font-medium tabnums text-laterite">
                      {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-2 text-heading font-semibold">{surface.titre}</h3>
                    <p className="mt-2.5 text-small leading-relaxed text-ink-soft">
                      {surface.texte}
                    </p>
                  </div>
                </Revele>
              ))}
            </div>
          </div>
        </section>

        {/* L'invitation — la claustra pleine, la porte au milieu */}
        <section className="claustra-sable text-ink">
          <div className="relative mx-auto max-w-6xl px-5 py-24 text-center lg:py-32">
            <Revele>
              <Symbole size={56} className="mx-auto text-laterite" />
              <h2 className="mt-7 text-balance text-[clamp(2rem,1.4rem+2.6vw,3.4rem)] font-semibold leading-tight tracking-tight">
                {t.finTitre}
              </h2>
              <p className="mt-4 text-heading font-normal text-ink-soft">
                {t.finSousTitre}
              </p>
              <Link
                href="/connexion"
                className="mt-9 inline-block rounded-btn bg-ink px-7 py-3.5 text-body font-medium text-white transition hover:opacity-90"
              >
                {t.finEntrer}
              </Link>
            </Revele>
          </div>
        </section>
      </main>

      {/* Le pied de page */}
      <footer className="border-t vitrine-ligne">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <span className="inline-flex items-center gap-2.5">
              <Symbole size={22} className="text-laterite-clair" />
              <span className="font-marque text-body font-bold uppercase tracking-marque">
                Totem
              </span>
            </span>
            <p className="mt-3 text-small leading-relaxed vitrine-texte-doux">
              {t.piedDevise}
            </p>
          </div>
          <div className="flex flex-col items-start gap-5 md:items-end">
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-small vitrine-texte-doux">
              <Link href="/connexion" className="transition hover:text-white">
                {t.piedConnexion}
              </Link>
              <Link href="/confidentialite" className="transition hover:text-white">
                {t.piedConfidentialite}
              </Link>
              <Link href="/suppression" className="transition hover:text-white">
                {t.piedSuppression}
              </Link>
            </nav>
            <BasculeSombre etiquette={t.piedLangue} />
          </div>
        </div>
      </footer>
    </div>
  );
}
