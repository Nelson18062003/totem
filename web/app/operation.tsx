"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { textesGuichet } from "@/lib/textes/guichet";
import { IconClose, IconError } from "./icons";
import { useLangue } from "./langue";
import { PaveSecret } from "./pave-secret";
import { Bouton } from "./ui/bouton";
import { Carte } from "./ui/carte";
import { Champ } from "./ui/champ";
import { Bandeau, Chargement } from "./ui/etat";
import { Fenetre } from "./ui/fenetre";

/**
 * Le pop-up d'une opération, du premier champ au code secret.
 *
 * Vous remplissez le formulaire (numéro, montant…), la vraie session USSD
 * s'ouvre sur la carte à Douala, et la plateforme répond elle-même aux
 * questions du menu avec vos informations — chaque échange reste affiché.
 * Quand l'opérateur demande le code secret, le pavé s'ouvre. Si une question
 * n'est pas reconnue, elle vous est simplement posée : on ne devine pas.
 */

/* ════════════════════════════════════════════════════════════════════════════
 * LES PIÈCES COMMUNES DE LA SESSION
 *
 * Cet écran et la console USSD (`app/ussd/console.tsx`) sont DEUX ÉCRITURES
 * MANUSCRITES DU MÊME OBJET : le même fil, la même bulle, le même bloc
 * d'erreur, le même encadré de pavé, le même « annuler la session », le même
 * « le terminal compose ». Six duplications, aux mêmes classes, corrigées deux
 * fois ou une seule selon les jours.
 *
 * Elles vivent ici, et la console les importe. Elles ne montent PAS dans
 * `app/ui/` : ce ne sont pas des objets du système, ce sont des objets de la
 * session USSD — une bulle de fil n'a de sens que pour qui parle à un réseau.
 * Ce qu'elles empruntent au système, en revanche, elles l'empruntent sans le
 * réécrire : `Bouton`, `Champ`, `Bandeau`, `Chargement`, `Carte`.
 * ════════════════════════════════════════════════════════════════════════════ */

export type Msg = { de: "reseau" | "vous"; texte: string };

/**
 * UNE BULLE DU FIL. Le réseau à gauche, vous à droite.
 *
 * Le texte de l'opérateur s'affiche MOT POUR MOT : `whitespace-pre-line` garde
 * ses retours à la ligne, et rien ne le traduit. La largeur est bornée par
 * `max-w-lecture` — la longueur de ligne du système, 68 caractères — et non
 * plus par un pourcentage choisi à l'œil.
 */
export function Bulle({ de, children }: { de: Msg["de"]; children: ReactNode }) {
  return (
    <p
      className={`max-w-lecture whitespace-pre-line rounded-card px-4 py-3 text-small ${
        de === "reseau"
          ? "self-start bg-surface-2 text-ink"
          : "self-end bg-ink text-sur-couleur tabnums"
      }`}
    >
      {children}
    </p>
  );
}

/** « Le terminal compose… » — une attente qui se dit, et qui s'annonce. */
export function TerminalCompose({ texte }: { texte: string }) {
  return (
    <div className="self-start">
      <Chargement texte={texte} visible />
    </div>
  );
}

/**
 * LE BLOC D'ERREUR. Le message vient du réseau ou de la plateforme, dans la
 * langue de l'écran : il s'affiche tel quel. L'icône est obligatoire — le ton
 * seul ne dit rien à qui ne distingue pas les couleurs.
 */
export function BlocErreur({ children }: { children: ReactNode }) {
  return (
    <Bandeau ton="negative" icone={<IconError size={20} />}>
      {children}
    </Bandeau>
  );
}

/**
 * LE FIL — les échanges, l'attente, l'erreur. Le repère de bas de fil reste
 * chez l'appelant : c'est lui qui sait où sa zone de défilement s'arrête.
 */
export function FilSession({
  fil,
  attente,
  erreur,
  texteAttente,
  bas,
}: {
  fil: Msg[];
  attente: boolean;
  erreur: string | null;
  texteAttente: string;
  bas: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {fil.map((m, i) => (
        <Bulle key={i} de={m.de}>
          {m.texte}
        </Bulle>
      ))}
      {attente && <TerminalCompose texte={texteAttente} />}
      {erreur && <BlocErreur>{erreur}</BlocErreur>}
      <div ref={bas} />
    </div>
  );
}

/** L'ENCADRÉ DU PAVÉ. Une carte, et rien d'autre : le pavé fait le reste. */
export function EncadrePave({ onValider }: { onValider: (code: string) => void }) {
  return (
    <Carte>
      <PaveSecret onValider={onValider} />
    </Carte>
  );
}

