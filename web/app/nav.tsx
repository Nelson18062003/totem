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
 *
 * Le seuil de départ était de 8 px, et il était compté d'un événement de
 * défilement à l'autre : autant dire qu'il tombait au premier geste. Sur les
 * réglages, qui font 3,12 écrans, la barre était donc invisible sur 96 % de la
 * page — alors qu'une navigation masquée descend à 57 % d'usage contre 86 %
 * quand elle reste là. Une barre qui se cache avant même qu'on ait fini de
 * lire la première ligne n'est plus une navigation : c'est une surprise.
 *
 * Trois corrections :
 *   — le seuil passe à 80 px pour s'effacer ;
 *   — il se compte depuis le PIVOT, c'est-à-dire depuis l'endroit où le doigt
 *     a changé de sens, et non depuis l'événement précédent — sinon 80 px ne
 *     seraient jamais franchis d'un seul coup et la barre ne partirait jamais ;
 *   — le retour est plus facile que le départ (40 px) : on rend toujours une
 *     navigation plus vite qu'on ne la retire.
 *
 * Et dans les 80 premiers pixels de la page, elle est là, sans condition.
 */
const SEUIL_EFFACEMENT = 80;
const SEUIL_RETOUR = 40;

function useBarreEffacable() {
  const [cachee, setCachee] = useState(false);

  useEffect(() => {
    let dernierY = window.scrollY;
    let pivot = dernierY;
    let sens = 0;

    const surDefilement = () => {
      const y = window.scrollY;

      // Haut de page : la barre est là, on ne discute pas.
      if (y <= SEUIL_EFFACEMENT) {
        setCachee(false);
        dernierY = pivot = y;
        sens = 0;
        return;
      }

      const pas = y - dernierY;
      if (pas === 0) return;
      const nouveauSens = pas > 0 ? 1 : -1;
      // Le doigt a changé de sens : on recompte à partir d'ici.
      if (nouveauSens !== sens) {
        sens = nouveauSens;
        pivot = dernierY;
      }
      const parcouru = Math.abs(y - pivot);
      const seuil = nouveauSens > 0 ? SEUIL_EFFACEMENT : SEUIL_RETOUR;
      if (parcouru > seuil) {
        setCachee(nouveauSens > 0);
        pivot = y;
      }
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
        {/* LA BARRE DOIT POUVOIR RÉTRÉCIR.
            Elle était en largeur intrinsèque : à 320 px elle mesurait 348 et
            débordait de 14 px de CHAQUE CÔTÉ ; à 320 px avec un zoom de 200 %,
            642 px — « Accueil » et « Opérations » sortaient entièrement du
            cadre. Et rien ne le signalait : un élément `fixed` qui déborde
            symétriquement ne crée aucun défilement, donc `scrollWidth` reste
            propre. Le contrôle par débordement de document ne pouvait pas le
            voir.
            `max-w-full` la borne, `overflow-x-auto` rend les onglets extrêmes
            atteignables quand la place manque vraiment, et `scrollbar-none`
            évite qu'une barre de défilement mange la hauteur de la cible. */}
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-surface-raised p-2 shadow-barre [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
