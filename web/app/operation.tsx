"use client";

import { useEffect, useRef, useState } from "react";
import { remplirVariables } from "@noyau/codes";
import { lireEcran, type EtatDuReseau } from "@noyau/ussd";
import {
  ATTENTE_DU_BOITIER_MS, PROLONGATION_MS, champAServir, etapePeutPartir, reponseDuBoitier,
  reponseLibre, reponsePrete, restantsApresReponse, type EcranRecu,
} from "@noyau/deroule";
import { formaterNumero } from "@noyau/numero";
import { nombre } from "@noyau/types";
import type { ClientRecent } from "@noyau/recents";
import { nomDuBeneficiaire, nomPropre, numeroPropre } from "@noyau/beneficiaires";
import { montantSaisi, numeroSaisi } from "@noyau/saisie";
import { textesGuichet } from "@noyau/textes/guichet";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import { BarreArret, BoutonFermer, type SortieRetenue } from "./feuille";
import { IconBubble, IconCheck, IconChevron, IconClose, IconLock, IconPersonnes } from "./icons";
import { useLangue } from "./langue";
import { abandonner, phraseDAbandon } from "./abandon";

/**
 * Une opération, du premier chiffre au code secret — le même parcours que
 * sur le téléphone (`mobile/src/operation.tsx`).
 *
 * Avant d'appeler : « À qui ? » → « Combien ? » → « Vérifiez », une question
 * par écran. Sur un ordinateur, une fenêtre centrée ; sur un téléphone, tout
 * l'écran. Échap sort.
 *
 * DES VRAIS CHAMPS. Le numéro et le montant se tapaient sur un pavé dessiné,
 * chiffre par chiffre : impossible d'y COLLER un numéro recopié d'un SMS,
 * de faire clic droit, de corriger au milieu. « C'est trop figé », a dit le
 * propriétaire. Ce sont maintenant des champs ordinaires, qui acceptent tout
 * ce qu'on tape ou colle ; l'écran montre ce qui partira (`@noyau/saisie`),
 * et ne devine jamais entre deux numéros.
 *
 * UN ÉCRAN À LA FOIS, COMME SUR LE TÉLÉPHONE. Pendant l'appel, on voit
 * l'écran EN COURS de l'opérateur, en entier — son texte, ses choix en
 * boutons, ou le champ qu'il attend — et rien d'autre : on répond, ça
 * charge, l'écran suivant REMPLACE le précédent. Une première version
 * empilait tout l'échange, message après message ; le propriétaire l'a
 * refusée : « je veux uniquement l'écran sur lequel je suis ». L'échange
 * entier reste à un geste, à la fin (« Détails »).
 *
 * Le pavé du code secret se pose SOUS le message qui le réclame — « Dépôt de
 * 5 000 F à JEAN DUPONT, frais 0 F » : on sait ce qu'on signe. Avant, il
 * n'affichait que « Votre code secret », seul. Le message se sélectionne et
 * se copie.
 *
 * Les transitions sont courtes et ne touchent que l'opacité et la position
 * (`.ecran`, `animate-ping`) : la carte graphique s'en charge, rien ne se
 * recalcule, et « réduire les animations » les coupe.
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

// `reseau` : ce que le RÉSEAU a dit de la session avec ce message, rapporté
// par le boîtier. Absent d'un boîtier d'avant : on lit le texte.
// `de: "totem"` : une phrase du BOÎTIER (un refus), jamais rangée comme un
// écran de l'opérateur — elle n'est pas de lui.
type Msg = { de: "reseau" | "vous" | "totem"; texte: string; reseau?: EtatDuReseau };
// « incertaine » : l'écran ne sait pas ce qu'est devenue la demande (le code
// est peut-être parti). Ni coche, ni croix.
type Issue = "reussie" | "refusee" | "interrompue" | "incertaine" | "reponse";

const PAUSE_MS = 1200;
/** L'écran renonce sur une issue qu'il ne connaît pas : « regardez vos SMS ». */
class Incertain extends Error {}

const MONTANTS = [1000, 5000, 10000, 25000];
const LONGUEUR_CODE_MIN = 4;
const LONGUEUR_CODE_MAX = 6;

type TypeSaisie = "numero" | "montant" | "texte";

/** Ce qui partira réellement au réseau, lu dans ce qu'on a tapé ou collé. */
function valeurPropre(type: TypeSaisie, brut: string): string {
  if (type === "numero") return numeroSaisi(brut);
  if (type === "montant") { const m = montantSaisi(brut); return m ? String(m) : ""; }
  return brut.trim();
}
/** Un numéro se tient à partir de huit chiffres ; un montant, dès le premier
 *  franc ; une réponse libre, dès le premier caractère. Le réseau reste juge. */
