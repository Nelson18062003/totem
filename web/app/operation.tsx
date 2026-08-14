"use client";

import { useEffect, useRef, useState } from "react";
import { textesGuichet } from "@/lib/textes/guichet";
import { IconClose } from "./icons";
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
 */

export type ChampOperation = {
  cle: string;
  label: string;
  aide: string;
  type: "numero" | "montant";
};

export type Operation = {
  titre: string;
  code: string;                 // le code USSD du catalogue, composé tel quel
  champs: ChampOperation[];     // vide : la session s'ouvre directement
};

type Msg = { de: "reseau" | "vous"; texte: string };

// La question du réseau ↔ le champ qui peut y répondre tout seul. Les
// opérateurs camerounais écrivent dans les deux langues : chaque motif porte
// donc les mots français ET anglais — c'est du texte opérateur qu'on lit,
// jamais celui de l'écran.
const RECONNAISSANCE: { motif: RegExp; type: ChampOperation["type"] }[] = [
  { motif: /num[ée]ro|beneficiaire|b[ée]n[ée]ficiaire|abonn[ée]|agent|destinataire|t[ée]l[ée]phone|number|recipient|beneficiary|receiver|subscriber|phone/i, type: "numero" },
  { motif: /montant|somme|combien|amount|how\s+much/i, type: "montant" },
];

const RE_OPTION = /^\s*\d{1,2}\s*[.):\-]\s*\S/m;

function demandeUnCode(texte: string): boolean {
  return !RE_OPTION.test(texte || "") &&
    /\bpin\b|\bmdp\b|\bcodes?\b|secret|confidentiel|confidential|mot\s+de\s+passe|password|passcode/i.test(texte || "");
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
  const [etape, setEtape] = useState<"saisie" | "session">(
    operation.champs.length ? "saisie" : "session",
  );
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [fil, setFil] = useState<Msg[]>([]);
  const [attente, setAttente] = useState(false);
  const [enSession, setEnSession] = useState(false);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reponseLibre, setReponseLibre] = useState("");
  // Les champs pas encore consommés par les questions du réseau.
  const restants = useRef<ChampOperation[]>([...operation.champs]);
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [fil, attente]);

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));
  const complet = operation.champs.every((c) => (valeurs[c.cle] ?? "").trim());

  const chiffres = (v: string) => v.replace(/\D/g, "");

  const envoyer = async (
    genre: "ussd" | "ussd_reponse" | "ussd_fin",
    parametres: Record<string, unknown>,
    bulle?: Msg,
  ): Promise<string | null> => {
    setAttente(true);
    setErreur(null);
    if (bulle) setFil((f) => [...f, bulle]);
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: genre, parametres }),
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
          if (genre === "ussd_fin") return null;
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
      const champ = restants.current.find((c) =>
        RECONNAISSANCE.some((r) => r.type === c.type && r.motif.test(texte!)));
      if (!champ) return;                            // question inattendue : à vous
      restants.current = restants.current.filter((c) => c !== champ);
      const valeur = chiffres(valeurs[champ.cle] ?? "");
      texte = await envoyer("ussd_reponse", { texte: valeur }, { de: "vous", texte: valeur });
    }
  };

  const lancer = async () => {
    setEtape("session");
    restants.current = [...operation.champs];
    const premiere = await envoyer("ussd", { code: operation.code }, { de: "vous", texte: operation.code });
    await derouler(premiere);
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

  const annuler = () => {
    if (enSession) void envoyer("ussd_fin", {});
    onFermer();
  };

  const dernier = [...fil].reverse().find((m) => m.de === "reseau")?.texte ?? "";
  const pave = enSession && !attente && !fini && demandeUnCode(dernier);

  return (
    // Sur téléphone, l'opération occupe TOUT l'écran : l'en-tête et les
    // gestes restent en place, seul le fil des échanges défile. Fini le
    // pop-up qu'il fallait faire défiler pour retrouver ses boutons.
    <div className="voile fixed inset-0 z-30 flex items-stretch justify-center bg-ink/25 md:items-center md:p-4" onClick={annuler}>
      <div className="surgit flex w-full max-w-md flex-col bg-surface-raised md:max-h-[85dvh] md:rounded-card md:border md:border-line md:shadow-fenetre"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between p-6 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-6">
          <div>
            <p className="text-caption uppercase tracking-wider text-ink-faint">
              {etape === "saisie" ? t.preparation : enSession ? t.sessionEnCours : t.session}
              {" · "}<span className="tabnums">{operation.code}</span>
            </p>
            <h2 className="mt-1 text-heading font-semibold">{operation.titre}</h2>
          </div>
          <button onClick={annuler} aria-label={t.fermer} className="text-ink-faint transition hover:text-ink">
            <IconClose size={18} />
          </button>
        </div>

        {etape === "saisie" ? (
          <>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6">
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
            {/* Les deux gestes, ancrés en bas — jamais à aller chercher */}
            <div className="flex shrink-0 gap-2 p-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-6">
              <button onClick={onFermer} className="flex-1 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint">
                {t.annuler}
              </button>
              <button disabled={!complet} onClick={lancer}
                className="flex-1 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
                {t.lancer}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Le fil de la session — chaque bulle grise vient de
                l'opérateur. La seule zone qui défile. */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-6">
              {fil.map((m, i) => (
                <p key={i}
                  className={`max-w-[85%] whitespace-pre-line rounded-card px-3.5 py-2.5 text-small leading-relaxed ${
                    m.de === "reseau" ? "self-start bg-surface-2 text-ink" : "self-end bg-ink text-white tabnums"
                  }`}>
                  {m.texte}
                </p>
              ))}
              {attente && <p className="self-start px-1 text-caption text-ink-faint">{t.terminalCompose}</p>}
              {erreur && (
                <p className="self-start rounded-card bg-surface-2 px-3.5 py-2.5 text-small leading-relaxed text-negative">
                  {erreur}
                </p>
              )}
              <div ref={bas} />
            </div>

            {/* Le pavé, la réponse et la sortie — toujours visibles en bas */}
            <div className="flex shrink-0 flex-col gap-3 p-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-6">
              {pave && (
                <div className="rounded-card border border-line p-4">
                  <PaveSecret onValider={secret} />
                </div>
              )}

              {enSession && !attente && !pave && !fini && (
                <form onSubmit={(e) => { e.preventDefault(); void repondre(reponseLibre); }}
                  className="flex items-center gap-2">
                  <input value={reponseLibre} onChange={(e) => setReponseLibre(e.target.value)}
                    inputMode="tel" placeholder={t.votreReponse}
                    className="flex-1 rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-small outline-none transition placeholder:text-ink-faint focus:border-ink" />
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
                /* Le geste de sortie, impossible à manquer. */
                <button onClick={annuler} disabled={attente}
                  className="rounded-btn border border-line py-2.5 text-small font-medium text-negative transition hover:border-negative disabled:opacity-40">
                  {t.annulerSession}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
