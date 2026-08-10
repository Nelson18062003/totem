"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { changerLangue, useLangue } from "@/app/langue";
import { autreLangue } from "@/lib/langue";
import { textesCharpente } from "@/lib/textes/charpente";
import { peut, type Pouvoir } from "@/lib/roles";
import type { Role } from "@/lib/session";
import type { EtatTerminal } from "@/lib/types";
import { IconCard, IconChart, IconChevron, IconGlobe, IconGrid, IconHash, IconHome, IconInbox, IconLock, IconSettings } from "./icons";
import { Logo, Symbole } from "./marque";
import { Pastille, useActualite } from "./veille";

// Les libellés vivent dans le dictionnaire (lib/textes/charpente.ts) : ici,
// seulement leur clé — et le POUVOIR qu'il faut pour que le lien existe.
//
// POURQUOI UN LIEN QU'ON NE PEUT PAS SUIVRE EST PIRE QUE PAS DE LIEN
// Un lecteur qui voit « Opérations » l'ouvre, se fait renvoyer à l'accueil, et
// n'apprend rien : pour lui, TOTEM vient de tomber en panne. Un opérateur qui
// voit « Code USSD » vit la même chose. Le menu doit dire ce que la personne
// peut faire — pas ce que la plateforme sait faire.
const liens = [
  { href: "/", cle: "accueil", Icone: IconHome, pouvoir: "lire" },
  { href: "/cartes", cle: "comptes", Icone: IconCard, pouvoir: "lire" },
  { href: "/encaissements", cle: "smsRecus", Icone: IconInbox, pouvoir: "lire" },
  { href: "/analyse", cle: "analyse", Icone: IconChart, pouvoir: "lire" },
  { href: "/actions", cle: "operations", Icone: IconGrid, pouvoir: "operer" },
] as const satisfies readonly { href: string; cle: string; Icone: unknown; pouvoir: Pouvoir }[];

// Sur grand écran, la place ne manque pas : le guichet complet est à un clic.
// Sur téléphone, ces deux pages se rejoignent depuis l'accueil et Opérations —
// la barre flottante reste à cinq boutons pour rester lisible.
const liensSecondaires = [
  { href: "/ussd", cle: "codeUssd", Icone: IconHash, pouvoir: "sortir_argent" },
  { href: "/gens", cle: "lesGens", Icone: IconLock, pouvoir: "gerer_les_gens" },
  // Ce que TOTEM envoie, et ce qu'on veut recevoir. Tout le monde y a droit :
  // c'est sa propre boîte qu'on y règle, pas celle du commerce.
  { href: "/messages", cle: "lesMessages", Icone: IconInbox, pouvoir: "lire" },
] as const satisfies readonly { href: string; cle: string; Icone: unknown; pouvoir: Pouvoir }[];

/**
 * La barre mobile s'efface pendant qu'on descend dans la page — le contenu
 * reprend toute la hauteur — et revient dès qu'on remonte, ou en haut de page.
 */
function useBarreEffacable() {
  const [cachee, setCachee] = useState(false);

  useEffect(() => {
    let dernierY = window.scrollY;
    const surDefilement = () => {
      const y = window.scrollY;
      if (y < 24) setCachee(false);
      else if (Math.abs(y - dernierY) > 8) setCachee(y > dernierY);
      dernierY = y;
    };
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => window.removeEventListener("scroll", surDefilement);
  }, []);

  return cachee;
}

