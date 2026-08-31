"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { aDesVariables, codesUssd } from "@noyau/codes";
import { demandeUnCode } from "@noyau/ussd";
import { textesUssd } from "@noyau/textes/ussd";
import type { RaccourciAppris, Sim } from "@noyau/types";
import { BarreArret, BoutonFermer } from "../feuille";
import { IconHash } from "../icons";
import { useLangue } from "../langue";
import { PaveSecret } from "../pave-secret";

/**
 * La console USSD, branchée sur le vrai réseau. Chaque code composé part dans
 * la base ; le terminal de Douala le tape sur la carte ; la réponse de
 * l'opérateur revient ici, telle quelle. Rien n'est simulé : ce qui s'affiche
 * est ce que le réseau a répondu.
 *
 * La sortie suit le motif de la plateforme (feuille.tsx) : croix de 44 px,
 * Échap, voile — et tant que la session est VIVANTE, ces trois chemins mènent
 * à la même confirmation avant de raccrocher. Une attente n'est jamais un
 * verrou : l'écran se quitte à tout moment, l'ordre au terminal suit.
 * (Sur grand écran la session est une carte de la page, pas une fenêtre :
 * la console garde donc sa propre coquille et n'emprunte à la feuille que
 * ses pièces — le bouton, la barre d'arrêt, les règles.)
 */

type Msg = { de: "reseau" | "vous"; texte: string };

// « Le réseau attend-il le code secret ? » se lit dans le NOYAU, jamais ici.
//
// Cet écran en gardait sa propre copie, et les deux ne s'accordaient déjà
// plus : sur « 3)\nEntrez votre code PIN », le noyau disait non et cette
// console disait oui. Même texte d'opérateur, décision opposée sur
// l'ouverture du pavé, dans la même plateforme — et c'est la décision qui
// détermine si le code part masqué ou en clair. Une seule lecture, partagée.
type CarteConsole = Pick<Sim, "libelle" | "operateur" | "iccid">;

