"use client";

import { useEffect, useRef, useState } from "react";
import { remplirVariables } from "@noyau/codes";
import { champPourQuestion, demandeUnCode, lireEcran } from "@noyau/ussd";
import { formaterNumero } from "@noyau/numero";
import { nombre } from "@noyau/types";
import type { ClientRecent } from "@noyau/recents";
import { nomDuBeneficiaire, nomPropre, numeroPropre } from "@noyau/beneficiaires";
import { textesGuichet } from "@noyau/textes/guichet";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import { BarreArret, BoutonFermer, type SortieRetenue } from "./feuille";
import { IconBubble, IconCheck, IconChevron, IconClose, IconLock, IconPersonnes, IconPuceSim } from "./icons";
import { useLangue } from "./langue";

/**
 * Une opération, du premier chiffre au code secret — le même parcours que
 * sur le téléphone (`mobile/src/operation.tsx`).
 *
 * UNE QUESTION PAR ÉCRAN : « À qui ? » → « Combien ? » → « Vérifiez » → on
 * parle à MTN… → le code secret → c'est fait. Sur un ordinateur, une fenêtre
 * centrée ; sur un téléphone, tout l'écran. Les chiffres se tapent au pavé
 * de l'écran OU au clavier de l'ordinateur — Entrée continue, Retour
 * arrière efface, Échap sort.
 *
 * La vraie session USSD s'ouvre sur la carte de Douala, la plateforme répond
 * elle-même aux questions qu'elle reconnaît, et le menu de l'opérateur ne se
 * montre que s'il pose une question qu'on ne sait pas servir — ses choix
 * sont alors des boutons. Son texte reste à un geste (« Détails »), mot pour
 * mot.
 *
 * La sortie suit le motif de la plateforme (feuille.tsx) : tant que la
 * session est VIVANTE, la croix et Échap mènent à la même confirmation —
 * raccrocher ne se fait jamais d'un frôlement.
 */

export type ChampOperation = {
  cle: string;
  label: string;
  aide: string;
  type: "numero" | "montant";
};

export type Operation = {
  titre: string;
  code: string;                 // le code USSD composé en premier, tel quel
  champs: ChampOperation[];     // vide : la session s'ouvre directement
  // L'ICCID de la carte visée. C'est lui qui dit au robot SUR QUELLE puce
  // composer : avec deux SIM en place, une opération sans carte partirait
  // sur la première venue.
  carte?: string;
  // Le parcours complet quand le bouton vient du carnet appris : le code
  // d'entrée puis les choix de menu, rejoués dans l'ordre. Jamais le code
  // secret — l'apprentissage s'arrête juste avant, le pavé prend la main.
  etapes?: string[];
  /** « MTN ·8901 » : le nom de la carte. */
  carteLibelle?: string;
  /** « MTN » : à qui l'on parle pendant que le réseau répond. */
  operateur?: string;
  /** Le carnet de la carte, puis les numéros vus dans ses SMS. */
  recents?: (ClientRecent & { enregistre?: boolean })[];
};

type Msg = { de: "reseau" | "vous"; texte: string };
type Issue = "reussie" | "refusee" | "interrompue" | "reponse";

const MONTANTS = [1000, 5000, 10000, 25000];
const LONGUEUR_CODE_MIN = 4;
const LONGUEUR_CODE_MAX = 6;
const chiffresDe = (v: string) => v.replace(/\D/g, "");
const pret = (type: "numero" | "montant", v: string) =>
  type === "numero" ? chiffresDe(v).length >= 8 : Number(chiffresDe(v)) > 0;

function couleurOperateur(op: string): string {
  const o = op.toUpperCase();
  return o.startsWith("MTN") ? "var(--color-op-mtn)"
    : o.startsWith("ORANGE") ? "var(--color-op-orange)" : "var(--color-ink-faint)";
}

