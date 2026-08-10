"use client";

// LA PORTE DU SUPER-ADMINISTRATEUR — planches A1 (l'entrée), A2 (les six
// chiffres) et A4 (les refus).
//
// CETTE PAGE EST OUVERTE, ET ELLE NE PEUT PAS ÊTRE AUTREMENT : on ne peut pas
// exiger d'être entré pour entrer. L'exception est à inscrire dans
// `tests/test_garde_partout.py`, et l'adresse à ajouter à `OUVERT` dans
// `middleware.ts` — c'est écrit dans le rapport de la pull request.
//
// CE QUI DISTINGUE CETTE PORTE DE CELLE DU CLIENT, ET QUI SE LIT DANS L'ORDRE
//
// 1. LE DOIGT D'ABORD, ET DIT COMME LA RÈGLE. Côté client, les deux chemins se
//    valent et l'écran montre les deux (docs/COMMENT-ON-ENTRE.md) : une
//    commerçante qui entre par le mail tous les jours n'a rien fait de mal.
//    Ici non. Cette console voit tous les commerces à la fois, et le NIST est
//    sans nuance sur le courriel (SP 800-63B-4 §3.1.3.1). Le mail reste — il
//    faut bien un chemin le jour du téléphone noyé — mais il est REPLIÉ, NOMMÉ
//    « secours », et il s'annonce par une lettre.
//
// 2. LE CODE DE SECOURS ATTEND. Une minute pendant laquelle il n'ouvre rien
//    (`ATTENTE_SECOURS_MS`). Ce n'est pas une friction gratuite : c'est le
//    temps que la lettre d'avertissement a pour arriver AVANT le code. Sans
//    elle, la lettre prévient d'une porte déjà ouverte.
//
// 3. LES DEUX ÉTAPES VIVENT DANS LA MÊME PAGE. L'adresse ne passe donc ni par
//    l'URL — où elle finirait dans l'historique du téléphone, dans le référent
//    et dans les journaux de l'hébergeur — ni par le stockage : elle reste
//    dans l'état de l'écran, et disparaît avec l'onglet.
//
// CE QUE LES REFUS DISENT ET NE DISENT PAS (planche A4, arbitrage 3)
// La planche promettait « une seule phrase, toujours la même » tout en
// montrant trois refus différents. La promesse est réécrite, et elle est plus
// juste : ce que la porte tait, c'est l'EXISTENCE DU COMPTE. Une adresse
// inconnue reçoit la même page, la même attente et la même phrase qu'une
// adresse connue — la demande de code ne lit même pas la réponse du serveur.
// Distinguer un code périmé d'un code faux, en revanche, n'apprend rien à un
// inconnu : il n'a pas de code.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLangue } from "@/app/langue";
import { EntrerAvecLeTelephone } from "@/app/cle-boutons";
import { IconDoc, IconLock } from "@/app/icons";
import { textesAdminPorte } from "@/lib/textes/admin-porte";
import { CadreDeLaPorte } from "../cadre";
import {
  ATTENTE_SECONDES, CODES_DE_SECOURS,
  ROUTE_ANNONCER, ROUTE_DEMANDER, ROUTE_PAPIER, ROUTE_VERIFIER,
} from "./raccord";

/** L'attente du code de secours, en millisecondes. Elle ne verrouille rien
 *  ici — c'est le serveur qui refuse — elle sert à écrire le compte à
 *  rebours, pour qu'un bouton inerte dise pourquoi il l'est. */
const ATTENTE_MS = ATTENTE_SECONDES * 1000;

