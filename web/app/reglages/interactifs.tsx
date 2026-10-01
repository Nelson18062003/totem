"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { changerLangue, useLangue } from "@/app/langue";
import { aDesVariables, CLES_GUICHET, codesUssd, type CodeUssd } from "@noyau/codes";
import { LANGUES } from "@noyau/langue";
import { textesReglages } from "@noyau/textes/reglages";
import { ApercuCode, Composeur } from "./composeur";
import { dateVue, type RaccourciAppris } from "@noyau/types";
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

/** Un compte tel que la route le rend : ses cartes, ou `null` pour le
 *  propriétaire, qui voit tout. */
type CompteAvecCartes = {
  id: number; courriel: string; role: string; approuve: boolean;
  creeLe: string | null; vuLe: string | null; cartes: string[] | null;
};
type CarteDeLaMaison = {
  iccid: string; libelle: string; operateur: string; numero: string;
  nom: string; enPlace: boolean;
};

/**
 * QUI PEUT SE CONNECTER, ET CE QUE CHACUN VOIT — réservé au propriétaire.
 *
 * Personne ne s'inscrit seul : c'est ici que le propriétaire crée un compte,
 * avec un courriel et rien d'autre (on entre par un code envoyé à ce
 * courriel). Et c'est ici qu'il CONFIE des cartes : un invité ne voit que
 * celles-là, et rien du tout tant qu'on ne lui en a confié aucune.
 *
 * La même section vit dans les Réglages et dans la console (« Les gens ») :
 * un seul écran pour un seul geste, montré aux deux endroits où on le cherche.
 *
 * Elle ne s'affiche pas du tout pour un invité : la route répond 403, et
 * l'écran ne montre rien plutôt qu'une case vide et mystérieuse.
 */
