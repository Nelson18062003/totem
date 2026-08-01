"use client";

import { useEffect, useRef, useState } from "react";
import { codesUssd } from "@/lib/codes";
import type { Sim } from "@/lib/types";
import { IconClose, IconHash } from "../icons";
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
function demandeUnCode(texte: string): boolean {
  const porteOptions = (texte || "")
    .split(/\r\n|\r|\n/)
    .some((l) => RE_OPTION.test(l.trim()));
  return !porteOptions &&
    /\bpin\b|\bmdp\b|\bcodes?\b|secret|confidentiel|mot\s+de\s+passe|password/i.test(texte);
}

export function ConsoleUssd({
  carte,
  codeInitial,
}: {
  carte: Pick<Sim, "libelle" | "operateur">;
  codeInitial?: string;
}) {
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
        throw new Error(corps?.erreur || "la demande n’a pas pu partir");
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
              texte: c.resultat || (c.etat === "faite" ? "(réponse vide)" : "Échec."),
            }]);
            setEnSession(c.etat === "faite");
          }
          setAttente(false);
          return;
        }
      }
      throw new Error("le terminal n’a pas répondu — est-il allumé, et à jour ?");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "petit accroc — réessayez");
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
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-x-10">
      <header className="lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">Code USSD</h1>
        <p className="mt-1 text-small text-ink-soft">
          Composez comme sur le téléphone : le terminal de Douala tape le code
          sur la carte {carte.libelle}, et la réponse du réseau revient ici.
        </p>
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
            Composer
          </button>
        </form>

        {/* Les codes déjà relevés sur le terrain — modifiables dans les réglages */}
        <div className="flex flex-wrap gap-1.5">
          {(codesUssd[carte.operateur] ?? []).map((c) => (
            <button key={c.code} onClick={() => composer(c.code)} disabled={attente}
              className="rounded-btn border border-line bg-surface-raised px-3 py-1.5 text-small text-ink-soft transition hover:border-ink-faint hover:text-ink disabled:opacity-40">
              {c.libelle} <span className="tabnums text-ink-faint">{c.code}</span>
            </button>
          ))}
        </div>

        <p className="hidden text-caption leading-relaxed text-ink-faint lg:block">
          La session traverse le terminal de Douala : chaque réponse affichée
          ici est celle de l’opérateur, mot pour mot. Le code secret, lui, se
          compose sur son pavé et n’est enregistré nulle part.
        </p>
      </div>

      {/* L'écran de session */}
      {fil.length === 0 && !attente ? (
        <div className="hidden items-center justify-center rounded-card border border-dashed border-line px-6 py-16 text-center lg:col-start-2 lg:flex">
          <p className="max-w-56 text-small leading-relaxed text-ink-faint">
            Aucune session en cours. Composez un code, la réponse du réseau
            s’affichera ici.
          </p>
        </div>
      ) : (
        <section className="rounded-card border border-line bg-surface-raised lg:col-start-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-small font-medium">
              {enSession ? "Session en cours" : "Session terminée"} · {carte.libelle}
            </p>
            <button onClick={fermer} aria-label="Raccrocher la session" disabled={attente}
              className="text-ink-faint transition hover:text-ink disabled:opacity-40">
              <IconClose size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-2 p-4">
            {fil.map((m, i) => (
              <p key={i}
                className={`max-w-[85%] whitespace-pre-line rounded-card px-3.5 py-2.5 text-small leading-relaxed ${
                  m.de === "reseau"
                    ? "self-start bg-surface-2 text-ink"
                    : "self-end bg-ink text-white tabnums"
                }`}>
                {m.texte}
              </p>
            ))}
            {attente && (
              <p className="self-start px-1 text-caption text-ink-faint">
                le terminal compose…
              </p>
            )}
            {erreur && (
              <p className="self-start rounded-card bg-surface-2 px-3.5 py-2.5 text-small leading-relaxed text-negative">
                {erreur}
              </p>
            )}

            {/* Le pavé, quand le réseau attend le code secret */}
            {pave && (
              <div className="mt-2 rounded-card border border-line p-4">
                <PaveSecret onValider={secret} />
              </div>
            )}

            {/* Réponse libre : le chiffre du menu, un montant, un numéro */}
            {enSession && !attente && !pave && (
              <form
                onSubmit={(e) => { e.preventDefault(); repondre(reponse); }}
                className="mt-2 flex items-center gap-2"
              >
                <input
                  value={reponse}
                  onChange={(e) => setReponse(e.target.value)}
                  inputMode="tel"
                  placeholder="Votre réponse (chiffre du menu, montant, numéro…)"
                  autoFocus
                  className="flex-1 rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-small outline-none transition placeholder:text-ink-faint focus:border-ink"
                />
                <button type="submit" disabled={!reponse.trim()}
                  className="rounded-btn bg-ink px-4 py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
                  Envoyer
                </button>
              </form>
            )}

            {/* Le geste de sortie, impossible à manquer. */}
            {enSession && (
              <button onClick={fermer} disabled={attente}
                className="mt-2 rounded-btn border border-line py-2.5 text-small font-medium text-negative transition hover:border-negative disabled:opacity-40">
                Annuler la session
              </button>
            )}
            <div ref={bas} />
          </div>
        </section>
      )}

      <p className="text-caption leading-relaxed text-ink-faint lg:hidden">
        La session traverse le terminal de Douala : chaque réponse affichée ici
        est celle de l’opérateur, mot pour mot.
      </p>
    </div>
  );
}