/**
 * LA RÉPONSE LIBRE — quand la question du réseau n'est pas reconnue, on la
 * pose telle quelle et vous répondez.
 *
 * Le champ a un LIBELLÉ : il était anonyme des deux côtés, avec pour seule
 * annonce un texte d'invite qui disparaît dès la première frappe. Le libellé
 * est celui qui s'y trouvait déjà, simplement rendu au lecteur d'écran. Et le
 * bouton du bout de rangée est un `secondaire` : 44, comme le champ.
 */
export function ReponseLibre({
  libelle,
  libelleEnvoi,
  valeur,
  surChangement,
  surEnvoi,
  autoFocus,
}: {
  libelle: string;
  libelleEnvoi: string;
  valeur: string;
  surChangement: (valeur: string) => void;
  surEnvoi: () => void;
  autoFocus?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        surEnvoi();
      }}
      className="flex items-end gap-2"
    >
      <Champ
        libelle={libelle}
        libelleMasque
        value={valeur}
        onChange={(e) => surChangement(e.target.value)}
        inputMode="tel"
        placeholder={libelle}
        autoFocus={autoFocus}
        className="flex-1"
      />
      <Bouton variante="secondaire" type="submit" desactive={!valeur.trim()}>
        {libelleEnvoi}
      </Bouton>
    </form>
  );
}

/**
 * LE GESTE DE SORTIE — DISCRET, ET EN HAUT.
 *
 * Il occupait la meilleure place de l'écran : rouge, pleine largeur, tout en
 * bas de la fenêtre — arc 200 du pouce, c'est-à-dire FACILE. Mesuré sur
 * 390 × 844 pendant une session engagée : le bas de « Raccrocher » était à
 * 17 px du bord de l'écran, quand « Valider » — la touche qui ENVOIE le code
 * secret — commençait à 208 px. **La meilleure place allait à l'abandon.**
 * Elle revient à « Valider ».
 *
 * Ce bouton-ci change donc d'habit et de place : `discret` (boîte 40, cible
 * 44), la largeur de son libellé et rien de plus, plus d'aplat rouge. Il ne se
 * cache pas pour autant — ON NE CACHE PAS UNE SORTIE DE SECOURS : il garde son
 * MOT (« Raccrocher »), son icône de fermeture, et il reste visible du premier
 * échange au dernier (épinglé en tête du fil dans la fenêtre d'opération, dans
 * l'en-tête fixe du panneau dans la console). On cesse simplement de le mettre
 * sous le doigt.
 */
export function BoutonAnnulerSession({
  libelle,
  surAppui,
  eteint,
}: {
  libelle: string;
  surAppui: () => void;
  eteint?: boolean;
}) {
  return (
    <Bouton
      variante="discret"
      icone={<IconClose size={20} />}
      onClick={surAppui}
      desactive={eteint}
    >
      {libelle}
    </Bouton>
  );
}

/**
 * LA TÊTE DE LA SESSION — ce qui reste en haut pendant que le fil défile.
 *
 * Le corps de la fenêtre est la seule zone qui défile : un bouton posé en
 * tête du fil serait parti vers le haut au troisième échange, exactement comme
 * le bouton de fermeture avant `Fenetre`. Il est donc COLLÉ EN HAUT de cette
 * zone, sur la surface de la fenêtre pour que les bulles passent dessous et
 * non au travers, et il déborde du rembourrage du corps (`-mx-4 -mt-4`) pour
 * couvrir toute la largeur au lieu de laisser deux couloirs de 16 px.
 */
