"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { textesInscription } from "@noyau/textes/inscription";
import { useLangue } from "@/app/langue";
import { Symbole } from "../marque";

/**
 * Créer son compte TOTEM, depuis un navigateur.
 *
 * OUVERT à tout le monde : TOTEM est une application grand public. Le compte
 * entre tout de suite ; il ne voit rien tant que TOTEM ne lui a pas attribué
 * de carte — et c'est CELA qui protège la maison, pas une porte fermée.
 *
 * Six champs, les mêmes que dans l'application du téléphone : prénom, nom,
 * adresse, courriel, téléphone, mot de passe. La plateforme refait tous les
 * contrôles ; l'écran ne fait qu'aider à remplir juste.
 *
 * Le mot de passe se demande DEUX fois. Une faute de frappe dans un champ
 * masqué ne se voit pas, et l'on découvrirait le problème à la connexion
 * suivante, sans savoir lequel des deux caractères a glissé.
 */
export default function Inscription() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesInscription[langue];

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [courriel, setCourriel] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [repete, setRepete] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");
  // Un verrou SYNCHRONE : deux appuis rapprochés lisent tous les deux
  // « repos » dans l'état React, qui ne se ferme qu'au rendu suivant.
  const enVol = useRef(false);

  const assezLong = motDePasse.length >= 12;
  const pareils = motDePasse === repete;
  const complet = Boolean(prenom.trim() && nom.trim() && adresse.trim()
    && telephone.trim() && courriel.trim()) && assezLong && pareils;

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!complet || enVol.current) return;
    enVol.current = true;
    setEtat("envoi");
    setMessage("");
    try {
      const r = await fetch(`/api/inscription?langue=${langue}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prenom, nom, adresse, telephone, courriel, motdepasse: motDePasse,
        }),
      });
      const corps = await r.json().catch(() => ({}));
      if (r.ok && corps.ok) {
        // Le compte est ouvert : il entre. Sans carte, l'accueil le dit.
        router.replace("/");
        router.refresh();
        return;
      }
      setEtat("erreur");
      setMessage(corps?.erreur || t.impossible);
    } catch {
      setEtat("erreur");
      setMessage(t.impossible);
    } finally {
      enVol.current = false;
    }
  }

  const champ =
    "rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition focus:border-ink";

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center py-10">
      <div className="mb-9">
        <Symbole size={34} className="text-laterite" />
        <h1 className="mt-5 text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.sousTitre}</p>
      </div>

      <form onSubmit={creer} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-small text-ink-soft">{t.prenom}</span>
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)}
              autoComplete="given-name" maxLength={60} autoFocus required className={champ} />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-small text-ink-soft">{t.nom}</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)}
              autoComplete="family-name" maxLength={60} required className={champ} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.adresse}</span>
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)}
            autoComplete="street-address" maxLength={200} placeholder={t.adresseExemple}
            required className={champ} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.telephone}</span>
          <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)}
            autoComplete="tel" inputMode="tel" maxLength={24}
            placeholder={t.telephoneExemple} required className={champ} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.courriel}</span>
          <input type="email" value={courriel} onChange={(e) => setCourriel(e.target.value)}
            autoComplete="username" autoCapitalize="none" required className={champ} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.motDePasse}</span>
          <input type="password" value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="new-password" required className={champ} />
          <span className={`text-caption ${
            motDePasse && !assezLong ? "text-negative" : "text-ink-faint"
          }`}>
            {t.motDePasseConseil}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-small text-ink-soft">{t.confirmer}</span>
          <input type="password" value={repete} onChange={(e) => setRepete(e.target.value)}
            autoComplete="new-password" required className={champ} />
          {repete && !pareils && (
            <span className="text-caption text-negative">{t.differents}</span>
          )}
        </label>

        <button
          type="submit"
          disabled={!complet || etat === "envoi"}
          className="mt-2 rounded-btn bg-ink py-3 text-body font-medium text-white transition hover:opacity-90 disabled:opacity-35"
        >
          {etat === "envoi" ? t.creation : t.creer}
        </button>

        {etat === "erreur" && <p className="text-small text-negative">{message}</p>}

        <p className="text-caption leading-relaxed text-ink-faint">
          {t.conditionsAvant}
          <a href="/confidentialite" className="underline underline-offset-4">
            {t.conditionsLien}
          </a>
          {t.conditionsApres}
        </p>
      </form>

      <a
        href="/connexion"
        className="mt-6 text-center text-small font-medium text-ink underline underline-offset-4"
      >
        {t.dejaUnCompte}
      </a>

      <p className="mt-10 text-caption leading-relaxed text-ink-faint">{t.notePin}</p>
    </div>
  );
}