const pret = (type: TypeSaisie, brut: string) => {
  const v = valeurPropre(type, brut);
  return type === "numero" ? v.length >= 8 : v.length > 0;
};

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
  // L'erreur dit-elle une issue INCONNUE (le code est peut-être parti) ?
  const [incertaine, setIncertaine] = useState(false);
  // Une phrase de TOTEM au-dessus de l'écran de l'opérateur (un bouton
  // appris qui s'est arrêté) — jamais dans sa carte.
  const [avis, setAvis] = useState<string | null>(null);
  const [pas, setPas] = useState(0);
  const [details, setDetails] = useState(false);
  const [libre, setLibre] = useState(false);
  const [confirme, setConfirme] = useState(false);
  // Les champs pas encore consommés par les questions du réseau.
  const restants = useRef<ChampOperation[]>([...operation.champs]);

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));
  const avecCarte = (p: Record<string, unknown>) =>
    operation.carte ? { ...p, carte: operation.carte } : p;

  // Ce qui partirait pour chaque champ : ce que l'écran a annoncé.
  const propres = () => Object.fromEntries(operation.champs.map(
    (c) => [c.cle, valeurPropre(c.type, valeurs[c.cle] ?? "")]));

  // LA DEMANDE EN VOL : déposée, pas encore rendue par le boîtier.
  // « Raccrocher » l'annule d'abord — sans quoi le boîtier, qui sert la file
  // de la carte dans l'ordre, composait le code secret PUIS raccrochait.
  const enVol = useRef<{ id: number; secret: boolean } | null>(null);
  // L'écran a raccroché pendant un vol : ce qui revient ne s'écrit plus.
  const arrete = useRef(false);
  // L'écran est-il encore là ? Une relecture en cours s'arrête au départ.
  const vivant = useRef(true);
  // Le dernier écran de l'opérateur, lu par `repondre` au moment de l'appui.
  const ecranCourant = useRef<EcranRecu>({ texte: "" });

  /** La réponse du boîtier : un ÉCRAN de l'opérateur, rangé à son nom tel
   *  qu'il l'a écrit (vide compris) ; ou un REFUS du boîtier, phrase de
   *  TOTEM qui ne passe pas pour un message de MTN. */
  const conclure = (
    c: { etat?: string; resultat?: string | null; reseau?: unknown }, secretEnVol: boolean,
  ): EcranRecu | null => {
    setAttente(false);
    setAvis(null);
    // Un nouvel écran de l'opérateur : on repart de SES choix.
    setLibre(false);
    const lu = reponseDuBoitier(c);
    if (!lu || lu.genre === "refus") {
      const texte = lu?.texte || t.echec;
      setFil((f) => [...f, { de: "totem", texte }]);
      setErreur(texte);
      setIncertaine(secretEnVol);
      // Le boîtier a pu laisser la carte sur un menu : on raccrochera.
      setEnSession(true);
      return null;
    }
    const recu: EcranRecu = { texte: lu.texte, reseau: lu.reseau };
    ecranCourant.current = recu;
    setFil((f) => [...f, { de: "reseau", texte: lu.texte, reseau: lu.reseau }]);
    setEnSession(true);
    return recu;
  };

  const envoyer = async (
    genre: "ussd" | "ussd_reponse",
    parametres: Record<string, unknown>,
    bulle?: Msg,
    // Jointe au seul envoi qui peut porter un transfert complet : l'ouverture.
    cle?: string,
  ): Promise<EcranRecu | null> => {
    if (arrete.current) return null;
    setAttente(true);
    setErreur(null);
    setIncertaine(false);
    if (bulle) setFil((f) => [...f, bulle]);
    const secretEnVol = parametres.secret === true;
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // La carte voyage avec CHAQUE geste de la session : la plateforme y
        // lit que la réponse vient du titulaire de cette carte, et le robot
        // dans quelle session la poser.
        body: JSON.stringify({ type: genre, parametres: avecCarte(parametres), cle }),
      }).catch(() => null);
      if (!r) {
        // La réponse s'est perdue : le code secret a peut-être été déposé.
        if (secretEnVol) throw new Incertain(t.telephoneSansTotem);
        throw new Error(t.demandePasPartie);
      }
      if (!r.ok) {
        const corps = await r.json().catch(() => null);
        throw new Error(corps?.erreur || t.demandePasPartie);
      }
      const { id } = (await r.json()) as { id: number };
      // L'écran a été quitté (ou raccroché) pendant le dépôt : personne ne
      // suivra cette demande — elle s'annule, puis la ligne se raccroche.
      if (!vivant.current || arrete.current) {
        void abandonner(id).finally(posterFin);
        return null;
      }
      enVol.current = { id, secret: secretEnVol };
      // UNE RELECTURE A SON ÉCHÉANCE. Le site comptait des TOURS (25 × 1,2 s)
      // et chaque relecture était un fetch sans borne : sur une connexion
      // lente, l'attente durait des minutes, et continuait après la
      // fermeture de la fenêtre. Comme au téléphone : l'horloge, un
      // abandon par relecture, l'arrêt au départ.
      type Lu = { etat?: string; resultat?: string | null; reseau?: unknown };
      const relire = async (reste: number): Promise<Lu | null> => {
        const ctrl = new AbortController();
        const minuteur = setTimeout(() => ctrl.abort(), Math.max(1500, reste));
        try {
          const x = await fetch(`/api/commande/${id}`, { cache: "no-store", signal: ctrl.signal });
          return x.ok ? ((await x.json()) as Lu) : null;
        } catch {
          return null;
        } finally {
          clearTimeout(minuteur);
        }
      };
      const finie = (c: Lu | null): c is Lu =>
        Boolean(c && (c.etat === "faite" || c.etat === "echouee"));
      /** Relit jusqu'à l'échéance : la demande finie, null, ou « parti ». */
      const guetter = async (echeance: number): Promise<Lu | null | "parti"> => {
        while (Date.now() < echeance) {
          await new Promise((res) => setTimeout(res, PAUSE_MS));
          if (!vivant.current || arrete.current) return "parti";
          const c = await relire(echeance - Date.now());
          if (!vivant.current || arrete.current) return "parti";
          if (finie(c)) return c;
        }
        return null;
      };
      const premiere = await guetter(Date.now() + ATTENTE_DU_BOITIER_MS);
      if (premiere === "parti") return null;
      if (premiere) { enVol.current = null; return conclure(premiere, secretEnVol); }
      // On renonce : la demande s'ANNULE, et l'écran ne dit « rien n'est
      // parti » que si l'annulation a pris (voir abandon.ts). Finie
      // entre-temps, elle a une réponse : on la relit et on la MONTRE. Prise
      // en main par le boîtier, elle attend peut-être encore le réseau : on
      // continue de relire, au lieu d'annoncer un échec.
      const issue = await abandonner(id);
      if (!vivant.current || arrete.current) return null;
      if (issue === "finie" || issue === "en_cours") {
        const suite = await guetter(Date.now() + (issue === "finie" ? PAUSE_MS + 1500 : PROLONGATION_MS));
        if (suite === "parti") return null;
        if (suite) { enVol.current = null; return conclure(suite, secretEnVol); }
      }
      enVol.current = null;
      if (issue === "rien_parti") throw new Error(phraseDAbandon(issue, t));
      throw new Incertain(phraseDAbandon(issue, t));
    } catch (e) {
      if (!vivant.current || arrete.current) return null;
      setErreur(e instanceof Error ? e.message : t.accroc);
      setIncertaine(e instanceof Incertain);
      setAttente(false);
      return null;
    }
  };

  // Après chaque réponse du réseau : répondre tout seul si on sait, sinon
  // laisser la main (pavé pour le code, une question pour le reste). « Si on
  // sait » se décide dans le noyau (`champAServir`) : jamais sur une
  // confirmation, ni sur un écran qui porte déjà la valeur.
  const derouler = async (recu: EcranRecu | null) => {
    while (recu) {
      const champ = champAServir(recu, restants.current, propres());
      if (!champ) return;                            // à vous
      restants.current = restants.current.filter((c) => c !== champ);
      const valeur = valeurPropre(champ.type, valeurs[champ.cle] ?? "");
      recu = await envoyer("ussd_reponse", { texte: valeur }, { de: "vous", texte: valeur });
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
    // et le code part ENTIER. Un trou sans réponse ne part jamais. Ce qui
    // remplit un trou, c'est ce que l'écran a annoncé (« Partira : … ») —
    // jamais le texte collé tel quel, dont « +237 » ferait un autre numéro.
    const { etapes, consommees, manquantes } = remplirVariables(brutes, propres());
    if (manquantes.length) {
      setErreur(t.trouSansReponse(manquantes.map((m) => `{${m}}`).join(", ")));
      setFini(true);
      return;
    }
    if (consommees.length) {
      restants.current = restants.current.filter((c) => !consommees.includes(c.cle));
    }
    let recu = await envoyer(
      "ussd",
      operation.carte ? { code: etapes[0], carte: operation.carte } : { code: etapes[0] },
      { de: "vous", texte: etapes[0] },
      cleOperation.current);
    // UN TRAJET APPRIS REGARDE L'ÉCRAN AVANT CHAQUE PAS (`etapePeutPartir`) :
    // si l'écran ne propose pas l'étape suivante, on s'arrête, le message
    // reste entier, et TOTEM dit pourquoi il n'a pas continué.
    for (let i = 1; i < etapes.length; i++) {
      if (recu == null) return;
      if (!etapePeutPartir(brutes[i], recu)) { setAvis(t.trajetArrete(etapes[i])); return; }
      recu = await envoyer("ussd_reponse", { texte: etapes[i] }, { de: "vous", texte: etapes[i] });
    }
    await derouler(recu);
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

  // Quitter l'écran autrement (navigation, « précédent ») raccroche — et
  // annule d'abord ce qui est encore en vol.
  useEffect(() => { raccrochageDu.current = enSession && !fini; }, [enSession, fini]);
  useEffect(() => () => {
    vivant.current = false;
    const vol = enVol.current;
    enVol.current = null;
    if (vol) void abandonner(vol.id).finally(posterFin);
    else if (raccrochageDu.current) posterFin();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // FERMER L'ONGLET NE DOIT PAS LAISSER LA SIM EN LIGNE : `sendBeacon` part
  // même quand la page disparaît.
  useEffect(() => {
    const enPartant = () => {
      if (!raccrochageDu.current && !enVol.current) return;
      raccrochageDu.current = false;
      const vol = enVol.current;
      enVol.current = null;
      if (vol) navigator.sendBeacon?.(`/api/commande/${vol.id}/annuler`);
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
      // Pas de fin forcée après le code : un opérateur qui demande encore
      // quelque chose (« 1. Confirm ») doit pouvoir recevoir sa réponse.
      // C'est ce qu'il écrit — et ce que dit le réseau — qui finit (`conclu`).
      await envoyer("ussd_reponse", { texte: code, secret: true },
                    { de: "vous", texte: "••••" });
    } finally {
      repondEnCours.current = false;
    }
  };
  const repondre = async (brut: string) => {
    const v = brut.trim();
    if (!v || repondEnCours.current) return;
    repondEnCours.current = true;
    try {
      // UNE RÉPONSE TAPÉE CONSOMME LA QUESTION : le montant tapé à la main ne
      // repart pas tout seul sur la confirmation qui le récapitule.
      restants.current = restantsApresReponse(ecranCourant.current, restants.current, propres(), v);
      await derouler(await envoyer("ussd_reponse", { texte: v }, { de: "vous", texte: v }));
    } finally {
      repondEnCours.current = false;
    }
  };

  // L'ordre de raccrochage, sans faire attendre l'écran.
  function posterFin() {
    raccrochageDu.current = false;
    fetch("/api/commande", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "ussd_fin", parametres: avecCarte({}) }),
    }).catch(() => {});
  }
  // RACCROCHER RETIENT D'ABORD CE QUI EST EN VOL. Si l'annulation n'a pas
  // pris, le code est peut-être parti : on le DIT au lieu de fermer.
  const raccrocher = async () => {
    const vol = enVol.current;
    if (!vol) { posterFin(); onFermer(); return; }
    arrete.current = true;
    enVol.current = null;
    const issue = await abandonner(vol.id);
    posterFin();
    if (issue === "rien_parti") { onFermer(); return; }
    if (!vivant.current) return;
    setAttente(false);
    setErreur(t.reponsePeutEtrePartie);
    setIncertaine(true);
    setFini(true);
  };
  const fermerSession = () => {
    if (attente && !fini && !enVol.current) posterFin();
    onFermer();
  };

  const dernierMsg = [...fil].reverse().find((m) => m.de === "reseau");
  const dernier = dernierMsg?.texte ?? "";
  // LE RÉSEAU DÉCIDE si la session continue ; le texte ne fait que le
  // laisser deviner. « Confirm: … 00. Next » s'affichait « Terminé ».
  const ecran = lireEcran(dernier, dernierMsg?.reseau);
  // « Répondre autre chose » (`libre`) range le pavé : le champ prend sa place.
  const pave = enSession && !attente && !fini && ecran.attend === "secret" && !libre;

  // L'OPÉRATEUR A CONCLU : un écran qui ne demande plus rien termine.
  // Un écran VIDE de l'opérateur est un écran : on le compte (`dernierMsg`).
  const conclu = enSession && !attente && Boolean(dernierMsg) && ecran.attend === "rien";
  useEffect(() => {
    if (conclu && !fini && !libre) { setFini(true); onTermine?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conclu, fini, libre]);

  const issue: Issue = erreur ? (incertaine ? "incertaine" : "interrompue")
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
          garder: t.garderSession, onArreter: () => void raccrocher() }
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
  const numeroChoisi = champNumero ? numeroSaisi(valeurs[champNumero.cle] ?? "") : "";
  const montantChoisi = champMontant ? montantSaisi(valeurs[champMontant.cle] ?? "") : 0;
  const nomDuDestinataire = nomDe(operation.recents, numeroChoisi);

  // « Enregistrer ce bénéficiaire ? » à la fin d'un transfert réussi.
  const numeroDuTransfert = numeroChoisi ? numeroPropre(numeroChoisi) : "";
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
      <EtapeSaisie
        titre={champ.type === "montant" ? t.combien : champ.label}
        type={champ.type} valeur={valeurs[champ.cle] ?? ""}
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
          {montantChoisi ? <Montant valeur={montantChoisi} langue={langue} grand />
            : <p className="text-title font-semibold">{operation.titre}</p>}
          {numeroChoisi ? (
            <div>
              <p className="text-heading">{t.vers} <strong className="font-semibold">
                {nomDuDestinataire || formaterNumero(numeroChoisi)}</strong></p>
              {nomDuDestinataire && <p className="tabnums text-ink-soft">{formaterNumero(numeroChoisi)}</p>}
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
          : issue === "interrompue" ? t.opInterrompue
            : issue === "incertaine" ? t.opIncertaine : t.opReponse}
        texte={erreur ?? (ecran.texte || dernier || t.ecranVide)}
        note={issue === "reussie" ? t.confirmationSms
          : issue === "incertaine" ? t.noteIncertaine : undefined}
        fil={fil} details={details} onDetails={() => setDetails((d) => !d)}
        // Le réseau a dit qu'il avait fermé : répondre ne mènerait nulle part.
        repondreQuandMeme={issue === "reponse" && conclu && !libre
          && dernierMsg?.reseau !== "fini"
          ? () => { setLibre(true); setFini(false); } : undefined}
        bouton={t.termine} onTerminer={enSession && !fini ? () => void raccrocher() : onFermer} t={t}
        proposition={proposer && operation.carte ? (
          <ProposerBeneficiaire carte={operation.carte} numero={numeroDuTransfert}
            nomInitial={nomLu ?? nomDuDestinataire ?? ""} tb={tb} onFait={onTermine} />
        ) : null} />
    );
  } else {
    // L'APPEL EN COURS : tout l'échange, en entier, puis ce qu'on attend de
    // vous — le pavé du code, un champ, ou rien pendant que le réseau parle.
    // Une seule vue pour toute la session : elle ne se remonte pas à chaque
    // message, l'échange défile sous les yeux au lieu de clignoter.
    cleVue = "session";
    // TOUT CE QUE LE RÉSEAU ATTEND SE RÉPOND ICI : menu, page, question,
    // ou — après « Répondre autre chose » — la demande du code.
    const repondable = !pave && !attente && Boolean(dernierMsg)
      && (libre || ecran.attend !== "rien");
    // Ce que TOTEM dit, À CÔTÉ de l'opérateur et jamais dans sa carte : un
    // bouton appris qui s'est arrêté, un écran que l'opérateur a laissé vide.
    const entete = (
      <div className="flex flex-col gap-3">
        {avis && <p aria-live="polite" className="px-1 text-small text-ink-soft">{avis}</p>}
        {dernier ? (
          <CarteOperateur texte={dernier} copie={dernier} op={op}
                          couleur={couleurOperateur(op)} t={t} />
        ) : (
          <p className="px-1 text-small text-ink-soft">{t.ecranVide}</p>
        )}
      </div>
    );
    const secretement = libre && ecran.attend === "secret";
    const typeQuestion: TypeSaisie = libre ? "texte"
      : ecran.attend === "numero" ? "numero" : ecran.attend === "montant" ? "montant" : "texte";
    // Ce qu'on vient d'envoyer — « 1 », un numéro, « •••• » — reste écrit
    // pendant que le réseau répond : on sait qu'on a été entendu.
    const envoye = [...fil].reverse().find((m) => m.de === "vous")?.texte ?? null;
    vue = (
      <div className="flex min-h-0 flex-1 flex-col">
        {attente || !dernierMsg ? (
          <Patience key={`patience-${fil.length}`} couleur={couleurOperateur(op)}
            texte={!dernierMsg ? t.connexionA(op) : t.onParleA(op)}
            envoye={dernierMsg ? envoye : null} t={t} />
        ) : repondable ? (
          // LE MESSAGE DE L'OPÉRATEUR, INTACT — rien n'en est retiré. Dessous,
          // ses choix en boutons, puis la zone de réponse, toujours là.
          <ZoneReponse key={`question-${fil.length}-${secretement ? "s" : ""}`} type={typeQuestion}
            entete={entete}
            choix={secretement ? [] : ecran.choix} onChoix={(n) => void repondre(n)}
            recents={typeQuestion === "numero" ? operation.recents : undefined}
            secretement={secretement}
            onRevenir={secretement ? () => setLibre(false) : undefined}
            onEnvoyer={(v) => void (secretement ? secret(v) : repondre(v))} langue={langue} />
        ) : (
          <EcranOperateur key={`ecran-${fil.length}`} op={op} couleur={couleurOperateur(op)} t={t}
            texte={dernier} copie={dernier} choix={[]} onChoix={(n) => void repondre(n)} />
        )}
        {pave && <EtapeCode key={`code-${fil.length}`} onValider={secret}
                            onAutre={() => setLibre(true)} t={t} />}
      </div>
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
              <button type="button" onClick={reculer} aria-label={t.retour} title={t.retour}
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

/** Le nom qu'on connaît à ce numéro — carnet ou SMS —, s'il y en a un. */
function nomDe(recents: Operation["recents"], numero: string): string | undefined {
  if (!numero) return undefined;
  const n = numeroPropre(numero);
  return recents?.find((r) => numeroPropre(r.numero) === n)?.nom || undefined;
}

/**
 * UN VRAI CHAMP. On y tape, on y colle (clic droit, Ctrl+V, appui long sur
 * un téléphone), on sélectionne, on corrige au milieu : tout ce qu'un champ
 * sait faire partout ailleurs. Il accepte n'importe quel texte — un numéro
 * recopié avec « +237 » et des espaces, un montant avec « FCFA » — et dit
 * dessous ce qui partira réellement. Quand il ne sait pas lire UN numéro
 * (deux numéros différents dans le même collage), il le dit, et rien ne part.
 */
function ChampSaisie({ type, valeur, onChange, langue, autoFocus = true, masque = false,
                      libre = false }: {
  type: TypeSaisie; valeur: string; onChange: (v: string) => void;
  langue: "fr" | "en"; autoFocus?: boolean;
  /** Ce qu'on tape ne s'affiche pas (une réponse pendant le code secret). */
  masque?: boolean;
  /** Une réponse à l'opérateur : le type ne choisit que le clavier, rien
   *  n'est refusé (`reponseLibre`). « 1 », « 00 », « # » partent tels quels. */
  libre?: boolean;
}) {
  const t = textesGuichet[langue];
  const propre = libre ? reponseLibre(type, valeur) : valeurPropre(type, valeur);
  const brut = valeur.trim();
  // Ce qu'on annonce sous le champ — seulement quand ce n'est pas déjà ce
  // qu'on lit dedans : « 677998877 » tapé tel quel n'a pas besoin d'écho.
  let annonce: { texte: string; doute?: boolean } | null = null;
  if (libre) {
    // Pas de « numéro introuvable » sous un « 1 » : seul l'écho d'un collage
    // nettoyé, pour qu'on sache ce qui part.
    if (brut && propre && !masque && propre !== brut) annonce = { texte: t.partira(propre) };
  } else if (brut && type === "numero") {
    if (propre.length >= 8) {
      const vu = formaterNumero(propre);
      if (vu !== brut && propre !== brut) annonce = { texte: t.partira(vu) };
    } else if (!propre || /\D/.test(brut.replace(/[\s+().\-]/g, ""))) {
      annonce = { texte: t.numeroIntrouvable, doute: true };
    }
  } else if (brut && type === "montant") {
    const vu = `${nombre(Number(propre) || 0, langue)} FCFA`;
    if (!propre) annonce = { texte: t.montantIntrouvable, doute: true };
    else if (propre !== brut && nombre(Number(propre), langue) !== brut) annonce = { texte: t.partira(vu) };
  }
  return (
    <div className="w-full">
      {/* Le champ actif se signale par son fond, pas par un cadre posé
          par-dessus le soulignement : deux traits pour un seul champ. */}
      <div className="flex items-baseline gap-2 rounded-t-xl border-b-2 border-ink px-2 pb-1 transition-colors focus-within:bg-surface-raised">
        <input
          value={valeur} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}
          type={masque ? "password" : "text"}
          // Le bon clavier sur un téléphone, et rien d'autre : le champ
          // accepte quand même tout ce qu'on y colle.
          // Pendant la session, le pavé « tel » porte « * » et « # » : « # »
          // (retour) doit pouvoir se taper même sur une question de montant.
          inputMode={type === "numero" || (libre && type === "montant") ? "tel"
            : type === "montant" ? "numeric" : "text"}
          autoComplete="off" spellCheck={false}
          placeholder={type === "numero" ? t.numeroPlaceholder
            : type === "montant" ? "0" : t.reponsePlaceholder}
          aria-label={type === "numero" ? t.numeroPlaceholder
            : type === "montant" ? t.combien : t.reponsePlaceholder}
          className={`min-w-0 flex-1 bg-transparent py-2 outline-none focus-visible:outline-none placeholder:text-ink-faint ${
            type === "texte" ? "text-title" : "tabnums text-[30px] font-semibold tracking-tight"} ${
            type === "montant" ? "text-right" : ""}`} />
        {type === "montant" && <span className="text-heading font-medium text-ink-faint">FCFA</span>}
      </div>
      <p aria-live="polite" className={`mt-2 min-h-5 px-2 text-small ${annonce?.doute ? "text-negative" : "text-ink-soft"}`}>
        {annonce?.texte ?? ""}
      </p>
    </div>
  );
}

/** UNE QUESTION DU FORMULAIRE, SUR UN ÉCRAN À ELLE : la question, le champ,
 *  les montants de tous les jours ou les visages déjà connus, « Continuer ». */
function EtapeSaisie({
  titre, type, valeur, onChange, recents, onRecent, bouton, onValider, langue,
}: {
  titre: string; type: "numero" | "montant";
  valeur: string; onChange: (v: string) => void;
  recents?: (ClientRecent & { enregistre?: boolean })[];
  onRecent: (numero: string) => void; bouton: string; onValider: () => void;
  langue: "fr" | "en";
}) {
  const t = textesGuichet[langue];
  const tb = textesBeneficiaires[langue];
  const valide = pret(type, valeur);
  const propre = valeurPropre(type, valeur);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valide) onValider(); }}
      className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pt-6">
        <p className="whitespace-pre-line text-title font-semibold leading-snug">{titre}</p>
        <ChampSaisie type={type} valeur={valeur} onChange={onChange} langue={langue} />
        {type === "montant" && (
          <div className="flex flex-wrap gap-2">
            {MONTANTS.map((m) => (
              <button key={m} type="button" onClick={() => onChange(String(m))}
                className={`tabnums rounded-full px-3.5 py-1.5 text-small font-medium transition ${Number(propre) === m ? "bg-ink text-white" : "bg-surface-2 hover:bg-surface-3"}`}>
                {nombre(m, langue)}
              </button>
            ))}
          </div>
        )}
        {recents?.length ? (
          <div className="w-full">
            <p className="mb-2 text-caption text-ink-faint">
              {recents.some((r) => r.enregistre) ? tb.vosBenef : t.clientsRecents}
            </p>
            {/* Défilant quand ils débordent — sans jamais couper le premier. */}
            <div className="overflow-x-auto pb-1">
              <div className="flex w-max gap-3">
                {recents.map((r) => (
                  <Visage key={r.numero} client={r}
                    choisi={numeroPropre(r.numero) === numeroPropre(propre)}
                    onClick={() => onRecent(r.numero)} />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="pt-3">
        <GrosBouton libelle={bouton} desactive={!valide} type="submit" />
      </div>
    </form>
  );
}

/**
 * RÉPONDRE À L'OPÉRATEUR, quand il pose une question que la plateforme ne
 * sert pas seule. Un vrai champ, là aussi : il accepte des LETTRES. Une
 * question qu'on ne savait pas classer ouvrait un pavé de chiffres — et un
 * opérateur qui demandait un motif, un nom, une référence ne pouvait pas
 * recevoir de réponse.
 */
function ZoneReponse({ type, entete, recents, onEnvoyer, langue, choix = [], onChoix,
                      secretement = false, onRevenir }: {
  type: TypeSaisie;
  entete: React.ReactNode;
  recents?: (ClientRecent & { enregistre?: boolean })[];
  onEnvoyer: (valeur: string) => void; langue: "fr" | "en";
  /** Les choix lus dans le message : des RACCOURCIS, jamais à la place du champ. */
  choix?: { numero: string; libelle: string }[];
  onChoix?: (numero: string) => void;
  /** Pendant le code secret : la réponse part protégée comme un code. */
  secretement?: boolean;
  onRevenir?: () => void;
}) {
  const t = textesGuichet[langue];
  const [valeur, setValeur] = useState("");
  // LE TYPE NE REFUSE RIEN. Un écran lu « numéro » qui demandait en fait
  // « 1=Oui 2=Non » laissait Envoyer éteint sur « 1 ». Voir `@noyau/deroule`.
  const valide = reponsePrete(type, valeur);
  const envoyer = () => {
    if (!valide) return;
    onEnvoyer(reponseLibre(type, valeur));
    setValeur("");
  };
  // UNE ZONE DE RÉPONSE, TOUJOURS — comme sur le téléphone, où chaque
  // message de l'opérateur arrive avec sa case à remplir.
  return (
    <form onSubmit={(e) => { e.preventDefault(); envoyer(); }}
      className="flex min-h-0 flex-1 flex-col">
      <div className="ecran flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {entete}
        {choix.length > 0 && onChoix && (
          <div className="flex flex-col gap-2">
            {choix.map((c) => (
              <button type="button" key={`${c.numero}-${c.libelle}`} onClick={() => onChoix(c.numero)}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface-raised px-4 py-3.5 text-left text-body font-medium transition hover:bg-surface-2 active:scale-[.98]">
                <span className="tabnums grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-small text-ink-soft">{c.numero}</span>
                <span className="flex-1">{c.libelle}</span>
                <IconChevron size={16} className="text-ink-faint" />
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <p className="text-small font-medium text-ink-soft">{t.votreReponse}</p>
          <ChampSaisie type={type} valeur={valeur} onChange={setValeur} langue={langue}
                       autoFocus={choix.length === 0} masque={secretement} libre />
          {secretement && <p className="text-caption text-ink-faint">{t.reponseProtegee}</p>}
        </div>
        {recents?.length ? (
          <div className="overflow-x-auto pb-1">
            <div className="flex w-max gap-3">
              {recents.map((r) => (
                <Visage key={r.numero} client={r} choisi={false} onClick={() => onEnvoyer(r.numero)} />
              ))}
            </div>
          </div>
        ) : null}
        {onRevenir && (
          <button type="button" onClick={onRevenir}
            className="self-center p-2 text-small text-ink-soft underline underline-offset-4 transition hover:text-ink">
            {t.revenirAuPave}
          </button>
        )}
      </div>
      <div className="pt-2">
        <GrosBouton libelle={t.envoyer} desactive={!valide} type="submit" />
      </div>
    </form>
  );
}

/**
 * L'ÉCRAN EN COURS DE L'OPÉRATEUR — un seul, comme sur le téléphone. Qui
 * parle, ce qu'il dit, mot pour mot, et ses choix en boutons. Il entre en
 * glissant doucement (`.ecran`) : on voit qu'un nouvel écran est arrivé.
 */
function EcranOperateur({ texte, copie, op, couleur, t, choix, onChoix, onAutre }: {
  texte: string; copie: string; op: string; couleur: string;
  t: (typeof textesGuichet)["fr"];
  choix: { numero: string; libelle: string }[];
  onChoix: (numero: string) => void;
  onAutre?: () => void;
}) {
  return (
    <div className="ecran flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
      <CarteOperateur texte={texte} copie={copie} op={op} couleur={couleur} t={t} />
      {choix.length > 0 && (
        <div className="flex flex-col gap-2">
          {choix.map((c) => (
            <button type="button" key={`${c.numero}-${c.libelle}`} onClick={() => onChoix(c.numero)}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface-raised px-4 py-3.5 text-left text-body font-medium transition hover:bg-surface-2 active:scale-[.98]">
              <span className="tabnums grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-small text-ink-soft">{c.numero}</span>
              <span className="flex-1">{c.libelle}</span>
              <IconChevron size={16} className="text-ink-faint" />
            </button>
          ))}
        </div>
      )}
      {onAutre && (
        <button type="button" onClick={onAutre}
          className="self-center p-2 text-small text-ink-soft transition hover:text-ink">
          {t.autreReponse}
        </button>
      )}
    </div>
  );
}

/** Le message de l'opérateur, dans sa carte : qui parle, le texte entier,
 *  « Copier ». */
function CarteOperateur({ texte, copie, op, couleur, t }: {
  texte: string; copie: string; op: string; couleur: string;
  t: (typeof textesGuichet)["fr"];
}) {
  const [copiee, setCopiee] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(copie);
      setCopiee(true);
      setTimeout(() => setCopiee(false), 1600);
    } catch { /* le texte reste sélectionnable à la souris */ }
  };
  return (
    <div className="rounded-3xl border border-line bg-surface-raised px-5 py-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-caption text-ink-faint">
        <span className="size-2 rounded-full" style={{ background: couleur }} />
        <span className="font-medium">{op}</span>
        <button type="button" onClick={() => void copier()}
          className="ml-auto rounded-full px-2 py-0.5 transition hover:bg-surface-2 hover:text-ink">
          {copiee ? t.copie : t.copier}
        </button>
      </div>
      {/* Le texte du réseau, mot pour mot : jamais traduit, toujours entier. */}
      {texte && <p className="whitespace-pre-line break-words text-heading leading-relaxed">{texte}</p>}
    </div>
  );
}

/**
 * LE RÉSEAU RÉPOND — comme le « code USSD en cours » d'un téléphone. Un rond
 * qui respire à la couleur de l'opérateur, une phrase, et ce qu'on vient
 * d'envoyer : on sait qu'on a été entendu, et l'écran ne reste jamais blanc.
 */
function Patience({ texte, couleur, envoye, t }: {
  texte: string; couleur: string; envoye: string | null;
  t: (typeof textesGuichet)["fr"];
}) {
  return (
    <div aria-live="polite" className="ecran flex flex-1 flex-col items-center justify-center gap-5 px-6">
      <div className="relative grid size-[88px] place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full opacity-20 motion-reduce:animate-none" style={{ background: couleur }} />
        <span className="grid size-[56px] place-items-center rounded-full border-[3px] bg-surface-raised" style={{ borderColor: couleur }}>
          <span className="size-2.5 rounded-full" style={{ background: couleur }} />
        </span>
      </div>
      <p className="text-heading font-medium">{texte}</p>
      {envoye && (
        <p className="tabnums rounded-full bg-surface-2 px-3.5 py-1.5 text-small text-ink-soft">
          {t.envoye(envoye)}
        </p>
      )}
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
    // `type="button"` N'EST PAS UN DÉTAIL. Ces visages vivent dans un
    // formulaire, et un bouton sans type y est un bouton d'ENVOI : Entrée,
    // dans le champ, « cliquait » le premier visage. On collait un numéro,
    // on validait au clavier — et c'est au premier client de la liste que
    // l'argent partait. Le harnais du parcours l'a vu au premier essai.
    <button type="button" onClick={onClick} title={`${client.nom} ${formaterNumero(client.numero)}`.trim()}
      className="flex w-[72px] shrink-0 flex-col items-center gap-1 transition hover:opacity-70">
      <span className={`grid size-[52px] place-items-center rounded-full border font-semibold ${choisi ? "border-ink bg-ink text-white" : "border-line bg-surface-raised"}`}>
        {initiales}
      </span>
      <span className="line-clamp-2 text-center text-caption leading-tight text-ink-soft">{court}</span>
    </button>
  );
}

function Pave({ onChiffre, onEffacer, etiquetteEffacer }: {
  onChiffre: (c: string) => void; onEffacer: () => void; etiquetteEffacer: string;
}) {
  const touches: (string | null)[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", null, "0", "⌫"];
  return (
    <div className="grid grid-cols-3 px-4 pb-2">
      {touches.map((x, i) => x == null ? <span key={i} /> : (
        <button type="button" key={i} onClick={() => (x === "⌫" ? onEffacer() : onChiffre(x))}
          aria-label={x === "⌫" ? etiquetteEffacer : x}
          className={`h-12 rounded-2xl tabnums text-[24px] transition hover:bg-surface-2 active:bg-surface-3 ${x === "⌫" ? "text-ink-soft" : "font-medium"}`}>
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
function EtapeCode({ onValider, onAutre, t }: {
  onValider: (code: string) => void; onAutre: () => void; t: (typeof textesGuichet)["fr"];
}) {
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
  // Posé SOUS l'échange, pas à sa place : le message qui réclame le code
  // — ce qu'on va signer — reste lisible juste au-dessus.
  return (
    <div className="flex flex-col border-t border-line bg-surface pt-4">
      <div className="flex flex-col items-center gap-2">
        <p className="flex items-center gap-2 text-heading font-semibold">
          <IconLock size={18} /> {t.codeTitre}
        </p>
        <p className="text-caption text-ink-faint">{t.codeNote}</p>
        <div aria-label={t.chiffresComposes(code.length)} className="my-2 flex h-4 items-center gap-3">
          {Array.from({ length: Math.max(LONGUEUR_CODE_MIN, code.length) }).map((_, i) => (
            <span key={i} className={`size-3.5 rounded-full border-[1.5px] ${i < code.length ? "border-ink bg-ink" : "border-ink-faint"}`} />
          ))}
        </div>
      </div>
      <Pave onChiffre={taper} onEffacer={effacer} etiquetteEffacer={t.effacerDernier} />
      {/* Le pavé n'est pas une prison : on peut toujours répondre autre
          chose — et ce qu'on tape part protégé comme un code. */}
      <button type="button" onClick={onAutre}
        className="mb-2 self-center rounded-btn border border-line bg-surface-raised px-4 py-2 text-small font-medium transition hover:bg-surface-2">
        {t.repondreAutrement}
      </button>
      <GrosBouton libelle={t.valider} desactive={code.length < LONGUEUR_CODE_MIN} onClick={valider} />
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
  // « incertaine » : ni coche ni croix — on ne sait pas, on le dit.
  const Icone = issue === "reussie" ? IconCheck
    : issue === "reponse" || issue === "incertaine" ? IconBubble : IconClose;
  const fond = issue === "reussie" ? "bg-positive-vif"
    : issue === "reponse" || issue === "incertaine" ? "bg-ink" : "bg-negative";
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
          <button type="button" onClick={repondreQuandMeme}
            className="rounded-btn border-[1.5px] border-ink px-5 py-2.5 text-body font-semibold transition hover:bg-surface-2">
            {t.repondreQuandMeme}
          </button>
        )}
        {fil.length > 1 && (
          <button type="button" onClick={onDetails} className="mt-2 text-small text-ink-soft transition hover:text-ink">
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
