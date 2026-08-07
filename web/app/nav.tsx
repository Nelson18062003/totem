"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { changerLangue, useLangue } from "@/app/langue";
import { autreLangue } from "@/lib/langue";
import { textesCharpente } from "@/lib/textes/charpente";
import type { EtatTerminal } from "@/lib/types";
import { IconCard, IconChart, IconGlobe, IconGrid, IconHash, IconHome, IconInbox, IconSettings } from "./icons";
import { Logo, Symbole } from "./marque";
import { useActualite } from "./veille";
import { BoutonRail, ElementMenu, PiluleOnglet } from "./ui/navigation";

// Les libellés vivent dans le dictionnaire (lib/textes/charpente.ts) : ici,
// seulement leur clé.
const liens = [
  { href: "/", cle: "accueil", Icone: IconHome },
  { href: "/cartes", cle: "comptes", Icone: IconCard },
  { href: "/encaissements", cle: "smsRecus", Icone: IconInbox },
  { href: "/analyse", cle: "analyse", Icone: IconChart },
  { href: "/actions", cle: "operations", Icone: IconGrid },
] as const;

// Sur grand écran, la place ne manque pas : le guichet complet est à un clic.
// Sur téléphone, ces deux pages se rejoignent depuis l'accueil et Opérations —
// la barre flottante reste à cinq boutons pour rester lisible.
const liensSecondaires = [
  { href: "/ussd", cle: "codeUssd", Icone: IconHash },
] as const;

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

/** L'état du terminal, en bas du rail. Le point ne parle pas : le texte, si. */
function EtatDuTerminal({
  terminal,
  replie,
  t,
}: {
  terminal: EtatTerminal | null;
  replie: boolean;
  t: (typeof textesCharpente)["fr"];
}) {
  const dit = terminal
    ? `${terminal.enLigne ? t.terminalActif : t.terminalMuet} · ${terminal.nom} · ${terminal.majTexte}`
    : t.aucunTerminal;

  // Le point n'est jamais seul porteur de l'information (WCAG 1.4.1) : replié,
  // c'est le nom accessible qui dit l'état ; déplié, c'est le texte écrit.
  const point = (
    <span
      aria-hidden
      className={`size-2 shrink-0 rounded-full ${
        !terminal ? "bg-contour" : terminal.enLigne ? "bg-positive" : "bg-negative"
      }`}
    />
  );

  if (replie) {
    return (
      <div className="flex h-controle items-center justify-center" title={dit}>
        {point}
        <span className="sr-only">{dit}</span>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <p className="flex items-center gap-2 text-small text-ink-soft">
        {point}
        {terminal ? (terminal.enLigne ? t.terminalActif : t.terminalMuet) : t.aucunTerminal}
      </p>
      {terminal ? (
        <p className="mt-1 text-caption text-ink-faint">
          {terminal.nom} · {terminal.majTexte}
        </p>
      ) : null}
    </div>
  );
}

export function Nav({ terminal }: { terminal: EtatTerminal | null }) {
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
  const messages = nonLus > 0 ? { nombre: nonLus, libelle: t.smsRecus } : undefined;

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

  return (
    <>
      {/* Rail latéral — desktop. Sa largeur est la variable --rail. */}
      <aside className="fixed inset-y-0 left-0 hidden w-rail flex-col border-r border-line bg-surface-raised px-3 py-6 transition-[width] duration-300 md:flex">
        <div className={`mb-8 ${replie ? "flex justify-center" : "px-3"}`}>
          {replie ? <Symbole size={24} className="text-laterite" /> : <Logo />}
        </div>

        <nav className="flex flex-col gap-1">
          {liens.map(({ href, cle, Icone }) => (
            <ElementMenu
              key={href}
              href={href}
              libelle={t[cle]}
              icone={Icone}
              actif={actif(href)}
              replie={replie}
              badge={href === "/encaissements" ? messages : undefined}
            />
          ))}

          <div className="mx-3 my-3 border-t border-line" />

          {liensSecondaires.map(({ href, cle, Icone }) => (
            <ElementMenu
              key={href}
              href={href}
              libelle={t[cle]}
              icone={Icone}
              actif={actif(href)}
              replie={replie}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1">
          <ElementMenu
            href="/reglages"
            libelle={t.reglages}
            icone={IconSettings}
            actif={actif("/reglages")}
            replie={replie}
          />
          {/* Un geste pour changer de langue, depuis n'importe quelle page.
              Le nom s'écrit en toutes lettres — jamais d'abréviation. */}
          <ElementMenu
            surAppui={() => changerLangue(autre.code)}
            libelle={autre.libelle}
            nom={autre.bascule}
            lang={autre.code}
            icone={IconGlobe}
            replie={replie}
          />

          <EtatDuTerminal terminal={terminal} replie={replie} t={t} />

          {/* La flèche de repli — un geste, mémorisé. */}
          <BoutonRail
            replie={replie}
            surBascule={basculer}
            libelleReplier={t.replierMenu}
            libelleDeplier={t.deplierMenu}
            libelleCourt={t.replier}
          />
        </div>
      </aside>

      {/* Barre flottante — mobile.
          Repos : icône seule. Actif : pilule pleine avec libellé.
          L'ombre appartient à la barre : c'est la seule du système. */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-300 md:hidden ${
          cachee ? "translate-y-[130%]" : "translate-y-0"
        }`}
      >
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface-raised p-2 shadow-barre">
          {liens.map(({ href, cle, Icone }) => (
            <PiluleOnglet
              key={href}
              href={href}
              libelle={t[cle]}
              icone={Icone}
              actif={actif(href)}
              badge={href === "/encaissements" ? messages : undefined}
            />
          ))}
        </div>
      </nav>
    </>
  );
}