export function Nav({ terminal, role }:
                    { terminal: EtatTerminal | null; role: Role | null }) {
  // Hors session, `role` est nul : la coquille sert encore /connexion et
  // /invitation, où il n'y a rien à proposer.
  const visibles = liens.filter((l) => role !== null && peut(role, l.pouvoir));
  const visiblesSecondaires =
    liensSecondaires.filter((l) => role !== null && peut(role, l.pouvoir));
  const path = usePathname();
  const langue = useLangue();
  const t = textesCharpente[langue];
  const cachee = useBarreEffacable();
  // La bascule de langue du rail : le bouton porte le nom de l'AUTRE langue,
  // en toutes lettres, dans cette langue — celle qui la cherche peut la lire.
  // Sur téléphone, elle vit en évidence sur l'accueil et dans les réglages :
  // la barre flottante n'a pas la place d'un mot entier, et on n'abrège pas.
  const autre = autreLangue(langue);
  const actif = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  // La veille : rafraîchit l'écran dès qu'un SMS entre en base, et porte la
  // pastille des non-lus. Elle vit ici parce que la barre est sur chaque page.
  const nonLus = useActualite();

  // Le rail se replie d'une flèche (icônes seules) et s'en souvient. La page
  // suit le mouvement : la même variable --rail pilote sa marge gauche.
  const [replie, setReplie] = useState(false);
  useEffect(() => {
    const su = localStorage.getItem("totem-rail") === "replie";
    setReplie(su);
    document.documentElement.dataset.rail = su ? "replie" : "";
  }, []);
  const basculer = () => {
    const apres = !replie;
    setReplie(apres);
    localStorage.setItem("totem-rail", apres ? "replie" : "deplie");
    document.documentElement.dataset.rail = apres ? "replie" : "";
  };

  const classeLien = (on: boolean) =>
    `relative flex items-center gap-3 rounded-btn py-2 text-body transition ${
      replie ? "justify-center px-0" : "px-3"
    } ${on ? "bg-surface-2 font-medium text-ink"
          : "text-ink-soft hover:bg-surface-2/70 hover:text-ink"}`;

  // Replié, la pastille devient un point sur l'icône — le chiffre n'a plus
  // la place, l'information reste.
  const point = (
    <span className="absolute right-2.5 top-1.5 size-2 rounded-full bg-ink" />
  );

  return (
    <>
      {/* Rail latéral — desktop. Sa largeur est la variable --rail. */}
      <aside className="fixed inset-y-0 left-0 hidden w-[var(--rail)] flex-col border-r border-line bg-surface-raised px-3 py-6 transition-[width] duration-300 md:flex">
        <div className={`mb-8 ${replie ? "flex justify-center" : "px-3"}`}>
          {replie ? <Symbole size={22} className="text-laterite" /> : <Logo />}
        </div>
        <nav className="flex flex-col gap-0.5">
          {visibles.map(({ href, cle, Icone }) => (
            <Link key={href} href={href} title={replie ? t[cle] : undefined}
              className={classeLien(actif(href))}>
              <Icone size={18} className="shrink-0" />
              {!replie && t[cle]}
              {href === "/encaissements" &&
                (replie ? nonLus > 0 && point : <Pastille n={nonLus} />)}
            </Link>
          ))}
          <div className="mx-3 my-3 border-t border-line" />
          {visiblesSecondaires.map(({ href, cle, Icone }) => (
            <Link key={href} href={href} title={replie ? t[cle] : undefined}
              className={classeLien(actif(href))}>
              <Icone size={18} className="shrink-0" />
              {!replie && t[cle]}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <Link href="/reglages" title={replie ? t.reglages : undefined}
            className={classeLien(actif("/reglages"))}>
            <IconSettings size={18} className="shrink-0" />
            {!replie && t.reglages}
          </Link>
          {/* Un geste pour changer de langue, depuis n'importe quelle page.
              Le nom s'écrit en toutes lettres — jamais d'abréviation. */}
          <button onClick={() => changerLangue(autre.code)}
            aria-label={autre.bascule} title={autre.bascule}
            lang={autre.code}
            className={`${classeLien(false)} w-full`}>
            <IconGlobe size={18} className="shrink-0" />
            {!replie && autre.libelle}
          </button>
          <div className={`mt-4 ${replie ? "flex justify-center" : "px-3"}`}>
            {terminal ? (
              replie ? (
                // Replié : l'état du terminal tient dans son point — le
                // survol dit le reste.
                <span title={`${terminal.enLigne ? t.terminalActif : t.terminalMuet} · ${terminal.nom} · ${terminal.majTexte}`}
                  className={`size-2 rounded-full ${terminal.enLigne ? "bg-positive" : "bg-negative"}`} />
              ) : (
                <>
                  <p className="flex items-center gap-2 text-small text-ink-soft">
                    <span className={`size-1.5 rounded-full ${terminal.enLigne ? "bg-positive" : "bg-negative"}`} />
                    {terminal.enLigne ? t.terminalActif : t.terminalMuet}
                  </p>
                  <p className="mt-1 text-caption text-ink-faint">
                    {terminal.nom} · {terminal.majTexte}
                  </p>
                </>
              )
            ) : (
              <p className="flex items-center gap-2 text-small text-ink-faint">
                <span className="size-1.5 rounded-full bg-surface-3" />
                {!replie && t.aucunTerminal}
              </p>
            )}
          </div>
          {/* La flèche de repli — un geste, mémorisé. */}
          <button onClick={basculer}
            aria-label={replie ? t.deplierMenu : t.replierMenu}
            title={replie ? t.deplierMenu : t.replierMenu}
            className={`mt-4 flex w-full items-center gap-3 rounded-btn py-2 text-small text-ink-faint transition hover:bg-surface-2/70 hover:text-ink ${
              replie ? "justify-center px-0" : "px-3"
            }`}>
            <IconChevron size={16}
              className={`shrink-0 transition-transform duration-300 ${replie ? "" : "rotate-180"}`} />
            {!replie && t.replier}
          </button>
        </div>
      </aside>

      {/* Barre flottante — mobile.
          Repos : icône seule. Actif : pilule pleine avec libellé. */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-300 md:hidden ${
          cachee ? "translate-y-[130%]" : "translate-y-0"
        }`}>
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface-raised p-1.5 shadow-[0_8px_28px_-8px_rgba(22,23,26,0.22)]">
          {visibles.map(({ href, cle, Icone }) => {
            const on = actif(href);
            return (
              <Link key={href} href={href} aria-label={t[cle]} aria-current={on ? "page" : undefined}
                className={`flex items-center justify-center gap-2 rounded-full transition-all duration-200 ${
                  on
                    ? "bg-ink px-4 py-2.5 text-white"
                    : "size-11 text-ink-faint active:bg-surface-2"
                }`}>
                <span className="relative">
                  <Icone size={20} />
                  {/* Le point des nouveaux SMS, version mobile : discret sur
                      l'icône de la boîte quand elle n'est pas la page active. */}
                  {href === "/encaissements" && !on && nonLus > 0 && (
                    <span className="absolute -right-1 -top-1 size-2 rounded-full bg-ink" />
                  )}
                </span>
                {on && <span className="text-small font-medium">{t[cle]}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
