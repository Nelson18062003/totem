"use client";

// LE REÇU D'UN SMS D'ARGENT, sur le site — un seul système, dans chaque
// fiche : celle d'un SMS (boîte de réception, accueil) et celle d'un
// paiement (l'onglet Paiements). « C'est hyper important sur chaque
// transaction », a dit le propriétaire : la fiche d'un paiement n'avait pas
// de PDF.
//
// Établir, attendre celui qui arrive tout seul, refaire — la logique vivait
// dans la fiche d'un SMS et y est restée mot pour mot, déplacée ici. Les
// gestes sur le document lui-même : VOIR (il s'ouvre dans un onglet),
// TÉLÉCHARGER (le fichier, sous son vrai nom), PARTAGER (la feuille de
// partage du système quand le navigateur en a une, le fichier joint — sinon
// le geste n'apparaît pas), REFAIRE.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLangue } from "@/app/langue";
import { etatDeLaReponseRecu, FENETRE_DU_RECU_MS, recuAttendu } from "@noyau/sms";
import { textesSms } from "@noyau/textes/sms";
import type { Categorie, Paiement } from "@noyau/types";
import { IconDoc, IconDownload, IconEye, IconPartage, IconRefresh } from "./icons";

/**
 * L'état du reçu d'un SMS, et le geste qui l'établit ou le refait.
 * `nature` — celle que la fiche affiche (le choix du propriétaire) : c'est
 * elle qui donne son titre au document.
 */
