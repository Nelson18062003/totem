"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changerLangue, useLangue } from "@/app/langue";
import { codesUssd, type CodeUssd } from "@/lib/codes";
import { LANGUES } from "@/lib/langue";
import { textesReglages } from "@/lib/textes/reglages";
import { IconClose, IconHash, IconPlus } from "../icons";

/**
 * Le numéro d'une puce, réglé depuis la plateforme. C'est lui qui dit de quel
 * côté d'un dépôt ou d'un transfert se trouve le terminal : sans lui, un dépôt
 * s'affiche sans qu'on sache s'il sort ou entre.
 *
 * La saisie ne touche jamais un modem : elle dépose une demande que le robot
 * de Douala relève, contrôle et applique — puis republie. On attend sa
 * confirmation avant de dire que c'est fait.
 */
export function ReglageNumero({
  iccid,
  numeroInitial,
  libelle,
}: {
  iccid: string;
  numeroInitial: string;
  libelle: string;
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesReglages[langue];
  const [numero, setNumero] = useState(numeroInitial);
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(numeroInitial);
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");

  async function attendre(id: number) {
    // Le robot relève les demandes toutes les quelques secondes : on patiente
    // jusqu'à ~40 s, puis on considère qu'il n'a pas répondu.
    for (let i = 0; i < 26; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const rep = await fetch(`/api/commande/${id}`, { cache: "no-store" });
      if (!rep.ok) continue;
      const c = await rep.json();
      if (c.etat === "faite" || c.etat === "echouee") return c;
    }
    return null;
  }

  async function enregistrer() {
    const propre = brouillon.replace(/\D/g, "");
    if (propre.length < 8) {
      setEtat("erreur");
      setMessage(t.neufChiffres);
      return;
    }
    setEtat("envoi");
    setMessage("");
    try {
      const rep = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "identite", parametres: { iccid, numero: propre } }),
      });
      const { id, erreur } = await rep.json();
      if (!rep.ok || !id) throw new Error(erreur || "demande refusée");
      const resultat = await attendre(id);
      if (!resultat) {
        setEtat("erreur");
        setMessage(t.pasRepondu);
        return;
      }
      if (resultat.etat === "faite") {
        setNumero(propre);
        setEdition(false);
        setEtat("repos");
        router.refresh(); // la page relit la base, numéro à jour partout
      } else if (/inconnue/i.test(resultat.resultat || "")) {
        // Le terminal tourne une version d'avant ce réglage : il ne connaît
        // pas encore la demande. On le dit clairement, avec l'issue de secours.
        setEtat("erreur");
        setMessage(t.majRequise);
      } else {
        // Le résultat écrit par le robot arrive déjà dans la langue choisie.
        setEtat("erreur");
        setMessage(resultat.resultat || t.aRefuse);
      }
    } catch {
      setEtat("erreur");
      setMessage(t.pasPartie);
    }
  }

  if (!edition) {
    return (
      <button
        onClick={() => {
          setBrouillon(numero);
          setEdition(true);
          setEtat("repos");
          setMessage("");
        }}
        className="rounded-btn border border-transparent px-2 py-1 text-small tabnums text-ink-soft transition hover:border-line-control hover:text-ink"
        title={t.reglerNumero(libelle)}
      >
        {numero || t.numeroARenseigner}
      </button>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1.5">
        <input
          value={brouillon}
          autoFocus
          inputMode="tel"
          disabled={etat === "envoi"}
          onChange={(e) => setBrouillon(e.target.value.replace(/[^\d\s]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && enregistrer()}
          placeholder="696103864"
          className="w-32 rounded-btn border border-ink bg-surface-raised px-2.5 py-1.5 text-right text-small tabnums outline-none disabled:opacity-50"
        />
        <button
          onClick={enregistrer}
          disabled={etat === "envoi"}
          className="rounded-btn bg-ink px-2.5 py-1.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {etat === "envoi" ? "…" : "OK"}
        </button>
        <button
          onClick={() => setEdition(false)}
          aria-label={t.annuler}
          disabled={etat === "envoi"}
          className="grid size-8 place-items-center rounded-btn border border-line-control text-ink-faint transition hover:text-ink disabled:opacity-40"
        >
          <IconClose size={14} />
        </button>
      </span>
      {etat === "envoi" && (
        <span className="text-caption text-ink-faint">{t.enregistrement}</span>
      )}
      {etat === "erreur" && (
        <span className="max-w-52 text-right text-caption text-negative">{message}</span>
      )}
    </span>
  );
}

/**
 * Les codes du guichet, par opérateur. Rien n'est deviné : le catalogue de
 * départ a été composé sur un vrai téléphone, et chaque code se corrige ou
 * s'ajoute ici — un opérateur qui change son menu ne casse rien.
 *
 * Les codes eux-mêmes (#148#…) ne se traduisent jamais : seuls les libellés
 * autour changent de langue. Un raccourci ajouté à la main garde son nom.
 */
export function SectionCodes({ operateur }: { operateur: string }) {
  const langue = useLangue();
  const t = textesReglages[langue];
  const [codes, setCodes] = useState<CodeUssd[]>(codesUssd[operateur] ?? []);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [ajout, setAjout] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauCode, setNouveauCode] = useState("");

  const proprer = (v: string) => v.replace(/[^0-9#*]/g, "");

  const enregistrer = (cle: string) => {
    if (brouillon.trim()) {
      setCodes((cs) => cs.map((c) => (c.cle === cle ? { ...c, code: brouillon.trim() } : c)));
    }
    setEnEdition(null);
  };

  const ajouter = () => {
    if (!nouveauNom.trim() || !nouveauCode.trim()) return;
    setCodes((cs) => [...cs, {
      cle: `perso-${cs.length}`, libelle: nouveauNom.trim(), code: nouveauCode.trim(),
    }]);
    setNouveauNom(""); setNouveauCode(""); setAjout(false);
  };

  return (
    <section>
      <h2 className="mb-3 text-heading font-semibold">{t.codesUssd}</h2>
      <div className="rounded-card border border-line bg-surface-raised">
        <p className="border-b border-line px-4 py-3 text-caption uppercase tracking-wider text-ink-faint">
          {t.carteEnPlace(operateur)}
        </p>
        {codes.length === 0 && !ajout && (
          <p className="px-4 py-4 text-small leading-relaxed text-ink-soft">
            {t.aucunCode(operateur)}
          </p>
        )}
        <ul className="divide-hair px-4">
          {codes.map((c) => (
            <li key={c.cle} className="flex items-center gap-3 py-3">
              <IconHash size={16} className="shrink-0 text-ink-faint" />
              <span className="flex-1 text-body">{t.libellesCodes[c.cle] ?? c.libelle}</span>
              {enEdition === c.cle ? (
                <span className="flex items-center gap-1.5">
                  <input
                    value={brouillon} autoFocus
                    onChange={(e) => setBrouillon(proprer(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && enregistrer(c.cle)}
                    className="w-32 rounded-btn border border-ink bg-surface-raised px-2.5 py-1.5 text-right text-small tabnums outline-none"
                  />
                  <button onClick={() => enregistrer(c.cle)}
                    className="rounded-btn bg-ink px-2.5 py-1.5 text-small font-medium text-white transition hover:opacity-90">
                    OK
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => { setEnEdition(c.cle); setBrouillon(c.code); }}
                  title={t.modifierCode}
                  className="rounded-btn border border-transparent px-2 py-1 text-small tabnums text-ink-soft transition hover:border-line-control hover:text-ink"
                >
                  {c.code}
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-3">
          {ajout ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)}
                placeholder={t.nomExemple} autoFocus
                className="flex-1 rounded-btn border border-line-control bg-surface-raised px-3 py-2 text-small outline-none transition focus:border-ink" />
              <input value={nouveauCode} onChange={(e) => setNouveauCode(proprer(e.target.value))}
                placeholder="#148*6#" inputMode="tel"
                className="w-full rounded-btn border border-line-control bg-surface-raised px-3 py-2 text-small tabnums outline-none transition focus:border-ink sm:w-32" />
              <span className="flex gap-2">
                <button onClick={ajouter} disabled={!nouveauNom.trim() || !nouveauCode.trim()}
                  className="flex-1 rounded-btn bg-ink px-4 py-2 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
                  {t.ajouter}
                </button>
                <button onClick={() => setAjout(false)} aria-label={t.annulerAjout}
                  className="grid size-9 place-items-center rounded-btn border border-line-control text-ink-faint transition hover:text-ink">
                  <IconClose size={15} />
                </button>
              </span>
            </div>
          ) : (
            <button onClick={() => setAjout(true)}
              className="flex w-full items-center justify-center gap-2 rounded-btn border border-line-control py-2.5 text-small font-medium transition hover:border-ink-faint">
              <IconPlus size={15} /> {t.ajouterRaccourci}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-faint">
        {t.noteCodes}
      </p>
    </section>
  );
}

/**
 * La langue de la plateforme, au choix du propriétaire. Le clic pose le
 * cookie et recharge : le serveur repeint tout dans la nouvelle langue.
 * Les noms des deux choix (« English », « Français ») ne se traduisent pas :
 * chacun se reconnaît dans sa propre écriture.
 */
export function SectionLangue() {
  const langue = useLangue();
  const t = textesReglages[langue];
  const active = LANGUES.find((l) => l.code === langue);

  return (
    <section>
      <h2 className="mb-3 text-heading font-semibold">{t.langue}</h2>
      <div className="rounded-card border border-line bg-surface-raised">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-small text-ink-soft">{t.langueActive}</span>
          <span className="text-small font-medium">{active?.libelle}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {LANGUES.map(({ code, libelle }) => (
            <button
              key={code}
              aria-pressed={code === langue}
              onClick={() => code !== langue && changerLangue(code)}
              className={`rounded-btn py-2.5 text-small font-medium transition ${
                code === langue
                  ? "bg-ink text-white"
                  : "border border-line-control hover:border-ink-faint"
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-faint">
        {t.noteLangue}
      </p>
    </section>
  );
}

export function BoutonDeconnexion() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesReglages[langue];
  const [envoi, setEnvoi] = useState(false);
  async function sortir() {
    setEnvoi(true);
    try {
      await fetch("/api/deconnexion", { method: "POST" });
    } catch {
      /* on redirige de toute façon vers la connexion */
    }
    router.replace("/connexion");
    router.refresh();
  }
  return (
    <button
      onClick={sortir}
      disabled={envoi}
      className="rounded-btn border border-line-control bg-surface-raised py-3 text-center text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink disabled:opacity-50"
    >
      {envoi ? t.deconnexion : t.seDeconnecter}
    </button>
  );
}

/** @param libelle une PHRASE, pas l'objet des textes. Le nom compte : appelée
 *  « t », cette propriété laissait croire qu'on peut lui passer les textes
 *  entiers — ce qui ferait planter l'écran si l'un d'eux devenait une
 *  fonction (voir « tests/test_frontiere_serveur.py »). */
export function Bascule({ libelle, defaut }: { libelle: string; defaut?: boolean }) {
  const [actif, setActif] = useState(Boolean(defaut));
  return (
    <div className="flex items-center justify-between py-3">
      <span className="pr-4 text-body">{libelle}</span>
      <button
        onClick={() => setActif((a) => !a)}
        role="switch"
        aria-checked={actif}
        aria-label={libelle}
        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition ${
          actif ? "justify-end bg-ink" : "justify-start bg-surface-3"
        }`}
      >
        <span className="size-5 rounded-full bg-white shadow-sm" />
      </button>
    </div>
  );
}