export default function PorteAdmin() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAdminPorte[langue];

  const [etape, setEtape] = useState<"porte" | "code">("porte");
  const [adresse, setAdresse] = useState("");
  const [demande, setDemande] = useState<"repos" | "envoi">("repos");
  const [demandeRate, setDemandeRate] = useState("");

  const [code, setCode] = useState("");
  const [verif, setVerif] = useState<"repos" | "envoi">("repos");
  const [verifRate, setVerifRate] = useState("");
  const [ouvertA, setOuvertA] = useState(0);

  const [motPapier, setMotPapier] = useState("");
  const [papier, setPapier] = useState<"repos" | "envoi">("repos");
  const [papierRate, setPapierRate] = useState("");

  /**
   * Ce qui suit une entrée réussie, quel que soit le chemin.
   *
   * L'AVIS PART AVANT LA REDIRECTION, et l'ordre n'est pas indifférent : sur
   * cette porte, chaque entrée est notifiée à l'intéressé lui-même. Un `await`
   * qui échoue ne retient personne dehors — la route est silencieuse en cas
   * d'échec, comme le journal.
   */
  async function entre() {
    try {
      await fetch(ROUTE_ANNONCER, { method: "POST" });
    } catch { /* le réseau a coupé après l'ouverture : on entre quand même */ }
    router.replace("/admin/appareils");
    router.refresh();
  }

  async function demanderLeCode(e: React.FormEvent) {
    e.preventDefault();
    if (!adresse || demande === "envoi") return;
    setDemande("envoi");
    setDemandeRate("");
    try {
      // On n'attend RIEN de la réponse et on ne la lit pas : une adresse
      // inconnue doit produire exactement ce que produit une adresse connue.
      await fetch(ROUTE_DEMANDER, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courriel: adresse }),
      });
    } catch {
      // Le serveur n'a rien dit du tout : c'est le réseau, pas le compte. Et
      // celui-là se distingue, parce que rien n'est parti.
      setDemande("repos");
      setDemandeRate(t.refus.reseau);
      return;
    }
    setDemande("repos");
    setOuvertA(Date.now() + ATTENTE_MS);
    setEtape("code");
  }

  async function verifierLeCode(e: React.FormEvent) {
    e.preventDefault();
    if (!adresse || !code || verif === "envoi") return;
    setVerif("envoi");
    setVerifRate("");
    try {
      const r = await fetch(ROUTE_VERIFIER, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courriel: adresse, code }),
      });
      if (r.ok) { await entre(); return; }
      // La route répond déjà dans la langue de l'écran : on affiche tel quel.
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setVerif("repos");
      setVerifRate(erreur || t.refus.indisponible);
    } catch {
      setVerif("repos");
      setVerifRate(t.refus.reseau);
    }
  }

  async function entrerAvecLePapier(e: React.FormEvent) {
    e.preventDefault();
    if (!adresse || !motPapier || papier === "envoi") return;
    setPapier("envoi");
    setPapierRate("");
    try {
      const r = await fetch(ROUTE_PAPIER, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courriel: adresse, code: motPapier }),
      });
      if (r.ok) { await entre(); return; }
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setPapier("repos");
      setPapierRate(erreur || t.entree.papierRate);
    } catch {
      setPapier("repos");
      setPapierRate(t.refus.reseau);
    }
  }

  if (etape === "code") {
    return (
      <CadreDeLaPorte langue={langue}>
        <EtapeDuCode
          langue={langue}
          adresse={adresse}
          code={code}
          setCode={setCode}
          ouvertA={ouvertA}
          verif={verif}
          verifRate={verifRate}
          onValider={verifierLeCode}
          onRenvoyer={demanderLeCode}
          onRetour={() => { setEtape("porte"); setCode(""); setVerifRate(""); }}
        />
      </CadreDeLaPorte>
    );
  }

  return (
    <CadreDeLaPorte langue={langue}>
      <section className="rounded-card bg-surface-raised px-5 py-6 shadow-sm">
        <h1 className="text-title font-semibold tracking-tight text-balance">
          {t.entree.titre}
        </h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.entree.sous}</p>
      </section>

      {/* — Le chemin, au singulier : le verrouillage du téléphone ————— */}
      <section className="empty:hidden">
        <EntrerAvecLeTelephone
          t={{
            avecLeTelephone: t.entree.avecLeTelephone,
            avecLeTelephoneAide: t.entree.avecLeTelephoneAide,
            telephoneEnCours: t.entree.telephoneEnCours,
            telephoneRate: t.entree.telephoneRate,
            telephoneImpossible: t.entree.telephoneImpossible,
          }}
          apres={() => { void entre(); }}
          separateur={
            /* Un « si », pas un « ou ». Les deux chemins ne se valent pas ici,
               et la mise en page ne doit pas prétendre le contraire. */
            <div className="mt-5 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="text-caption text-ink-faint">{t.entree.ouBien}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          }
        />
      </section>

      <p className="text-caption leading-relaxed text-ink-faint">{t.entree.pourquoi}</p>

      {/* — Le secours : replié, nommé, et annoncé ————————————————————— */}
      <details className="overflow-hidden rounded-card bg-surface-raised shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
          <IconLock size={20} className="shrink-0 text-ink-faint" />
          <span className="text-body">{t.entree.secoursTitre}</span>
        </summary>
        <div className="border-t border-line px-4 py-4">
          <p className="text-caption leading-relaxed text-ink-faint">
            {t.entree.secoursAide(Math.round(ATTENTE_MS / 60000))}
          </p>
          <form onSubmit={demanderLeCode} className="mt-3 flex flex-col gap-3">
            <label htmlFor="adresse" className="text-small text-ink-soft">
              {t.entree.adresse}
            </label>
            <input
              id="adresse"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              required
              className="h-12 w-full rounded-btn border border-line-control bg-surface-raised
                         px-3.5 text-body outline-none transition focus:border-ink"
            />
            <button
              type="submit"
              disabled={!adresse || demande !== "repos"}
              className="h-12 w-full rounded-btn border border-line-control bg-surface-raised
                         text-body font-medium transition hover:bg-surface-2 disabled:opacity-40"
            >
              {demande === "envoi" ? t.entree.demandeEnCours : t.entree.demander}
            </button>
          </form>
          {demandeRate && (
            <p role="alert" className="mt-3 text-small leading-relaxed text-negative">
              {demandeRate}
            </p>
          )}
        </div>
      </details>

      {/* — Le papier de dix codes : replié, mais son nom se lit sans ouvrir.
          Le jour où il sert, on est déjà en panique. */}
      <details className="overflow-hidden rounded-card bg-surface-raised shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
          <IconDoc size={20} className="shrink-0 text-ink-faint" />
          <span className="text-body">{t.entree.papierTitre}</span>
        </summary>
        <div className="border-t border-line px-4 py-4">
          <p className="text-caption leading-relaxed text-ink-faint">
            {t.entree.papierAide(CODES_DE_SECOURS)}
          </p>
          <form onSubmit={entrerAvecLePapier} className="mt-3 flex flex-col gap-3">
            <label htmlFor="adresse-papier" className="text-small text-ink-soft">
              {t.entree.adresse}
            </label>
            <input
              id="adresse-papier"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              required
              className="h-12 w-full rounded-btn border border-line-control bg-surface-raised
                         px-3.5 text-body outline-none transition focus:border-ink"
            />
            <label htmlFor="code-papier" className="text-small text-ink-soft">
              {t.entree.papierCode}
            </label>
            {/* Un code se colle : pas de longueur maximale, pas de masquage,
                pas de cases séparées. On y colle « 7K4M · 2QW9 » tel quel. */}
            <input
              id="code-papier"
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              spellCheck={false}
              value={motPapier}
              onChange={(e) => setMotPapier(e.target.value)}
              required
              className="tabnums h-12 w-full rounded-btn border border-line-control
                         bg-surface-raised px-3.5 text-body tracking-widest outline-none
                         transition focus:border-ink"
            />
            <button
              type="submit"
              disabled={!adresse || !motPapier || papier === "envoi"}
              className="h-12 w-full rounded-btn border border-line-control bg-surface-raised
                         text-body font-medium transition hover:bg-surface-2 disabled:opacity-40"
            >
              {papier === "envoi" ? t.entree.papierEnCours : t.entree.papierEntrer}
            </button>
          </form>
          {papierRate && (
            <p role="alert" className="mt-3 text-small leading-relaxed text-negative">
              {papierRate}
            </p>
          )}
        </div>
      </details>

      <p className="mt-auto text-caption leading-relaxed text-ink-faint">
        {t.entree.notePin}
      </p>
    </CadreDeLaPorte>
  );
}

