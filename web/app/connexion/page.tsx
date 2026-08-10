"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { textesConnexion } from "@/lib/textes/connexion";
import { BasculeLangue, useLangue } from "@/app/langue";
import { EntrerAvecLeTelephone } from "@/app/cle-boutons";
import { CLE_ADRESSE, demanderUnCode } from "@/app/entrer/raccord";
import { IconDoc, IconLock } from "@/app/icons";
import { Logo } from "../marque";

/**
 * L'entrée de tous les jours — l'écran le plus vu de toute la partie client.
 *
 * TROIS CHEMINS, ET L'ORDRE EST LA DÉCISION PRINCIPALE
 *
 * 1. LE VERROUILLAGE DU TÉLÉPHONE, en premier et en gros. C'est la journée
 *    normale : un geste, rien à retenir, et un faux site ne peut pas s'en
 *    servir. Le bouton vient de `cle-boutons.tsx` et ne se réécrit pas ici.
 * 2. LE CODE PAR MAIL, dépliée et visible sans rien ouvrir. C'est le chemin
 *    de l'autre appareil, du téléphone neuf, du capteur qui refuse — pas un
 *    rattrapage honteux : une personne qui entre par le mail tous les jours
 *    n'a rien fait de mal (docs/COMMENT-ON-ENTRE.md).
 * 3. LE PAPIER DE DIX CODES, replié mais NOMMÉ. Le jour où il sert, on est
 *    déjà en panique — le téléphone volé, la boîte mail avec lui. Il ne doit
 *    pas falloir le chercher : on lit son nom sans avoir à ouvrir quoi que ce
 *    soit, et un doigt suffit à le déplier.
 *
 * OÙ EST PASSÉ LE MOT DE PASSE, ET POURQUOI LÀ
 * Il ouvrait cet écran ; il est maintenant en dessous des trois chemins,
 * replié, et surtout RENOMMÉ PAR SON DESTINATAIRE : « Je suis le
 * propriétaire fondateur », et non « Mot de passe ». Le déplacer ne suffisait
 * pas — un champ intitulé « mot de passe », même en bas, se lit comme la voie
 * normale, et c'est celle-là qu'on essaie quand le reste résiste. Nommer la
 * personne au lieu de la technique fait le tri tout seul : les autres lisent
 * la ligne, comprennent qu'elle ne les concerne pas, et passent. Il reste
 * parce qu'il est vrai — `TOTEM_MOT_DE_PASSE` est la seule porte du
 * propriétaire tant que son compte à son nom n'existe pas — et il partira le
 * jour où ce compte existera, sans que cet écran ait à bouger.
 *
 * CE QUI NE SE VOIT PAS ET QUI COMPTE AUTANT
 * · Rien ne dit si un compte existe. Demander un code sur une adresse
 *   inventée affiche exactement ce qu'affiche une adresse connue ; le détail
 *   est dans `app/entrer/raccord.ts`, qui ne lit jamais la réponse.
 * · La bascule de langue est en haut, avant tout le reste : quelqu'un qui
 *   n'est pas encore entré n'a jamais eu l'occasion de choisir sa langue.
 * · Aucun champ ne prend le focus au chargement. Sur 390 px, le clavier qui
 *   se lève mange l'écran et cache les deux autres chemins.
 * · Un chemin qui échoue laisse les autres visibles : chaque message d'erreur
 *   s'affiche DANS sa section, et n'en remplace aucune.
 */
