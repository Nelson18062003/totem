"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Langue } from "@noyau/langue";
import { fcfa } from "@noyau/types";
import { formaterNumero } from "@noyau/numero";
import { apresEffacement, enFormeDansLeChamp, montantSaisi } from "@noyau/saisie";
import { couleurOperateur } from "../logos-operateurs";

// L'ÉCRAN DE LA DÉMO VIVANTE (docs/DEMO-VIVANTE.md).
//
// Il tient sur une question : « l'argent de la démo est-il juste ? ». D'où
// l'ordre : d'abord la parité (fabriqué = en circulation), puis le pont vers
// Glisil, puis les cartes. Fabriquer des francs est un geste d'argent, même
// faux : un appui, une demande — le verrou est synchrone (`useRef`), pas un
// état React qui ne se ferme qu'au rendu suivant.

type Carte = {
  iccid: string; libelle: string; operateur: string; numero: string; nom: string;
  solde: number; titulaire: string | null; float: boolean;
};
type Etat = {
  cartes: Carte[]; fabrique: number; enCirculation: number;
  glisil: { relie: boolean; enAttente: number; derniereReponse: string | null };
};

const MOTS = {
  fr: {
    titre: "La démo vivante",
    sous: "Un monde à part : ces cartes, ces francs et ces SMS ne sont pas de l'argent réel. La maison n'en voit rien.",
    fabrique: "Francs fabriqués",
    circulation: "Sur les cartes",
    ecart: "Écart",
    juste: "Juste : tout franc en circulation a été fabriqué ici.",
    faux: "Écart : la somme des soldes ne correspond pas à ce qui a été fabriqué.",
    glisil: "Glisil (test)",
    glisilRelie: "Relié · les SMS des floats partent chez Glisil",
    glisilNonRelie: "Pas relié : XAFE_DEMO_URL et XAFE_DEMO_CLE manquent sur le serveur. Rien ne se perd, la file attend.",
    enAttente: (n: number) => (n === 0 ? "Rien en attente" : `${n} SMS en attente`),
    derniere: "Dernière réponse",
    renvoyer: "Renvoyer maintenant",
    cartes: "Les cartes",
    chercher: "Chercher un testeur, un numéro…",
    aucune: "Aucune carte. Créez des testeurs dans Réglages → Qui peut se connecter : chacun naît avec une MTN et une Orange.",
    fabriquer: "Fabriquer",
    montant: "Montant",
    valider: "Créditer",
    annuler: "Annuler",
    float: "Float Glisil",
    pasFloat: "Déclarer float Glisil",
    sansTitulaire: "Sans titulaire",
    fait: (m: string, c: string) => `${m} crédités sur ${c}.`,
    panne: "La plateforme n'a pas répondu.",
    chargement: "Chargement…",
    code: "Code secret de toutes les cartes de démo : 1234",
  },
  en: {
    titre: "The live demo",
    sous: "A world apart: these cards, francs and SMS are not real money. The house sees none of it.",
    fabrique: "Francs made",
    circulation: "On the cards",
    ecart: "Gap",
    juste: "Balanced: every franc in circulation was made here.",
    faux: "Gap: the sum of balances does not match what was made.",
    glisil: "Glisil (test)",
    glisilRelie: "Connected · float SMS go to Glisil",
    glisilNonRelie: "Not connected: XAFE_DEMO_URL and XAFE_DEMO_CLE are missing on the server. Nothing is lost, the queue waits.",
    enAttente: (n: number) => (n === 0 ? "Nothing waiting" : `${n} SMS waiting`),
    derniere: "Last answer",
    renvoyer: "Send now",
    cartes: "Cards",
    chercher: "Search a tester, a number…",
    aucune: "No card. Create testers in Settings → Who can sign in: each one is born with an MTN and an Orange card.",
    fabriquer: "Make francs",
    montant: "Amount",
    valider: "Credit",
    annuler: "Cancel",
    float: "Glisil float",
    pasFloat: "Declare Glisil float",
    sansTitulaire: "No holder",
    fait: (m: string, c: string) => `${m} credited to ${c}.`,
    panne: "The platform did not answer.",
    chargement: "Loading…",
    code: "Secret code of every demo card: 1234",
  },
} as const;