export function TeteDeSession({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-center bg-surface-raised px-4 pb-2 pt-4">
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * L'ÉCRAN
 * ════════════════════════════════════════════════════════════════════════════ */

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

  // Le PIED de la fenêtre : les actions qui TERMINENT, et elles seules. Fixes —
  // elles ne partent jamais avec le défilement du fil, si long qu'il devienne.
  //
  // PENDANT LA SESSION, IL N'Y A PAS DE PIED. C'est la place du pouce, et elle
  // revient à ce qui fait avancer l'échange : le pavé du code secret, épinglé
  // en bas du corps, ou la réponse libre. Le geste de sortie est remonté en
  // tête (voir `TeteDeSession`).
  //
  // À l'étape de saisie, les deux boutons passent par une rangée à eux : le
  // pied de `Fenetre` sépare ses enfants de 8 px, et deux CIBLES voisines en
  // demandent 12 — à 8, leurs zones d'appui se recouvrent de 4 px et la norme
  // retire l'aire commune du calcul. Le pied n'a rien à savoir de cette règle :
  // il ne reçoit qu'un enfant, qui porte lui-même la gouttière du système.
  // Les deux boutons dessinent la même hauteur (44) : un 40 et un 44 côte à
  // côte lisaient deux importances là où il n'y en a qu'une.
  const pied =
    etape === "saisie" ? (
      <div className="flex w-full items-center justify-end gap-3">
        <Bouton variante="secondaire" taille="forte" onClick={onFermer}>
          {t.annuler}
        </Bouton>
        <Bouton variante="primaire" desactive={!complet} onClick={lancer}>
          {t.lancer}
        </Bouton>
      </div>
    ) : fini ? (
      <Bouton variante="primaire" pleineLargeur onClick={onFermer}>
        {t.termine}
      </Bouton>
    ) : undefined;

  return (
    // `Fenetre` remplace la feuille écrite à la main : l'en-tête ne défile plus
    // avec le fil (le bouton de fermeture partait vers le haut au troisième
    // échange, et il faisait 18×18), la hauteur vient d'un calcul nommé au lieu
    // des 92dvh / 70dvh qui « rendaient bien » sur un téléphone donné, Échap
    // ferme, et la tabulation ne s'échappe plus derrière le voile.
    //
    // ── LE VOILE, ET POURQUOI IL RESTE UNE FERMETURE ──────────────────────
    // Reproche reçu : « le voile ferme la session et couvre 45 % de l'écran —
    // une surface d'annulation énorme pour un geste coûteux ». Mesuré sur
    // 390 × 844, les deux cas sont opposés :
    //
    //   — À L'ÉTAPE DE SAISIE, la feuille fait 428 px et le voile 49 %. Mais
    //     rien n'est engagé : `annuler` ne trouve pas de session ouverte
    //     (`enSession` est faux), il n'envoie AUCUN `ussd_fin`, il referme un
    //     formulaire. Un appui à côté coûte deux champs à retaper.
    //   — DÈS QUE LA SESSION EST ENGAGÉE, la feuille grandit avec le fil et
    //     atteint la hauteur maximale : 800 px sur 844. Le voile ne fait plus
    //     que 5 % — les 44 px de la zone de fermeture, celle-là même que
    //     `Fenetre` réserve exprès pour qu'on puisse sortir sans viser.
    //
    // Autrement dit, la grande surface d'annulation n'existe QUE quand elle ne
    // coûte rien, et elle disparaît d'elle-même quand le geste devient cher.
    // On n'y touche donc pas : ajouter une confirmation ferait payer un
    // dialogue de plus à chaque sortie normale pour un risque qui, mesuré,
    // vaut 5 % de l'écran. Ce qui coûtait vraiment cher — le bouton rouge
    // pleine largeur sous le pouce — est parti en haut.
    <Fenetre
      titre={operation.titre}
      description={`${
        etape === "saisie" ? t.preparation : enSession ? t.sessionEnCours : t.session
      } · ${operation.code}`}
      // Le bouton de fermeture de la fenêtre RACCROCHE quand la session est
      // engagée : il annonce donc « Raccrocher », et non « Fermer ». C'est le
      // même geste que le bouton de tête, dit par le même mot.
      etiquetteFermer={enSession && !fini ? t.annulerSession : t.fermer}
      onFermer={annuler}
      pied={pied}
    >
      {etape === "saisie" ? (
        <div className="flex flex-col gap-4">
          {operation.champs.map((c) => (
            <Champ
              key={c.cle}
              libelle={c.label}
              value={valeurs[c.cle] ?? ""}
              onChange={(e) => set(c.cle, e.target.value)}
              inputMode="numeric"
              placeholder={c.aide}
            />
          ))}
          <p className="max-w-lecture text-small text-ink-soft">
            {t.noteSaisie}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* LA SORTIE, EN HAUT ET DISCRÈTE — épinglée, donc jamais perdue. */}
          {!fini && (
            <TeteDeSession>
              <BoutonAnnulerSession
                libelle={t.annulerSession}
                surAppui={annuler}
                eteint={attente}
              />
            </TeteDeSession>
          )}

          {/* Le fil de la session — chaque bulle grise vient de l'opérateur */}
          <FilSession
            fil={fil}
            attente={attente}
            erreur={erreur}
            texteAttente={t.terminalCompose}
            bas={bas}
          />

          {pave && <EncadrePave onValider={secret} />}

          {enSession && !attente && !pave && !fini && (
            <ReponseLibre
              libelle={t.votreReponse}
              libelleEnvoi={t.envoyer}
              valeur={reponseLibre}
              surChangement={setReponseLibre}
              surEnvoi={() => void repondre(reponseLibre)}
            />
          )}

          {fini && (
            <p className="max-w-lecture text-small text-ink-soft">
              {t.confirmationSms}
            </p>
          )}
        </div>
      )}
    </Fenetre>
  );
}