export default function Connexion() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesConnexion[langue];

  // Une seule adresse pour l'écran : celle du mail et celle du papier sont la
  // même personne. La retaper deux fois sur un écran fêlé n'apprend rien à
  // personne.
  const [adresse, setAdresse] = useState("");
  const [demande, setDemande] = useState<"repos" | "envoi" | "parti">("repos");
  const [demandeRate, setDemandeRate] = useState("");
  const [motPapier, setMotPapier] = useState("");
  const [papier, setPapier] = useState<"repos" | "envoi">("repos");
  const [papierRate, setPapierRate] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [passe, setPasse] = useState<"repos" | "envoi">("repos");
  const [passeRate, setPasseRate] = useState("");

  const entre = () => { router.replace("/"); router.refresh(); };

  async function demanderLeCode(e: React.FormEvent) {
    e.preventDefault();
    if (!adresse || demande === "envoi") return;
    setDemande("envoi");
    setDemandeRate("");
    try {
      await demanderUnCode(adresse);
    } catch {
      // Le serveur n'a rien dit du tout : c'est le réseau, pas le compte.
      setDemande("repos");
      setDemandeRate(t.connexionImpossible);
      return;
    }
    // Le même mot dans les deux cas, et on avance dans les deux cas.
    setDemande("parti");
    try { sessionStorage.setItem(CLE_ADRESSE, adresse); } catch { /* mode privé */ }
    router.push("/entrer");
  }

  async function entrerAvecLePapier(e: React.FormEvent) {
    e.preventDefault();
    if (!adresse || !motPapier || papier === "envoi") return;
    setPapier("envoi");
    setPapierRate("");
    try {
      const r = await fetch("/api/entrer/papier", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courriel: adresse, code: motPapier }),
      });
      if (r.ok) { entre(); return; }
      // La route répond déjà dans la langue de l'écran : afficher tel quel.
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setPapier("repos");
      setPapierRate(erreur || t.papierRate);
    } catch {
      setPapier("repos");
      setPapierRate(t.connexionImpossible);
    }
  }

  async function entrerEnFondateur(e: React.FormEvent) {
    e.preventDefault();
    if (!motDePasse || passe === "envoi") return;
    setPasse("envoi");
    setPasseRate("");
    try {
      const r = await fetch("/api/connexion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ motdepasse: motDePasse }),
      });
      if (r.ok) { entre(); return; }
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setPasse("repos");
      setPasseRate(erreur || t.motDePasseIncorrect);
    } catch {
      setPasse("repos");
      setPasseRate(t.connexionImpossible);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-5 py-5">
      {/* La langue AVANT tout le reste — voir l'en-tête. */}
      <header className="flex items-center gap-3">
        <Logo className="h-7" />
        <div className="ml-auto"><BasculeLangue /></div>
      </header>

      <section className="claustra rounded-card px-5 py-6">
        <h1 className="text-title font-semibold tracking-tight text-balance">{t.titre}</h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.sousTitre}</p>
      </section>

      {/* — Chemin 1 : le verrouillage du téléphone ————————————————————— */}
      <section className="empty:hidden">
        <EntrerAvecLeTelephone
          t={t}
          apres={entre}
          separateur={
            /* Un séparateur, pas un titre : les chemins se valent, et celui du
               dessous n'est pas un rattrapage. Il est passé au bouton parce
               qu'un « ou » qui reste quand le bouton disparaît ne sépare plus
               rien. */
            <div className="mt-5 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="text-caption text-ink-faint">{t.ouBien}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          }
        />
      </section>

      {/* — Chemin 2 : six chiffres par mail ——————————————————————————— */}
      <section>
        <h2 className="text-body font-semibold">{t.parMailTitre}</h2>
        <p className="mt-1 text-caption leading-relaxed text-ink-faint">{t.parMailAide}</p>
        <form onSubmit={demanderLeCode} className="mt-3 flex flex-col gap-3">
          <label htmlFor="adresse" className="text-small text-ink-soft">{t.adresse}</label>
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
            {demande === "envoi" ? t.demandeEnCours : t.demanderLeCode}
          </button>
        </form>
        {demande === "parti" && (
          /* La phrase au conditionnel : elle est la même pour une adresse
             connue et pour une adresse inventée. */
          <p role="status" className="mt-3 text-small leading-relaxed text-ink-soft">
            {t.codeParti(adresse)}
          </p>
        )}
        {demandeRate && (
          <p role="alert" className="mt-3 text-small leading-relaxed text-negative">
            {demandeRate}
          </p>
        )}
      </section>

      {/* — Chemin 3 : le papier de dix codes ——————————————————————————
          Replié, mais son nom se lit sans rien ouvrir. */}
      <details className="overflow-hidden rounded-card bg-surface-raised shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
          <IconDoc size={20} className="shrink-0 text-ink-faint" />
          <span className="text-body">{t.papierTitre}</span>
        </summary>
        <div className="border-t border-line px-4 py-4">
          <p className="text-caption leading-relaxed text-ink-faint">{t.papierAide}</p>
          <form onSubmit={entrerAvecLePapier} className="mt-3 flex flex-col gap-3">
            <label htmlFor="adresse-papier" className="text-small text-ink-soft">{t.adresse}</label>
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
            <label htmlFor="code-papier" className="text-small text-ink-soft">{t.papierCode}</label>
            {/* Un code se colle : pas de longueur maximale, pas de masquage,
                pas de cases séparées. On y colle « 4081 » avec ses espaces. */}
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
              {papier === "envoi" ? t.papierEnCours : t.papierEntrer}
            </button>
          </form>
          {papierRate && (
            <p role="alert" className="mt-3 text-small leading-relaxed text-negative">
              {papierRate}
            </p>
          )}
        </div>
      </details>

      {/* — La porte d'une seule personne, en attendant son compte nominatif */}
      <details className="rounded-card border border-line px-4">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3">
          <IconLock size={20} className="shrink-0 text-ink-faint" />
          <span className="text-small text-ink-soft">{t.fondateurTitre}</span>
        </summary>
        <div className="pb-4">
          <p className="text-caption leading-relaxed text-ink-faint">{t.fondateurAide}</p>
          <form onSubmit={entrerEnFondateur} className="mt-3 flex flex-col gap-3">
            <label htmlFor="mot-de-passe" className="text-small text-ink-soft">
              {t.motDePasse}
            </label>
            <input
              id="mot-de-passe"
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
              required
              className="h-12 w-full rounded-btn border border-line-control bg-surface-raised
                         px-3.5 text-body outline-none transition focus:border-ink"
            />
            <button
              type="submit"
              disabled={!motDePasse || passe === "envoi"}
              className="h-12 w-full rounded-btn border border-line-control bg-surface-raised
                         text-body font-medium transition hover:bg-surface-2 disabled:opacity-40"
            >
              {passe === "envoi" ? t.verification : t.seConnecter}
            </button>
          </form>
          {passeRate && (
            <p role="alert" className="mt-3 text-small text-negative">{passeRate}</p>
          )}
        </div>
      </details>

      {/* Un écran d'entrée n'est jamais un cul-de-sac : quand aucun des trois
          chemins ne s'ouvre, il reste un geste, et il porte un nom. */}
      <Link
        href="/retour"
        className="flex min-h-14 items-center justify-center text-small font-medium
                   text-accent underline underline-offset-4"
      >
        {t.plusEntrer}
      </Link>

      <p className="mt-auto text-caption leading-relaxed text-ink-faint">{t.notePin}</p>
    </main>
  );
}
