"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import {
  BRIN_A, BRIN_B, COUPE, CROISEMENTS, EPAISSEUR, VUE_BOITE,
} from "@noyau/marque";
import { textesDecouvrir } from "@noyau/textes/decouvrir";
import { BasculeLangue, useLangue } from "@/app/langue";
import { Symbole } from "../marque";
import {
  IconArrowDown, IconArrowUp, IconChevron, IconDoc, IconGrid, IconLock,
  IconRefresh,
} from "../icons";
import { LogoMtn, LogoOrange } from "../logos-operateurs";

/**
 * La vitrine — la seule page qui présente TOTEM à un visiteur sans compte.
 *
 * Elle est claire et silencieuse : de grands titres, une phrase par carte,
 * beaucoup d'air. Le seul objet qui bouge est le monolithe, un volume tissé
 * qui tourne lentement et s'incline sous le pointeur ; la tresse se tisse à
 * l'arrivée. Tout se fige pour qui préfère les interfaces immobiles.
 *
 * Elle ne montre AUCUNE donnée : pas un solde, pas un chiffre inventé, pas
 * un témoignage fabriqué. Elle dit ce que le produit fait, et tend la porte
 * de la connexion.
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

/** La Tresse qui se tisse : le même symbole que partout, mais chaque brin se
 *  trace de haut en bas à l'arrivée. La géométrie reste celle de
 *  `@noyau/marque` : on ne redessine rien, on anime le rendu. */
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
          longueur réelle ; le tissage s'anime alors d'un seul réglage. */}
      <path d={BRIN_A} pathLength={1} {...brin} mask={`url(#${id}-a)`} />
      <path d={BRIN_B} pathLength={1} {...brin} mask={`url(#${id}-b)`} />
    </svg>
  );
}

/** Le monolithe : un volume qui tourne lentement sur lui-même et s'incline
 *  sous le pointeur. Le tissage fait le tour de l'objet : la tresse sur les
 *  faces d'encre, la claustra sur les tranches. C'est le totem, debout,
 *  qu'on regarde sans pouvoir le toucher. */
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
            className={`${face} inset-0 flex-col gap-5 rounded-card bg-[#1b1a19]`}
            style={{ transform: "translateZ(3rem)" }}
          >
            <TresseTracee size={132} className="text-laterite-clair" />
            <span className="font-marque text-small font-bold uppercase tracking-marque text-[#f5f5f5]">
              Totem
            </span>
          </div>
          {/* Derrière : la même face, le tissage déjà posé */}
          <div
            className={`${face} inset-0 flex-col gap-5 rounded-card bg-[#1b1a19]`}
            style={{ transform: "rotateY(180deg) translateZ(3rem)" }}
          >
            <Symbole size={132} className="text-laterite-clair" />
            <span className="font-marque text-small font-bold uppercase tracking-marque text-[#f5f5f5]">
              Totem
            </span>
          </div>
          {/* Les tranches : la claustra, le mur ajouré fait le tour.
              Le motif se resserre : à 56 px il lirait trop gros ici. */}
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

/** Un écran du produit dans son cadre de téléphone : un bord d'encre épais,
 *  des angles très ronds, l'image telle que publiée sur le magasin. */