export function useRecuDuSms(p: Paiement, nature: Paiement["nature"]) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesSms[langue];
  const [etabli, setEtabli] = useState<"repos" | "envoi" | "fait" | "refus">("repos");
  const [mot, setMot] = useState("");

  // Le numéro du reçu : celui de la ligne, ou celui que la fiche vient
  // d'apprendre (le reçu arrivé tout seul, voir plus bas).
  const [recuAppris, setRecuAppris] = useState<string | null>(null);
  const recu = p.recu ?? recuAppris;

  // LE REÇU QUI ARRIVE TOUT SEUL — la même règle que sur le téléphone
  // (`recuAttendu`, dans le noyau). Un SMS d'argent tout juste reçu a son
  // reçu en route : le boîtier le dépose dans les secondes qui suivent. La
  // fiche l'ATTEND au lieu de proposer de l'établir, et demande à la
  // plateforme, toutes les trois secondes, s'il est là — le temps de la
  // fenêtre, et tant qu'elle est ouverte. Jamais un pouls.
  const [attendu, setAttendu] = useState(() => recuAttendu(p, Date.now()));
  // La fin du guet : la fenêtre du SMS neuf — ou, après une demande que le
  // boîtier n'a pas encore pu déposer (« en fabrication »), une fenêtre
  // ouverte à partir de cette réponse.
  const [finGuet, setFinGuet] = useState(() => Date.parse(p.recuLe) + FENETRE_DU_RECU_MS);
  useEffect(() => {
    if (!attendu || p.recu) return;
    const fin = finGuet;
    const renoncer = new AbortController();
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const guetter = async () => {
      if (renoncer.signal.aborted) return;
      const n = await fetch(`/api/recu-du-sms?id=${encodeURIComponent(p.id)}`,
                            { cache: "no-store", signal: renoncer.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((c: { recu?: unknown } | null) =>
          (typeof c?.recu === "string" && c.recu ? c.recu : null))
        .catch(() => null);
      if (renoncer.signal.aborted) return;
      if (n) {
        setRecuAppris(n);
        setAttendu(false);
        router.refresh();       // la ligne de la liste prend son icône
        return;
      }
      if (Date.now() >= fin) { setAttendu(false); return; }
      minuterie = setTimeout(guetter, Math.min(3000, Math.max(0, fin - Date.now())));
    };
    void guetter();
    return () => { renoncer.abort(); if (minuterie) clearTimeout(minuterie); };
  }, [p.id, p.recu, finGuet, attendu, router]);
  const enPreparation = attendu && !recu && etabli === "repos";

  // Le reçu d'un message passé : le terminal le refabrique depuis le SMS,
  // qui fait foi — même numéro, à la demande. La nature choisie voyage avec
  // la demande : c'est ELLE qui décide du document (un transfert marqué
  // « transfert » ne peut pas revenir en reçu de solde).
  // La date d'établissement du reçu, lue dans le cloud : elle avance quand le
  // terminal a VRAIMENT remplacé le document — c'est elle qu'on guette.
  const ficheRecu = async (): Promise<string | null> => {
    if (!recu) return null;
    try {
      const r = await fetch(`/api/recu/${recu}/fiche`, { cache: "no-store" });
      if (!r.ok) return null;
      const corps = (await r.json()) as { etabliLe: string | null };
      return corps.etabliLe;
    } catch {
      return null;
    }
  };

  const etablirRecu = async (natureVoulue?: Categorie) => {
    if (etabli === "envoi" || p.sourceId == null) return;
    const natureDemandee = natureVoulue ?? nature;
    setEtabli("envoi");
    const etabliAvant = await ficheRecu();
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "recu",
          // Le terminal qui a REÇU ce SMS : `source_id` ne veut rien dire
          // dans le journal d'un autre boîtier.
          ...(p.terminal ? { terminal: p.terminal } : {}),
          parametres: {
            source_id: p.sourceId,
            ...(natureDemandee ? { nature: natureDemandee } : {}),
          },
        }),
      });
      if (!r.ok) throw new Error();
      const { id } = (await r.json()) as { id: number };
      for (let i = 0; i < 20; i++) {
        await new Promise((res) => setTimeout(res, 1300));
        const c = await fetch(`/api/commande/${id}`, { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);
        if (c && (c.etat === "faite" || c.etat === "echouee")) {
          setEtabli(c.etat === "faite" ? "fait" : "refus");
          if (c.etat !== "faite") {
            setMot(c.resultat || "");
            return;
          }
          // Ce que le boîtier a FAIT, lu dans sa phrase : c'est lui qui a
          // comparé le document refait à celui déposé (voir
          // `etatDeLaReponseRecu`). Ni l'égalité des numéros ni une date
          // inchangée ne le disent : un document refait garde les deux.
          const etat = etatDeLaReponseRecu(c.resultat);
          if (recu) {
            // RÉGÉNÉRATION d'un document existant. Le terminal dépose le
            // document AVANT de répondre « faite ».
            if (etat === "inchange") {
              setMot(t.recuDejaAJour);
              setEtabli("repos");
              return;
            }
            if (etat === "pret") {
              setMot(t.regenerationFaite);
              setEtabli("repos");
              router.refresh();
              return;
            }
            // En route — ou un boîtier d'avant cette règle : on guette la
            // date d'établissement, et on ne dit « c'est le nouveau » que
            // quand elle a vraiment avancé.
            setMot(t.regenerationEnCours);
            if (!etabliAvant) {
              // Le repère d'avant n'a pas pu être lu : impossible de
              // CONSTATER le remplacement — alors on ne le certifie pas.
              // Message d'attente honnête, et la main revient.
              await new Promise((res) => setTimeout(res, 15000));
              setMot(t.regenerationEnRoute);
              setEtabli("repos");
              router.refresh();
              return;
            }
            for (let attente = 0; attente < 30; attente++) {
              await new Promise((res) => setTimeout(res, 3000));
              const etabliApres = await ficheRecu();
              if (etabliApres && etabliApres !== etabliAvant) {
                setMot(t.regenerationFaite);
                setEtabli("repos");
                router.refresh();
                return;
              }
            }
            // Toujours rien après une minute et demie : on le dit sans
            // prétendre que c'est fait.
            setMot(t.regenerationLente);
            setEtabli("repos");
          } else {
            setMot(c.resultat || "");
            const n = /\bT[A-Z]-\d{4}-\d{4}-\d+\b/.exec(c.resultat ?? "")?.[0];
            if (n && etat !== "en_route") {
              // Le terminal a DÉPOSÉ le document avant de répondre « prêt » :
              // le lien peut s'ouvrir tout de suite.
              setRecuAppris(n);
              setEtabli("repos");
            } else {
              // « En fabrication » : le document n'est PAS encore sur la
              // plateforme. Poser le lien maintenant, c'était un clic vers
              // une erreur. La fiche guette, comme pour un SMS neuf, et le
              // lien n'apparaît que quand le reçu est là.
              setFinGuet(Date.now() + FENETRE_DU_RECU_MS);
              setAttendu(true);
              setEtabli("repos");
            }
            router.refresh();
          }
          return;
        }
      }
      throw new Error();
    } catch {
      setMot(t.terminalMuet);
      setEtabli("refus");
    }
  };

  return { recu, enPreparation, etabli, mot, etablirRecu };
}

