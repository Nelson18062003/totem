"use client";

// Les deux boutons qui parlent au téléphone.
//
// « EntrerAvecLeTelephone » ouvre la porte. « PoserUneCle » installe la clé,
// une fois entré.
//
// TROIS CHOSES QUE CES BOUTONS FONT ET QUI NE SE VOIENT PAS
//
// 1. ILS NE SE MONTRENT QUE SI LE NAVIGATEUR SAIT FAIRE. Un bouton qui échoue
//    toujours est pire que pas de bouton : il fait croire à une panne de
//    TOTEM. On demande au navigateur, et on n'affiche qu'ensuite.
//
// 2. UN REFUS N'EST JAMAIS UN CUL-DE-SAC. Chaque échec laisse l'autre chemin
//    visible juste en dessous — le mot de passe, ou le code par mail.
//
// 3. « L'UTILISATEUR A ANNULÉ » N'EST PAS UNE ERREUR. Quelqu'un qui ferme la
//    fenêtre de son téléphone a changé d'avis ; lui afficher un message rouge
//    lui apprend qu'il a fait une bêtise, ce qui est faux.

import { useEffect, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

/** Le navigateur sait-il se servir du verrouillage du téléphone ? */
function useSaitFaire(): boolean | null {
  const [sait, setSait] = useState<boolean | null>(null);
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const dispo = typeof window !== "undefined"
          && typeof window.PublicKeyCredential !== "undefined";
        if (!dispo) { if (vivant) setSait(false); return; }
        // On demande au navigateur s'il a un verrou intégré à portée. La
        // réponse « non » n'est pas rédhibitoire — une clé qu'on branche
        // marcherait — mais elle dit qu'ici, ça ne servira à rien.
        const interne = await window.PublicKeyCredential
          .isUserVerifyingPlatformAuthenticatorAvailable?.();
        if (vivant) setSait(interne !== false);
      } catch {
        if (vivant) setSait(false);
      }
    })();
    return () => { vivant = false; };
  }, []);
  return sait;
}

/** Annulé par la personne : ce n'est pas un échec, et on ne dit rien. */
function estUnRenoncement(e: unknown): boolean {
  const nom = (e as { name?: string })?.name;
  return nom === "NotAllowedError" || nom === "AbortError";
}

type TextesEntree = {
  avecLeTelephone: string;
  avecLeTelephoneAide: string;
  telephoneEnCours: string;
  telephoneRate: string;
  telephoneImpossible: string;
};

export function EntrerAvecLeTelephone(
  { t, apres }: { t: TextesEntree; apres: () => void },
) {
  const sait = useSaitFaire();
  const [etat, etablir] = useState<"repos" | "attente" | "rate">("repos");
  const [message, dire] = useState("");

  // Tant qu'on ne sait pas, on ne montre rien : un bouton qui apparaît puis
  // disparaît est plus déroutant qu'un demi-instant d'attente.
  if (sait === null) return null;
  if (sait === false) {
    return <p className="text-caption leading-relaxed text-ink-faint">{t.telephoneImpossible}</p>;
  }

  async function entrer() {
    etablir("attente");
    dire("");
    try {
      const demande = await fetch("/api/cle/entrer");
      if (!demande.ok) throw new Error("options");
      const options = await demande.json();
      const signature = await startAuthentication({ optionsJSON: options });
      const r = await fetch("/api/cle/entrer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(signature),
      });
      if (r.ok) { apres(); return; }
      const { erreur } = await r.json().catch(() => ({ erreur: "" }));
      etablir("rate");
      dire(erreur || t.telephoneRate);
    } catch (e) {
      if (estUnRenoncement(e)) { etablir("repos"); return; }
      etablir("rate");
      dire(t.telephoneRate);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={entrer}
        disabled={etat === "attente"}
        className="flex h-12 w-full items-center justify-center rounded-btn bg-accent px-4
                   text-body font-medium text-white transition
                   hover:bg-accent-hover disabled:opacity-40"
      >
        {etat === "attente" ? t.telephoneEnCours : t.avecLeTelephone}
      </button>
      <p className="text-center text-caption text-ink-faint">{t.avecLeTelephoneAide}</p>
      {etat === "rate" && (
        <p role="alert" className="text-small text-negative">{message}</p>
      )}
    </div>
  );
}

type TextesPose = {
  poser: string;
  poserAide: string;
  poserEnCours: string;
  poserFait: string;
  poserFaitSauvegardee: string;
  poserRate: string;
  poserImpossible: string;
  plusTard: string;
};

export function PoserUneCle(
  { t, apres }: { t: TextesPose; apres?: () => void },
) {
  const sait = useSaitFaire();
  const [etat, etablir] = useState<"repos" | "attente" | "faite" | "rate">("repos");
  const [message, dire] = useState("");

  if (sait === null) return null;
  if (sait === false) {
    return <p className="text-caption leading-relaxed text-ink-faint">{t.poserImpossible}</p>;
  }

  async function poser() {
    etablir("attente");
    dire("");
    try {
      const demande = await fetch("/api/cle/enregistrer");
      if (!demande.ok) {
        const { erreur } = await demande.json().catch(() => ({ erreur: "" }));
        etablir("rate");
        dire(erreur || t.poserRate);
        return;
      }
      const options = await demande.json();
      const preuve = await startRegistration({ optionsJSON: options });
      const r = await fetch("/api/cle/enregistrer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(preuve),
      });
      if (!r.ok) {
        const { erreur } = await r.json().catch(() => ({ erreur: "" }));
        etablir("rate");
        dire(erreur || t.poserRate);
        return;
      }
      const { sauvegardee } = await r.json();
      etablir("faite");
      dire(sauvegardee ? t.poserFaitSauvegardee : t.poserFait);
      apres?.();
    } catch (e) {
      if (estUnRenoncement(e)) { etablir("repos"); return; }
      etablir("rate");
      dire(t.poserRate);
    }
  }

  if (etat === "faite") {
    return <p role="status" className="text-small leading-relaxed text-positive">{message}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={poser}
        disabled={etat === "attente"}
        className="flex h-12 w-full items-center justify-center rounded-btn bg-accent px-4
                   text-body font-medium text-white transition
                   hover:bg-accent-hover disabled:opacity-40"
      >
        {etat === "attente" ? t.poserEnCours : t.poser}
      </button>
      <p className="text-center text-caption leading-relaxed text-ink-faint">{t.poserAide}</p>
      {etat === "rate" && (
        <p role="alert" className="text-small text-negative">{message}</p>
      )}
    </div>
  );
}