function Telephone({ src, className }: { src: string; className?: string }) {
  return (
    <div
      className={`w-60 shrink-0 overflow-hidden rounded-[2.4rem] border-[7px] border-[#1b1a19] bg-[#1b1a19] ${className ?? ""}`}
    >
      <img src={src} alt="" className="block w-full rounded-[1.9rem]" />
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* La page                                                                   */

const ICONES_GESTES = [IconLock, IconDoc, IconGrid, IconRefresh];

export default function Decouvrir() {
  const langue = useLangue();
  const t = textesDecouvrir[langue];

  return (
    <div className="vitrine min-h-dvh">
      {/* L'en-tête : la marque, deux liens, la langue, la porte */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <span className="inline-flex items-center gap-2.5">
            <Symbole size={22} className="text-laterite" />
            <span className="font-marque text-body font-bold uppercase tracking-marque">
              Totem
            </span>
          </span>
          <nav className="hidden items-center gap-6 text-small text-ink-soft md:flex">
            <a href="#fonctionnement" className="transition hover:text-ink">
              {t.navFonctionnement}
            </a>
            <a href="#securite" className="transition hover:text-ink">
              {t.navSecurite}
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <BasculeLangue />
            <Link
              href="/connexion"
              className="hidden rounded-full bg-ink px-4 py-1.5 text-small font-medium text-white transition hover:opacity-90 sm:block"
            >
              {t.navEntrer}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Le grand écran d'ouverture : centré, clair, une seule invitation */}
        <section className="px-4 pt-6 sm:pt-10">
          <div className="hero-halo mx-auto max-w-6xl rounded-[2.5rem] px-6 pb-16 pt-16 text-center sm:pb-20 sm:pt-24">
            <Revele>
              <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-caption font-medium text-ink-soft">
                <span className="size-1.5 rounded-full bg-laterite" />
                {t.heroPuce}
              </p>
              <h1 className="mx-auto mt-7 max-w-5xl text-balance text-[clamp(2.4rem,1.5rem+3.8vw,4.5rem)] font-bold leading-[1.04] tracking-[-0.03em]">
                {t.heroTitre1}
                <br />
                {t.heroTitre2}
              </h1>
              <p className="mx-auto mt-6 max-w-md text-pretty text-body leading-relaxed text-ink-soft sm:text-heading sm:font-normal">
                {t.heroSousTitre}
              </p>
            </Revele>
            <Revele delai={120}>
              <div className="mt-9 flex flex-col items-center gap-5">
                <Link
                  href="/connexion"
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-body font-medium text-white transition hover:opacity-90"
                >
                  {t.heroEntrer} <IconChevron size={16} />
                </Link>
                <a
                  href="#fonctionnement"
                  className="text-small font-medium text-ink-soft transition hover:text-ink"
                >
                  {t.heroVoir}
                </a>
              </div>
            </Revele>
          </div>

          {/* La ligne de confiance : les marques que le totem écoute */}
          <Revele delai={200}>
            <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-center gap-x-7 gap-y-3 px-6">
              <span className="text-caption font-medium uppercase tracking-[0.14em] text-ink-faint">
                {t.heroAvec}
              </span>
              <LogoMtn size={26} />
              <LogoOrange size={26} />
              <span className="text-small font-semibold text-ink-soft">Telegram</span>
            </div>
          </Revele>
        </section>

        {/* La grande grille : le monolithe et trois idées, une phrase chacune */}
        <section id="fonctionnement" className="scroll-mt-20 px-4 pt-16 sm:pt-24">
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
            <Revele className="h-full">
              <div className="flex h-full flex-col items-center justify-center gap-6 rounded-[2rem] bg-sable px-8 py-14">
                <Monolithe />
                <p className="max-w-xs text-center text-body font-medium text-ink">
                  {t.mosaiqueLegende}
                </p>
              </div>
            </Revele>
            <div className="grid gap-5">
              {/* Trois portes : les mots suffisent, en pilules */}
              <Revele className="h-full">
                <div className="flex h-full flex-col justify-center rounded-[2rem] bg-[#f6f5f3] px-8 py-9">
                  <h2 className="text-title font-bold tracking-tight">{t.cartePortesTitre}</h2>
                  <div className="mt-4 flex flex-wrap gap-2.5" aria-hidden>
                    {t.portes.map((porte) => (
                      <span
                        key={porte}
                        className="rounded-full border border-line bg-white px-4 py-2 text-small font-medium"
                      >
                        {porte}
                      </span>
                    ))}
                  </div>
                </div>
              </Revele>
              {/* Le menu USSD, montré : le code, puis des choix qui se
                  touchent au lieu de se composer */}
              <Revele delai={90} className="h-full">
                <div className="flex h-full flex-col justify-center rounded-[2rem] bg-[#f6f5f3] px-8 py-9">
                  <h2 className="text-title font-bold tracking-tight">{t.carteUssdTitre}</h2>
                  <div className="mt-4 flex flex-wrap items-center gap-2.5" aria-hidden>
                    <span className="rounded-full bg-ink px-4 py-2 text-small font-semibold tabnums text-white">
                      *126#
                    </span>
                    {t.ussdChoix.map((choix) => (
                      <span
                        key={choix}
                        className="rounded-full border border-line bg-white px-4 py-2 text-small font-medium"
                      >
                        {choix}
                      </span>
                    ))}
                  </div>
                </div>
              </Revele>
              {/* Les SMS, montrés : deux lignes comme dans l'application,
                  sans un montant inventé */}
              <Revele delai={180} className="h-full">
                <div className="flex h-full flex-col justify-center rounded-[2rem] bg-[#f6f5f3] px-8 py-9">
                  <h2 className="text-title font-bold tracking-tight">{t.carteSmsTitre}</h2>
                  <div className="mt-4 space-y-2" aria-hidden>
                    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
                      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[#e9f6ee] text-positive">
                        <IconArrowDown size={15} />
                      </span>
                      <LogoMtn size={20} />
                      <span className="h-2 w-24 rounded-full bg-surface-2" />
                      <span className="ml-auto h-2 w-10 rounded-full bg-[#bfe3cd]" />
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
                      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-surface-2 text-ink-soft">
                        <IconArrowUp size={15} />
                      </span>
                      <LogoOrange size={20} />
                      <span className="h-2 w-16 rounded-full bg-surface-2" />
                      <span className="ml-auto h-2 w-10 rounded-full bg-surface-2" />
                    </div>
                  </div>
                </div>
              </Revele>
            </div>
          </div>
        </section>

        {/* Les écrans du produit : les captures publiées sur le magasin,
            dans des cadres de téléphone qui filent sous le bord de la carte */}
        <section className="px-4 pt-20 sm:pt-28">
          <div className="mx-auto max-w-6xl">
            <Revele>
              <p className="text-center text-small font-medium uppercase tracking-[0.14em] text-laterite">
                {t.ecransSur}
              </p>
              <h2 className="mt-3 text-balance text-center text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] font-bold leading-tight tracking-[-0.02em]">
                {t.ecransTitre}
              </h2>
              <p className="mt-3 text-center text-body text-ink-soft">{t.ecransTexte}</p>
            </Revele>
            <Revele delai={120}>
              <div className="mt-10 h-[24rem] overflow-hidden rounded-[2.5rem] bg-sable px-6 sm:h-[30rem]">
                <div className="flex items-start justify-center gap-8 pt-12 sm:pt-14" aria-hidden>
                  <Telephone src="/vitrine/encaissements.png" className="mt-10 hidden sm:block" />
                  <Telephone src="/vitrine/caisses.png" />
                  <Telephone src="/vitrine/cartes.png" className="mt-10 hidden sm:block" />
                </div>
              </div>
            </Revele>
          </div>
        </section>

        {/* Les gestes du guichet : quatre cartes, une idée chacune */}
        <section className="px-4 pt-20 sm:pt-28">
          <div className="mx-auto max-w-6xl">
            <Revele>
              <h2 className="text-balance text-center text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] font-bold leading-tight tracking-[-0.02em]">
                {t.gestesTitre}
              </h2>
            </Revele>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {t.gestes.map((geste, i) => {
                const Icone = ICONES_GESTES[i];
                return (
                  <Revele key={geste.titre} delai={(i % 2) * 90} className="h-full">
                    <div className="flex h-full flex-col items-center rounded-[2rem] bg-[#f6f5f3] px-8 py-12 text-center">
                      <span className="inline-flex size-12 items-center justify-center rounded-full bg-white text-laterite">
                        <Icone size={22} />
                      </span>
                      <h3 className="mt-5 max-w-xs text-heading font-semibold tracking-tight">
                        {geste.titre}
                      </h3>
                      <p className="mt-2 max-w-xs text-small leading-relaxed text-ink-soft">
                        {geste.texte}
                      </p>
                    </div>
                  </Revele>
                );
              })}
            </div>
          </div>
        </section>

        {/* Le verrou : une seule grande carte, quatre phrases */}
        <section id="securite" className="scroll-mt-20 px-4 pt-20 sm:pt-28">
          <Revele>
            <div className="claustra-sable mx-auto max-w-6xl overflow-hidden rounded-[2.5rem]">
              <div className="relative px-6 py-16 text-center sm:py-20">
                <Symbole size={40} className="mx-auto text-laterite" />
                <h2 className="mt-6 text-balance text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] font-bold leading-tight tracking-[-0.02em]">
                  {t.securiteTitre}
                  <br />
                  {t.securiteSousTitre}
                </h2>
                <ul className="mx-auto mt-10 grid max-w-3xl gap-x-10 gap-y-5 text-left sm:grid-cols-2">
                  {t.securite.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-laterite" />
                      <span className="text-body leading-relaxed text-ink">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Revele>
        </section>

        {/* L'invitation finale */}
        <section className="px-4 py-24 text-center sm:py-32">
          <Revele>
            <h2 className="text-balance text-[clamp(2.2rem,1.5rem+3vw,4rem)] font-bold leading-tight tracking-[-0.03em]">
              {t.finTitre}
            </h2>
            <Link
              href="/connexion"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-body font-medium text-white transition hover:opacity-90"
            >
              {t.finEntrer} <IconChevron size={16} />
            </Link>
          </Revele>
        </section>
      </main>

      {/* Le pied de page */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <span className="inline-flex items-center gap-2.5">
              <Symbole size={22} className="text-laterite" />
              <span className="font-marque text-body font-bold uppercase tracking-marque">
                Totem
              </span>
            </span>
            <p className="mt-3 text-small leading-relaxed text-ink-soft">
              {t.piedDevise}
            </p>
          </div>
          <div className="flex flex-col items-start gap-5 md:items-end">
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-small text-ink-soft">
              <Link href="/connexion" className="transition hover:text-ink">
                {t.piedConnexion}
              </Link>
              <Link href="/confidentialite" className="transition hover:text-ink">
                {t.piedConfidentialite}
              </Link>
              <Link href="/suppression" className="transition hover:text-ink">
                {t.piedSuppression}
              </Link>
            </nav>
            <BasculeLangue />
          </div>
        </div>
      </footer>
    </div>
  );
}
