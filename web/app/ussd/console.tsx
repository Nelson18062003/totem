"use client";

import { useEffect, useRef, useState } from "react";
import { codesUssd } from "@/lib/codes";
import { textesUssd } from "@/lib/textes/ussd";
import type { Sim } from "@/lib/types";
import { IconClose, IconHash } from "../icons";
import { useLangue } from "../langue";
import {
  BoutonAnnulerSession,
  EncadrePave,
  FilSession,
  ReponseLibre,
  type Msg,
} from "../operation";
import { Bouton, BoutonIcone } from "../ui/bouton";
import { Champ } from "../ui/champ";
import { Vide } from "../ui/etat";

/**
 * La console USSD, branchée sur le vrai réseau. Chaque code composé part dans
 * la base ; le terminal de Douala le tape sur la carte ; la réponse de
 * l'opérateur revient ici, telle quelle. Rien n'est simulé : ce qui s'affiche
 * est ce que le réseau a répondu.
 *
 * Le fil, la bulle, le bloc d'erreur, l'encadré du pavé, la réponse libre et
 * le geste de sortie ne sont plus écrits ici : cet écran et le pop-up d'une
 * opération étaient deux écritures manuscrites du même objet. Ils vivent
 * maintenant dans `app/operation.tsx`, en un seul exemplaire.
 */

// « 1) Transfert » — une ligne d'option numérotée du menu de l'opérateur.
const RE_OPTION = /^\s*(\d{1,2})\s*[.):\-]\s*(\S.*)$/;

// Le réseau attend-il le code secret ? (même règle que le robot : un menu
// qui PARLE du code sans rien demander porte des options numérotées.)
// Le motif lit du texte opérateur, écrit en français comme en anglais.
function demandeUnCode(texte: string): boolean {
  const porteOptions = (texte || "")
    .split(/\r\n|\r|\n/)
    .some((l) => RE_OPTION.test(l.trim()));
  return !porteOptions &&
    /\bpin\b|\bmdp\b|\bcodes?\b|secret|confidentiel|confidential|mot\s+de\s+passe|password|passcode/i.test(texte);
}

/**
 * LA HAUTEUR DU PANNEAU DE SESSION SE CALCULE — elle ne se choisit pas.
 *
 * Le panneau n'avait NI PLAFOND NI ZONE DE DÉFILEMENT : chaque réponse du
 * réseau allongeait la page, et au dixième échange le pavé du code secret et
 * le bouton « annuler la session » étaient sous le bord de l'écran, à des
 * centaines de pixels du fil qu'on lisait. Le calcul a un nom :
 *
 *     hauteur du panneau = écran visible
 *                        − l'en-tête de la page (un titre, sa ligne d'aide)
 *                        − l'écart qui l'en sépare
 *                        − la barre du pouce et sa marge basse sûre
 *
 * — L'EN-TÊTE DE PAGE se mesure en LIGNES DE TEXTE, pas en espacements : une
 *   ligne de `text-title` (28) et une de `text-small` (20). Ces deux jetons
 *   viennent de l'échelle typographique, la seule qui sache exprimer la
 *   hauteur d'une ligne.
 * — LA BARRE DU POUCE est la barre flottante du téléphone : une cible, donc
 *   `h-controle` (44).
 * — LA MARGE BASSE SÛRE est la barre système (`env(safe-area-inset-bottom)`),
 *   zéro partout ailleurs.
 *
 * L'en-tête du panneau et son pied restent hors de la zone défilante : le
 * bouton pour raccrocher et le pavé ne partent jamais avec le fil.
 */
const MESURES = {
  "--entete-de-page": "calc(var(--spacing-ligne-lg) + var(--spacing-ligne-sm))",
  "--ecart-de-page": "calc(var(--spacing) * 6)",
  "--barre-du-pouce": "var(--spacing-controle)",
  "--marge-basse-sure": "env(safe-area-inset-bottom, 0px)",
  "--hauteur-session":
    "calc(100dvh - var(--entete-de-page) - var(--ecart-de-page)" +
    " - var(--barre-du-pouce) - var(--marge-basse-sure))",
} as React.CSSProperties;