export function SectionQui({ sansTitre = false }: { sansTitre?: boolean } = {}) {
  const langue = useLangue();
  const t = textesReglages[langue];
  const [comptes, setComptes] = useState<CompteAvecCartes[] | null>(null);
  const [cartes, setCartes] = useState<CarteDeLaMaison[]>([]);
  const [permis, setPermis] = useState<boolean | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  // L'échec d'une action, à dire au propriétaire : retirer une carte qui
  // n'aboutit pas ne doit jamais passer pour un succès.
  const [rateAction, setRateAction] = useState<string | null>(null);
  // Le compte dont on choisit les cartes, ou aucun.
  const [enChoix, setEnChoix] = useState<number | null>(null);
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [courriel, setCourriel] = useState("");
  const [creation, setCreation] = useState(false);
  const [motCree, setMotCree] = useState<string | null>(null);
  const [rateCree, setRateCree] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/comptes", { cache: "no-store" });
      if (!r.ok) { setPermis(false); return; }
      const corps = await r.json();
      setComptes(corps.comptes ?? []);
      setCartes(corps.cartes ?? []);
      setPermis(true);
    } catch {
      setPermis(false);
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function envoyer(cle: string, corps: Record<string, unknown>) {
    setOccupe(cle);
    setRateAction(null);
    try {
      // ON REGARDE SI ÇA A ABOUTI. Sans ce contrôle, un 403 ou une coupure
      // repassaient inaperçus : la liste se réaffichait inchangée et le
      // propriétaire croyait avoir fermé un accès qui, lui, tenait toujours.
      const r = await fetch("/api/comptes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corps),
      });
      if (!r.ok) {
        const c = await r.json().catch(() => ({}));
        setRateAction(c?.erreur || t.actionRatee);
        return;
      }
      await charger();
    } catch {
      setRateAction(t.actionRatee);
    } finally {
      setOccupe(null);
    }
  }

  function agir(id: number, geste: "approuver" | "fermer" | "supprimer") {
    if (geste === "supprimer" && !confirm(t.supprimerSur)) return;
    if (geste === "fermer" && !confirm(t.fermerSur)) return;
    void envoyer(`${geste}-${id}`, { id, geste });
  }

  function basculer(id: number, iccid: string, confiee: boolean) {
    void envoyer(`${id}-${iccid}`, {
      id, iccid, geste: confiee ? "retirer" : "attribuer",
    });
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (creation || !courriel) return;
    setCreation(true);
    setMotCree(null);
    try {
      const r = await fetch("/api/comptes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geste: "creer", courriel }),
      });
      const c = await r.json().catch(() => ({}));
      if (r.ok) {
        setRateCree(false);
        setMotCree(t.creerFait);
        setCourriel("");
        setOuvrirCreation(false);
        await charger();
        // Le geste qui suit naturellement : choisir ses cartes. On ouvre le
        // choix tout de suite, sans quoi le compte neuf ne verrait rien et
        // on croirait l'accès cassé.
        if (typeof c?.id === "number") setEnChoix(c.id);
      } else {
        setRateCree(true);
        setMotCree(c?.erreur ?? t.actionRatee);
      }
    } catch {
      setRateCree(true);
      setMotCree(t.actionRatee);
    } finally {
      setCreation(false);
    }
  }

  // Ni autorisé, ni encore chargé : rien à montrer.
  if (permis !== true || !comptes) return null;

  const nomDeCarte = (iccid: string) => {
    const c = cartes.find((x) => x.iccid === iccid);
    return c ? c.libelle : `··${iccid.slice(-4)}`;
  };

  return (
    <section>
      {!sansTitre && <h2 className="mb-1 text-heading font-semibold">{t.qui}</h2>}
      <p className="mb-3 text-caption leading-relaxed text-ink-faint">{t.quiAide}</p>
      <ul className="divide-hair rounded-card border border-line bg-surface-raised px-4">
        {rateAction && (
          <li className="py-3 text-caption text-negative" role="alert">
            {rateAction}
          </li>
        )}
        {comptes.map((c) => (
          <li key={c.id} className="py-3" data-compte={c.courriel}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                {/* Un courriel n'est jamais coupé : c'est sur lui qu'on décide
                    d'ouvrir la caisse à quelqu'un. */}
                <p className="break-all text-small font-medium">{c.courriel}</p>
                <p className="mt-0.5 text-caption text-ink-faint">
                  {c.role === "proprietaire" ? t.roleProprietaire : t.roleInvite}
                  {" · "}
                  {c.approuve ? t.ouvert : t.enAttente}
                  {" · "}
                  {c.vuLe ? `${t.vuLe} ${dateVue(c.vuLe, langue)}` : t.jamaisVenu}
                </p>
              </div>
              {/* Le propriétaire n'a pas de boutons sur sa propre ligne : il ne
                  peut ni se bloquer ni se supprimer, et un bouton qui refuse
                  toujours est un bouton de trop. */}
              {c.role !== "proprietaire" && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => agir(c.id, c.approuve ? "fermer" : "approuver")}
                    disabled={occupe !== null}
                    className="min-h-11 rounded-btn border border-line px-3 text-caption font-medium text-ink-soft transition hover:border-ink-faint disabled:opacity-40"
                  >
                    {c.approuve ? t.fermer : t.approuver}
                  </button>
                  <button
                    onClick={() => agir(c.id, "supprimer")}
                    disabled={occupe !== null}
                    className="min-h-11 rounded-btn border border-line px-3 text-caption text-negative transition hover:border-negative disabled:opacity-40"
                  >
                    {t.supprimer}
                  </button>
                </div>
              )}
            </div>

            {/* CE QUE CETTE PERSONNE VOIT. Dit en toutes lettres sur chaque
                ligne : « aucune » n'est pas un oubli d'affichage, c'est un
                compte qui ne voit rien. */}
            <div className="mt-2 rounded-btn bg-surface-2 px-3 py-2">
              <p className="text-caption text-ink-faint">{t.cartesDeLaPersonne}</p>
              {c.cartes === null ? (
                <p className="mt-0.5 text-caption text-ink-soft">{t.cartesToutes}</p>
              ) : c.cartes.length === 0 ? (
                <p className="mt-0.5 text-caption text-alert">{t.cartesAucune}</p>
              ) : (
                <p className="mt-0.5 text-caption text-ink">
                  {c.cartes.map(nomDeCarte).join(" · ")}
                </p>
              )}
              {c.cartes !== null && enChoix !== c.id && (
                <button
                  onClick={() => setEnChoix(c.id)}
                  className="mt-1.5 min-h-11 text-caption font-medium text-accent underline underline-offset-4"
                >
                  {t.cartesConfier}
                </button>
              )}
              {c.cartes !== null && enChoix === c.id && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {cartes.length === 0 && (
                    <p className="text-caption text-ink-faint">{t.cartesAucuneDansLaMaison}</p>
                  )}
                  {cartes.map((carte) => {
                    const confiee = c.cartes!.includes(carte.iccid);
                    return (
                      <label
                        key={carte.iccid}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-btn border border-line bg-surface-raised px-3"
                      >
                        <input
                          type="checkbox"
                          checked={confiee}
                          disabled={occupe !== null}
                          onChange={() => basculer(c.id, carte.iccid, confiee)}
                          data-carte={carte.iccid}
                          className="h-4 w-4"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-small font-medium">{carte.libelle}</span>
                          <span className="block break-all text-caption text-ink-faint">
                            {[carte.nom, carte.numero].filter(Boolean).join(" · ") || carte.iccid}
                            {!carte.enPlace && ` · ${t.cartesRetiree}`}
                          </span>
                        </span>
                        {confiee && (
                          <span className="text-caption text-positive">{t.cartesConfiee}</span>
                        )}
                      </label>
                    );
                  })}
                  <button
                    onClick={() => setEnChoix(null)}
                    className="mt-1 min-h-11 self-start rounded-btn border border-line px-3 text-caption font-medium text-ink-soft transition hover:border-ink-faint"
                  >
                    {t.cartesFermer}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
        {comptes.length <= 1 && (
          <li className="py-3 text-caption text-ink-faint">{t.aucunAutreCompte}</li>
        )}
      </ul>

      {/* CRÉER UN COMPTE. L'inscription libre est fermée et le reste : c'est
          le seul chemin pour faire entrer quelqu'un. Google EXIGE un compte
          qui fonctionne pour examiner l'application. */}
      {!ouvrirCreation ? (
        <button
          onClick={() => { setOuvrirCreation(true); setMotCree(null); }}
          className="mt-3 min-h-11 rounded-btn border border-line px-3.5 text-small font-medium text-ink-soft transition hover:border-ink-faint"
        >
          {t.creerCompte}
        </button>
      ) : (
        <form onSubmit={creer} className="mt-3 flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4">
          <p className="text-caption leading-relaxed text-ink-faint">
            {t.creerCompteAide}
          </p>
          {/* L'AVERTISSEMENT, avant le champ et pas après : un compte neuf ne
              voit RIEN tant qu'on ne lui a pas confié de carte. */}
          <p className="rounded-btn border border-line bg-surface px-3 py-2 text-caption leading-relaxed text-ink-soft">
            {t.creerAvertissement}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-small text-ink-soft">{t.creerCourriel}</span>
            <input
              type="email" value={courriel} required autoCapitalize="none"
              autoComplete="off" name="nouveau-courriel"
              onChange={(e) => setCourriel(e.target.value)}
              className="rounded-btn border border-line bg-surface px-3 py-2 text-small outline-none transition focus:border-ink"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creation || !courriel}
              className="min-h-11 rounded-btn bg-ink px-4 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-35"
            >
              {creation ? t.creerEnCours : t.creerBouton}
            </button>
            <button
              type="button"
              onClick={() => { setOuvrirCreation(false); setMotCree(null); }}
              className="min-h-11 rounded-btn border border-line px-4 text-small text-ink-soft transition hover:border-ink-faint"
            >
              {t.annuler}
            </button>
          </div>
        </form>
      )}

      {motCree && (
        <p role="status" className={`mt-2 text-caption ${rateCree ? "text-negative" : "text-ink-soft"}`}>
          {motCree}
        </p>
      )}
    </section>
  );
}

