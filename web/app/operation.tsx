"use client";

import { useEffect, useRef, useState } from "react";
import { remplirVariables } from "@noyau/codes";
import { champPourQuestion, demandeUnCode } from "@noyau/ussd";
import { textesGuichet } from "@noyau/textes/guichet";
import { Feuille } from "./feuille";
import { useLangue } from "./langue";
import { PaveSecret } from "./pave-secret";

/**
 * Le pop-up d'une opération, du premier champ au code secret.
 *
 * Vous remplissez le formulaire (numéro, montant…), la vraie session USSD
 * s'ouvre sur la carte à Douala, et la plateforme répond elle-même aux
 * questions du menu avec vos informations — chaque échange reste affiché.
 * Quand l'opérateur demande le code secret, le pavé s'ouvre. Si une question
 * n'est pas reconnue, elle vous est simplement posée : on ne devine pas.
 *
 * La sortie suit le motif de la plateforme (feuille.tsx) : tant que la
 * session est VIVANTE, la croix, le voile et Échap mènent tous à la même
 * confirmation — raccrocher ne se fait jamais d'un frôlement.
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
};

type Msg = { de: "reseau" | "vous"; texte: string };

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
  const [etape, setEtape] = useState<"saisie" | "session">(
    operation.champs.length ? "saisie" : "session",
  );
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [fil, setFil] = useState<Msg[]>([]);
  const [attente, setAttente] = useState(false);
  const [enSession, setEnSession] = useState(false);
  // LA CLÉ D'INTENTION DE CETTE OPÉRATION — tirée une fois, à l'ouverture.
  // Le premier code composé porte le bénéficiaire ET le montant : le
  // composer deux fois, c'est transférer deux fois. Cette clé accompagne ce
  // premier envoi ; si le même geste repart (un rendu joué deux fois, un
  // appui recompté, une requête reprise après un délai), la base reconnaît
  // la clé et rend la demande DÉJÀ créée au lieu d'en ouvrir une seconde.
  const cleOperation = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  // Un raccrochage est-il DÛ ? (session ouverte, pas encore close.) Un
  // `ref` synchrone, lisible depuis le nettoyage de démontage — l'état
  // React n'y serait plus à jour.
  const raccrochageDu = useRef(false);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reponseLibre, setReponseLibre] = useState("");
  // Les champs pas encore consommés par les questions du réseau.
  const restants = useRef<ChampOperation[]>([...operation.champs]);

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));
  const complet = operation.champs.every((c) => (valeurs[c.cle] ?? "").trim());

  const chiffres = (v: string) => v.replace(/\D/g, "");

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
        body: JSON.stringify({ type: genre, parametres, cle }),
      });
      if (!r.ok) {
        const corps = await r.json().catch(() => null);
        // corps.erreur arrive déjà dans la langue de l'écran : tel quel.
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
  // laisser la main (pavé pour le code, zone de texte pour le reste).
  const derouler = async (texte: string | null) => {
    while (texte) {
      if (demandeUnCode(texte)) return;              // le pavé prend la main
      const champ = champPourQuestion(texte, restants.current);
      if (!champ) return;                            // question inattendue : à vous
      restants.current = restants.current.filter((c) => c !== champ);
      const valeur = chiffres(valeurs[champ.cle] ?? "");
      texte = await envoyer("ussd_reponse", { texte: valeur }, { de: "vous", texte: valeur });
    }
  };

  const lancer = async () => {
    setEtape("session");
    restants.current = [...operation.champs];
    const brutes = operation.etapes?.length ? operation.etapes : [operation.code];

    // LES TROUS D'ABORD. Un code peut porter « {numero} » et « {montant} » :
    // on les remplace par ce qui vient d'être saisi, et le code part alors
    // ENTIER — « *126*1*677123456*5000# » — le réseau ne demandant plus que
    // le code secret. Sans trou, rien ne change : le code ouvre le menu et
    // les questions se déroulent une à une, comme avant.
    const { etapes, consommees, manquantes } = remplirVariables(brutes, valeurs);
    // Un trou sans réponse ne part JAMAIS tel quel : « {numero} » composé
    // au réseau, c'est un code faux — au mieux il échoue, au pire il tombe
    // sur autre chose. On s'arrête, et on dit lequel manque.
    if (manquantes.length) {
      setErreur(t.trouSansReponse(manquantes.map((m) => `{${m}}`).join(", ")));
      setFini(true);
      return;
    }
    // Ce qui voyage DÉJÀ dans le code ne doit pas être resaisi ensuite : on
    // retire ces champs de la liste des réponses à donner.
    if (consommees.length) {
      restants.current = restants.current.filter(
        (c) => !consommees.includes(c.cle));
    }

    let texte = await envoyer(
      "ussd",
      operation.carte
        ? { code: etapes[0], carte: operation.carte }
        : { code: etapes[0] },
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

  // Le drapeau suit l'état : une session vivante et non finie DOIT être
  // raccrochée. Les boutons de fermeture le font déjà ; ce qui manquait,
  // c'est le cas où l'on QUITTE l'écran autrement — un appui sur la
  // navigation, le bouton « précédent » du navigateur. Le composant se
  // démonte alors sans un mot, et la session reste ouverte sur la vraie SIM,
  // à Douala : l'opération suivante peut échouer parce que la carte est
  // encore « en ligne » sur un menu. Le nettoyage de démontage raccroche.
  useEffect(() => { raccrochageDu.current = enSession && !fini; }, [enSession, fini]);
  useEffect(() => () => { if (raccrochageDu.current) posterFin(); }, []);

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
      if (!raccrochageDu.current) return;
      raccrochageDu.current = false;
      navigator.sendBeacon?.(
        "/api/commande",
        new Blob([JSON.stringify({ type: "ussd_fin", parametres: {} })],
                 { type: "application/json" }));
    };
    window.addEventListener("pagehide", enPartant);
    return () => window.removeEventListener("pagehide", enPartant);
  }, []);

  const secret = async (code: string) => {
    const texte = await envoyer("ussd_reponse", { texte: code, secret: true }, { de: "vous", texte: "••••" });
    if (texte) { setFini(true); onTermine?.(); }
  };

  const repondre = async (texte: string) => {
    const t = texte.trim();
    if (!t) return;
    setReponseLibre("");
    await derouler(await envoyer("ussd_reponse", { texte: t }, { de: "vous", texte: t }));
  };

  // L'ordre de raccrochage, sans faire attendre l'écran.
  const posterFin = () => {
    raccrochageDu.current = false;      // c'est fait : le démontage ne refera rien
    fetch("/api/commande", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "ussd_fin", parametres: {} }),
    }).catch(() => {});
  };

  // RACCROCHER, l'arrêt effectif : l'ordre part, la fenêtre se ferme.
  const raccrocher = () => {
    posterFin();
    onFermer();
  };

  // Fermer l'écran de session : si une commande est encore EN VOL (le réseau
  // n'a pas répondu), on raccroche défensivement — une session qui s'ouvre
  // après la fermeture ne doit jamais rester pendue sur la carte, sans écran.
  const fermerSession = () => {
    if (attente && !fini) posterFin();
    onFermer();
  };

  const dernier = [...fil].reverse().find((m) => m.de === "reseau")?.texte ?? "";
  const pave = enSession && !attente && !fini && demandeUnCode(dernier);

  // Tant que la session est vivante, toute sortie passe par la confirmation.
  // Et un formulaire entamé ne se jette pas sans question : la saisie perdue
  // se nomme avant de disparaître.
  const saisieEntamee = operation.champs.some((c) => (valeurs[c.cle] ?? "").trim());
  const retenue = etape === "session" && enSession && !fini
    ? {
        question: t.raccrocherQuestion,
        arreter: t.raccrocherCourt,
        garder: t.garderSession,
        onArreter: raccrocher,
      }
    : etape === "saisie" && saisieEntamee
      ? {
          question: t.jeterQuestion,
          arreter: t.jeter,
          garder: t.continuerSaisie,
          onArreter: onFermer,
        }
      : null;

  const entete = (
    <>
      <p className="text-caption uppercase tracking-wider text-ink-faint">
        {etape === "saisie" ? t.preparation : enSession ? t.sessionEnCours : t.session}
        {" · "}<span className="tabnums">
          {remplirVariables(
            operation.etapes?.length ? operation.etapes : [operation.code],
            valeurs).etapes[0]}
        </span>
      </p>
      <h2 className="mt-0.5 truncate text-heading font-semibold">{operation.titre}</h2>
    </>
  );

  const pied = etape === "saisie"
    ? (sortir: () => void) => (
      // Les deux gestes de la préparation — l'annulation est un MOT, pas
      // une croix, et passe par la même porte : une saisie entamée pose
      // sa question avant d'être jetée.
      <div className="flex gap-2">
        <button onClick={sortir} className="flex-1 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint">
          {t.annuler}
        </button>
        <button disabled={!complet} onClick={lancer}
          className="flex-1 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
          {t.lancer}
        </button>
      </div>
    )
    : (sortir: () => void) => (
      <div className="flex flex-col gap-2.5">
        {/* Le pavé, la réponse et la sortie — toujours visibles en bas, et
            compacts : la place est au message, pas aux contrôles. */}
        {pave && <PaveSecret onValider={secret} />}

        {enSession && !attente && !pave && !fini && (
          <form onSubmit={(e) => { e.preventDefault(); void repondre(reponseLibre); }}
            className="flex items-center gap-2">
            <input value={reponseLibre} onChange={(e) => setReponseLibre(e.target.value)}
              inputMode="tel" placeholder={t.votreReponse}
              className="flex-1 rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition placeholder:text-ink-faint focus:border-ink" />
            <button type="submit" disabled={!reponseLibre.trim()}
              className="rounded-btn bg-ink px-4 py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
              {t.envoyer}
            </button>
          </form>
        )}

        {fini ? (
          <>
            <p className="text-caption leading-relaxed text-ink-faint">
              {t.confirmationSms}
            </p>
            <button onClick={onFermer}
              className="rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
              {t.termine}
            </button>
          </>
        ) : (
          /* Le geste de sortie, impossible à manquer — un mot rouge, et la
             même porte que la croix : la confirmation avant de raccrocher.
             Jamais désactivé : une attente n'est pas un verrou. */
          <button onClick={sortir}
            className="rounded-btn border border-line py-2.5 text-small font-medium text-negative transition hover:border-negative">
            {enSession ? t.annulerSession : t.fermer}
          </button>
        )}
      </div>
    );

  return (
    <Feuille
      entete={entete}
      libelleFermer={etape === "saisie" ? t.annuler : t.fermer}
      onFermer={etape === "saisie" ? onFermer : fermerSession}
      retenue={retenue}
      pied={pied}
    >
      {etape === "saisie" ? (
        <div className="flex flex-col gap-4">
          {operation.champs.map((c) => (
            <label key={c.cle} className="flex flex-col gap-1.5">
              <span className="text-small text-ink-soft">{c.label}</span>
              <input value={valeurs[c.cle] ?? ""} onChange={(e) => set(c.cle, e.target.value)}
                inputMode="numeric" placeholder={c.aide}
                className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition placeholder:text-ink-faint focus:border-ink" />
            </label>
          ))}
          <p className="text-caption leading-relaxed text-ink-faint">
            {t.noteSaisie}
          </p>
        </div>
      ) : (
        // UNE seule carte, qui se réécrit à chaque réponse du réseau — comme
        // sur Telegram. Le message de l'opérateur dit ce qu'on s'apprête à
        // confirmer : il garde toute la place du corps de la feuille.
        <>
          {dernier && (
            <p className="whitespace-pre-line rounded-card bg-surface-2 px-4 py-3.5 text-body leading-relaxed">
              {dernier}
            </p>
          )}
          {attente && <p className="mt-2 px-1 text-caption text-ink-faint">{t.terminalCompose}</p>}
          {erreur && (
            <p className="mt-2 rounded-card bg-surface-2 px-4 py-3 text-small leading-relaxed text-negative">
              {erreur}
            </p>
          )}
        </>
      )}
    </Feuille>
  );
}