export function ConsoleUssd({
  cartes,
  raccourcis,
  codeInitial,
}: {
  cartes: CarteConsole[];
  // Les boutons appris par le robot (💾 sur Telegram), par opérateur.
  raccourcis: Record<string, RaccourciAppris[]>;
  codeInitial?: string;
}) {
  const langue = useLangue();
  const t = textesUssd[langue];
  // La carte sur laquelle le cadran compose. Le choix se fige pendant une
  // session : un menu ouvert appartient à SA carte.
  const [choisie, setChoisie] = useState(cartes[0]?.iccid ?? "");
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const [saisie, setSaisie] = useState("");
  const [reponse, setReponse] = useState("");
  const [fil, setFil] = useState<Msg[]>([]);
  const [enSession, setEnSession] = useState(false);
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  // Le numéro de génération : fermer l'écran le fait avancer, et toute
  // réponse d'une génération passée est jetée — un écran refermé ne se
  // rouvre pas tout seul sur une réponse tardive.
  const generation = useRef(0);
  // Une session vivante à raccrocher ? Lu depuis le nettoyage de démontage,
  // d'où un `ref` synchrone plutôt que l'état React.
  const aRaccrocher = useRef(false);
  // UN ENVOI À LA FOIS, ET SYNCHRONE. `attente` est un état React : il ne
  // devient vrai qu'au re-rendu SUIVANT. Deux appuis rapides sur « Entrée »
  // passaient donc tous les deux, et un code complet — bénéficiaire et
  // montant compris — partait DEUX fois. Un drapeau synchrone ferme la
  // porte à l'instant même, comme ailleurs dans l'application.
  const envoiEnCours = useRef(false);

  // L'ordre de raccrochage, à un seul endroit : il marque aussi que c'est
  // fait, pour que le démontage ne le renvoie pas une seconde fois.
  const posterFin = useCallback(() => {
    aRaccrocher.current = false;
    fetch("/api/commande", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "ussd_fin", parametres: {} }),
    }).catch(() => {});
  }, []);

  // Rend la réponse du réseau quand la demande aboutit, null sinon : c'est
  // ce qui permet de rejouer un bouton appris étape par étape, en s'arrêtant
  // net dès que le réseau ne suit pas.
  const envoyer = async (
    genre: "ussd" | "ussd_reponse",
    parametres: Record<string, unknown>,
    bulle?: Msg,
    // Jointe à la composition : le cadran accepte un code complet tapé à la
    // main — donc un transfert entier, qu'on ne veut pas jouer deux fois.
    cle?: string,
  ): Promise<string | null> => {
    if (attente || envoiEnCours.current) return null;
    envoiEnCours.current = true;
    const gen = generation.current;
    setAttente(true);
    setErreur(null);
    if (bulle) setFil((f) => [...f, bulle]);
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: genre, parametres, cle }),
      });
      if (!r.ok) {
        const corps = await r.json().catch(() => null);
        // corps.erreur arrive déjà dans la langue de l'écran : tel quel.
        throw new Error(corps?.erreur || t.demandePasPartie);
      }
      const { id } = (await r.json()) as { id: number };
      // Le terminal relève ses demandes toutes les quelques secondes : on
      // attend sa réponse, sans jamais prétendre l'avoir avant lui.
      for (let i = 0; i < 25; i++) {
        await new Promise((res) => setTimeout(res, 1200));
        if (generation.current !== gen) return null;   // écran refermé entre-temps
        const c = await fetch(`/api/commande/${id}`, { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);
        if (c && (c.etat === "faite" || c.etat === "echouee")) {
          if (generation.current !== gen) return null;
          const texte = c.resultat || (c.etat === "faite" ? t.reponseVide : t.echec);
          setFil((f) => [...f, { de: "reseau", texte }]);
          setEnSession(c.etat === "faite");
          setAttente(false);
          return c.etat === "faite" ? texte : null;
        }
      }
      throw new Error(t.terminalMuet);
    } catch (e) {
      if (generation.current !== gen) return null;
      setErreur(e instanceof Error ? e.message : t.accroc);
      setAttente(false);
      return null;
    } finally {
      envoiEnCours.current = false;
    }
  };

  const composer = (code: string) => {
    const c = code.trim();
    if (!c || enSession) return;
    setFil([]);
    setSaisie("");
    // L'ICCID voyage avec le code : le robot compose sur CETTE carte,
    // jamais sur « la première venue ».
    void envoyer("ussd", { code: c, carte: carte.iccid }, { de: "vous", texte: c },
      `cadran-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  };

  // Rejouer un bouton appris : le code d'entrée, puis chaque réponse retenue,
  // dans l'ordre. Le code secret n'est jamais dans un parcours —
  // l'apprentissage s'arrête juste avant, et le pavé prend la main ici aussi.
  const jouer = async (etapes: string[]) => {
    if (!etapes.length || enSession || attente) return;
    // Un bouton à trous (« *126*1*{numero}*{montant}# ») n'a pas sa place
    // ici : ce cadran ne demande rien avant de composer, et « {numero} »
    // parti tel quel au réseau est un code faux. Il se lance depuis
    // Opérations, qui pose les questions d'abord.
    if (aDesVariables(etapes)) return;
    setFil([]);
    setSaisie("");
    let texte = await envoyer("ussd", { code: etapes[0], carte: carte.iccid },
      { de: "vous", texte: etapes[0] });
    for (const etape of etapes.slice(1)) {
      if (texte == null) return;   // le réseau n'a pas suivi : on s'arrête là
      texte = await envoyer("ussd_reponse", { texte: etape }, { de: "vous", texte: etape });
    }
  };

  const repondre = (texte: string) => {
    const t = texte.trim();
    if (!t) return;
    setReponse("");
    void envoyer("ussd_reponse", { texte: t }, { de: "vous", texte: t });
  };

  const secret = (code: string) => {
    void envoyer("ussd_reponse", { texte: code, secret: true }, { de: "vous", texte: "••••" });
  };

  // RACCROCHER, l'arrêt effectif : l'ordre part au terminal sans faire
  // attendre l'écran — la carte se replie sur-le-champ.
  const raccrocher = useCallback(() => {
    generation.current++;
    posterFin();
    setFil([]); setEnSession(false); setErreur(null);
    setAttente(false); setConfirme(false);
  }, [posterFin]);

  // Fermer l'écran quand rien ne vit : immédiat, sans aller-retour. Si une
  // commande est encore EN VOL, on raccroche défensivement — une session qui
  // s'ouvrirait après la fermeture ne doit jamais rester pendue sur la carte.
  const fermerEcran = useCallback(() => {
    if (attente) posterFin();
    generation.current++;
    setFil([]); setErreur(null); setAttente(false); setConfirme(false);
  }, [attente, posterFin]);

  // LA porte de sortie : libre quand la session est finie, retenue par la
  // confirmation quand elle est vivante — croix, voile et Échap, même porte.
  const sortir = useCallback(() => {
    if (enSession) setConfirme(true);
    else fermerEcran();
  }, [enSession, fermerEcran]);

  const visible = fil.length > 0 || attente;

  // QUITTER LA PAGE NE DOIT PAS LAISSER LA SIM EN LIGNE. Les boutons
  // raccrochent déjà ; ce qui manquait, c'est le départ AUTREMENT — la
  // navigation, le « précédent » du navigateur. La console est une carte de
  // la page /ussd : en quitter la page la démonte, et sans ce nettoyage la
  // session restait ouverte sur la vraie carte, à Douala.
  useEffect(() => { aRaccrocher.current = enSession; }, [enSession]);
  useEffect(() => () => { if (aRaccrocher.current) posterFin(); }, [posterFin]);

  // FERMER L'ONGLET NE DOIT PAS LAISSER LA SIM EN LIGNE.
  //
  // Le nettoyage de démontage de React ne s'exécute QUE si le composant est
  // démonté par l'application : fermer l'onglet, recharger, taper une autre
  // adresse ou revenir en arrière hors du site déchargent la page sans qu'il
  // soit appelé — et la session reste ouverte sur la vraie carte, à Douala.
  //
  // `sendBeacon` est fait pour ce moment précis : le navigateur garde la
  // requête en charge APRÈS la disparition de la page. On l'accroche à
  // « pagehide », que tous les navigateurs déclenchent (y compris sur mobile,
  // où « beforeunload » est ignoré).
  useEffect(() => {
    const enPartant = () => {
      if (!aRaccrocher.current) return;
      aRaccrocher.current = false;
      navigator.sendBeacon?.(
        "/api/commande",
        new Blob([JSON.stringify({ type: "ussd_fin", parametres: {} })],
                 { type: "application/json" }));
    };
    window.addEventListener("pagehide", enPartant);
    return () => window.removeEventListener("pagehide", enPartant);
  }, []);

  // Échap sort — la même porte qu'au doigt.
  useEffect(() => {
    if (!visible) return;
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") sortir();
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [visible, sortir]);

  // La session peut se terminer pendant que la question est posée.
  useEffect(() => {
    if (!enSession) setConfirme(false);
  }, [enSession]);

  // Le piège à focus de la feuille — sur téléphone seulement : sur grand
  // écran la session est une carte DE la page, le clavier doit pouvoir
  // circuler librement entre le cadran et elle.
  const feuille = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!visible) return;
    const telephone = window.matchMedia("(max-width: 1023px)");
    if (!telephone.matches) return;
    const avant = document.activeElement as HTMLElement | null;
    const focusables = (): HTMLElement[] =>
      [...(feuille.current?.querySelectorAll<HTMLElement>(
        'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((e) => !e.hasAttribute("disabled") && e.offsetParent !== null);
    const piege = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const actif = document.activeElement;
      if (!feuille.current?.contains(actif as Node)) { e.preventDefault(); els[0].focus(); return; }
      if (e.shiftKey && actif === els[0]) { e.preventDefault(); els[els.length - 1].focus(); }
      else if (!e.shiftKey && actif === els[els.length - 1]) { e.preventDefault(); els[0].focus(); }
    };
    window.addEventListener("keydown", piege, true);
    return () => {
      window.removeEventListener("keydown", piege, true);
      avant?.focus?.();
    };
  }, [visible]);

  // Arrivée depuis un bouton du guichet : le code se compose tout seul.
  const lance = useRef(false);
  useEffect(() => {
    if (codeInitial && !lance.current) {
      lance.current = true;
      composer(codeInitial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeInitial]);

  const dernier = [...fil].reverse().find((m) => m.de === "reseau")?.texte ?? "";
  const pave = enSession && !attente && demandeUnCode(dernier);

  return (
    // Grand écran : le cadran à gauche, l'écran de session à droite.
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-x-10">
      <header className="lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre(carte.libelle)}</p>
        {/* Deux cartes en place : le cadran dit sur laquelle il compose.
            Le choix se fige pendant une session — un menu ouvert appartient
            à SA carte. */}
        {cartes.length > 1 && (
          <span className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t.carteDuCadran}>
            {cartes.map((c) => (
              <button
                key={c.iccid}
                onClick={() => setChoisie(c.iccid)}
                disabled={attente || enSession}
                aria-pressed={c.iccid === carte.iccid}
                className={`rounded-btn px-3 py-1.5 text-small font-medium transition disabled:opacity-40 ${
                  c.iccid === carte.iccid
                    ? "bg-ink text-white"
                    : "border border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
                }`}
              >
                {c.libelle}
              </button>
            ))}
          </span>
        )}
      </header>

      {/* La colonne du cadran : composer, puis les raccourcis */}
      <div className="flex flex-col gap-5 lg:col-start-1">
        <form
          onSubmit={(e) => { e.preventDefault(); composer(saisie); }}
          className="flex items-center gap-2"
        >
          <div className="flex flex-1 items-center gap-2.5 rounded-btn border border-line bg-surface-raised px-3.5">
            <IconHash size={16} className="text-ink-faint" />
            <input
              value={saisie}
              onChange={(e) => setSaisie(e.target.value.replace(/[^0-9#*]/g, ""))}
              inputMode="tel"
              placeholder={codesUssd[carte.operateur]?.[0]?.code ?? "#148#"}
              className="flex-1 bg-transparent py-2.5 text-body tabnums outline-none placeholder:text-ink-faint"
            />
          </div>
          <button type="submit" disabled={!saisie.trim() || attente || enSession}
            className="rounded-btn bg-ink px-4 py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
            {t.composer}
          </button>
        </form>

        {/* Les codes déjà relevés sur le terrain — modifiables dans les réglages.
            Le libellé suit la langue par la clé du catalogue ; le code, jamais.
            Une ligne par code, taillée pour le pouce : le nuage de puces
            serrées se visait mal sur téléphone. */}
        <div className="flex flex-col gap-1.5">
          {(codesUssd[carte.operateur] ?? []).map((c) => (
            <button key={c.code} onClick={() => composer(c.code)} disabled={attente || enSession}
              className="flex items-center justify-between gap-3 rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-left text-small font-medium text-ink transition hover:border-ink-faint disabled:opacity-40">
              {t.libelleCode(c.cle, c.libelle)}
              <span className="tabnums font-normal text-ink-faint">{c.code}</span>
            </button>
          ))}
        </div>

        {/* Les boutons APPRIS par le robot (💾 sur Telegram), pour cet
            opérateur : le même carnet que Telegram, lu depuis la base. Un
            bouton rejoue son parcours étape par étape — jamais le code
            secret, l'apprentissage s'arrête juste avant. */}
        {(raccourcis[carte.operateur] ?? []).length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-caption uppercase tracking-wider text-ink-faint">
              {t.boutonsAppris}
            </p>
            {(raccourcis[carte.operateur] ?? []).map((r) => {
              const aTrous = aDesVariables(r.etapes);
              return (
              <button key={r.nom} onClick={() => void jouer(r.etapes)}
                disabled={attente || enSession || aTrous}
                title={aTrous ? t.boutonAVariables : undefined}
                className="flex flex-col gap-0.5 rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-left text-small font-medium text-ink transition hover:border-ink-faint disabled:opacity-40">
                <span className="flex items-center justify-between gap-3">
                  {r.libelle}
                  <span className="tabnums font-normal text-ink-faint">{r.etapes.join(" → ")}</span>
                </span>
                {aTrous && (
                  <span className="text-caption font-normal text-ink-faint">
                    {t.boutonAVariables}
                  </span>
                )}
              </button>
              );
            })}
          </div>
        )}

        <p className="hidden text-caption leading-relaxed text-ink-faint lg:block">
          {t.noteSession}
        </p>
      </div>

      {/* L'écran de session */}
      {!visible ? (
        <div className="hidden items-center justify-center rounded-card border border-dashed border-line px-6 py-16 text-center lg:col-start-2 lg:flex">
          <p className="max-w-56 text-small leading-relaxed text-ink-faint">
            {t.aucuneSession}
          </p>
        </div>
      ) : (
        // Une FEUILLE posée en bas de l'écran : le cadran reste visible
        // derrière le voile. Sur grand écran, la carte de droite, comme
        // toujours.
        <>
        <div className="voile fixed inset-0 z-20 bg-ink/25 lg:hidden"
          onClick={sortir} />
        <section ref={feuille} className="fixed inset-x-0 bottom-0 z-30 flex max-h-[88dvh] flex-col rounded-t-card border-t border-line bg-surface-raised lg:static lg:z-auto lg:max-h-none lg:rounded-card lg:border lg:col-start-2">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-2.5 pl-4 pr-2.5">
            <p className="text-small font-medium">
              {enSession ? t.sessionEnCours : t.sessionTerminee} · {carte.libelle}
            </p>
            {/* La croix de la plateforme : 44 px, bordée, jamais désactivée —
                et jamais un raccrochage en silence. */}
            <BoutonFermer onClick={sortir}
              libelle={enSession ? t.raccrocher : t.fermerEcran} />
          </div>

          {/* UNE seule carte, réécrite à chaque réponse du réseau. Le message
              de l'opérateur a un minimum de place GARANTI : le pavé n'a pas
              le droit de l'écraser. */}
          <div className="min-h-28 flex-1 overflow-y-auto overscroll-contain p-4">
            {dernier && (
              <p dir="auto" className="whitespace-pre-line rounded-card bg-surface-2 px-4 py-3.5 text-body leading-relaxed">
                {dernier}
              </p>
            )}
            {attente && (
              <p className="mt-2 px-1 text-caption text-ink-faint">
                {t.terminalCompose}
              </p>
            )}
            {erreur && (
              <p className="mt-2 rounded-card bg-surface-2 px-4 py-3 text-small leading-relaxed text-negative">
                {erreur}
              </p>
            )}
          </div>

          {/* Les gestes — toujours visibles, jamais à aller chercher. */}
          <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4">
            {confirme && enSession ? (
              // La confirmation d'arrêt, à même le pied — jamais une
              // deuxième fenêtre par-dessus la première.
              <BarreArret
                retenue={{
                  question: t.raccrocherQuestion,
                  arreter: t.raccrocherCourt,
                  garder: t.garderSession,
                  onArreter: raccrocher,
                }}
                onGarder={() => setConfirme(false)}
              />
            ) : (
              <>
                {/* Le pavé, quand le réseau attend le code secret — à même la
                    feuille, sans boîte autour : la place est au message. */}
                {pave && <PaveSecret onValider={secret} />}

                {/* Réponse libre : le chiffre du menu, un montant, un numéro */}
                {enSession && !attente && !pave && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); repondre(reponse); }}
                    className="flex items-center gap-2"
                  >
                    <input
                      value={reponse}
                      onChange={(e) => setReponse(e.target.value)}
                      inputMode="tel"
                      placeholder={t.votreReponseDetail}
                      autoFocus
                      className="flex-1 rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition placeholder:text-ink-faint focus:border-ink"
                    />
                    <button type="submit" disabled={!reponse.trim()}
                      className="rounded-btn bg-ink px-4 py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
                      {t.envoyer}
                    </button>
                  </form>
                )}

                {/* Le geste de sortie, impossible à manquer — un mot, jamais
                    désactivé : une attente n'est pas un verrou. Session
                    vivante : la même porte que la croix (confirmation) ;
                    sinon, fermer est immédiat. */}
                <button onClick={sortir}
                  className={`rounded-btn border border-line py-2.5 text-small font-medium transition ${
                    enSession
                      ? "text-negative hover:border-negative"
                      : "text-ink-soft hover:border-ink-faint"
                  }`}>
                  {enSession ? t.annulerSession : t.fermerEcran}
                </button>
              </>
            )}
          </div>
        </section>
        </>
      )}

      <p className="text-caption leading-relaxed text-ink-faint lg:hidden">
        {t.noteSessionCourte}
      </p>
    </div>
  );
}
