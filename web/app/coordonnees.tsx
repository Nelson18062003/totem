"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { pdfCoordonnees } from "@/lib/pdf-rib";
import { textesAccueil } from "@/lib/textes/accueil";
import { useLangue } from "@/app/langue";
import { Feuille } from "./feuille";
import { IconCopy, IconDownload, IconEye, IconIdentite } from "./icons";
import { LogoOperateur } from "./logos-operateurs";

/**
 * Les coordonnées d'une carte — le « RIB » de la SIM. Le propriétaire les
 * montre à qui veut lui envoyer de l'argent : son nom, son numéro, son
 * réseau. D'un geste il les copie (pour les coller dans un message), les
 * ouvre pour les relire, ou les télécharge en PDF — un vrai fichier, comme
 * le relevé d'identité d'une banque.
 *
 * Aucune donnée n'est inventée : le numéro vient de ce que la carte déclare
 * ou de ce que le propriétaire a inscrit, le nom de ce qu'il a inscrit dans
 * les Réglages. Sans nom, la fiche le dit et renvoie aux Réglages.
 */

/** « 237652236856 » → « +237 652 23 68 56 » : un numéro se lit par tranches. */
export function formaterNumero(numero: string): string {
  const d = (numero || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 12 && d.startsWith("237")) {
    const n = d.slice(3);
    return `+237 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  }
  if (d.length === 9) {
    return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
  }
  return numero;
}

/** Le nom commercial du service — ce qu'on écrit sur la ligne « réseau ». */
function service(operateur: string): string {
  if (operateur === "MTN") return "MTN Mobile Money";
  if (operateur === "Orange") return "Orange Money";
  return operateur || "Mobile Money";
}

/**
 * Un geste de copie, partout le même : il dit ce qu'il a fait, puis
 * s'efface. Sur la carte, il vit contre le numéro ; dans la feuille, il
 * emporte les coordonnées entières.
 */
export function BoutonCopier({
  valeur,
  libelle,
  libelleFait,
  clair = false,
}: {
  valeur: string;
  libelle: string;
  libelleFait: string;
  // Sur la carte sombre, le bouton se dessine en clair.
  clair?: boolean;
}) {
  const [fait, setFait] = useState(false);
  const copier = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(valeur);
      setFait(true);
      setTimeout(() => setFait(false), 1800);
    } catch {
      /* presse-papiers refusé : le texte reste lisible à l'écran */
    }
  };
  return (
    <button
      onClick={copier}
      aria-label={fait ? libelleFait : libelle}
      title={fait ? libelleFait : libelle}
      className={`grid size-7 shrink-0 place-items-center rounded-full border transition ${
        clair
          ? "border-white/35 text-white/80 hover:border-white hover:text-white"
          : "border-line text-ink-soft hover:border-ink hover:text-ink"
      }`}
    >
      {fait ? <span className="text-[11px] leading-none">✓</span> : <IconCopy size={13} />}
    </button>
  );
}

export function Coordonnees({
  carte,
}: {
  carte: { nom: string; numero: string; operateur: string; libelle: string };
}) {
  const langue = useLangue();
  const t = textesAccueil[langue];
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  // Le portail n'existe qu'une fois la page montée côté navigateur.
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);

  const nom = carte.nom.trim();
  const numero = formaterNumero(carte.numero);
  const reseau = service(carte.operateur);

  // Le texte à coller dans un message : nom, numéro, réseau — chacun sur sa
  // ligne, sans étiquette, prêt à envoyer tel quel.
  const texteACopier = [nom, numero, reseau].filter(Boolean).join("\n");

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texteACopier);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setCopie(false);
    }
  };

  // Le document : un VRAI fichier PDF, assemblé dans le navigateur. Rien ne
  // part sur le réseau, et le fichier s'ouvre ou se joint comme un autre.
  const fabriquer = () =>
    new Blob([pdfCoordonnees({
      nom, numero, operateur: carte.operateur, service: reseau,
      libelle: carte.libelle, titre: t.coordonneesTitre,
      etiquetteNom: t.coordNom, etiquetteNumero: t.coordNumero,
      etiquetteReseau: t.coordReseau, pied: t.coordPied,
    })], { type: "application/pdf" });

  const nomFichier = () =>
    `totem-${(nom || carte.libelle).replace(/[^\w]+/g, "-").toLowerCase()}.pdf`;

  const telecharger = () => {
    const url = URL.createObjectURL(fabriquer());
    const a = document.createElement("a");
    a.href = url;
    a.download = nomFichier();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const voir = () => {
    const url = URL.createObjectURL(fabriquer());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const feuille = (
    <Feuille
      entete={
        <>
          <p className="text-caption uppercase tracking-wider text-ink-faint">
            {carte.libelle}
          </p>
          <h2 className="mt-0.5 text-heading font-semibold">{t.coordonneesTitre}</h2>
        </>
      }
      libelleFermer={t.coordFermer}
      onFermer={() => setOuvert(false)}
      pied={
        <div className="flex flex-col gap-2">
          <button
            onClick={copier}
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-ink py-3 text-small font-medium text-white transition hover:opacity-90"
          >
            <IconCopy size={16} /> {copie ? t.coordCopie : t.coordCopier}
          </button>
          <div className="flex gap-2">
            <button
              onClick={voir}
              className="flex flex-1 items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint"
            >
              <IconEye size={16} /> {t.coordVoir}
            </button>
            <button
              onClick={telecharger}
              className="flex flex-1 items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint"
            >
              <IconDownload size={16} /> {t.coordTelecharger}
            </button>
          </div>
        </div>
      }
    >
      <dl className="flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line py-3.5">
          <div className="min-w-0">
            <dt className="text-caption uppercase tracking-wider text-ink-faint">{t.coordNom}</dt>
            {nom ? (
              <dd className="mt-1 text-body font-semibold">{nom}</dd>
            ) : (
              <dd className="mt-1 text-small leading-relaxed text-ink-faint">{t.coordSansNom}</dd>
            )}
          </div>
          {nom && <BoutonCopier valeur={nom} libelle={t.coordCopier} libelleFait={t.coordCopie} />}
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-line py-3.5">
          <div className="min-w-0">
            <dt className="text-caption uppercase tracking-wider text-ink-faint">{t.coordNumero}</dt>
            <dd className="mt-1 text-body font-semibold tabnums">{numero || "—"}</dd>
          </div>
          {numero && (
            <BoutonCopier valeur={numero} libelle={t.coordCopier} libelleFait={t.coordCopie} />
          )}
        </div>
        <div className="flex items-center justify-between gap-3 py-3.5">
          <div className="min-w-0">
            <dt className="text-caption uppercase tracking-wider text-ink-faint">{t.coordReseau}</dt>
            <dd className="mt-1 text-body font-semibold">{reseau}</dd>
          </div>
          <LogoOperateur operateur={carte.operateur} size={30} />
        </div>
      </dl>
      <p className="mt-3 text-caption leading-relaxed text-ink-faint">{t.coordPied}</p>
    </Feuille>
  );

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOuvert(true); }}
        aria-label={t.coordonneesAria}
        title={t.coordonneesTitre}
        className="grid size-9 place-items-center rounded-full border border-white/40 text-white transition hover:border-white"
      >
        <IconIdentite size={16} />
      </button>

      {/* La feuille sort par un PORTAIL : la carte porte un conteneur de
          requête (container-type) et un débord masqué, qui piégeaient et
          rognaient toute fenêtre posée dedans. */}
      {ouvert && monte && createPortal(feuille, document.body)}
    </>
  );
}