/**
 * A2 — les six chiffres.
 *
 * LE CHAMP SE COLLE. Un seul champ, pas six cases, aucune longueur maximale,
 * aucun masquage : on y colle « 408 913 » avec son espace, et le serveur
 * enlève ce qui n'est pas un chiffre. Une longueur maximale tronque un collage
 * en silence (WCAG 2.2 §3.3.8), et six cases séparées rendent le collage
 * impossible sur la moitié des téléphones.
 */
function EtapeDuCode({
  langue, adresse, code, setCode, ouvertA, verif, verifRate,
  onValider, onRenvoyer, onRetour,
}: {
  langue: "en" | "fr";
  adresse: string;
  code: string;
  setCode: (v: string) => void;
  ouvertA: number;
  verif: "repos" | "envoi";
  verifRate: string;
  onValider: (e: React.FormEvent) => void;
  onRenvoyer: (e: React.FormEvent) => void;
  onRetour: () => void;
}) {
  const t = textesAdminPorte[langue];
  const [reste, setReste] = useState(() => Math.max(0, ouvertA - Date.now()));

  // Le compte à rebours de l'attente. Il ne verrouille rien — c'est le serveur
  // qui refuse — il DIT pourquoi le bouton ne sert à rien encore. Un bouton
  // grisé sans explication se martèle.
  useEffect(() => {
    if (reste <= 0) return;
    const h = setInterval(() => {
      setReste(Math.max(0, ouvertA - Date.now()));
    }, 1000);
    return () => clearInterval(h);
  }, [ouvertA, reste]);

  const secondes = Math.ceil(reste / 1000);

  return (
    <>
      <button
        type="button"
        onClick={onRetour}
        className="flex min-h-11 items-center self-start text-small text-ink-soft
                   underline underline-offset-4"
      >
        {t.code.autreAdresse}
      </button>

      <section className="rounded-card bg-surface-raised px-5 py-6 shadow-sm">
        <h1 className="text-title font-semibold tracking-tight text-balance">
          {t.code.titre}
        </h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">
          {t.code.sous(adresse)}
        </p>
      </section>

      <form onSubmit={onValider} className="flex flex-col gap-3">
        <label htmlFor="code" className="text-small text-ink-soft">{t.code.champ}</label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          aria-invalid={verifRate ? true : undefined}
          aria-describedby={verifRate ? "refus-code" : "attente-code"}
          className="tabnums h-12 w-full rounded-btn border border-line-control
                     bg-surface-raised px-3.5 text-body tracking-widest outline-none
                     transition focus:border-ink"
        />
        <p id="attente-code" className="text-caption leading-relaxed text-ink-faint">
          {secondes > 0 ? t.code.attente(secondes) : t.code.pret}
        </p>
        <button
          type="submit"
          disabled={!code || verif === "envoi"}
          className="flex h-12 w-full items-center justify-center rounded-btn bg-accent px-4
                     text-body font-medium text-white transition hover:bg-accent-hover
                     disabled:opacity-40"
        >
          {verif === "envoi" ? t.code.enCours : t.code.entrer}
        </button>
      </form>

      {verifRate && (
        <p id="refus-code" role="alert" className="text-small leading-relaxed text-negative">
          {verifRate}
        </p>
      )}

      <section>
        <h2 className="text-body font-semibold">{t.code.pasRecu}</h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-small leading-relaxed text-ink-soft">
          <li>{t.code.pasRecu1}</li>
          <li>{t.code.pasRecu2}</li>
          <li>{t.code.pasRecu3}</li>
        </ul>
        <button
          type="button"
          onClick={onRenvoyer}
          className="mt-3 flex min-h-11 items-center text-small text-accent
                     underline underline-offset-4"
        >
          {t.code.renvoyer}
        </button>
      </section>

      <p className="mt-auto text-caption leading-relaxed text-ink-faint">{t.code.seul}</p>
    </>
  );
}