/**
 * LES GESTES DU REÇU, au pied d'une fiche. Sans reçu : l'établir (ou
 * l'attendre, s'il arrive tout seul). Avec : le VOIR d'abord — un onglet du
 * navigateur montre le PDF —, puis télécharger, partager, refaire, de même
 * poids.
 */
export function GestesRecu({ p, recu, etabli, enPreparation, mot, onEtablir }: {
  p: Paiement; recu: string | null; etabli: "repos" | "envoi" | "fait" | "refus";
  enPreparation: boolean; mot: string; onEtablir: () => void;
}) {
  const langue = useLangue();
  const t = textesSms[langue];
  // Le partage d'un FICHIER n'existe pas dans tous les navigateurs : le
  // geste n'apparaît que là où il marche. Décidé après le montage — le
  // serveur ne connaît pas le navigateur.
  const [peutPartager, setPeutPartager] = useState(false);
  useEffect(() => {
    try {
      const essai = new File([""], "essai.pdf", { type: "application/pdf" });
      setPeutPartager(typeof navigator.share === "function"
        && typeof navigator.canShare === "function" && navigator.canShare({ files: [essai] }));
    } catch { setPeutPartager(false); }
  }, []);
  const [partage, setPartage] = useState<"repos" | "envoi" | "refus">("repos");
  const partager = async () => {
    if (!recu || partage === "envoi") return;
    setPartage("envoi");
    try {
      const r = await fetch(`/api/recu/${recu}`, { cache: "no-store" });
      const octets = await r.arrayBuffer();
      // Vérifié : un document qui n'est pas un PDF (une page d'erreur) ne
      // part pas chez un client sous le nom « Recu-….pdf ».
      const debut = String.fromCharCode(...new Uint8Array(octets.slice(0, 5)));
      if (!r.ok || debut !== "%PDF-") throw new Error("document illisible");
      const fichier = new File([octets], `Recu-${recu}.pdf`, { type: "application/pdf" });
      await navigator.share({ files: [fichier], title: t.partagerRecu });
      setPartage("repos");
    } catch (e) {
      // Refermer la feuille de partage n'est pas un échec.
      setPartage(e instanceof DOMException && e.name === "AbortError" ? "repos" : "refus");
    }
  };

  const plein = "flex w-full items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-40";
  const court = "flex flex-1 flex-col items-center justify-center gap-1 rounded-btn border border-line py-2 text-caption font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink disabled:opacity-40";
  return (
    <div className="flex flex-col gap-2">
      {recu ? (
        <a href={`/api/recu/${recu}`} target="_blank" rel="noopener" className={plein}>
          <IconEye size={15} /> {t.voirRecu}
        </a>
      ) : p.sourceId != null && etabli !== "fait" ? (
        <button onClick={onEtablir} disabled={etabli === "envoi" || enPreparation} className={plein}>
          <IconDoc size={15} />
          {enPreparation ? t.recuEnPreparation : etabli === "envoi" ? t.demandeAuTerminal : t.etablirRecu}
        </button>
      ) : null}
      {recu && (
        <div className="flex gap-2">
          <a href={`/api/recu/${recu}`} download={`Recu-${recu}.pdf`} className={court}>
            <IconDownload size={16} /> {t.telechargerRecuCourt}
          </a>
          {peutPartager && (
            <button onClick={() => void partager()} disabled={partage === "envoi"} className={court}>
              <IconPartage size={16} /> {partage === "envoi" ? `${t.partagerCourt}…` : t.partagerCourt}
            </button>
          )}
          {p.sourceId != null && (
            <button onClick={onEtablir} disabled={etabli === "envoi" || etabli === "fait"} className={court}>
              <IconRefresh size={16} /> {etabli === "envoi" ? `${t.refaireRecuCourt}…` : t.refaireRecuCourt}
            </button>
          )}
        </div>
      )}
      {mot && (
        <p className={`text-caption leading-relaxed ${etabli === "refus" ? "text-negative" : "text-ink-soft"}`}>
          {mot}
        </p>
      )}
      {partage === "refus" && <p className="text-caption text-negative">{t.lienRecuImpossible}</p>}
    </div>
  );
}
