"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { LANGUES } from "@noyau/langue";
import { textesConnexion } from "@noyau/textes/connexion";
import { changerLangue, useLangue } from "@/app/langue";
import { Symbole } from "../marque";
import { COURRIEL_EN_ATTENTE } from "./attente";

/**
 * L'écran de connexion — le verrou réel de la plateforme.
 *
 * DEUX TEMPS, PAS DE MOT DE PASSE. On donne son courriel ; un code à six
 * chiffres part vers cette boîte ; on le tape. Le code sert une fois, vit dix
 * minutes, et ne s'invente pas — ce qui vaut mieux qu'un mot de passe qu'on
 * choisit mal, qu'on réutilise ailleurs et dont la fuite ailleurs ouvrait la
 * porte ici.
 *
 * L'écran ne dit JAMAIS si une adresse a un compte : « si cette adresse a un
 * accès, un code vient de partir ». Le dire apprendrait à n'importe qui
 * quelles adresses ouvrent quelque chose ici.
 *
 * Sous le formulaire, un lien discret : la CLÉ DE SECOURS, posée dans les
 * variables d'environnement de l'hébergement. Elle reste pour le jour où la
 * base ou le courrier se taisent — une panne ne doit pas être un verrou sur
 * sa propre maison.
 *
 * Ce n'est PAS le code PIN Mobile Money : celui-là ne se saisit qu'au moment
 * d'une opération, et n'est enregistré nulle part.
 */