/**
 * « Est-ce que mon téléphone sonne ? »
 *
 * Le propriétaire vient d'installer l'application. Lui demander d'attendre un
 * vrai paiement pour savoir si son téléphone sonnera serait cruel — et s'il
 * ne sonne pas, il chercherait longtemps, sans savoir par quel bout prendre
 * la panne : Firebase ? le jeton ? le canal Android ? la permission ?
 *
 * Ce bouton répond en trois secondes.
 *
 * Il dit aussi ce qu'il NE prouve pas. La chaîne complète va du modem de
 * Douala jusqu'à l'écran ; cet essai n'en éprouve que le dernier kilomètre.
 * Le taire laisserait croire que tout est vérifié.
 */
export function SectionEssaiNotification() {
  const langue = useLangue();
  const t = textesReglages[langue];
  const [etat, setEtat] = useState<"repos" | "envoi">("repos");
  const [message, setMessage] = useState<string | null>(null);
  const [rate, setRate] = useState(false);

  async function essayer() {
    setEtat("envoi");
    setMessage(null);
    try {
      const r = await fetch(`/api/essai-notification?langue=${langue}`, {
        method: "POST",
      });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRate(true);
        setMessage(c?.erreur ?? t.essaiEchec);
      } else if (c.aucun) {
        setRate(true);
        setMessage(`${t.essaiAucunAppareil} ${t.essaiDepuisNavigateur}`);
      } else if (c.servis > 0 || c.enRoute) {
        setRate(false);
        // REMIS, OU SEULEMENT PARTI. Voir `lib/pousser.ts` : le guichet rend
        // un billet tout de suite, l'accusé de remise plus tard, et seul le
        // second dit qu'un téléphone a sonné.
        setMessage(
          (c.servis > 0 ? t.essaiRemis : t.essaiEnRoute)
          + (c.oublies ? ` (${c.oublies} ${t.essaiOublies})` : ""));
      } else {
        setRate(true);
        // La cause, dans la langue de l'écran : le mot anglais du service
        // (« InvalidCredentials ») ne disait rien à qui doit s'en servir.
        setMessage(
          t.essaiEchec + (c.soucis?.length ? ` — ${c.soucis.join(" · ")}` : ""));
      }
    } catch {
      setRate(true);
      setMessage(t.essaiEchec);
    } finally {
      setEtat("repos");
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-heading font-semibold">{t.essai}</h2>
      <p className="mb-3 text-caption leading-relaxed text-ink-faint">{t.essaiAide}</p>
      <div className="rounded-card border border-line bg-surface-raised p-4">
        <button
          onClick={essayer}
          disabled={etat === "envoi"}
          className="w-full rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint disabled:opacity-40"
        >
          {etat === "envoi" ? t.essaiEnCours : t.essaiBouton}
        </button>
        {message && (
          <p className={`mt-3 text-caption leading-relaxed ${
            rate ? "text-negative" : "text-ink-soft"
          }`}>
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
