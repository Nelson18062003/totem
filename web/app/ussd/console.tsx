"use client";

import { useEffect, useRef, useState } from "react";
import { codesUssd } from "@/lib/codes";
import { textesUssd } from "@/lib/textes/ussd";
import type { Sim } from "@/lib/types";
import { BoutonFermer, ConfirmationArret, useEchap } from "../fermer";
import { IconHash } from "../icons";
import { useLangue } from "../langue";
import { PaveSecret } from "../pave-secret";

/**
 * La console USSD, branchée sur le vrai réseau. Chaque code composé part dans
 * la base ; le terminal de Douala le tape sur la carte ; la réponse de
 * l'opérateur revient ici, telle quelle. Rien n'est simulé : ce qui s'affiche
 * est ce que le réseau a répondu.
 */

type Msg = { de: "reseau" | "vous"; texte: string };

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

  const fermer = () => {
    // Une session déjà terminée n'a rien à raccrocher : l'écran se ferme
    // sur-le-champ, sans aller-retour inutile jusqu'au terminal.
    if (!enSession) {
      setFil([]);
      setErreur(null);
      return;
    }
    void envoyer("ussd_fin", {});
  };

  // --- L'arrêt SÛR : trouvable, jamais accidentel ---------------------------
  // Session en cours = quelque chose à perdre : la pastille et Échap posent
  // d'abord la question ; le voile est inerte. Session finie : tout ferme.
  const [confirmeArret, setConfirmeArret] = useState(false);
  const sortir = () => {
    if (attente || confirmeArret) return;
    if (enSession) setConfirmeArret(true);
    else fermer();
  };
  useEchap(sortir);

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
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-x-10">
      <header className="lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre(carte.libelle)}</p>
      </header>

      {/* La colonne du cadran : composer, puis les raccourcis */}
      <div className="flex flex-col gap-5 lg:col-start-1">
        <form
          onSubmit={(e) => { e.preventDefault(); composer(saisie); }}
          className="flex items-center gap-2"
        >
          <div className="flex flex-1 items-center gap-2.5 rounded-btn border border-line bg-surface-raised px-3.5">
            <IconHash size={16} className="text-ink-faint" />
            <input
              value={saisie}
              onChange={(e) => setSaisie(e.target.value.replace(/[^0-9#*]/g, ""))}
              inputMode="tel"
              placeholder="#148#"
              className="flex-1 bg-transparent py-2.5 text-body tabnums outline-none placeholder:text-ink-faint"
            />
          </div>
          <button type="submit" disabled={!saisie.trim() || attente}
            className="rounded-btn bg-ink px-4 py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
            {t.composer}
          </button>
        </form>

        {/* Les codes déjà relevés sur le terrain — modifiables dans les réglages.
            Le libellé suit la langue par la clé du catalogue ; le code, jamais.
            Une ligne par code, taillée pour le pouce : le nuage de puces
            serrées se visait mal sur téléphone. */}
        <div className="flex flex-col gap-1.5">
          {(codesUssd[carte.operateur] ?? []).map((c) => (
            <button key={c.code} onClick={() => composer(c.code)} disabled={attente}
              className="flex items-center justify-between gap-3 rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-left text-small font-medium text-ink transition hover:border-ink-faint disabled:opacity-40">
              {t.libelleCode(c.cle, c.libelle)}
              <span className="tabnums font-normal text-ink-faint">{c.code}</span>
            </button>
          ))}
        </div>

        <p className="hidden text-caption leading-relaxed text-ink-faint lg:block">
          {t.noteSession}
        </p>
      </div>

      {/* L'écran de session */}
      {fil.length === 0 && !attente ? (
        <div className="hidden items-center justify-center rounded-card border border-dashed border-line px-6 py-16 text-center lg:col-start-2 lg:flex">
          <p className="max-w-56 text-small leading-relaxed text-ink-faint">
            {t.aucuneSession}
          </p>
        </div>
      ) : (
        // Une FEUILLE posée en bas de l'écran : le cadran reste visible
        // derrière le voile. Sur grand écran, la carte de droite, comme
        // toujours.
        <>
        {/* Le voile ne raccroche JAMAIS une session en cours : un pouce qui
            dépasse la feuille ne doit pas couper un dialogue d'argent. */}
        <div className="voile fixed inset-0 z-20 bg-ink/25 lg:hidden"
          onClick={() => { if (!attente && !enSession) fermer(); }} />
        <section className="fixed inset-x-0 bottom-0 z-30 flex max-h-[92dvh] flex-col rounded-t-card border-t border-line bg-surface-raised lg:static lg:z-auto lg:max-h-none lg:rounded-card lg:border lg:col-start-2">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <p className="text-small font-medium">
              {enSession ? t.sessionEnCours : t.sessionTerminee} · {carte.libelle}
            </p>
            <BoutonFermer onClick={sortir} label={t.raccrocher} disabled={attente} />
          </div>

          {/* UNE seule carte, réécrite à chaque réponse du réseau. Le message
              de l'opérateur a un minimum de place GARANTI : le pavé n'a pas
              le droit de l'écraser. */}
          <div className="min-h-28 flex-1 overflow-y-auto p-4">
            {dernier && (
              <p className="whitespace-pre-line rounded-card bg-surface-2 px-4 py-3.5 text-body leading-relaxed">
                {dernier}
              </p>
            )}
            {attente && (
              <p className="mt-2 px-1 text-caption text-ink-faint">
                {t.terminalCompose}
              </p>
            )}
            {erreur && (
              <p className="mt-2 rounded-card bg-surface-2 px-4 py-3 text-small leading-relaxed text-negative">
                {erreur}
              </p>
            )}
          </div>

          {/* Les gestes — toujours visibles, jamais à aller chercher.
              (Pendant la toute première composition, il n'y a encore aucun
              geste à offrir : pas de pied vide.) */}
          {confirmeArret ? (
            <ConfirmationArret question={t.arreterQuestion} continuer={t.continuer} arreter={t.arreter}
              onContinuer={() => setConfirmeArret(false)}
              onArreter={() => { setConfirmeArret(false); fermer(); }} />
          ) : (enSession || !attente) && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:border-t-0 lg:pt-0 lg:pb-4">
            {/* Le pavé, quand le réseau attend le code secret — à même la
                feuille, sans boîte autour : la place est au message. */}
            {pave && <PaveSecret onValider={secret} />}

            {/* Réponse libre : le chiffre du menu, un montant, un numéro */}
            {enSession && !attente && !pave && (
              <form
                onSubmit={(e) => { e.preventDefault(); repondre(reponse); }}
                className="flex items-center gap-2"
              >
                <input
                  value={reponse}
                  onChange={(e) => setReponse(e.target.value)}
                  inputMode="tel"
                  placeholder={t.votreReponseDetail}
                  autoFocus
                  className="flex-1 rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-small outline-none transition placeholder:text-ink-faint focus:border-ink"
                />
                <button type="submit" disabled={!reponse.trim()}
                  className="rounded-btn bg-ink px-4 py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
                  {t.envoyer}
                </button>
              </form>
            )}

            {/* Le geste de sortie, impossible à manquer. Session finie :
                « Fermer », immédiat ; session en cours : « Annuler ». */}
            {enSession ? (
              <button onClick={fermer} disabled={attente}
                className="rounded-btn border border-line py-2.5 text-small font-medium text-negative transition hover:border-negative disabled:opacity-40">
                {t.annulerSession}
              </button>
            ) : (
              !attente && (
                <button onClick={fermer}
                  className="rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint">
                  {t.fermerEcran}
                </button>
              )
            )}
          </div>
          )}
        </section>
        </>
      )}

      <p className="text-caption leading-relaxed text-ink-faint lg:hidden">
        {t.noteSessionCourte}
      </p>
    </div>
  );
}