export default function Connexion() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesConnexion[langue];
  const [courriel, setCourriel] = useState("");
  const [code, setCode] = useState("");
  const [cle, setCle] = useState("");
  // Où l'on en est : donner son courriel, taper le code, ou la clé de secours.
  const [etape, setEtape] = useState<"courriel" | "code" | "secours">("courriel");
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");
  // Peut-on encore créer un compte ? Non dès qu'il y en a un. On ne montre
  // donc pas un lien qui ne mènerait qu'à un refus.
  const [inscriptionOuverte, setInscriptionOuverte] = useState(false);
  // Les codes peuvent-ils partir ? Sinon on le dit AVANT que quelqu'un
  // attende une lettre qui ne viendra jamais.
  const [codesPossibles, setCodesPossibles] = useState(true);
  // Les secondes avant de pouvoir redemander un code : la base refuse d'en
  // poser un second dans la minute, l'écran ne propose pas un geste vain.
  const [attente, setAttente] = useState(0);

  useEffect(() => {
    fetch("/api/plateforme", { cache: "no-store" })
      .then((r) => r.json())
      .then((p) => {
        setInscriptionOuverte(p?.inscription === true);
        setCodesPossibles(p?.codes !== false);
      })
      .catch(() => setInscriptionOuverte(false));
  }, []);

  // Venu de l'inscription : un code est déjà parti, on reprend au code.
  useEffect(() => {
    try {
      const enAttente = sessionStorage.getItem(COURRIEL_EN_ATTENTE);
      if (enAttente) {
        sessionStorage.removeItem(COURRIEL_EN_ATTENTE);
        setCourriel(enAttente);
        setEtape("code");
        setAttente(60);
      }
    } catch { /* stockage refusé : on part du courriel, comme d'habitude */ }
  }, []);

  useEffect(() => {
    if (attente <= 0) return;
    const minuteur = setTimeout(() => setAttente((s) => s - 1), 1000);
    return () => clearTimeout(minuteur);
  }, [attente]);

  async function poster(chemin: string, corps: unknown): Promise<Response> {
    return fetch(chemin, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corps),
    });
  }

  async function demanderCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!courriel || etat === "envoi") return;
    setEtat("envoi");
    setMessage("");
    try {
      const r = await poster("/api/code", { courriel });
      if (!r.ok) {
        const { erreur } = await r.json().catch(() => ({ erreur: "" }));
        setEtat("erreur");
        setMessage(erreur || t.connexionImpossible);
        return;
      }
      setEtape("code");
      setCode("");
      setAttente(60);
      setEtat("repos");
    } catch {
      setEtat("erreur");
      setMessage(t.connexionImpossible);
    }
  }

  async function entrer(e: React.FormEvent) {
    e.preventDefault();
    if (etat === "envoi") return;
    const corps = etape === "secours" ? { motdepasse: cle } : { courriel, code };
    if (etape === "secours" ? !cle : code.replace(/\D/g, "").length !== 6) return;
    setEtat("envoi");
    setMessage("");
    try {
      const r = await poster("/api/connexion", corps);
      if (r.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      // La route répond déjà dans la langue de l'écran : afficher tel quel.
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      setEtat("erreur");
      setMessage(erreur || t.connexionImpossible);
    } catch {
      setEtat("erreur");
      setMessage(t.connexionImpossible);
    }
  }

  const champ =
    "rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink";
  const bouton =
    "mt-2 rounded-btn bg-ink py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35";

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center py-10">
      <div className="mb-9">
        <Symbole size={34} className="text-laterite" />
        <h1 className="mt-5 text-title font-semibold tracking-tight">{t.titre}</h1>
        {/* La présentation en une phrase : c'est le seul écran qu'un visiteur
            verra jamais — il doit dire ce qu'est TOTEM. */}
        <p className="mt-2 text-small leading-relaxed text-ink-soft">
          {t.sousTitre}
        </p>
        <p className="mt-2 text-caption text-ink-faint">{t.reserve}</p>
      </div>

      {etape === "courriel" && (
        <form onSubmit={demanderCode} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-small text-ink-soft">{t.courriel}</span>
            <input
              type="email"
              name="courriel"
              value={courriel}
              onChange={(e) => setCourriel(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              required
              className={champ}
            />
          </label>
          {!codesPossibles && (
            <p className="text-caption leading-relaxed text-alert">{t.codesIndisponibles}</p>
          )}
          <button type="submit" disabled={!courriel || etat === "envoi"} className={bouton}>
            {etat === "envoi" ? t.envoiDuCode : t.recevoirCode}
          </button>
        </form>
      )}

      {etape === "code" && (
        <form onSubmit={entrer} className="flex flex-col gap-4">
          <p className="text-small leading-relaxed text-ink-soft" role="status">
            {t.codeAide(courriel)}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-small text-ink-soft">{t.codeRecu}</span>
            {/* « one-time-code » : le téléphone propose le code tout seul
                quand la lettre arrive. */}
            <input
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              className={`${champ} text-center text-title tracking-[0.4em] tabnums`}
            />
          </label>
          <button
            type="submit"
            disabled={code.replace(/\D/g, "").length !== 6 || etat === "envoi"}
            className={bouton}
          >
            {etat === "envoi" ? t.verification : t.seConnecter}
          </button>
          <div className="flex flex-wrap justify-between gap-2 text-caption">
            <button
              type="button"
              disabled={attente > 0 || etat === "envoi"}
              onClick={() => void demanderCode()}
              className="min-h-11 text-ink-soft underline underline-offset-4 disabled:no-underline disabled:opacity-60"
            >
              {attente > 0 ? t.renvoyerDans(attente) : t.renvoyer}
            </button>
            <button
              type="button"
              onClick={() => { setEtape("courriel"); setMessage(""); setEtat("repos"); }}
              className="min-h-11 text-ink-soft underline underline-offset-4"
            >
              {t.autreAdresse}
            </button>
          </div>
        </form>
      )}

      {etape === "secours" && (
        <form onSubmit={entrer} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-small text-ink-soft">{t.motDePasse}</span>
            <input
              type="password"
              value={cle}
              onChange={(e) => setCle(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
              className={champ}
            />
          </label>
          <p className="text-caption leading-relaxed text-ink-faint">
            {t.cleDeSecoursAide}
          </p>
          <button type="submit" disabled={!cle || etat === "envoi"} className={bouton}>
            {etat === "envoi" ? t.verification : t.seConnecter}
          </button>
        </form>
      )}

      {etat === "erreur" && (
        <p className="mt-4 text-small text-negative" role="alert">{message}</p>
      )}

      <div className="mt-6 flex flex-col items-center gap-3 text-small">
        {inscriptionOuverte && (
          <a href="/inscription" className="font-medium text-ink underline underline-offset-4">
            {t.creerUnCompte}
          </a>
        )}
        {/* La clé de secours ne s'annonce pas plus fort que cela : ce n'est
            pas le chemin de tous les jours. */}
        <button
          type="button"
          onClick={() => {
            setEtape((e) => (e === "secours" ? "courriel" : "secours"));
            setMessage(""); setEtat("repos");
          }}
          className="text-caption text-ink-faint transition hover:text-ink-soft"
        >
          {etape === "secours" ? t.retourAuCompte : t.cleDeSecours}
        </button>
      </div>

      {/* Le choix de la langue — chaque nom dans sa propre langue */}
      <div className="mt-8 flex items-center justify-center gap-2 text-caption" aria-label={t.langue}>
        {LANGUES.map(({ code, libelle }, i) => (
          <Fragment key={code}>
            {i > 0 && <span aria-hidden className="text-ink-faint">·</span>}
            <button
              type="button"
              onClick={() => changerLangue(code)}
              aria-current={code === langue || undefined}
              className={
                code === langue
                  ? "font-medium text-ink"
                  : "text-ink-faint transition hover:text-ink-soft"
              }
            >
              {libelle}
            </button>
          </Fragment>
        ))}
      </div>

      <p className="mt-10 text-caption leading-relaxed text-ink-faint">
        {t.notePin}
      </p>
    </div>
  );
}
