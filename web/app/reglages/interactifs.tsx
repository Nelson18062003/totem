"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { changerLangue, useLangue } from "@/app/langue";
import { aDesVariables, CLES_GUICHET, codesUssd, type CodeUssd } from "@noyau/codes";
import { LANGUES } from "@noyau/langue";
import { textesReglages } from "@noyau/textes/reglages";
import { ApercuCode, Composeur } from "./composeur";
import type { RaccourciAppris } from "@noyau/types";
import { IconHash, IconPlus } from "../icons";
import { BoutonFermer } from "../feuille";

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
        className="rounded-btn border border-transparent px-2 py-1 text-small tabnums text-ink-soft transition hover:border-line hover:text-ink"
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
          className="w-32 rounded-btn border border-ink bg-surface-raised px-2.5 py-1.5 text-right text-body tabnums outline-none disabled:opacity-50"
        />
        <button
          onClick={enregistrer}
          disabled={etat === "envoi"}
          className="rounded-btn bg-ink px-2.5 py-1.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {etat === "envoi" ? "…" : "OK"}
        </button>
        <BoutonFermer onClick={() => setEdition(false)} libelle={t.annuler} disabled={etat === "envoi"} />
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
 * Le nom d'une carte, réglé depuis la plateforme. Le propriétaire voit le
 * numéro (que la puce déclare parfois) et lui associe un nom — celui qui
 * paraîtra sur ses coordonnées à partager et sur ses reçus. Ni la puce ni le
 * réseau ne connaissent ce nom : seul le propriétaire le sait.
 *
 * Comme le numéro, la saisie ne touche jamais un modem : elle dépose une
 * demande que le robot relève, contrôle et applique — puis republie.
 */
export function ReglageNom({
  iccid,
  nomInitial,
  libelle,
}: {
  iccid: string;
  nomInitial: string;
  libelle: string;
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesReglages[langue];
  const [nom, setNom] = useState(nomInitial);
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(nomInitial);
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");

  async function enregistrer() {
    const propre = brouillon.trim().replace(/\s+/g, " ");
    if (propre.length < 2) {
      setEtat("erreur");
      setMessage(t.nomTropCourt);
      return;
    }
    setEtat("envoi");
    setMessage("");
    try {
      const rep = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "identite", parametres: { iccid, nom: propre } }),
      });
      const { id, erreur } = await rep.json();
      if (!rep.ok || !id) throw new Error(erreur || "demande refusée");
      const resultat = await attendreCommande(id);
      if (!resultat) {
        setEtat("erreur");
        setMessage(t.pasRepondu);
        return;
      }
      if (resultat.etat === "faite") {
        setNom(propre);
        setEdition(false);
        setEtat("repos");
        router.refresh();
      } else if (/inconnue/i.test(resultat.resultat || "")) {
        setEtat("erreur");
        setMessage(t.majRequise);
      } else {
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
        onClick={() => { setBrouillon(nom); setEdition(true); setEtat("repos"); setMessage(""); }}
        className="rounded-btn border border-transparent px-1.5 py-0.5 text-left text-body font-medium transition hover:border-line"
        title={t.reglerNom(libelle)}
      >
        {nom || t.nomARenseigner}
      </button>
    );
  }

  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <input
          value={brouillon}
          autoFocus
          disabled={etat === "envoi"}
          onChange={(e) => setBrouillon(e.target.value.slice(0, 40))}
          onKeyDown={(e) => e.key === "Enter" && enregistrer()}
          placeholder={t.nomPlaceholder}
          className="w-48 rounded-btn border border-ink bg-surface-raised px-2.5 py-1.5 text-body outline-none disabled:opacity-50"
        />
        <button
          onClick={enregistrer}
          disabled={etat === "envoi"}
          className="rounded-btn bg-ink px-2.5 py-1.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {etat === "envoi" ? "…" : "OK"}
        </button>
        <BoutonFermer onClick={() => setEdition(false)} libelle={t.annuler} disabled={etat === "envoi"} />
      </span>
      {etat === "erreur" && (
        <span className="max-w-52 text-caption text-negative">{message}</span>
      )}
    </span>
  );
}

/** Attend l'issue d'une demande déposée pour le robot (≈40 s au plus). */
async function attendreCommande(id: number) {
  for (let i = 0; i < 26; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const rep = await fetch(`/api/commande/${id}`, { cache: "no-store" });
    if (!rep.ok) continue;
    const c = await rep.json();
    if (c.etat === "faite" || c.etat === "echouee") return c;
  }
  return null;
}

