"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { textesConnexion } from "@/lib/textes/connexion";
import { BasculeLangue, useLangue } from "@/app/langue";
import { CLE_ADRESSE, demanderUnCode, verifierUnCode } from "./raccord";
import { Logo } from "@/app/marque";

/**
 * Les six chiffres, pour l'entrée de tous les jours.
 *
 * POURQUOI UN ÉCRAN À PART, ET PAS UN CHAMP DE PLUS SUR /connexion
 * Entre la demande et la saisie, la personne quitte TOTEM : elle va dans sa
 * boîte mail, et le téléphone met l'onglet en sommeil — parfois le tue. Une
 * adresse de page à soi survit à ce voyage ; un état gardé en mémoire dans
 * l'écran précédent, non. Elle reviendrait sur un écran remis à zéro, sans
 * comprendre pourquoi son code ne sert plus à rien.
 *
 * L'ADRESSE NE PASSE PAS PAR L'URL. Elle vit dans le stockage de session (voir
 * `raccord.ts`) : une adresse mail dans une adresse de page finit dans
 * l'historique du téléphone et dans les journaux de l'hébergeur.
 *
 * CET ÉCRAN SE SUFFIT À LUI-MÊME. Ouvert directement, sans rien en mémoire,
 * il demande l'adresse et envoie le code lui-même. Un écran qui ne saurait
 * que dire « recommencez ailleurs » serait un cul-de-sac de plus, à l'endroit
 * exact où quelqu'un est déjà en train de s'énerver.
 *
 * LE CHAMP DE CODE SE COLLE : pas de longueur maximale, pas de six cases
 * séparées, pas de masquage. On y colle « 408 913 » avec son espace, tel que
 * le message l'écrit, et c'est le serveur qui enlève ce qui n'est pas un
 * chiffre.
 */
export default function Entrer() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesConnexion[langue];

  const [pret, setPret] = useState(false);
  const [courriel, setCourriel] = useState("");
  const [saisie, setSaisie] = useState("");
  const [code, setCode] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi">("repos");
  const [parti, setParti] = useState(false);
  const [rate, setRate] = useState("");

  useEffect(() => {
    try {
      const su = sessionStorage.getItem(CLE_ADRESSE);
      if (su) { setCourriel(su); setParti(true); }
    } catch { /* mode privé : on demandera l'adresse */ }
    setPret(true);
  }, []);

  async function demander(e: React.FormEvent) {
    e.preventDefault();
    if (!saisie || etat === "envoi") return;
    setEtat("envoi");
    setRate("");
    try {
      // On ne lit pas la réponse : voir `raccord.ts`. Une adresse inconnue
      // doit produire exactement ce que produit une adresse connue.
      await demanderUnCode(saisie);
    } catch {
      setEtat("repos");
      setRate(t.connexionImpossible);
      return;
    }
    setEtat("repos");
    setCourriel(saisie);
    setParti(true);
    try { sessionStorage.setItem(CLE_ADRESSE, saisie); } catch { /* mode privé */ }
  }

  async function renvoyer() {
    if (etat === "envoi") return;
    setEtat("envoi");
    setRate("");
    try {
      await demanderUnCode(courriel);
    } catch {
      setRate(t.connexionImpossible);
    }
    setEtat("repos");
    setParti(true);
  }

  async function entrer(e: React.FormEvent) {
    e.preventDefault();
    if (!code || etat === "envoi") return;
    setEtat("envoi");
    setRate("");
    try {
      const v = await verifierUnCode(courriel, code);
      if (v.ok) { router.replace("/"); router.refresh(); return; }
      setEtat("repos");
      // La route répond déjà dans la langue de l'écran : afficher tel quel.
      setRate(v.erreur || t.codeRate);
    } catch {
      setEtat("repos");
      setRate(t.connexionImpossible);
    }
  }

  function changerDAdresse() {
    setCourriel("");
    setSaisie("");
    setCode("");
    setParti(false);
    setRate("");
    try { sessionStorage.removeItem(CLE_ADRESSE); } catch { /* mode privé */ }
  }

  const champ = "h-12 w-full rounded-btn border border-line-control bg-surface-raised "
    + "px-3.5 text-body outline-none transition focus:border-ink";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-5 py-5">
      {/* La langue avant tout le reste : on n'est pas encore entré, donc on
          n'a encore rien pu choisir. */}
      <header className="flex items-center gap-3">
        <Logo className="h-7" />
        <div className="ml-auto"><BasculeLangue /></div>
      </header>

      <section className="claustra rounded-card px-5 py-6">
        <h1 className="text-title font-semibold tracking-tight text-balance">
          {t.saisieTitre}
        </h1>
        {parti && courriel && (
          <p role="status" className="mt-2 text-small leading-relaxed text-ink-soft">
            {t.codeParti(courriel)}
          </p>
        )}
      </section>

      {pret && !courriel && (
        <section>
          <h2 className="text-body font-semibold">{t.parMailTitre}</h2>
          <form onSubmit={demander} className="mt-3 flex flex-col gap-3">
            <label htmlFor="adresse" className="text-small text-ink-soft">{t.adresse}</label>
            <input
              id="adresse"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              required
              className={champ}
            />
            <button
              type="submit"
              disabled={!saisie || etat === "envoi"}
              className="h-12 w-full rounded-btn bg-accent text-body font-medium text-white
                         transition hover:bg-accent-hover disabled:opacity-40"
            >
              {etat === "envoi" ? t.demandeEnCours : t.demanderLeCode}
            </button>
          </form>
        </section>
      )}

      {pret && courriel && (
        <section>
          <form onSubmit={entrer} className="flex flex-col gap-3">
            <label htmlFor="code" className="text-small text-ink-soft">{t.saisieCode}</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              spellCheck={false}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={`${champ} tabnums text-title tracking-[0.2em]`}
            />
            <p className="text-caption text-ink-faint">{t.saisieAide}</p>
            <button
              type="submit"
              disabled={!code || etat === "envoi"}
              className="h-12 w-full rounded-btn bg-accent text-body font-medium text-white
                         transition hover:bg-accent-hover disabled:opacity-40"
            >
              {etat === "envoi" ? t.saisieEnCours : t.saisieEntrer}
            </button>
          </form>

          {/* Un chemin qui n'aboutit pas laisse toujours le geste suivant. */}
          <div className="mt-4 flex flex-col">
            <button
              type="button"
              onClick={renvoyer}
              disabled={etat === "envoi"}
              className="flex min-h-14 items-center text-small font-medium text-accent
                         underline underline-offset-4 disabled:opacity-40"
            >
              {t.renvoyer}
            </button>
            <button
              type="button"
              onClick={changerDAdresse}
              className="flex min-h-14 items-center text-small text-ink-soft
                         underline underline-offset-4"
            >
              {t.autreAdresse}
            </button>
          </div>
        </section>
      )}

      {rate && (
        <p role="alert" className="text-small leading-relaxed text-negative">{rate}</p>
      )}

      <nav className="flex flex-col">
        <Link
          href="/connexion"
          className="flex min-h-14 items-center text-small font-medium text-accent
                     underline underline-offset-4"
        >
          {t.autresChemins}
        </Link>
        <Link
          href="/retour"
          className="flex min-h-14 items-center text-small text-ink-soft
                     underline underline-offset-4"
        >
          {t.plusEntrer}
        </Link>
      </nav>

      <p className="mt-auto text-caption leading-relaxed text-ink-faint">{t.notePin}</p>
    </main>
  );
}