export function OperationPopup({
  operation,
  onFermer,
  onTermine,
}: {
  operation: Operation;
  onFermer: () => void;
  onTermine?: () => void;       // après une session aboutie (rafraîchir le solde…)
}) {
  const langue = useLangue();
  const t = textesGuichet[langue];
  const tb = textesBeneficiaires[langue];
  const [etape, setEtape] = useState<"saisie" | "session">(
    operation.champs.length ? "saisie" : "session",
  );
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [fil, setFil] = useState<Msg[]>([]);
  const [attente, setAttente] = useState(false);
  const [enSession, setEnSession] = useState(false);
  // LA CLÉ D'INTENTION DE CETTE OPÉRATION — tirée une fois, à l'ouverture.
  // Le premier code composé peut porter le bénéficiaire ET le montant : le
  // composer deux fois, c'est transférer deux fois. Si le même geste repart,
  // la base reconnaît la clé et rend la demande DÉJÀ créée.
  const cleOperation = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  // Un raccrochage est-il DÛ ? (session ouverte, pas encore close.)
  const raccrochageDu = useRef(false);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reponseLibre, setReponseLibre] = useState("");
  const [pas, setPas] = useState(0);
  const [details, setDetails] = useState(false);
  const [libre, setLibre] = useState(false);
  const [confirme, setConfirme] = useState(false);
  // Les champs pas encore consommés par les questions du réseau.
  const restants = useRef<ChampOperation[]>([...operation.champs]);

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));
  const avecCarte = (p: Record<string, unknown>) =>
    operation.carte ? { ...p, carte: operation.carte } : p;

  const envoyer = async (
    genre: "ussd" | "ussd_reponse",
    parametres: Record<string, unknown>,
    bulle?: Msg,
    // Jointe au seul envoi qui peut porter un transfert complet : l'ouverture.
    cle?: string,
  ): Promise<string | null> => {
    setAttente(true);
    setErreur(null);
    if (bulle) setFil((f) => [...f, bulle]);
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // La carte voyage avec CHAQUE geste de la session : la plateforme y
        // lit que la réponse vient du titulaire de cette carte, et le robot
        // dans quelle session la poser.
        body: JSON.stringify({ type: genre, parametres: avecCarte(parametres), cle }),
      });
      if (!r.ok) {
        const corps = await r.json().catch(() => null);
        throw new Error(corps?.erreur || t.demandePasPartie);
      }
      const { id } = (await r.json()) as { id: number };
      for (let i = 0; i < 25; i++) {
        await new Promise((res) => setTimeout(res, 1200));
        const c = await fetch(`/api/commande/${id}`, { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);
        if (c && (c.etat === "faite" || c.etat === "echouee")) {
          setAttente(false);
          const texte = c.resultat || (c.etat === "faite" ? t.reponseVide : t.echec);
          setFil((f) => [...f, { de: "reseau", texte }]);
          if (c.etat === "echouee") { setEnSession(false); setFini(true); return null; }
          setEnSession(true);
          return texte;
        }
      }
      throw new Error(t.terminalMuet);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t.accroc);
      setAttente(false);
      return null;
    }
  };

  // Après chaque réponse du réseau : répondre tout seul si on sait, sinon
  // laisser la main (pavé pour le code, une question pour le reste).
  const derouler = async (texte: string | null) => {
    while (texte) {
      if (demandeUnCode(texte)) return;              // le pavé prend la main
      const champ = champPourQuestion(texte, restants.current);
      if (!champ) return;                            // question inattendue : à vous
      restants.current = restants.current.filter((c) => c !== champ);
      const valeur = chiffresDe(valeurs[champ.cle] ?? "");
      texte = await envoyer("ussd_reponse", { texte: valeur }, { de: "vous", texte: valeur });
    }
  };

  // UNE SEULE SESSION, JAMAIS DEUX : un double clic sur « Confirmer »
  // rappelait `lancer` avant le rendu suivant. Un drapeau synchrone.
  const lance = useRef(false);
  const lancer = async () => {
    if (lance.current) return;
    lance.current = true;
    setEtape("session");
    restants.current = [...operation.champs];
    const brutes = operation.etapes?.length ? operation.etapes : [operation.code];
    // LES TROUS D'ABORD : « {numero} », « {montant} » remplis par la saisie,
    // et le code part ENTIER. Un trou sans réponse ne part jamais.
    const { etapes, consommees, manquantes } = remplirVariables(brutes, valeurs);
    if (manquantes.length) {
      setErreur(t.trouSansReponse(manquantes.map((m) => `{${m}}`).join(", ")));
      setFini(true);
      return;
    }
    if (consommees.length) {
      restants.current = restants.current.filter((c) => !consommees.includes(c.cle));
    }
    let texte = await envoyer(
      "ussd",
      operation.carte ? { code: etapes[0], carte: operation.carte } : { code: etapes[0] },
      { de: "vous", texte: etapes[0] },
      cleOperation.current);
    for (const e of etapes.slice(1)) {
      if (texte == null) return;
      texte = await envoyer("ussd_reponse", { texte: e }, { de: "vous", texte: e });
    }
    await derouler(texte);
  };

  // Sans formulaire, la session part toute seule à l'ouverture.
  const parti = useRef(false);
  useEffect(() => {
    if (operation.champs.length === 0 && !parti.current) {
      parti.current = true;
      void lancer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quitter l'écran autrement (navigation, « précédent ») raccroche.
  useEffect(() => { raccrochageDu.current = enSession && !fini; }, [enSession, fini]);
  useEffect(() => () => { if (raccrochageDu.current) posterFin(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // FERMER L'ONGLET NE DOIT PAS LAISSER LA SIM EN LIGNE : `sendBeacon` part
  // même quand la page disparaît.
  useEffect(() => {
    const enPartant = () => {
      if (!raccrochageDu.current) return;
      raccrochageDu.current = false;
      navigator.sendBeacon?.(
        "/api/commande",
        new Blob([JSON.stringify({ type: "ussd_fin", parametres: avecCarte({}) })],
                 { type: "application/json" }));
    };
    window.addEventListener("pagehide", enPartant);
    return () => window.removeEventListener("pagehide", enPartant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UNE RÉPONSE PART UNE SEULE FOIS — le code secret surtout.
  const repondEnCours = useRef(false);
  const secret = async (code: string) => {
    if (repondEnCours.current) return;
    repondEnCours.current = true;
    try {
      const texte = await envoyer("ussd_reponse", { texte: code, secret: true },
                                  { de: "vous", texte: "••••" });
      if (texte) { setFini(true); onTermine?.(); }
    } finally {
      repondEnCours.current = false;
    }
  };
  const repondre = async (brut: string) => {
    const v = brut.trim();
    if (!v || repondEnCours.current) return;
    repondEnCours.current = true;
    setReponseLibre("");
    try {
      await derouler(await envoyer("ussd_reponse", { texte: v }, { de: "vous", texte: v }));
    } finally {
      repondEnCours.current = false;
    }
  };

  // L'ordre de raccrochage, sans faire attendre l'écran.
  const posterFin = () => {
    raccrochageDu.current = false;
    fetch("/api/commande", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "ussd_fin", parametres: avecCarte({}) }),
    }).catch(() => {});
  };
  const raccrocher = () => { posterFin(); onFermer(); };
  const fermerSession = () => {
    if (attente && !fini) posterFin();
    onFermer();
  };

  const dernier = [...fil].reverse().find((m) => m.de === "reseau")?.texte ?? "";
  const ecran = lireEcran(dernier);
  const pave = enSession && !attente && !fini && ecran.attend === "secret";

  // L'OPÉRATEUR A CONCLU : un écran qui ne demande plus rien termine.
  const conclu = enSession && !attente && Boolean(dernier) && ecran.attend === "rien";
  useEffect(() => {
    if (conclu && !fini && !libre) { setFini(true); onTermine?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conclu, fini, libre]);

  const issue: Issue = erreur ? "interrompue"
    : ecran.issue === "refusee" ? "refusee"
      : ecran.issue === "reussie" ? "reussie" : "reponse";
  const termine = fini || Boolean(erreur);
  const op = operation.operateur || operation.carteLibelle?.split(/\s/)[0] || t.reseau;
  const verification = pas >= operation.champs.length;

  // Tant que la session est vivante, toute sortie passe par la confirmation.
  const saisieEntamee = operation.champs.some((c) => (valeurs[c.cle] ?? "").trim());
  const retenue: SortieRetenue | null =
    etape === "session" && enSession && !termine
      ? { question: t.raccrocherQuestion, arreter: t.raccrocherCourt,
          garder: t.garderSession, onArreter: raccrocher }
      : etape === "saisie" && saisieEntamee
        ? { question: t.jeterQuestion, arreter: t.jeter,
            garder: t.continuerSaisie, onArreter: onFermer }
        : null;
  const sortir = () => {
    if (retenue) setConfirme(true);
    else if (etape === "session" && !termine) fermerSession();
    else onFermer();
  };
  useEffect(() => { if (!retenue) setConfirme(false); }, [retenue]);
  const reculer = () => (etape === "saisie" && pas > 0 ? setPas((p) => p - 1) : sortir());

  // Échap sort — la même porte que la croix.
  const sortirRef = useRef(sortir);
  sortirRef.current = sortir;
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") sortirRef.current(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const champNumero = operation.champs.find((c) => c.type === "numero");
  const champMontant = operation.champs.find((c) => c.type === "montant");
  const numeroSaisi = champNumero ? chiffresDe(valeurs[champNumero.cle] ?? "") : "";
  const montantSaisi = champMontant ? Number(chiffresDe(valeurs[champMontant.cle] ?? "")) : 0;
  const nomDuDestinataire = operation.recents?.find((r) => r.numero === numeroSaisi)?.nom;

  // « Enregistrer ce bénéficiaire ? » à la fin d'un transfert réussi.
  const numeroDuTransfert = numeroSaisi ? numeroPropre(numeroSaisi) : "";
  const dejaAuCarnet = Boolean(operation.recents?.some(
    (r) => r.enregistre && numeroPropre(r.numero) === numeroDuTransfert));
  const nomLu = [...fil].reverse().filter((m) => m.de === "reseau")
    .map((m) => nomDuBeneficiaire(m.texte, numeroDuTransfert)).find(Boolean) ?? null;
  const proposer = termine && issue === "reussie" && Boolean(operation.carte)
    && numeroDuTransfert.length >= 8 && !dejaAuCarnet;

  let vue: React.ReactNode;
  let cleVue: string;
  if (etape === "saisie" && !verification) {
    const champ = operation.champs[pas];
    cleVue = `champ-${pas}`;
    vue = (
      <EtapeChiffres
        titre={champ.type === "montant" ? t.combien : champ.label}
        type={champ.type} valeur={valeurs[champ.cle] ?? ""} aide={champ.aide}
        onChange={(v) => set(champ.cle, v)}
        recents={champ.type === "numero" ? operation.recents : undefined}
        onRecent={(n) => { set(champ.cle, n); setPas((p) => p + 1); }}
        bouton={t.continuer} onValider={() => setPas((p) => p + 1)} langue={langue} />
    );
  } else if (etape === "saisie") {
    cleVue = "verification";
    vue = (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-small text-ink-faint">{t.verifiez}</p>
          {montantSaisi ? <Montant valeur={montantSaisi} langue={langue} grand />
            : <p className="text-title font-semibold">{operation.titre}</p>}
          {numeroSaisi ? (
            <div>
              <p className="text-heading">{t.vers} <strong className="font-semibold">
                {nomDuDestinataire || formaterNumero(numeroSaisi)}</strong></p>
              {nomDuDestinataire && <p className="tabnums text-ink-soft">{formaterNumero(numeroSaisi)}</p>}
            </div>
          ) : null}
          {operation.carteLibelle && (
            <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-small text-ink-soft">
              <span className="size-2 rounded-full" style={{ background: couleurOperateur(op) }} />
              {t.depuis(operation.carteLibelle)}
            </span>
          )}
        </div>
        <p className="mb-3 px-6 text-center text-small text-ink-faint">{t.codeEnsuite}</p>
        <GrosBouton libelle={t.confirmer} onClick={() => void lancer()} autoFocus />
      </div>
    );
  } else if (termine) {
    cleVue = "fin";
    vue = (
      <Fin issue={issue}
        titre={issue === "reussie" ? t.opReussie : issue === "refusee" ? t.opRefusee
          : issue === "interrompue" ? t.opInterrompue : t.opReponse}
        texte={erreur ?? (ecran.texte || dernier)}
        note={issue === "reussie" ? t.confirmationSms : undefined}
        fil={fil} details={details} onDetails={() => setDetails((d) => !d)}
        repondreQuandMeme={issue === "reponse" && conclu && !libre
          ? () => { setLibre(true); setFini(false); } : undefined}
        bouton={t.termine} onTerminer={enSession && !fini ? raccrocher : onFermer} t={t}
        proposition={proposer && operation.carte ? (
          <ProposerBeneficiaire carte={operation.carte} numero={numeroDuTransfert}
            nomInitial={nomLu ?? nomDuDestinataire ?? ""} tb={tb} onFait={onTermine} />
        ) : null} />
    );
  } else if (pave) {
    cleVue = `code-${fil.length}`;
    vue = <EtapeCode onValider={secret} t={t} />;
  } else if (attente || !dernier) {
    cleVue = "attente";
    vue = <Attente texte={!dernier ? t.connexionA(op) : t.onParleA(op)} couleur={couleurOperateur(op)} />;
  } else if (ecran.choix.length && !libre) {
    cleVue = `menu-${fil.length}`;
    vue = (
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-6">
        <p className="text-small text-ink-faint">{t.operateurDemande(op)}</p>
        {/* Le texte du réseau, mot pour mot : jamais traduit. */}
        {ecran.texte && <p className="mb-3 whitespace-pre-line text-title font-semibold">{ecran.texte}</p>}
        {ecran.choix.map((c) => (
          <button key={`${c.numero}-${c.libelle}`} onClick={() => void repondre(c.numero)}
            className="flex items-center gap-3 rounded-2xl bg-surface-raised px-5 py-4 text-left text-body font-medium transition hover:bg-surface-2">
            <span className="flex-1">{c.libelle}</span>
            <IconChevron size={16} className="text-ink-faint" />
          </button>
        ))}
        <button onClick={() => setLibre(true)}
          className="mt-1 self-center p-3 text-small text-ink-soft transition hover:text-ink">
          {t.autreReponse}
        </button>
      </div>
    );
  } else if (ecran.attend === "texte") {
    cleVue = `texte-${fil.length}`;
    vue = (
      <form onSubmit={(e) => { e.preventDefault(); void repondre(reponseLibre); }}
        className="flex flex-1 flex-col gap-4 px-6 py-6">
        <p className="text-small text-ink-faint">{t.operateurDemande(op)}</p>
        <p className="whitespace-pre-line text-title font-semibold">{ecran.texte || dernier}</p>
        <input value={reponseLibre} onChange={(e) => setReponseLibre(e.target.value)} autoFocus
          placeholder={t.votreReponse}
          className="border-b-2 border-ink bg-transparent py-3 text-title outline-none placeholder:text-ink-faint" />
        <div className="flex-1" />
        <GrosBouton libelle={t.envoyer} desactive={!reponseLibre.trim()} type="submit" />
      </form>
    );
  } else {
    // L'opérateur demande un chiffre qu'on ne sait pas servir seul : le même
    // pavé que pour la saisie, sous SA question à lui.
    cleVue = `question-${fil.length}`;
    vue = (
      <EtapeChiffres surtitre={t.operateurDemande(op)} titre={ecran.texte || dernier}
        type={ecran.attend === "montant" ? "montant" : "numero"}
        brut={ecran.attend !== "numero" && ecran.attend !== "montant"}
        valeur={reponseLibre} aide="" onChange={setReponseLibre}
        recents={ecran.attend === "numero" ? operation.recents : undefined}
        onRecent={(n) => void repondre(n)}
        bouton={t.envoyer} onValider={() => void repondre(reponseLibre)} langue={langue} />
    );
  }

  const nbPas = operation.champs.length + 1;

  return (
    <div role="dialog" aria-modal="true" aria-label={operation.titre}
      className="voile fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-6">
      <div className="surgit flex h-full w-full flex-col bg-surface sm:h-[min(760px,92vh)] sm:max-w-[440px] sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl">
        {/* L'EN-TÊTE : revenir, ce qu'on fait, sortir. Rien d'autre. */}
        <header className="flex items-center gap-3 px-4 pb-2 pt-4">
          <div className="w-11">
            {etape === "saisie" && pas > 0 && (
              <button onClick={reculer} aria-label={t.retour} title={t.retour}
                className="grid size-11 place-items-center rounded-full text-ink-soft transition hover:bg-surface-2 hover:text-ink">
                <IconChevron size={18} className="rotate-180" />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-body font-semibold">{operation.titre}</p>
            {operation.carteLibelle && <p className="truncate text-caption text-ink-faint">{operation.carteLibelle}</p>}
          </div>
          <div className="w-11">
            {!termine && <BoutonFermer onClick={sortir} libelle={t.fermer} />}
          </div>
        </header>

        {etape === "saisie" && nbPas > 1 && (
          <div className="flex gap-1 px-6">
            {Array.from({ length: nbPas }).map((_, i) => (
              <span key={i} className={`h-[3px] flex-1 rounded ${i <= pas ? "bg-ink" : "bg-surface-3"}`} />
            ))}
          </div>
        )}

        <div key={cleVue} className="flex min-h-0 flex-1 flex-col entree">
          {vue}
        </div>

        {confirme && retenue && (
          <div className="border-t border-line bg-surface-raised px-5 py-4">
            <BarreArret retenue={retenue} onGarder={() => setConfirme(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function Montant({ valeur, langue, grand, vide }: {
  valeur: number; langue: "fr" | "en"; grand?: boolean; vide?: boolean;
}) {
  return (
    <p className="flex items-baseline justify-center gap-2">
      <span className={`tabnums font-semibold tracking-tight ${grand ? "text-[48px]" : "text-[44px]"} ${vide ? "text-ink-faint" : ""}`}>
        {nombre(valeur, langue)}
      </span>
      <span className="text-heading font-medium text-ink-faint">FCFA</span>
    </p>
  );
}

/** UN CHAMP DE CHIFFRES, SUR UN ÉCRAN À LUI — au pavé de l'écran ou au
 *  clavier de l'ordinateur. */
function EtapeChiffres({
  surtitre, titre, type, brut, valeur, aide, onChange, recents, onRecent,
  bouton, onValider, langue,
}: {
  surtitre?: string; titre: string; type: "numero" | "montant"; brut?: boolean;
  valeur: string; aide: string; onChange: (v: string) => void;
  recents?: (ClientRecent & { enregistre?: boolean })[];
  onRecent: (numero: string) => void; bouton: string; onValider: () => void;
  langue: "fr" | "en";
}) {
  const t = textesGuichet[langue];
  const tb = textesBeneficiaires[langue];
  const c = chiffresDe(valeur);
  const max = type === "montant" ? 9 : 15;
  const taper = (x: string) => onChange((c + x).replace(/^0+(?=\d)/, "").slice(0, max));
  const effacer = () => onChange(c.slice(0, -1));
  const valide = brut ? c.length > 0 : pret(type, c);

  // LE CLAVIER DE L'ORDINATEUR, aussi : on ne clique pas des chiffres un à
  // un quand on a un clavier sous les doigts.
  const etat = useRef({ c, valide, taper, effacer, onValider });
  etat.current = { c, valide, taper, effacer, onValider };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible && /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); etat.current.taper(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); etat.current.effacer(); }
      else if (e.key === "Enter" && etat.current.valide) { e.preventDefault(); etat.current.onValider(); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 pt-6">
        {surtitre && <p className="text-small text-ink-faint">{surtitre}</p>}
        <p className="whitespace-pre-line text-title font-semibold leading-snug">{titre}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        {type === "montant" && !brut ? (
          <Montant valeur={Number(c) || 0} langue={langue} vide={!c} />
        ) : (
          <p className={`tabnums text-[36px] font-semibold tracking-wide ${c ? "" : "text-ink-faint"}`}>
            {/* Vide, un trait — jamais un numéro d'exemple : grisé, il
                passait pour un numéro déjà rempli. */}
            {c ? (brut ? c : formaterNumero(c)) : "— — —"}
          </p>
        )}
        {type === "montant" && !brut && (
          <div className="flex flex-wrap justify-center gap-2">
            {MONTANTS.map((m) => (
              <button key={m} onClick={() => onChange(String(m))}
                className={`tabnums rounded-full px-3.5 py-1.5 text-small font-medium transition ${Number(c) === m ? "bg-ink text-white" : "bg-surface-2 hover:bg-surface-3"}`}>
                {nombre(m, langue)}
              </button>
            ))}
          </div>
        )}
        {recents?.length ? (
          <div className="w-full">
            <p className="mb-2 text-center text-caption text-ink-faint">
              {recents.some((r) => r.enregistre) ? tb.vosBenef : t.clientsRecents}
            </p>
            {/* Centré quand ils tiennent, défilant quand ils débordent — sans
                jamais couper le premier : un « justify-center » dans une
                bande qui défile rogne le début, hors d'atteinte. */}
            <div className="overflow-x-auto pb-1">
              <div className="mx-auto flex w-max gap-3">
                {recents.map((r) => <Visage key={r.numero} client={r} choisi={r.numero === c} onClick={() => onRecent(r.numero)} />)}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <Pave onChiffre={taper} onEffacer={effacer} gauche={type === "montant" && !brut ? "000" : undefined}
            etiquetteEffacer={t.effacerDernier} />
      <GrosBouton libelle={bouton} desactive={!valide} onClick={onValider} />
    </div>
  );
}

function Visage({ client, choisi, onClick }: {
  client: ClientRecent & { enregistre?: boolean }; choisi: boolean; onClick: () => void;
}) {
  const mots = client.nom.trim().split(/\s+/).filter(Boolean);
  const initiales = mots.length ? (mots[0][0] + (mots[1]?.[0] ?? "")).toUpperCase() : client.numero.slice(-2);
  const court = mots.length
    ? mots.slice(0, 2).map((m) => m[0] + m.slice(1).toLowerCase()).join(" ")
    : formaterNumero(client.numero);
  return (
    <button onClick={onClick} title={`${client.nom} ${formaterNumero(client.numero)}`.trim()}
      className="flex w-[72px] shrink-0 flex-col items-center gap-1 transition hover:opacity-70">
      <span className={`grid size-[52px] place-items-center rounded-full border font-semibold ${choisi ? "border-ink bg-ink text-white" : "border-line bg-surface-raised"}`}>
        {initiales}
      </span>
      <span className="line-clamp-2 text-center text-caption leading-tight text-ink-soft">{court}</span>
    </button>
  );
}

function Pave({ onChiffre, onEffacer, gauche, etiquetteEffacer }: {
  onChiffre: (c: string) => void; onEffacer: () => void; gauche?: string; etiquetteEffacer: string;
}) {
  const touches: (string | null)[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", gauche ?? null, "0", "⌫"];
  return (
    <div className="grid grid-cols-3 px-4 pb-2">
      {touches.map((x, i) => x == null ? <span key={i} /> : (
        <button key={i} onClick={() => (x === "⌫" ? onEffacer() : onChiffre(x))}
          aria-label={x === "⌫" ? etiquetteEffacer : x}
          className={`h-14 rounded-2xl tabnums transition hover:bg-surface-2 active:bg-surface-3 ${x === "000" ? "text-heading" : "text-[26px]"} ${x === "⌫" ? "text-ink-soft" : "font-medium"}`}>
          {x}
        </button>
      ))}
    </div>
  );
}

function GrosBouton({ libelle, onClick, desactive, type = "button", autoFocus }: {
  libelle: string; onClick?: () => void; desactive?: boolean;
  type?: "button" | "submit"; autoFocus?: boolean;
}) {
  return (
    <div className="px-4 pb-5">
      <button type={type} onClick={onClick} disabled={desactive} autoFocus={autoFocus}
        className="h-14 w-full rounded-2xl bg-accent text-[17px] font-semibold text-white transition hover:bg-accent-hover active:scale-[.98] disabled:bg-surface-3 disabled:text-ink-faint">
        {libelle}
      </button>
    </div>
  );
}

/** LE CODE SECRET. Des points, le pavé, « Valider ». Les chiffres ne vivent
 *  que dans l'état de ce composant : jamais affichés, jamais dans un champ
 *  du navigateur (qui les retiendrait), oubliés dès l'envoi. */
function EtapeCode({ onValider, t }: { onValider: (code: string) => void; t: (typeof textesGuichet)["fr"] }) {
  const [code, setCode] = useState("");
  const valider = () => {
    if (code.length < LONGUEUR_CODE_MIN) return;
    onValider(code);
    setCode("");
  };
  const taper = (x: string) => setCode((v) => (v.length >= LONGUEUR_CODE_MAX ? v : v + x));
  const effacer = () => setCode((v) => v.slice(0, -1));
  const etat = useRef({ taper, effacer, valider });
  etat.current = { taper, effacer, valider };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); etat.current.taper(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); etat.current.effacer(); }
      else if (e.key === "Enter") { e.preventDefault(); etat.current.valider(); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <span className="grid size-14 place-items-center rounded-full bg-surface-2"><IconLock size={24} /></span>
        <p className="text-title font-semibold">{t.codeTitre}</p>
        <p className="text-small text-ink-faint">{t.codeNote}</p>
        <div aria-label={t.chiffresComposes(code.length)} className="mt-4 flex h-4 items-center gap-3">
          {Array.from({ length: Math.max(LONGUEUR_CODE_MIN, code.length) }).map((_, i) => (
            <span key={i} className={`size-3.5 rounded-full border-[1.5px] ${i < code.length ? "border-ink bg-ink" : "border-ink-faint"}`} />
          ))}
        </div>
      </div>
      <Pave onChiffre={taper} onEffacer={effacer} etiquetteEffacer={t.effacerDernier} />
      <GrosBouton libelle={t.valider} desactive={code.length < LONGUEUR_CODE_MIN} onClick={valider} />
    </div>
  );
}

/** L'attente : un rond qui respire, à la couleur de l'opérateur, et UNE phrase. */
function Attente({ texte, couleur }: { texte: string; couleur: string }) {
  return (
    <div aria-live="polite" className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="relative grid size-[120px] place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full opacity-25 motion-reduce:animate-none" style={{ background: couleur }} />
        <span className="grid size-[72px] place-items-center rounded-full border-[3px] bg-surface-raised" style={{ borderColor: couleur }}>
          <IconPuceSim size={28} />
        </span>
      </div>
      <p className="text-heading font-medium">{texte}</p>
    </div>
  );
}

function Fin({
  issue, titre, texte, note, fil, details, onDetails, repondreQuandMeme,
  bouton, onTerminer, t, proposition,
}: {
  issue: Issue; titre: string; texte: string; note?: string; fil: Msg[];
  details: boolean; onDetails: () => void; repondreQuandMeme?: () => void;
  bouton: string; onTerminer: () => void; t: (typeof textesGuichet)["fr"];
  proposition?: React.ReactNode;
}) {
  const Icone = issue === "reussie" ? IconCheck : issue === "reponse" ? IconBubble : IconClose;
  const fond = issue === "reussie" ? "bg-positive-vif" : issue === "reponse" ? "bg-ink" : "bg-negative";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-6 py-6 text-center">
        <div className="flex-1" />
        <span className={`grid size-[88px] shrink-0 place-items-center rounded-full text-white ${fond}`}>
          <Icone size={40} />
        </span>
        <p className="text-title font-semibold">{titre}</p>
        {/* Le texte du réseau, mot pour mot. Pour une simple réponse (un
            solde), c'est lui l'information — en grand. */}
        {texte && (
          <p className={`whitespace-pre-line ${issue === "reponse" ? "text-heading" : "text-body text-ink-soft"}`}>
            {texte}
          </p>
        )}
        {note && <p className="text-small text-ink-faint">{note}</p>}
        {proposition}
        {repondreQuandMeme && (
          <button onClick={repondreQuandMeme} className="text-small text-ink-soft underline underline-offset-4">
            {t.repondreQuandMeme}
          </button>
        )}
        {fil.length > 1 && (
          <button onClick={onDetails} className="mt-2 text-small text-ink-soft transition hover:text-ink">
            {details ? t.masquerDetails : t.details}
          </button>
        )}
        {details && (
          <div className="flex w-full flex-col gap-2">
            {fil.map((m, k) => (
              <p key={k} className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-left text-small ${m.de === "vous" ? "self-end bg-accent text-white" : "self-start bg-surface-raised"}`}>
                {m.texte}
              </p>
            ))}
          </div>
        )}
        <div className="flex-1" />
      </div>
      <GrosBouton libelle={bouton} onClick={onTerminer} autoFocus />
    </div>
  );
}

function ProposerBeneficiaire({ carte, numero, nomInitial, tb, onFait }: {
  carte: string; numero: string; nomInitial: string;
  tb: (typeof textesBeneficiaires)["fr"]; onFait?: () => void;
}) {
  const [nom, setNom] = useState(nomInitial);
  const [etat, setEtat] = useState<"repos" | "envoi" | "fait" | "erreur">("repos");
  const enCours = useRef(false);
  const enregistrer = async () => {
    if (enCours.current || !nom.trim()) return;
    enCours.current = true;
    setEtat("envoi");
    try {
      const r = await fetch("/api/beneficiaires", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ geste: "enregistrer", carte, numero, nom: nomPropre(nom) }),
      });
      if (!r.ok) throw new Error();
      setEtat("fait");
      onFait?.();
    } catch {
      setEtat("erreur");
    } finally {
      enCours.current = false;
    }
  };
  if (etat === "fait") {
    return (
      <p className="flex items-center gap-2 text-ink-soft">
        <IconCheck size={18} className="text-positive" /> {tb.enregistre} · {nomPropre(nom)}
      </p>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}
      className="flex w-full flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-4 text-left">
      <p className="flex items-center gap-2 font-semibold"><IconPersonnes size={20} /> {tb.enregistrerCeBenef}</p>
      <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={tb.nomAide}
        className="border-b-[1.5px] border-ink bg-transparent py-2 text-heading font-medium outline-none placeholder:text-ink-faint" />
      <p className="tabnums text-small text-ink-faint">{formaterNumero(numero)}</p>
      {etat === "erreur" && <p className="text-small text-negative">{tb.echec}</p>}
      <button type="submit" disabled={!nom.trim() || etat === "envoi"}
        className="self-start rounded-full bg-accent px-5 py-2.5 text-small font-semibold text-white transition hover:bg-accent-hover disabled:bg-surface-3">
        {tb.enregistrer}
      </button>
    </form>
  );
}