// « Mon numéro » → « mon_numero » : la clé d'un bouton créé à la main.
const deriverCle = (nom: string) =>
  nom.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);

// La saisie d'un parcours : le code, puis d'éventuels choix de menu séparés
// par des virgules — « *126#, 1, 1 ». Les ACCOLADES passent aussi : un code
// peut porter des trous à remplir, « *126*1*{numero}*{montant}# ». Elles
// n'atteignent jamais le modem — le guichet les remplace par des chiffres
// avant de composer.
const proprerEtapes = (v: string) => v.replace(/[^0-9#*,\s{}a-zA-Z_]/g, "");
const decouperEtapes = (v: string) =>
  v.split(",").map((p) => p.replace(/[^0-9#*{}a-zA-Z_]/g, "")).filter(Boolean);

/**
 * Les codes du guichet, par opérateur — TOUS les boutons standards, chacun
 * attribuable ici même. Rien n'est deviné : c'est le propriétaire qui dicte,
 * et le robot revérifie (un code d'abord, des choix de menu ensuite — jamais
 * un montant, un numéro ou le code secret).
 *
 * Ce qui s'enregistre part dans le CARNET DU ROBOT (la même place que
 * l'apprentissage) puis revient par la base : l'accueil, le guichet et la
 * console USSD l'utilisent aussitôt, pour toute carte de cet opérateur.
 */
export function SectionCodes({
  operateur,
  enPlace,
  appris,
}: {
  operateur: string;
  // Une carte de cet opérateur est-elle dans le terminal en ce moment ?
  enPlace?: boolean;
  // Les boutons définis ou appris, lus depuis la base : ils l'emportent
  // sur le catalogue — c'est le terrain qui commande.
  appris?: RaccourciAppris[];
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesReglages[langue];
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [ajout, setAjout] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauCode, setNouveauCode] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");

  const parNom = new Map((appris ?? []).map((r) => [r.nom, r]));
  const statiques = new Map(
    (codesUssd[operateur] ?? []).map((c: CodeUssd) => [c.cle, c.code]));

  // Chaque bouton standard a sa ligne — remplie ou À REMPLIR : c'est ici
  // qu'un opérateur tout neuf reçoit ses codes, bouton par bouton.
  const rangs = [
    ...CLES_GUICHET.map((cle) => ({
      cle,
      libelle: t.libellesCodes[cle] ?? cle,
      etapes: parNom.get(cle)?.etapes
        ?? (statiques.get(cle) ? [statiques.get(cle)!] : []),
      defini: parNom.has(cle),
    })),
    ...(appris ?? [])
      .filter((r) => !(CLES_GUICHET as readonly string[]).includes(r.nom))
      .map((r) => ({ cle: r.nom, libelle: r.libelle, etapes: r.etapes,
                     defini: true })),
  ];

  const poser = async (
    cle: string, libelle: string,
    etapes: string[], action: "definir" | "supprimer",
  ) => {
    setEtat("envoi");
    setMessage("");
    try {
      const rep = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "raccourci",
          parametres: { operateur, cle, libelle, etapes, action },
        }),
      });
      const { id, erreur } = await rep.json();
      if (!rep.ok || !id) throw new Error(erreur || t.pasPartie);
      const resultat = await attendreCommande(id);
      if (!resultat) {
        setEtat("erreur");
        setMessage(t.pasRepondu);
        return false;
      }
      if (resultat.etat !== "faite") {
        setEtat("erreur");
        setMessage(/inconnue/i.test(resultat.resultat || "")
          ? t.majRequise
          : (resultat.resultat || t.aRefuse));
        return false;
      }
      setEtat("repos");
      router.refresh();    // la base renvoie le carnet, tous les écrans suivent
      return true;
    } catch (e) {
      setEtat("erreur");
      setMessage(e instanceof Error ? e.message : t.pasPartie);
      return false;
    }
  };

  const enregistrer = async (cle: string, libelle: string) => {
    const etapes = decouperEtapes(brouillon);
    if (!etapes.length) return;
    if (await poser(cle, libelle, etapes, "definir")) setEnEdition(null);
  };

  const ajouter = async () => {
    const cle = deriverCle(nouveauNom);
    const etapes = decouperEtapes(nouveauCode);
    if (!cle || !etapes.length) return;
    if (await poser(cle, nouveauNom.trim(), etapes, "definir")) {
      setNouveauNom(""); setNouveauCode(""); setAjout(false);
    }
  };

  return (
    <section>
      <h2 className="mb-3 text-heading font-semibold">{t.codesUssd}</h2>
      <div className="rounded-card border border-line bg-surface-raised">
        <p className="border-b border-line px-4 py-3 text-caption uppercase tracking-wider text-ink-faint">
          {enPlace ? t.carteEnPlace(operateur) : operateur}
        </p>
        <ul className="divide-hair px-4">
          {rangs.map((r) => (
            <li key={r.cle} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <IconHash size={16} className="shrink-0 text-ink-faint" />
              <span className="flex flex-1 flex-wrap items-center gap-2">
                <span className="text-body">{r.libelle}</span>
                {/* Le code dit lui-même sa façon de faire : avec des trous il
                    part complet d'un coup, sans trous il ouvre le menu. */}
                {r.etapes.length > 0 && (
                  <span className={`rounded-btn px-1.5 py-0.5 text-caption ${
                    aDesVariables(r.etapes)
                      ? "bg-ink text-white"
                      : "border border-line text-ink-faint"
                  }`}>
                    {aDesVariables(r.etapes) ? t.modeDirect : t.modeGuide}
                  </span>
                )}
              </span>
              {enEdition === r.cle ? (
                // Le composeur prend la ligne entière : un code se construit
                // à plat, pas dans une case de quarante pixels.
                <span className="flex w-full basis-full flex-col gap-2">
                  <Composeur
                    valeur={brouillon}
                    onChanger={(v) => setBrouillon(proprerEtapes(v))}
                    onValider={() => enregistrer(r.cle, r.libelle)}
                    desactive={etat === "envoi"}
                    placeholder={t.exempleEtapes}
                  />
                  <span className="flex items-center gap-1.5">
                    <button onClick={() => enregistrer(r.cle, r.libelle)}
                      disabled={etat === "envoi"}
                      className="rounded-btn bg-ink px-3.5 py-1.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-40">
                      {etat === "envoi" ? "…" : "OK"}
                    </button>
                    <BoutonFermer onClick={() => setEnEdition(null)}
                      libelle={t.annuler} disabled={etat === "envoi"} />
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setEnEdition(r.cle);
                      setBrouillon(r.etapes.join(", "));
                      setEtat("repos");
                      setMessage("");
                    }}
                    title={t.modifierCode}
                    className={`rounded-btn border px-2 py-1 text-small tabnums transition hover:border-line hover:text-ink ${
                      r.etapes.length
                        ? "border-transparent text-ink-soft"
                        : "border-line font-medium text-ink"
                    }`}
                  >
                    {r.etapes.length
                      ? <ApercuCode etapes={r.etapes} />
                      : t.attribuer}
                  </button>
                  {r.defini && (
                    <button
                      onClick={() => void poser(r.cle, r.libelle, [], "supprimer")}
                      disabled={etat === "envoi"}
                      title={t.retirerBouton}
                      className="rounded-btn border border-transparent px-1.5 py-1 text-small text-ink-faint transition hover:border-line hover:text-negative disabled:opacity-40"
                    >
                      ✕
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-3">
          {ajout ? (
            <div className="flex flex-col gap-2">
              <input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)}
                placeholder={t.nomExemple} autoFocus
                className="rounded-btn border border-line bg-surface-raised px-3 py-2 text-body outline-none transition focus:border-ink" />
              <Composeur
                valeur={nouveauCode}
                onChanger={(v) => setNouveauCode(proprerEtapes(v))}
                onValider={() => void ajouter()}
                desactive={etat === "envoi"}
                placeholder={t.exempleEtapes}
              />
              <span className="flex gap-2">
                <button onClick={() => void ajouter()}
                  disabled={etat === "envoi" || !nouveauNom.trim() || !nouveauCode.trim()}
                  className="flex-1 rounded-btn bg-ink px-4 py-2 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
                  {etat === "envoi" ? "…" : t.ajouter}
                </button>
                <BoutonFermer onClick={() => setAjout(false)} libelle={t.annulerAjout} />
              </span>
            </div>
          ) : (
            <button onClick={() => setAjout(true)}
              className="flex w-full items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium transition hover:border-ink-faint">
              <IconPlus size={15} /> {t.ajouterRaccourci}
            </button>
          )}
        </div>
      </div>
      {etat === "envoi" && (
        <p className="mt-2 text-caption text-ink-faint">{t.enregistrement}</p>
      )}
      {etat === "erreur" && (
        <p className="mt-2 text-caption leading-relaxed text-negative">{message}</p>
      )}
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
                  : "border border-line hover:border-ink-faint"
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
      className="rounded-btn border border-line bg-surface-raised py-3 text-center text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink disabled:opacity-50"
    >
      {envoi ? t.deconnexion : t.seDeconnecter}
    </button>
  );
}

export function Bascule({ t, defaut }: { t: string; defaut?: boolean }) {
  const [actif, setActif] = useState(Boolean(defaut));
  return (
    <div className="flex items-center justify-between py-3">
      <span className="pr-4 text-body">{t}</span>
      <button
        onClick={() => setActif((a) => !a)}
        role="switch"
        aria-checked={actif}
        aria-label={t}
        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition ${
          actif ? "justify-end bg-ink" : "justify-start bg-surface-3"
        }`}
      >
        <span className="size-5 rounded-full bg-white" />
      </button>
    </div>
  );
}

/**
 * QUI PEUT SE CONNECTER — réservé au propriétaire.
 *
 * L'inscription est libre : n'importe qui peut créer un compte. Ce n'est pas
 * une négligence, c'est le partage du travail. Un compte neuf n'ouvre RIEN ;
 * c'est ici, et seulement ici, qu'une porte s'ouvre.
 *
 * La section ne s'affiche pas du tout pour un invité : la route répond 403,
 * et l'écran ne montre rien plutôt que de laisser une case vide et
 * mystérieuse. Le refus est déjà dit par le serveur ; le répéter à l'écran
 * n'apprendrait rien à personne.
 */
export function SectionQui() {
  const langue = useLangue();
  const t = textesReglages[langue];
  const [comptes, setComptes] = useState<{
    id: number; courriel: string; role: string; approuve: boolean;
    creeLe: string | null; vuLe: string | null;
  }[] | null>(null);
  const [permis, setPermis] = useState<boolean | null>(null);
  const [occupe, setOccupe] = useState<number | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/comptes", { cache: "no-store" });
      if (!r.ok) { setPermis(false); return; }
      const { comptes } = await r.json();
      setComptes(comptes ?? []);
      setPermis(true);
    } catch {
      setPermis(false);
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function agir(id: number, geste: "approuver" | "fermer" | "supprimer") {
    if (geste === "supprimer" && !confirm(t.supprimerSur)) return;
    setOccupe(id);
    try {
      await fetch("/api/comptes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, geste }),
      });
      await charger();
    } finally {
      setOccupe(null);
    }
  }

  // Ni autorisé, ni encore chargé : rien à montrer.
  if (permis !== true || !comptes) return null;

  return (
    <section>
      <h2 className="mb-1 text-heading font-semibold">{t.qui}</h2>
      <p className="mb-3 text-caption leading-relaxed text-ink-faint">{t.quiAide}</p>
      <ul className="divide-hair rounded-card border border-line bg-surface-raised px-4">
        {comptes.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-small font-medium">{c.courriel}</p>
              <p className="mt-0.5 text-caption text-ink-faint">
                {c.role === "proprietaire" ? t.roleProprietaire : t.roleInvite}
                {" · "}
                {c.approuve ? t.ouvert : t.enAttente}
                {" · "}
                {c.vuLe
                  ? `${t.vuLe} ${new Date(c.vuLe).toLocaleDateString()}`
                  : t.jamaisVenu}
              </p>
            </div>
            {/* Le propriétaire n'a pas de boutons sur sa propre ligne : il ne
                peut ni se bloquer ni se supprimer, et un bouton qui refuse
                toujours est un bouton de trop. */}
            {c.role !== "proprietaire" && (
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => agir(c.id, c.approuve ? "fermer" : "approuver")}
                  disabled={occupe === c.id}
                  className="rounded-btn border border-line px-3 py-1.5 text-caption font-medium text-ink-soft transition hover:border-ink-faint disabled:opacity-40"
                >
                  {c.approuve ? t.fermer : t.approuver}
                </button>
                <button
                  onClick={() => agir(c.id, "supprimer")}
                  disabled={occupe === c.id}
                  className="rounded-btn border border-line px-3 py-1.5 text-caption text-negative transition hover:border-negative disabled:opacity-40"
                >
                  {t.supprimer}
                </button>
              </div>
            )}
          </li>
        ))}
        {comptes.length <= 1 && (
          <li className="py-3 text-caption text-ink-faint">{t.aucunAutreCompte}</li>
        )}
      </ul>
    </section>
  );
}