export function ConsoleUssd({
  carte,
  codeInitial,
}: {
  carte: Pick<Sim, "libelle" | "operateur">;
  codeInitial?: string;
}) {
  const langue = useLangue();
  const t = textesUssd[langue];
  const [saisie, setSaisie] = useState("");
  const [reponse, setReponse] = useState("");
  const [fil, setFil] = useState<Msg[]>([]);
  const [enSession, setEnSession] = useState(false);
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [fil, attente]);

  const envoyer = async (
    genre: "ussd" | "ussd_reponse" | "ussd_fin",
    parametres: Record<string, unknown>,
    bulle?: Msg,
  ) => {
    if (attente) return;
    setAttente(true);
    setErreur(null);
    if (bulle) setFil((f) => [...f, bulle]);
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: genre, parametres }),
      });
      if (!r.ok) {
        const corps = await r.json().catch(() => null);
        // corps.erreur arrive déjà dans la langue de l'écran : tel quel.
        throw new Error(corps?.erreur || t.demandePasPartie);
      }
      const { id } = (await r.json()) as { id: number };
      // Le terminal relève ses demandes toutes les quelques secondes : on
      // attend sa réponse, sans jamais prétendre l'avoir avant lui.
      for (let i = 0; i < 25; i++) {
        await new Promise((res) => setTimeout(res, 1200));
        const c = await fetch(`/api/commande/${id}`, { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);
        if (c && (c.etat === "faite" || c.etat === "echouee")) {
          if (genre === "ussd_fin") {
            setFil([]); setEnSession(false);
          } else {
            setFil((f) => [...f, {
              de: "reseau",
              texte: c.resultat || (c.etat === "faite" ? t.reponseVide : t.echec),
            }]);
            setEnSession(c.etat === "faite");
          }
          setAttente(false);
          return;
        }
      }
      throw new Error(t.terminalMuet);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t.accroc);
      setAttente(false);
    }
  };

  const composer = (code: string) => {
    const c = code.trim();
    if (!c) return;
    setFil([]);
    setSaisie("");
    void envoyer("ussd", { code: c }, { de: "vous", texte: c });
  };

  const repondre = (texte: string) => {
    const t = texte.trim();
    if (!t) return;
    setReponse("");
    void envoyer("ussd_reponse", { texte: t }, { de: "vous", texte: t });
  };

  const secret = (code: string) => {
    void envoyer("ussd_reponse", { texte: code, secret: true }, { de: "vous", texte: "••••" });
  };

  const fermer = () => void envoyer("ussd_fin", {});

  // Arrivée depuis un bouton du guichet : le code se compose tout seul.
  const lance = useRef(false);
  useEffect(() => {
    if (codeInitial && !lance.current) {
      lance.current = true;
      composer(codeInitial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeInitial]);

  const dernier = [...fil].reverse().find((m) => m.de === "reseau")?.texte ?? "";
  const pave = enSession && !attente && demandeUnCode(dernier);

  return (
    // Grand écran : le cadran à gauche, l'écran de session à droite.
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-x-8">
      <header className="lg:col-span-3">
        <h1 className="text-title">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre(carte.libelle)}</p>
      </header>

      {/* La colonne du cadran : composer, puis les raccourcis */}
      <div className="flex flex-col gap-4 lg:col-start-1">
        <form
          onSubmit={(e) => { e.preventDefault(); composer(saisie); }}
          className="flex items-end gap-2"
        >
          <Champ
            libelle={t.titre}
            libelleMasque
            iconeAvant={<IconHash size={20} />}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value.replace(/[^0-9#*]/g, ""))}
            inputMode="tel"
            placeholder="#148#"
            className="flex-1 tabnums"
          />
          <Bouton
            variante="secondaire"
            type="submit"
            desactive={!saisie.trim() || attente}
          >
            {t.composer}
          </Bouton>
        </form>

        {/* Les codes déjà relevés sur le terrain — modifiables dans les réglages.
            Le libellé suit la langue par la clé du catalogue ; le code, jamais. */}
        <div className="flex flex-wrap gap-2">
          {(codesUssd[carte.operateur] ?? []).map((c) => (
            <Bouton
              key={c.code}
              variante="secondaire"
              onClick={() => composer(c.code)}
              desactive={attente}
            >
              {t.libelleCode(c.cle, c.libelle)}
              <span className="tabnums text-ink-faint">{c.code}</span>
            </Bouton>
          ))}
        </div>

        <p className="hidden max-w-lecture text-small text-ink-soft lg:block">
          {t.noteSession}
        </p>
      </div>

      {/* L'écran de session */}
      {fil.length === 0 && !attente ? (
        <div className="hidden lg:col-span-2 lg:col-start-2 lg:block">
          <Vide titre={t.aucuneSession} />
        </div>
      ) : (
        <section
          style={MESURES}
          className="flex max-h-[var(--hauteur-session)] flex-col overflow-hidden rounded-card border border-line bg-surface-raised lg:col-span-2 lg:col-start-2"
        >
          {/* EN-TÊTE — FIXE. Le bouton pour raccrocher reste sous le pouce, quel
              que soit le nombre d'échanges. Il faisait 16×16 ; il fait 44×44. */}
          <div className="flex h-rangee shrink-0 items-center justify-between gap-4 border-b border-line px-4">
            <p className="min-w-0 truncate text-small font-medium">
              {enSession ? t.sessionEnCours : t.sessionTerminee} · {carte.libelle}
            </p>
            <BoutonIcone
              variante="discret"
              icone={<IconClose size={20} />}
              aria-label={t.raccrocher}
              onClick={fermer}
              desactive={attente}
            />
          </div>

          {/* LE FIL — LA SEULE ZONE QUI DÉFILE. `min-h-0` est indispensable :
              sans lui, un enfant de flex refuse de rétrécir sous sa taille de
              contenu et le défilement ne s'active jamais. */}
          <div className="min-h-0 grow overflow-y-auto p-4">
            <FilSession
              fil={fil}
              attente={attente}
              erreur={erreur}
              texteAttente={t.terminalCompose}
              bas={bas}
            />
          </div>

          {/* LE PIED — FIXE. Le pavé du code, la réponse libre et le geste de
              sortie ne partent jamais avec le fil. */}
          {enSession && (
            <div className="flex shrink-0 flex-col gap-2 border-t border-line p-4">
              {/* Le pavé, quand le réseau attend le code secret */}
              {pave && <EncadrePave onValider={secret} />}

              {/* Réponse libre : le chiffre du menu, un montant, un numéro */}
              {!attente && !pave && (
                <ReponseLibre
                  libelle={t.votreReponseDetail}
                  libelleEnvoi={t.envoyer}
                  valeur={reponse}
                  surChangement={setReponse}
                  surEnvoi={() => repondre(reponse)}
                  autoFocus
                />
              )}

              <BoutonAnnulerSession
                libelle={t.annulerSession}
                surAppui={fermer}
                eteint={attente}
              />
            </div>
          )}
        </section>
      )}

      <p className="max-w-lecture text-small text-ink-soft lg:hidden">
        {t.noteSessionCourte}
      </p>
    </div>
  );
}