async function parler(corps?: Record<string, unknown>): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const r = await fetch("/api/demo", corps
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }
      : { cache: "no-store" });
    return { ok: r.ok, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, json: {} };
  }
}

export function EcranDeLAdministrateur({ langue }: { langue: Langue }) {
  const t = MOTS[langue];
  const [etat, setEtat] = useState<Etat | null>(null);
  const [souci, setSouci] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [cherche, setCherche] = useState("");
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [saisie, setSaisie] = useState("");
  const verrou = useRef(false);

  const relire = useCallback(async () => {
    const r = await parler();
    if (r.ok) { setEtat(r.json as unknown as Etat); setSouci(null); }
    else setSouci(String(r.json.erreur ?? t.panne));
  }, [t.panne]);

  useEffect(() => { void relire(); }, [relire]);

  const geste = async (corps: Record<string, unknown>, apres?: (j: Record<string, unknown>) => void) => {
    if (verrou.current) return;
    verrou.current = true;
    try {
      const r = await parler(corps);
      if (!r.ok) setSouci(String(r.json.erreur ?? t.panne));
      else { setSouci(null); apres?.(r.json); }
      await relire();
    } finally {
      verrou.current = false;
    }
  };

  const montrees = useMemo(() => {
    const q = cherche.trim().toLowerCase();
    const chiffres = q.replace(/\D/g, "");
    return (etat?.cartes ?? []).filter((c) => !q
      || (c.titulaire ?? "").toLowerCase().includes(q) || c.nom.toLowerCase().includes(q)
      || (chiffres && c.numero.includes(chiffres)));
  }, [etat, cherche]);

  if (!etat) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="text-small text-ink-soft">{souci ?? t.chargement}</p>
      </div>
    );
  }
  const ecart = etat.enCirculation - etat.fabrique;
  const montant = montantSaisi(saisie);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-soft">{t.sous}</p>
        <p className="mt-2 inline-flex rounded-full border border-line bg-surface-raised px-3 py-1 text-caption text-ink-soft">{t.code}</p>
      </header>

      {/* LA PARITÉ — le seul chiffre qui dit si la démo est juste. */}
      <section aria-label={t.ecart} className="grid grid-cols-3 overflow-hidden rounded-card border border-line bg-surface-raised">
        <Chiffre titre={t.fabrique} valeur={fcfa(etat.fabrique, langue)} />
        <Chiffre titre={t.circulation} valeur={fcfa(etat.enCirculation, langue)} />
        <Chiffre titre={t.ecart} valeur={fcfa(ecart, langue)} ton={ecart === 0 ? "positif" : "negatif"} />
        <p className={`col-span-3 border-t border-line px-4 py-2.5 text-small ${ecart === 0 ? "text-ink-soft" : "font-medium text-negative"}`}>
          {ecart === 0 ? t.juste : t.faux}
        </p>
      </section>

      {/* LE PONT VERS GLISIL */}
      <section className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`size-2 rounded-full ${etat.glisil.relie ? "bg-positive-vif" : "bg-ink-faint"}`} />
          <p className="font-semibold">{t.glisil}</p>
          <p className="text-small text-ink-soft">{t.enAttente(etat.glisil.enAttente)}</p>
          {etat.glisil.relie && etat.glisil.enAttente > 0 && (
            <button type="button" onClick={() => void geste({ action: "glisil" })}
              className="ml-auto rounded-btn border border-line px-3 py-1.5 text-small font-medium transition hover:border-ink-faint">
              {t.renvoyer}
            </button>
          )}
        </div>
        <p className="text-small leading-relaxed text-ink-soft">
          {etat.glisil.relie ? t.glisilRelie : t.glisilNonRelie}
        </p>
        {etat.glisil.derniereReponse && (
          <p className="text-caption text-ink-faint">{t.derniere} : {etat.glisil.derniereReponse}</p>
        )}
      </section>

      {/* LES CARTES */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-heading font-semibold">{t.cartes}</h2>
          <input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder={t.chercher}
            aria-label={t.chercher}
            className="w-full min-w-0 rounded-btn border border-line bg-surface px-3.5 py-2 text-small outline-none focus:border-ink sm:w-72" />
        </div>
        {annonce && <p role="status" className="text-small text-ink-soft">{annonce}</p>}
        {souci && <p role="alert" className="text-small text-negative">{souci}</p>}
        {etat.cartes.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-small leading-relaxed text-ink-faint">{t.aucune}</p>
        ) : (
          <ul className="divide-hair overflow-hidden rounded-card border border-line bg-surface-raised">
            {montrees.map((c) => (
              <li key={c.iccid} className="flex flex-col gap-3 px-4 py-3.5"
                style={{ boxShadow: `inset 3px 0 0 ${couleurOperateur(c.operateur) ?? "transparent"}` }}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.titulaire ?? t.sansTitulaire}</p>
                    <p className="tabnums text-small text-ink-faint">
                      {c.libelle} · {formaterNumero(c.numero)}
                    </p>
                  </div>
                  <p className="tabnums text-body font-semibold">{fcfa(c.solde, langue)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button"
                    onClick={() => { setOuverte(ouverte === c.iccid ? null : c.iccid); setSaisie(""); setAnnonce(null); }}
                    className="rounded-btn bg-ink px-3 py-1.5 text-small font-medium text-white">
                    {t.fabriquer}
                  </button>
                  <button type="button" aria-pressed={c.float}
                    onClick={() => void geste({ action: "float", iccid: c.iccid, float: !c.float })}
                    className={`rounded-full border px-3 py-1.5 text-small font-medium transition ${c.float ? "border-ink bg-ink/5" : "border-line text-ink-soft hover:border-ink-faint"}`}>
                    {c.float ? `✓ ${t.float}` : t.pasFloat}
                  </button>
                </div>
                {ouverte === c.iccid && (
                  <form className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (montant <= 0) return;
                      void geste({ action: "fabriquer", iccid: c.iccid, montant }, () => {
                        setAnnonce(t.fait(fcfa(montant, langue), c.titulaire ?? c.libelle));
                        setOuverte(null); setSaisie("");
                      });
                    }}>
                    <input autoFocus inputMode="numeric" aria-label={t.montant} placeholder={t.montant}
                      value={saisie}
                      onChange={(e) => setSaisie(enFormeDansLeChamp("montant",
                        apresEffacement(saisie, e.target.value), langue))}
                      className="tabnums min-w-0 flex-1 rounded-btn border border-line bg-surface px-3.5 py-2 text-heading outline-none focus:border-ink" />
                    <button type="button" onClick={() => setOuverte(null)}
                      className="rounded-btn border border-line px-3 py-2 text-small text-ink-soft">{t.annuler}</button>
                    <button type="submit" disabled={montant <= 0}
                      className="rounded-btn bg-ink px-3 py-2 text-small font-medium text-white disabled:opacity-30">{t.valider}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Chiffre({ titre, valeur, ton }: { titre: string; valeur: string; ton?: "positif" | "negatif" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
      <span className="text-caption uppercase tracking-wider text-ink-faint">{titre}</span>
      <span className={`tabnums break-words text-body font-semibold ${ton === "negatif" ? "text-negative" : ""}`}>{valeur}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA NAISSANCE DE LA DÉMO — l'écran du vrai propriétaire de TOTEM.
// ---------------------------------------------------------------------------

const NAISSANCE = {
  fr: {
    titre: "La démo vivante",
    sous: "Des testeurs se connectent au vrai TOTEM avec des comptes de démo : de fausses cartes MTN et Orange, de faux francs, de vrais gestes. Votre maison n'en voit rien, et ils ne voient rien de la maison.",
    deja: "La démo a son administrateur. Connectez-vous avec son adresse pour créer les testeurs et fabriquer des francs.",
    creer: "Créer l'administrateur de la démo",
    note: "Un compte à part, avec son propre mot de passe — jamais le vôtre : un geste réel ne doit pas pouvoir se faire dans un écran qu'on croyait de démo.",
    prenom: "Prénom", nom: "Nom", courriel: "Adresse e-mail", motdepasse: "Mot de passe",
    valider: "Créer", cree: "Créé. Déconnectez-vous, puis connectez-vous avec cette adresse.",
    panne: "La plateforme n'a pas répondu.",
  },
  en: {
    titre: "The live demo",
    sous: "Testers sign in to the real TOTEM with demo accounts: fake MTN and Orange cards, fake francs, real gestures. Your house sees none of it, and they see nothing of the house.",
    deja: "The demo has its administrator. Sign in with that address to create testers and make francs.",
    creer: "Create the demo administrator",
    note: "A separate account, with its own password — never yours: a real gesture must not be possible on a screen believed to be the demo.",
    prenom: "First name", nom: "Last name", courriel: "Email address", motdepasse: "Password",
    valider: "Create", cree: "Created. Sign out, then sign in with that address.",
    panne: "The platform did not answer.",
  },
} as const;

export function NaissanceDeLaDemo({ langue }: { langue: Langue }) {
  const t = NAISSANCE[langue];
  const [existe, setExiste] = useState<boolean | null>(null);
  const [champs, setChamps] = useState({ prenom: "", nom: "", courriel: "", motdepasse: "" });
  const [souci, setSouci] = useState<string | null>(null);
  const [cree, setCree] = useState(false);
  const verrou = useRef(false);

  useEffect(() => {
    void parler().then((r) => setExiste(r.ok ? r.json.administrateur === true : null));
  }, []);

  const pret = champs.prenom.trim() && champs.nom.trim() && champs.courriel.includes("@") && champs.motdepasse.length > 0;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small leading-relaxed text-ink-soft">{t.sous}</p>
      </header>
      {existe || cree ? (
        <p role="status" className="rounded-card border border-line bg-surface-raised p-4 text-small leading-relaxed">{cree ? t.cree : t.deja}</p>
      ) : (
        <form className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pret || verrou.current) return;
            verrou.current = true;
            try {
              const r = await parler({ action: "administrateur", ...champs });
              if (r.ok) { setCree(true); setSouci(null); }
              else setSouci(String(r.json.erreur ?? t.panne));
            } finally {
              verrou.current = false;
            }
          }}>
          <p className="font-semibold">{t.creer}</p>
          <p className="text-small leading-relaxed text-ink-soft">{t.note}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["prenom", "nom"] as const).map((k) => (
              <input key={k} aria-label={t[k]} placeholder={t[k]} value={champs[k]}
                onChange={(e) => setChamps({ ...champs, [k]: e.target.value })}
                className="min-w-0 rounded-btn border border-line bg-surface px-3.5 py-2.5 outline-none focus:border-ink" />
            ))}
          </div>
          <input type="email" autoComplete="off" aria-label={t.courriel} placeholder={t.courriel} value={champs.courriel}
            onChange={(e) => setChamps({ ...champs, courriel: e.target.value })}
            className="min-w-0 rounded-btn border border-line bg-surface px-3.5 py-2.5 outline-none focus:border-ink" />
          <input type="password" autoComplete="new-password" aria-label={t.motdepasse} placeholder={t.motdepasse} value={champs.motdepasse}
            onChange={(e) => setChamps({ ...champs, motdepasse: e.target.value })}
            className="min-w-0 rounded-btn border border-line bg-surface px-3.5 py-2.5 outline-none focus:border-ink" />
          {souci && <p role="alert" className="text-small text-negative">{souci}</p>}
          <button type="submit" disabled={!pret}
            className="rounded-btn bg-ink py-2.5 text-small font-medium text-white disabled:opacity-30">{t.valider}</button>
        </form>
      )}
    </div>
  );
}
