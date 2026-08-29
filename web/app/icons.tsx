// Le jeu d'icônes, dessiné pour le NAVIGATEUR.
//
// La géométrie ne vit pas ici : elle est dans `@noyau/icones`, partagée avec
// l'application du téléphone. Ce fichier ne fait que la rendre en <svg>, avec
// les mêmes noms qu'avant (`IconHome`, `IconCard`…) — aucun écran n'a bougé.

import { ICONES, TRAIT, type Forme, type NomIcone } from "@noyau/icones";

type P = { className?: string; size?: number };

function base(size = 20) {
  return {
    width: size, height: size, viewBox: TRAIT.vueBoite, fill: "none",
    stroke: "currentColor", strokeWidth: TRAIT.epaisseur,
    strokeLinecap: TRAIT.bout, strokeLinejoin: TRAIT.jointure,
  };
}

function tracer(forme: Forme, i: number) {
  if (forme.f === "path") return <path key={i} d={forme.d} />;
  if (forme.f === "rect") {
    return <rect key={i} x={forme.x} y={forme.y} width={forme.w}
                 height={forme.h} {...(forme.r ? { rx: forme.r } : {})} />;
  }
  return <circle key={i} cx={forme.cx} cy={forme.cy} r={forme.r} />;
}

/** Fabrique le composant d'une icône du jeu. */
function icone(nom: NomIcone) {
  const formes = ICONES[nom] as readonly Forme[];
  const Composant = ({ size, className }: P) => (
    <svg {...base(size)} className={className}>{formes.map(tracer)}</svg>
  );
  Composant.displayName = `Icon${nom}`;
  return Composant;
}

export const IconHome = icone("Home");
export const IconCard = icone("Card");
export const IconInbox = icone("Inbox");
export const IconChart = icone("Chart");
export const IconGrid = icone("Grid");
export const IconArrowDown = icone("ArrowDown");
export const IconArrowUp = icone("ArrowUp");
export const IconPlus = icone("Plus");
export const IconSearch = icone("Search");
export const IconClose = icone("Close");
export const IconSettings = icone("Settings");
export const IconDownload = icone("Download");
export const IconCopy = icone("Copy");
export const IconRefund = icone("Refund");
export const IconLock = icone("Lock");
export const IconList = icone("List");
export const IconWallet = icone("Wallet");
export const IconPhone = icone("Phone");
export const IconBank = icone("Bank");
export const IconIdentite = icone("Identite");
export const IconChevron = icone("Chevron");
export const IconGlobe = icone("Globe");
export const IconRefresh = icone("Refresh");
export const IconHash = icone("Hash");
export const IconDoc = icone("Doc");
export const IconTransfer = icone("Transfer");
export const IconMegaphone = icone("Megaphone");
export const IconBubble = icone("Bubble");
export const IconMail = icone("Mail");
export const IconEye = icone("Eye");
export const IconEyeOff = icone("EyeOff");
export const IconPuceSim = icone("PuceSim");
