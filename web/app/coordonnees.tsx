"use client";

import { useState } from "react";
import { textesAccueil } from "@/lib/textes/accueil";
import { useLangue } from "@/app/langue";
import { Feuille } from "./feuille";
import { IconCopy, IconDownload, IconIdentite } from "./icons";

/**
 * Les coordonnées d'une carte — le « RIB » de la SIM. Le propriétaire les
 * montre à qui veut lui envoyer de l'argent : son nom, son numéro, son
 * réseau. D'un geste il les copie (pour les coller dans un message) ou les
 * télécharge en PDF, comme le relevé d'identité d'une banque.
 *
 * Aucune donnée n'est inventée : le numéro vient de ce que la carte déclare
 * ou de ce que le propriétaire a inscrit, le nom de ce qu'il a inscrit dans
 * les Réglages. Sans nom, la fiche le dit et renvoie aux Réglages.
 */

// Le numéro par tranches lisibles : « +237 6XX XX XX XX ». On ne garde que
// les chiffres, on rétablit le « + » et l'indicatif s'il est là.
function formaterNumero(numero: string): string {
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

// Le nom commercial du service, pour la ligne « réseau ».
function service(operateur: string): string {
  if (operateur === "MTN") return "MTN Mobile Money";
  if (operateur === "Orange") return "Orange Money";
  return operateur || "Mobile Money";
}

// « La Tresse », en SVG autonome pour le document imprimé (repris de marque.tsx).
const TRESSE = `<svg viewBox="0 0 32 32" width="46" height="46" fill="none" stroke="#B23A0E" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4.4C17.54 5.302 22.6 6.462 22.6 8.267C22.6 10.071 19.08 10.329 16 12.133C12.92 13.938 9.4 14.196 9.4 16C9.4 17.804 12.92 18.062 16 19.867C19.08 21.671 22.6 21.929 22.6 23.733C22.6 25.538 17.54 26.698 16 27.6"/><path d="M16 4.4C14.46 5.302 9.4 6.462 9.4 8.267C9.4 10.071 12.92 10.329 16 12.133C19.08 13.938 22.6 14.196 22.6 16C22.6 17.804 19.08 18.062 16 19.867C12.92 21.671 9.4 21.929 9.4 23.733C9.4 25.538 14.46 26.698 16 27.6"/></svg>`;

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
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
      // Le presse-papiers peut être refusé (contexte non sécurisé) : on
      // sélectionne alors le texte pour une copie manuelle.
      setCopie(false);
    }
  };

  // Le PDF : une fenêtre autonome, mise en page comme un relevé d'identité,
  // que le navigateur enregistre en PDF. Rien ne quitte l'appareil.
  const telecharger = () => {
    const fen = window.open("", "_blank", "width=620,height=800");
    if (!fen) return;   // fenêtre bloquée : le bouton Copier reste la voie
    const html = `<!doctype html><html lang="${langue}"><head><meta charset="utf-8">
<title>${echapper(t.coordonneesTitre)} — ${echapper(nom || numero)}</title>
<style>
  @page { margin: 22mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    color: #241E17; margin: 0; padding: 40px; }
  .cadre { border: 2px solid #241E17; border-radius: 14px; padding: 30px 34px; max-width: 520px; }
  .tete { display: flex; align-items: center; gap: 12px; padding-bottom: 18px;
    border-bottom: 2px solid #241E17; margin-bottom: 22px; }
  .marque { font-weight: 800; letter-spacing: .12em; text-transform: uppercase; font-size: 20px; }
  h1 { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: #8B8175;
    margin: 0 0 20px; font-weight: 700; }
  dl { margin: 0; }
  .ligne { padding: 12px 0; border-bottom: 1px solid #E3DCD1; }
  .ligne:last-child { border-bottom: none; }
  dt { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #8B8175; margin-bottom: 4px; }
  dd { margin: 0; font-size: 20px; font-weight: 600; }
  .pied { margin-top: 24px; font-size: 12px; color: #8B8175; line-height: 1.5; }
</style></head><body>
  <div class="cadre">
    <div class="tete">${TRESSE}<span class="marque">Totem</span></div>
    <h1>${echapper(t.coordonneesTitre)}</h1>
    <dl>
      ${nom ? `<div class="ligne"><dt>${echapper(t.coordNom)}</dt><dd>${echapper(nom)}</dd></div>` : ""}
      <div class="ligne"><dt>${echapper(t.coordNumero)}</dt><dd>${echapper(numero || "—")}</dd></div>
      <div class="ligne"><dt>${echapper(t.coordReseau)}</dt><dd>${echapper(reseau)}</dd></div>
    </dl>
    <p class="pied">${echapper(t.coordPied)}</p>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>
</body></html>`;
    fen.document.write(html);
    fen.document.close();
  };

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

      {ouvert && (
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
            <div className="flex gap-2">
              <button
                onClick={copier}
                className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90"
              >
                <IconCopy size={16} /> {copie ? t.coordCopie : t.coordCopier}
              </button>
              <button
                onClick={telecharger}
                className="flex flex-1 items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint"
              >
                <IconDownload size={16} /> {t.coordTelecharger}
              </button>
            </div>
          }
        >
          <dl className="flex flex-col">
            {nom ? (
              <div className="border-b border-line py-3">
                <dt className="text-caption uppercase tracking-wider text-ink-faint">{t.coordNom}</dt>
                <dd className="mt-1 text-body font-semibold">{nom}</dd>
              </div>
            ) : (
              <div className="border-b border-line py-3">
                <dt className="text-caption uppercase tracking-wider text-ink-faint">{t.coordNom}</dt>
                <dd className="mt-1 text-small leading-relaxed text-ink-faint">{t.coordSansNom}</dd>
              </div>
            )}
            <div className="border-b border-line py-3">
              <dt className="text-caption uppercase tracking-wider text-ink-faint">{t.coordNumero}</dt>
              <dd className="mt-1 text-body font-semibold tabnums">{numero || "—"}</dd>
            </div>
            <div className="py-3">
              <dt className="text-caption uppercase tracking-wider text-ink-faint">{t.coordReseau}</dt>
              <dd className="mt-1 text-body font-semibold">{reseau}</dd>
            </div>
          </dl>
          <p className="mt-3 text-caption leading-relaxed text-ink-faint">{t.coordPied}</p>
        </Feuille>
      )}
    </>
  );
}
