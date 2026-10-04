// Une opération, du premier chiffre au code secret — en plein écran.
//
// Le pendant mobile de `web/app/operation.tsx`, et il suit le MÊME
// déroulement : vous dites à qui et combien, la vraie session USSD s'ouvre
// sur la carte de Douala, l'application répond elle-même aux questions du
// menu avec vos informations, et quand l'opérateur réclame le code secret, le
// pavé prend la main. Une question qu'on ne comprend pas vous est posée
// telle quelle : on ne devine jamais.
//
// Ce qui décide « est-ce le code secret qu'on me demande ? » ne vit pas ici
// mais dans `@noyau/ussd`, partagé avec la plateforme et testé. Deux
// jugements différents sur la même question, et le code partirait en clair
// d'un côté.
//
// UNE QUESTION PAR ÉCRAN. La version d'avant tenait dans une feuille posée
// sur l'accueil : un en-tête, une frise, le texte de l'opérateur, ses choix,
// un lien d'échange, un bouton rouge — tout à la fois, sur la moitié d'un
// écran, avec le clavier du téléphone par-dessus. Le propriétaire l'a dit
// sans détour : « trop d'informations au même endroit ». On ne retouche pas
// un écran pareil, on le refait :
//
//   « À qui ? »  →  « Combien ? »  →  « Vérifiez »  →  on parle à MTN…
//   →  le code secret  →  c'est fait.
//
// Chaque écran ne pose qu'une question, en grand.
//
// DES VRAIS CHAMPS. Le numéro et le montant se tapaient sur un pavé dessiné,
// chiffre par chiffre : impossible d'y COLLER un numéro recopié d'un SMS ou
// de WhatsApp — « c'est trop figé », a dit le propriétaire. Ce sont
// maintenant des champs du téléphone (appui long → Coller), qui acceptent
// tout ce qu'on y met ; l'écran montre ce qui partira (`@noyau/saisie`), et
// ne devine jamais entre deux numéros.
//
// UN ÉCRAN À LA FOIS, COMME SUR LE TÉLÉPHONE. Pendant l'appel, on voit
// l'écran EN COURS de l'opérateur, en entier — son texte, ses choix en
// boutons, ou le champ qu'il attend — et rien d'autre : on répond, ça
// charge, l'écran suivant REMPLACE le précédent. Une première version
// empilait tout l'échange ; le propriétaire l'a refusée : « je veux
// uniquement l'écran sur lequel je suis ». L'échange entier reste à un
// geste, à la fin (« Détails »).
//
// Le pavé du code secret se pose SOUS le message qui le réclame (« Dépôt de
// 5 000 F à JEAN DUPONT, frais 0 F ») : on sait ce qu'on signe. Avant, il
// n'affichait que « Votre code secret », seul. Le message se sélectionne et
// se copie.
//
// Les transitions passent par Reanimated, sur le fil de l'interface : elles
// ne touchent que l'opacité et la position, ne bloquent rien, et
// « réduire les animations » les coupe.

import { useEffect, useRef, useState } from "react";
import {
  Alert, Keyboard, KeyboardAvoidingView, Modal, Pressable, View,
  useWindowDimensions,
} from "react-native";
import {
  Easing, FadeIn, FadeInDown, FadeInLeft, FadeInRight, useAnimatedStyle, useSharedValue,
  withRepeat, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoutonIcone, Carte, ChampTexte, Defilement, Filet, Texte } from "@/ui";
import { Animated, COURBE, useMouvementReduit } from "@/animations";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { Icone, type NomIcone } from "@/icones";
import {
  couleurOperateur, couleurs, espaces, polices, rayons, textes,
} from "@/theme/jetons";
import {
  agirSurBeneficiaire, annulerCommande, deposerCommande, ErreurGuichet, lireCommande,
} from "@/api/guichet";
import { useSession } from "@/session";
import { useLangue } from "@/langue";
import { toucherDepart, toucherEchec, toucherReussite } from "@/toucher";
import { copierTexte } from "@/presse-papiers";
import { remplirVariables } from "@noyau/codes";
import { issueDeLAnnulation, phraseDAbandon } from "@noyau/abandon";
import { lireEcran, type EtatDuReseau, type TypeChamp } from "@noyau/ussd";
import {
  ATTENTE_DU_BOITIER_MS, PROLONGATION_MS, champAServir, etapePeutPartir, reponseDuBoitier,
  reponseLibre, reponsePrete, restantsApresReponse, type EcranRecu,
} from "@noyau/deroule";
import { formaterNumero } from "@noyau/numero";
import { nombre } from "@noyau/types";
import type { ClientRecent } from "@noyau/recents";
import { nomDuBeneficiaire, nomPropre, numeroPropre } from "@noyau/beneficiaires";
import { apresEffacement, enFormeDansLeChamp, montantSaisi, numeroSaisi } from "@noyau/saisie";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import { textesGuichet } from "@noyau/textes/guichet";

export type ChampOperation = {
  cle: string;
  label: string;
  aide: string;
  type: TypeChamp;
};

export type Operation = {
  titre: string;
  /** L'icône du geste (« ArrowDown » pour un dépôt), reprise en tête du
   *  parcours : on voit d'un coup d'œil ce qu'on est en train de faire. */
  icone?: NomIcone;
  code: string;                 // le code USSD composé en premier, tel quel
  champs: ChampOperation[];     // vide : la session s'ouvre directement
  /** L'ICCID de la carte visée. Sans lui, le robot composerait sur sa
   *  première carte — et avec deux SIM, une opération Orange partirait sur
   *  la MTN. */
  carte?: string;
  /** Le parcours complet quand le bouton vient du carnet appris. Jamais le
   *  code secret : l'apprentissage s'arrête juste avant. */
  etapes?: string[];
  /** Le terminal qui doit exécuter — celui de la carte visée. */
  terminal?: string | null;
  /** « MTN ·8901 » : le nom de la carte, pour la vérification. */
  carteLibelle?: string;
  /** « MTN » : à qui l'on parle, pendant que le réseau répond. */
  operateur?: string;
  /** Les bénéficiaires de cette carte, proposés d'un geste : le carnet
   *  d'abord (`enregistre`), puis les numéros vus dans ses SMS. */
  recents?: (ClientRecent & { enregistre?: boolean })[];
};

// `reseau` : ce que le RÉSEAU a dit de la session avec ce message (rapporté
// par le boîtier) — il attend une réponse, ou il a fermé. Absent d'un
// boîtier d'avant : l'écran lit alors le texte.
// `de: "totem"` : une phrase du BOÎTIER (un refus), jamais rangée comme un
// écran de l'opérateur — elle n'est pas de lui.
type Msg = { de: "reseau" | "vous" | "totem"; texte: string; reseau?: EtatDuReseau };

// COMBIEN DE TEMPS on attend la réponse du boîtier — À L'HORLOGE. On
// comptait des TOURS (25 × 1,2 s ≈ 30 s), mais chaque relecture peut prendre
// jusqu'à trente secondes sur un mauvais réseau : l'écran « On parle à MTN… »
// durait alors jusqu'à six minutes et quarante-cinq secondes. Et trente
// secondes, c'était MOINS que le boîtier, qui attend lui-même le réseau
// jusqu'à trente secondes après avoir relevé sa file : la réponse de MTN à
// la 28e seconde arrivait après l'abandon. Le délai vit dans le noyau,
// relu contre ceux du robot (`@noyau/deroule`).
const ATTENTE_MAX_MS = ATTENTE_DU_BOITIER_MS;

/** L'écran renonce sur une issue qu'il ne connaît pas : ni réussite, ni
 *  échec — « regardez vos SMS ». Pas de vibration d'échec. */
class Incertain extends Error {}
const PAUSE_MS = 1200;
/** Sans une seule relecture réussie depuis ce délai, ce n'est plus le
 *  boîtier qui se tait : c'est le TÉLÉPHONE qui n'arrive pas à joindre TOTEM. */
const TELEPHONE_MUET_MS = 10_000;

/** Des montants qu'on tape tous les jours — un geste au lieu de six chiffres. */
const MONTANTS = [1000, 5000, 10000, 25000];

const LONGUEUR_CODE_MIN = 4;
// Douze, pas six : le pavé coupait sans rien dire au sixième chiffre, et un
// code plus long (certains comptes, certains services) partait tronqué.
const LONGUEUR_CODE_MAX = 12;

type TypeSaisie = TypeChamp | "texte";

/** Ce qui partira réellement au réseau, lu dans ce qu'on a tapé ou collé. */
function valeurPropre(type: TypeSaisie, brut: string): string {
  if (type === "numero") return numeroSaisi(brut);
  if (type === "montant") { const m = montantSaisi(brut); return m ? String(m) : ""; }
  return brut.trim();
}

/** Un numéro se tient à partir de huit chiffres ; un montant, dès le premier
 *  franc ; une réponse libre, dès le premier caractère. Le réseau reste juge :
 *  ceci n'évite que le « Continuer » à vide. */
function pret(type: TypeSaisie, brut: string): boolean {
  const v = valeurPropre(type, brut);
  return type === "numero" ? v.length >= 8 : v.length > 0;
}

/** Le nom qu'on connaît à ce numéro — carnet ou SMS —, s'il y en a un. */
function nomDe(recents: Operation["recents"], numero: string): string | undefined {
  if (!numero) return undefined;
  const n = numeroPropre(numero);
  return recents?.find((r) => numeroPropre(r.numero) === n)?.nom || undefined;
}

export function OperationPopup({
  operation, onFermer, onTermine, onRefus,
}: {
  operation: Operation;
  onFermer: () => void;
  onTermine?: () => void;
  /** La plateforme a refusé parce que le boîtier se tait ou que la carte
   *  n'y est plus : l'écran d'où l'on vient doit se remettre à jour, sans
   *  quoi il restait « en ligne » et chaque nouvel essai prenait le même
   *  refus. */
  onRefus?: () => void;
}) {
  const langue = useLangue();
  const t = textesGuichet[langue];
  const { perdue } = useSession();

  const [etape, setEtape] = useState<"saisie" | "session">(
    operation.champs.length ? "saisie" : "session");
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [fil, setFil] = useState<Msg[]>([]);
  const [attente, setAttente] = useState(false);
  const [enSession, setEnSession] = useState(false);
  // LA CLÉ D'INTENTION DE CETTE OPÉRATION — tirée une fois, à l'ouverture.
  // Elle accompagne le premier code composé, celui qui peut porter le
  // bénéficiaire et le montant. Si ce geste repart (un appui recompté, une
  // requête reprise après un délai), la plateforme reconnaît la clé et rend
  // la demande déjà créée : l'argent ne part pas deux fois.
  const cleOperation = useRef<string>(
    `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // L'erreur dit-elle une issue INCONNUE (le code est peut-être parti) ?
  const [incertaine, setIncertaine] = useState(false);
  // Une phrase de TOTEM posée au-dessus de l'écran de l'opérateur — le
  // bouton appris qui s'est arrêté. Jamais dans la carte de l'opérateur.
  const [avis, setAvis] = useState<string | null>(null);
  // « Taper une autre réponse » : un champ libre à la place des boutons.
  const [libre, setLibre] = useState(false);
  // LA DEMANDE EN VOL : déposée, pas encore rendue par le boîtier.
  // « Raccrocher » l'annule d'abord — sans quoi le boîtier, qui sert la file
  // de la carte dans l'ordre, composait le code secret PUIS raccrochait.
  const enVol = useRef<{ id: number; secret: boolean } | null>(null);
  // L'écran a raccroché pendant un vol : ce qui revient ne s'écrit plus.
  const arrete = useRef(false);
  // Le dernier écran de l'opérateur, tel qu'il est à l'instant — lu par
  // `repondre` au moment de l'appui, sans attendre un rendu.
  const ecranCourant = useRef<EcranRecu>({ texte: "" });

  const avecCarte = (p: Record<string, unknown>) =>
    operation.carte ? { ...p, carte: operation.carte } : p;

  // Les champs pas encore consommés par les questions du réseau.
  const restants = useRef<ChampOperation[]>([...operation.champs]);
  // L'écran est-il encore monté ? Une session peut répondre après la
  // fermeture ; on ne veut pas écrire dans un composant démonté.
  const vivant = useRef(true);
  // Un raccrochage est-il DÛ au démontage ? Le nettoyage ci-dessous le lit ;
  // il est tenu à jour plus bas, dès que la session vit ou se termine.
  const raccrochageDu = useRef(false);
  useEffect(() => () => {
    vivant.current = false;
    // QUITTER SANS RACCROCHER LAISSE LA SIM EN LIGNE. Les boutons raccrochent
    // déjà ; ce qui manquait, c'est le départ AUTREMENT — un balayage arrière,
    // la navigation, l'application mise en fond. La fiche se démonte alors
    // sans un mot, et la session reste ouverte sur la vraie carte, à Douala :
    // l'opération suivante peut échouer parce que la carte est encore sur un
    // menu. On raccroche.
    //
    // Une demande encore EN VOL s'annule d'abord : partie sans écran pour la
    // suivre, elle serait composée quand même, puis raccrochée.
    const fin = () => {
      void deposerCommande("ussd_fin", avecCarte({}), operation.terminal).catch(() => {});
    };
    const vol = enVol.current;
    enVol.current = null;
    if (vol) void annulerCommande(vol.id).catch(() => null).finally(fin);
    else if (raccrochageDu.current) fin();
  }, [operation.terminal]);

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));

  // Ce qui partirait pour chaque champ : ce que l'écran a annoncé.
  const propres = () => Object.fromEntries(operation.champs.map(
    (c) => [c.cle, valeurPropre(c.type, valeurs[c.cle] ?? "")]));

  /** La réponse du boîtier est là : on la montre, et on dit où l'on en est.
   *  Un ÉCRAN de l'opérateur se range à son nom, tel qu'il l'a écrit — vide
   *  compris. Un REFUS du boîtier est une phrase de TOTEM : il ne passe pas
   *  pour un message de MTN, et la session se raccroche en partant (le
   *  boîtier a pu laisser la carte sur un menu). */
  const servir = (
    c: { etat: string; resultat: string | null; reseau?: EtatDuReseau }, secretEnVol: boolean,
  ): EcranRecu | null => {
    setAttente(false);
    setAvis(null);
    // Un nouvel écran de l'opérateur : on repart de SES choix. Rester
    // en « autre réponse » aurait caché les boutons du menu suivant.
    setLibre(false);
    const lu = reponseDuBoitier(c);
    if (!lu || lu.genre === "refus") {
      const texte = lu?.texte || t.echec;
      setFil((f) => [...f, { de: "totem", texte }]);
      setErreur(texte);
      // Le code secret est parti au boîtier, et on ne sait pas ce qu'il en
      // a fait (pas de réponse du réseau…) : ni réussite, ni échec.
      setIncertaine(secretEnVol);
      setEnSession(true);
      return null;
    }
    const ecranRecu: EcranRecu = { texte: lu.texte, reseau: lu.reseau };
    ecranCourant.current = ecranRecu;
    setFil((f) => [...f, { de: "reseau", texte: lu.texte, reseau: lu.reseau }]);
    setEnSession(true);
    return ecranRecu;
  };

  /** Dépose une demande et attend la réponse du réseau. */
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
      // La carte voyage avec CHAQUE geste de la session : la plateforme y
      // lit que la réponse vient du titulaire de cette carte, et le robot
      // dans quelle session la poser.
      const demande = avecCarte(parametres);
      const { id } = await deposerCommande(genre, demande, operation.terminal, cle)
        .catch((e: unknown) => {
          // LE CODE SECRET EST PEUT-ÊTRE PARTI. Sa réponse s'est perdue en
          // route — connexion à demi ouverte, corps coupé après les
          // en-têtes, 504 d'un hébergeur après l'écriture —, mais la demande
          // a pu être créée, et le boîtier la composera. Dire « réessayez »,
          // c'était inviter à un second transfert. Seul un refus EXPLICITE
          // de la plateforme (une raison donnée) dit que rien n'est parti.
          const secretPeutEtreParti = secretEnVol
            && !(e instanceof ErreurGuichet && e.nature === "refus")
            && !(e instanceof ErreurGuichet && e.nature === "session")
            && !(e instanceof ErreurGuichet && e.nature === "plateforme" && e.raison);
          if (secretPeutEtreParti) throw new Incertain(t.telephoneSansTotem);
          throw e;
        });
      // L'écran a été quitté (ou raccroché) pendant le dépôt : personne ne
      // suivra cette demande — elle s'annule, puis la ligne se raccroche.
      if (!vivant.current || arrete.current) {
        void annulerCommande(id).catch(() => null).finally(() => {
          void deposerCommande("ussd_fin", avecCarte({}), operation.terminal).catch(() => {});
        });
        return null;
      }
      enVol.current = { id, secret: secretEnVol };
      const depart = Date.now();
      let joint = depart;            // la dernière fois que la plateforme a répondu
      /** Relit jusqu'à l'échéance ; rend la demande finie, ou null. */
      const guetter = async (echeance: number) => {
        while (Date.now() < echeance) {
          await new Promise((r) => setTimeout(r, PAUSE_MS));
          if (!vivant.current || arrete.current) return "parti" as const;
          // Une relecture ne mange jamais plus que le temps qui reste.
          const reste = Math.max(1500, echeance - Date.now());
          const ctrl = new AbortController();
          const minuteur = setTimeout(() => ctrl.abort(), reste);
          let c: Awaited<ReturnType<typeof lireCommande>> | null = null;
          try {
            c = await lireCommande(id, ctrl.signal);
            joint = Date.now();
          } catch (e) {
            // Session expirée : le verrou, pas un message d'opération.
            if (e instanceof ErreurGuichet && e.nature === "session") { perdue(); return "parti" as const; }
          } finally {
            clearTimeout(minuteur);
          }
          if (!vivant.current || arrete.current) return "parti" as const;
          if (c && (c.etat === "faite" || c.etat === "echouee")) return c;
        }
        return null;
      };
      const premiere = await guetter(depart + ATTENTE_MAX_MS);
      if (premiere === "parti") return null;
      if (premiere) { enVol.current = null; return servir(premiere, secretEnVol); }
      // L'ÉCRAN RENONCE — ET LE DIT JUSTE.
      //
      // Le téléphone n'a pas joint la plateforme depuis dix secondes : ce
      // n'est pas le boîtier qu'on attend, c'est le réseau du téléphone. On
      // ne peut pas annuler sans réseau : la demande est peut-être partie.
      if (Date.now() - joint > TELEPHONE_MUET_MS) throw new Incertain(t.telephoneSansTotem);
      // Le boîtier n'a pas répondu : on ANNULE. Un boîtier revenu des heures
      // plus tard composait encore la demande — numéro et montant compris —
      // pour un écran qui avait abandonné. « Rien n'est parti » ne se dit que
      // si l'annulation a PRIS ; sinon le boîtier l'a en main, et la dire
      // abandonnée ferait recommencer un transfert qui part peut-être.
      const annulation = await annulerCommande(id).catch(() => null);
      const issue = annulation ? issueDeLAnnulation(true, annulation) : "incertain";
      if (!vivant.current || arrete.current) return null;
      // Il l'a FINIE entre notre dernier coup d'œil et l'annulation : sa
      // réponse existe — on la montre, plutôt que d'envoyer guetter ses SMS.
      // Il l'a EN MAIN : il attend peut-être encore le réseau — on continue
      // de relire, au lieu de déclarer un échec sur un transfert qui part.
      if (issue === "finie" || issue === "en_cours") {
        const suite = await guetter(Date.now() + (issue === "finie" ? PAUSE_MS + 1500 : PROLONGATION_MS));
        if (suite === "parti") return null;
        if (suite) { enVol.current = null; return servir(suite, secretEnVol); }
      }
      enVol.current = null;
      if (issue === "rien_parti") throw new Error(phraseDAbandon(issue, t));
      throw new Incertain(phraseDAbandon(issue, t));
    } catch (e) {
      if (e instanceof ErreurGuichet && e.nature === "session") { perdue(); return null; }
      if (e instanceof ErreurGuichet
          && (e.raison === "boitier_muet" || e.raison === "carte_absente")) onRefus?.();
      if (!vivant.current || arrete.current) return null;
      // Le guichet rend déjà ses messages dans la bonne langue : tels quels.
      setErreur(e instanceof Error && e.message ? e.message : t.accroc);
      setIncertaine(e instanceof Incertain);
      setAttente(false);
      return null;
    }
  };

  // Après chaque réponse du réseau : répondre tout seul si on sait, sinon
  // rendre la main (le pavé pour le code, une zone de texte pour le reste).
  // « Si on sait » se décide dans le noyau (`champAServir`) : jamais sur une
  // confirmation, jamais sur un écran qui porte déjà la valeur, jamais sur
  // une session que le réseau a fermée.
  const derouler = async (ecranRecu: EcranRecu | null) => {
    while (ecranRecu) {
      const champ = champAServir(ecranRecu, restants.current, propres());
      if (!champ) return;                                // à vous
      restants.current = restants.current.filter((c) => c !== champ);
      const valeur = valeurPropre(champ.type, valeurs[champ.cle] ?? "");
      ecranRecu = await envoyer("ussd_reponse", { texte: valeur }, { de: "vous", texte: valeur });
    }
  };

  // UNE SEULE SESSION, JAMAIS DEUX. `setEtape` est asynchrone : un
  // double-appui sur « Lancer » rappelle `lancer` avant que le pied ne se
  // redessine, et déposait DEUX commandes « ussd » pour la même carte — deux
  // sessions ouvertes sur la SIM, une opération d'argent jouée deux fois. Le
  // verrou synchrone (un drapeau, pas un état) ferme cette porte, comme
  // partout ailleurs dans le code. `lancer` est à usage unique de toute
  // façon : une fois lancée, l'écran quitte l'étape « saisie ».
  const lance = useRef(false);
  const lancer = async () => {
    if (lance.current) return;
    lance.current = true;
    // Le clavier de la saisie ne survit pas à la saisie : resté ouvert, il
    // couvrait la session — le message de l'opérateur, le pavé du code.
    Keyboard.dismiss();
    setEtape("session");
    restants.current = [...operation.champs];
    const brutes = operation.etapes?.length ? operation.etapes : [operation.code];

    // LES TROUS D'ABORD. Un code peut porter « {numero} » et « {montant} » :
    // on les remplace par ce qui vient d'être saisi, et le code part alors
    // ENTIER, le réseau ne demandant plus que le code secret.
    // Ce qui remplit un trou, c'est ce que l'écran a annoncé (« Partira :
    // … ») — jamais le texte collé tel quel, dont « +237 » ferait un autre
    // numéro.
    const { etapes, consommees, manquantes } = remplirVariables(brutes, propres());
    // Un trou sans réponse ne part JAMAIS tel quel : « {numero} » composé au
    // réseau, c'est un code faux — au mieux il échoue, au pire il tombe sur
    // autre chose. On s'arrête, et on dit lequel manque.
    if (manquantes.length) {
      setErreur(t.trouSansReponse(manquantes.map((m) => `{${m}}`).join(", ")));
      setFini(true);
      return;
    }
    // Ce qui voyage déjà dans le code ne se resaisit pas ensuite.
    if (consommees.length) {
      restants.current = restants.current.filter((c) => !consommees.includes(c.cle));
    }

    let ecranRecu = await envoyer(
      "ussd",
      operation.carte ? { code: etapes[0], carte: operation.carte } : { code: etapes[0] },
      { de: "vous", texte: etapes[0] },
      cleOperation.current);
    // UN TRAJET APPRIS REGARDE L'ÉCRAN AVANT CHAQUE PAS. Il rejouait ses
    // étapes à l'aveugle : « 1 » partait sur « Service indisponible », sur
    // un menu renuméroté, et un numéro partait là où l'opérateur réclamait
    // déjà le code secret. Si l'écran ne propose pas l'étape suivante, on
    // s'arrête : son message reste entier, la zone de réponse est là, et
    // TOTEM dit pourquoi il n'a pas continué.
    for (let i = 1; i < etapes.length; i++) {
      if (ecranRecu == null) return;
      if (!etapePeutPartir(brutes[i], ecranRecu)) {
        setAvis(t.trajetArrete(etapes[i]));
        return;
      }
      ecranRecu = await envoyer("ussd_reponse", { texte: etapes[i] },
                                { de: "vous", texte: etapes[i] });
    }
    await derouler(ecranRecu);
  };

  // Sans formulaire, la session part toute seule à l'ouverture.
  const parti = useRef(false);
  useEffect(() => {
    if (operation.champs.length === 0 && !parti.current) {
      parti.current = true;
      void lancer();
    }
  }, []);

  // UNE RÉPONSE PART UNE SEULE FOIS — le code secret surtout.
  //
  // `lancer` a son verrou synchrone ; `secret` et `repondre` n'en avaient
  // pas, et s'en remettaient à l'état asynchrone `attente` pour cacher le
  // déclencheur. Or le re-rendu qui cache le pavé arrive APRÈS l'appel : un
  // double-appui rapide sur « Valider » envoyait donc DEUX fois
  // « ussd_reponse … secret:true » dans la session USSD vivante — le code
  // secret joué deux fois, exactement ce que le verrou de `lancer` empêche
  // sur son chemin. Un drapeau synchrone, partagé, ferme cette porte ; il se
  // relève quand la requête est finie, pour qu'une vraie seconde réponse
  // (une autre question du réseau) reste possible.
  const repondEnCours = useRef(false);

  const secret = async (code: string) => {
    if (repondEnCours.current) return;
    repondEnCours.current = true;
    try {
      // La bulle affichée n'est PAS le code : quatre points. Le code ne
      // traverse que la requête, et le robot le masque en base sitôt lu.
      // PAS DE FIN FORCÉE APRÈS LE CODE. L'écran se déclarait terminé dès
      // la réponse au code, quoi qu'elle dise : un opérateur qui demande
      // ENCORE quelque chose après le code (« 1. Confirm », un second code)
      // ne pouvait plus recevoir de réponse. C'est ce que l'opérateur écrit
      // — et ce que le réseau dit — qui décide de la fin (`conclu`).
      await envoyer("ussd_reponse", { texte: code, secret: true },
                    { de: "vous", texte: "••••" });
    } finally {
      repondEnCours.current = false;
    }
  };

  const repondre = async (brut: string) => {
    const valeur = brut.trim();
    if (!valeur) return;
    if (repondEnCours.current) return;
    repondEnCours.current = true;
    try {
      // UNE RÉPONSE TAPÉE CONSOMME LA QUESTION. Sans cela, le montant tapé à
      // la main restait « à servir », et l'écran suivant — la confirmation
      // qui le récapitule — le recevait tout seul, à la place de « 1 ».
      restants.current = restantsApresReponse(
        ecranCourant.current, restants.current, propres(), valeur);
      await derouler(await envoyer("ussd_reponse", { texte: valeur },
                                   { de: "vous", texte: valeur }));
    } finally {
      repondEnCours.current = false;
    }
  };

  /** L'ordre de raccrochage, sans faire attendre l'écran. */
  const posterFin = () => {
    raccrochageDu.current = false;   // c'est fait : le démontage ne refait rien
    void deposerCommande("ussd_fin", avecCarte({}), operation.terminal).catch(() => {});
  };

  // RACCROCHER RETIENT D'ABORD CE QUI EST EN VOL. Le boîtier sert la file
  // de la carte dans l'ordre : sans annulation, un code secret validé une
  // seconde plus tôt était composé, PUIS la ligne raccrochée — pendant que
  // l'écran s'était fermé comme si tout était arrêté. Si l'annulation n'a
  // pas pris, on le DIT au lieu de fermer en silence.
  const raccrocher = async () => {
    const vol = enVol.current;
    if (!vol) { posterFin(); onFermer(); return; }
    arrete.current = true;
    enVol.current = null;
    const annulation = await annulerCommande(vol.id).catch(() => null);
    const issue = annulation ? issueDeLAnnulation(true, annulation) : "incertain";
    posterFin();
    if (issue === "rien_parti") { onFermer(); return; }
    if (!vivant.current) return;
    setAttente(false);
    setErreur(t.reponsePeutEtrePartie);
    setIncertaine(true);
    setFini(true);
  };

  // Fermer alors qu'une commande est encore EN VOL : le démontage l'annule
  // et raccroche — une session qui s'ouvre après la fermeture ne doit pas
  // rester pendue sur la carte, sans écran pour la conduire.
  const fermerSession = () => {
    if (attente && !fini && !enVol.current) posterFin();
    onFermer();
  };

  // Une session vivante et non finie devra être raccrochée si l'on quitte.
  useEffect(() => { raccrochageDu.current = enSession && !fini; }, [enSession, fini]);

  const dernierMsg = [...fil].reverse().find((m) => m.de === "reseau");
  const dernier = dernierMsg?.texte ?? "";
  // LE RÉSEAU DÉCIDE si la session continue ; le texte ne fait que le
  // laisser deviner. « Confirm: … 00. Next » s'affichait « Terminé ».
  const ecran = lireEcran(dernier, dernierMsg?.reseau);
  // « Répondre autre chose » (`libre`) range le pavé : le champ prend sa place.
  const pave = enSession && !attente && !fini && ecran.attend === "secret" && !libre;
  const reduit = useMouvementReduit();
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState(false);
  // Le formulaire, un champ par écran : `pas` désigne le champ montré, et
  // le dernier pas (= nombre de champs) est la vérification.
  const [pas, setPas] = useState(0);
  const verification = pas >= operation.champs.length;

  // L'OPÉRATEUR A CONCLU. Un écran qui ne demande plus rien (« Votre solde
  // est… », « Opération réussie ») termine la session : on n'offre plus un
  // champ de réponse vide sous une phrase qui n'attend rien. Un geste discret
  // permet tout de même de répondre — dans le doute, on rend la main.
  // Un écran VIDE de l'opérateur est un écran : on le compte (`dernierMsg`),
  // on ne le confond pas avec « rien reçu encore ».
  const conclu = enSession && !attente && Boolean(dernierMsg) && ecran.attend === "rien";
  useEffect(() => {
    if (conclu && !fini && !libre) { setFini(true); onTermine?.(); }
  }, [conclu, fini, libre]);

  // L'issue de l'écran de fin : ce que l'opérateur a dit, pas ce qu'on espère.
  const issue: Issue = erreur ? (incertaine ? "incertaine" : "interrompue")
    : ecran.issue === "refusee" ? "refusee"
      : ecran.issue === "reussie" ? "reussie" : "reponse";
  const termine = fini || Boolean(erreur);

  // CE QUE L'ÉCRAN A DIT, ET RIEN D'AUTRE, SE SENT AU DOIGT. Une réussite
  // que l'opérateur a écrite vibre « réussi » ; un refus, « échec ». Une
  // simple réponse (un solde) ne vibre pas : elle n'est ni l'un ni l'autre.
  const sentie = useRef(false);
  useEffect(() => {
    if (!termine || sentie.current) return;
    sentie.current = true;
    if (issue === "reussie") toucherReussite();
    else if (issue === "refusee" || issue === "interrompue") toucherEchec();
  }, [termine, issue]);

  const op = operation.operateur || operation.carteLibelle?.split(/\s/)[0] || t.reseau;
  const saisieEntamee = operation.champs.some((c) => (valeurs[c.cle] ?? "").trim());

  // UNE SEULE PORTE DE SORTIE — la croix, le retour d'Android, le balayage.
  // Une session vivante ne se quitte pas sans raccrocher, et une saisie
  // entamée ne se jette pas sans question.
  const sortir = () => {
    if (etape === "session" && enSession && !termine) {
      Alert.alert(t.raccrocherQuestion, undefined, [
        { text: t.garderSession, style: "cancel" },
        { text: t.raccrocherCourt, style: "destructive", onPress: () => void raccrocher() },
      ]);
      return;
    }
    if (etape === "saisie" && saisieEntamee) {
      Alert.alert(t.jeterQuestion, undefined, [
        { text: t.continuerSaisie, style: "cancel" },
        { text: t.jeter, style: "destructive", onPress: onFermer },
      ]);
      return;
    }
    if (etape === "session" && !termine) fermerSession(); else onFermer();
  };
  // LE SENS DU PARCOURS SE VOIT : la question suivante arrive par la
  // droite, la précédente revient par la gauche — comme une page qu'on
  // tourne et qu'on retourne. Tout arrivait de la droite, retour compris.
  const sens = useRef<"avant" | "arriere">("avant");
  // Le retour ramène à la question d'avant ; à la première, il sort.
  const reculer = () => {
    if (etape === "saisie" && pas > 0) { sens.current = "arriere"; setPas((p) => p - 1); }
    else sortir();
  };
  const avancer = () => { sens.current = "avant"; setPas((p) => p + 1); };

  // Le destinataire, tel qu'on le connaît : son nom s'il est dans les SMS.
  const champNumero = operation.champs.find((c) => c.type === "numero");
  const champMontant = operation.champs.find((c) => c.type === "montant");
  const numeroChoisi = champNumero ? numeroSaisi(valeurs[champNumero.cle] ?? "") : "";
  const montantChoisi = champMontant ? montantSaisi(valeurs[champMontant.cle] ?? "") : 0;
  const nomDuDestinataire = nomDe(operation.recents, numeroChoisi);

  // À LA FIN D'UN TRANSFERT RÉUSSI : « Enregistrer ce bénéficiaire ? » Le
  // nom proposé est celui que l'OPÉRATEUR a écrit sur son écran de
  // confirmation (« … a JEAN DUPONT (677998877) »), sinon celui des SMS. Un
  // numéro déjà au carnet ne se repropose pas.
  const numeroDuTransfert = numeroChoisi ? numeroPropre(numeroChoisi) : "";
  const dejaAuCarnet = Boolean(operation.recents?.some(
    (r) => r.enregistre && numeroPropre(r.numero) === numeroDuTransfert));
  const nomLu = [...fil].reverse().filter((m) => m.de === "reseau")
    .map((m) => nomDuBeneficiaire(m.texte, numeroDuTransfert)).find(Boolean) ?? null;
  const proposer = termine && issue === "reussie" && Boolean(operation.carte)
    && numeroDuTransfert.length >= 8 && !dejaAuCarnet;

  // Ce que l'on montre, une chose à la fois.
  let vue: React.ReactNode;
  let cleVue: string;
  if (etape === "saisie" && !verification) {
    const champ = operation.champs[pas];
    cleVue = `champ-${pas}`;
    vue = (
      <EtapeSaisie
        titre={champ.type === "montant" ? t.combien : champ.label}
        type={champ.type}
        valeur={valeurs[champ.cle] ?? ""}
        onChange={(v) => set(champ.cle, v)}
        recents={champ.type === "numero" ? operation.recents : undefined}
        onRecent={(n) => { set(champ.cle, enFormeDansLeChamp("numero", n, langue)); avancer(); }}
        bouton={t.continuer}
        onValider={avancer}
        langue={langue}
      />
    );
  } else if (etape === "saisie") {
    cleVue = "verification";
    // UNE FICHE, PAS UNE AFFICHE. Le montant en grand ; puis ce qu'on
    // signe, rangée par rangée — l'opération, le destinataire, la carte —,
    // l'étiquette à gauche, la valeur à droite, JAMAIS coupée : c'est
    // exactement ce qu'on vient relire. Un seul bouton plein, en bas.
    vue = (
      <View style={{ flex: 1 }}>
        <Defilement contentContainerStyle={{ flexGrow: 1, justifyContent: "center",
                                             padding: espaces.xl, gap: espaces.lg }}>
          <View style={{ alignItems: "center", gap: espaces.sm }}>
            <Texte taille={textes.petit} ton="pale">{t.verifiez}</Texte>
            {montantChoisi ? (
              <Montant valeur={montantChoisi} langue={langue} grand />
            ) : (
              <Texte taille={textes.titre} poids="demi" style={{ textAlign: "center" }}>
                {operation.titre}
              </Texte>
            )}
          </View>
          <Carte>
            <RangeeRecap etiquette={t.recapOperation}>
              <Texte poids="moyen" style={{ textAlign: "right" }}>{operation.titre}</Texte>
            </RangeeRecap>
            {numeroChoisi ? (
              <>
                <Filet />
                <RangeeRecap etiquette={t.recapVers}>
                  {nomDuDestinataire ? (
                    <Texte poids="demi" style={{ textAlign: "right" }}>{nomDuDestinataire}</Texte>
                  ) : null}
                  <Texte ton={nomDuDestinataire ? "doux" : "normal"}
                         poids={nomDuDestinataire ? "normal" : "demi"} chiffresAlignes
                         style={{ textAlign: "right" }}>
                    {formaterNumero(numeroChoisi)}
                  </Texte>
                </RangeeRecap>
              </>
            ) : null}
            {/* LA CARTE NE SE DIT QU'UNE FOIS. La fiche portait aussi une
                rangée « Depuis la carte · MTN ·8901 », sous un en-tête qui
                disait déjà « depuis MTN ·8901 », avec le même logo. L'en-tête
                reste — il est là à chaque étape, jusqu'au pavé du code, à la
                même hauteur : le retirer ici ferait sauter l'écran. */}
          </Carte>
        </Defilement>
        <Texte taille={textes.petit} ton="pale"
               style={{ textAlign: "center", paddingHorizontal: espaces.xl,
                        marginBottom: espaces.md }}>
          {t.codeEnsuite}
        </Texte>
        <GrosBouton libelle={t.confirmer}
                    onPress={() => { toucherDepart(); void lancer(); }} />
      </View>
    );
  } else if (termine) {
    cleVue = "fin";
    vue = (
      <Fin
        issue={issue}
        titre={issue === "reussie" ? t.opReussie : issue === "refusee" ? t.opRefusee
          : issue === "interrompue" ? t.opInterrompue
            : issue === "incertaine" ? t.opIncertaine : t.opReponse}
        texte={erreur ?? (ecran.texte || dernier || t.ecranVide)}
        note={issue === "reussie" ? t.confirmationSms
          : issue === "incertaine" ? t.noteIncertaine : undefined}
        fil={fil}
        details={details}
        onDetails={() => setDetails((d) => !d)}
        // Fini sur une simple réponse : peut-être attendait-il encore
        // quelque chose. On ne le devine pas — on rend la main.
        // Le réseau a dit qu'il avait fermé : répondre ne mènerait nulle part.
        repondreQuandMeme={issue === "reponse" && conclu && !libre
          && dernierMsg?.reseau !== "fini"
          ? () => { setLibre(true); setFini(false); } : undefined}
        bouton={t.termine}
        // Une session encore ouverte (un accroc en plein échange) se
        // raccroche en partant : elle ne reste pas pendue sur la carte.
        onTerminer={enSession && !fini ? () => void raccrocher() : onFermer}
        t={t}
        proposition={proposer && operation.carte ? (
          <ProposerBeneficiaire carte={operation.carte} numero={numeroDuTransfert}
                                nomInitial={nomLu ?? nomDuDestinataire ?? ""}
                                langue={langue} onFait={onTermine} />
        ) : null}
      />
    );
  } else {
    // L'APPEL EN COURS : tout l'échange, en entier, puis ce qu'on attend de
    // vous — le pavé du code, un champ, ou rien pendant que le réseau parle.
    // Une seule vue pour toute la session : elle ne se remonte pas à chaque
    // message, l'échange défile sous les yeux au lieu de clignoter.
    cleVue = "session";
    // TOUT CE QUE LE RÉSEAU ATTEND SE RÉPOND ICI : un menu, une page, une
    // question, ou — après « Répondre autre chose » — la demande du code.
    const repondable = !pave && !attente && Boolean(dernierMsg)
      && (libre || ecran.attend !== "rien");
    // Ce que TOTEM dit, À CÔTÉ de l'opérateur et jamais dans sa carte : un
    // bouton appris qui s'est arrêté, un écran que l'opérateur a laissé vide.
    const entete = (
      <View style={{ gap: espaces.md }}>
        {avis ? (
          <Texte taille={textes.petit} ton="doux" accessibilityLiveRegion="polite"
                 style={{ paddingHorizontal: espaces.xs }}>{avis}</Texte>
        ) : null}
        {dernier ? (
          <CarteOperateur texte={dernier} copie={dernier} op={op}
                          couleur={couleurOperateur(op)} t={t} />
        ) : (
          <Texte taille={textes.petit} ton="doux" style={{ paddingHorizontal: espaces.xs }}>
            {t.ecranVide}
          </Texte>
        )}
      </View>
    );
    // Pendant le code secret, ce qu'on tape librement part protégé.
    // PROTÉGÉ DÈS QUE LE MESSAGE PARLE DU CODE. Un menu « Entrez votre code
    // secret / 1. Valider / 0. Retour » reste un menu (ses choix en boutons),
    // mais ce qu'on tape librement dessous peut être le code : il part masqué,
    // avec le drapeau « secret », et ne s'affiche jamais dans l'échange.
    const secretement = ecran.parleDuCode && (libre || ecran.attend !== "secret");
    const typeQuestion: TypeSaisie = libre ? "texte"
      : ecran.attend === "numero" ? "numero" : ecran.attend === "montant" ? "montant" : "texte";
    // Ce qu'on vient d'envoyer — « 1 », un numéro, « •••• » — reste écrit
    // pendant que le réseau répond : on sait qu'on a été entendu.
    const envoye = [...fil].reverse().find((m) => m.de === "vous")?.texte ?? null;
    vue = (
      <View style={{ flex: 1 }}>
        {attente || !dernierMsg ? (
          <Patience key={`patience-${fil.length}`} couleur={couleurOperateur(op)} reduit={reduit}
            texte={!dernierMsg ? t.connexionA(op) : t.onParleA(op)}
            envoye={dernierMsg ? envoye : null} t={t} />
        ) : repondable ? (
          // LE MESSAGE DE L'OPÉRATEUR, INTACT — « 00. Next » compris : on ne
          // retire rien de ce qu'il a écrit. Dessous, ses choix en boutons
          // (des raccourcis), puis la zone de réponse, toujours là.
          <ZoneReponse key={`question-${fil.length}-${secretement ? "s" : ""}`}
            type={typeQuestion} reduit={reduit}
            entete={entete}
            choix={ecran.choix}
            onChoix={(n) => void repondre(n)}
            recents={typeQuestion === "numero" ? operation.recents : undefined}
            secretement={secretement}
            onRevenir={libre && ecran.attend === "secret" ? () => setLibre(false) : undefined}
            onEnvoyer={(v) => void (secretement ? secret(v) : repondre(v))} langue={langue} />
        ) : (
          // La demande du code : le message entier, compact, au-dessus du pavé.
          <EcranOperateur key={`ecran-${fil.length}`} op={op} couleur={couleurOperateur(op)}
            t={t} reduit={reduit} serre={pave}
            texte={dernier} copie={dernier} choix={[]} onChoix={(n) => void repondre(n)} />
        )}
        {pave ? <EtapeCode key={`code-${fil.length}`} onValider={secret}
                           onAutre={() => setLibre(true)} t={t} /> : null}
      </View>
    );
  }

  const nbPas = operation.champs.length + 1;

  return (
    <Modal visible animationType={reduit ? "none" : "slide"}
           presentationStyle="fullScreen" onRequestClose={reculer}
           statusBarTranslucent>
      <View style={{
        flex: 1, backgroundColor: couleurs.surface,
        paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, espaces.lg),
      }}>
        {/* L'EN-TÊTE : revenir, ce qu'on fait, sortir. Rien d'autre. */}
        <View style={{
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: espaces.lg, paddingVertical: espaces.md, gap: espaces.md,
        }}>
          <View style={{ width: 32 }}>
            {etape === "saisie" && pas > 0 ? (
              <BoutonIcone nom="Chevron" etiquette={t.retour} onPress={reculer}
                           style={{ transform: [{ rotate: "180deg" }] }} />
            ) : null}
          </View>
          {/* Ce qu'on fait — son icône et son nom —, et d'où ça part : le
              logo et la carte. La même hauteur que l'ancien en-tête, au
              point près : sur un petit écran, chaque point pris ici l'est
              au message de l'opérateur, au-dessus du pavé du code. */}
          <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                           maxWidth: "100%" }}>
              {operation.icone ? (
                <View style={{ width: 22, height: 22, borderRadius: rayons.rond,
                               backgroundColor: couleurs.accent, alignItems: "center",
                               justifyContent: "center" }}>
                  <Icone nom={operation.icone} taille={13} couleur={couleurs.surfaceHaute} />
                </View>
              ) : null}
              <Texte poids="demi" numberOfLines={1} style={{ flexShrink: 1 }}>
                {operation.titre}
              </Texte>
            </View>
            {operation.carteLibelle ? (
              <PastilleCarte libelle={t.depuis(operation.carteLibelle)} operateur={op} />
            ) : null}
          </View>
          <View style={{ width: 32, alignItems: "flex-end" }}>
            {termine ? null : (
              <BoutonIcone nom="Close" etiquette={t.fermer} onPress={sortir} />
            )}
          </View>
        </View>

        {/* Où l'on en est du formulaire : un trait, pas une frise. */}
        {etape === "saisie" && nbPas > 1 ? (
          <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: espaces.xl }}>
            {Array.from({ length: nbPas }).map((_, i) => (
              <View key={i} style={{
                flex: 1, height: 3, borderRadius: 2,
                backgroundColor: i <= pas ? couleurs.encre : couleurs.surface3,
              }} />
            ))}
          </View>
        ) : null}

        {/* `behavior="padding"`, sans condition de plateforme : le seul
            champ du système qui reste (une réponse en lettres) ne doit pas
            finir sous le clavier. */}
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {/* Avancer arrive par la droite, reculer par la gauche ; la
              session se révèle sur place. « Réduire les animations » : un
              fondu court, rien ne glisse. */}
          <Animated.View key={cleVue} style={{ flex: 1 }}
            entering={reduit ? FadeIn.duration(120)
              : etape !== "saisie" ? FadeIn.duration(200)
                : sens.current === "arriere" ? FadeInLeft.duration(220)
                  : FadeInRight.duration(220)}>
            {vue}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// « incertaine » : l'écran ne sait pas ce qu'est devenue la demande (le code
// est peut-être parti). Ni coche, ni croix, ni vibration d'échec.
type Issue = "reussie" | "refusee" | "interrompue" | "incertaine" | "reponse";
type T = (typeof textesGuichet)["fr"];

/** Un montant en grand : les chiffres, puis « FCFA » plus petit à côté. */
function Montant({ valeur, langue, grand, vide }: {
  valeur: number; langue: "fr" | "en"; grand?: boolean; vide?: boolean;
}) {
  const taille = grand ? 48 : 44;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: espaces.sm }}>
      <Texte taille={taille} poids="demi" chiffresAlignes ton={vide ? "pale" : "normal"}
             maxFontSizeMultiplier={1.2} adjustsFontSizeToFit numberOfLines={1}
             style={{ letterSpacing: -1 }}>
        {nombre(valeur, langue)}
      </Texte>
      <Texte taille={textes.intertitre} ton="pale" poids="moyen">FCFA</Texte>
    </View>
  );
}

/**
 * UN VRAI CHAMP. On y tape, on y colle (appui long → Coller), on corrige au
 * milieu : tout ce qu'un champ du téléphone sait faire ailleurs. Il accepte
 * n'importe quel texte — un numéro recopié avec « +237 » et des espaces, un
 * montant avec « FCFA » — et dit dessous ce qui partira réellement. Quand il
 * ne sait pas lire UN numéro (deux numéros différents dans le même collage),
 * il le dit, et rien ne part.
 *
 * Le clavier est celui du téléphone, le bon pour chaque champ : sur iPhone,
 * `ChampTexte` lui ajoute la barre « Terminé » qui manque aux claviers de
 * chiffres, et la feuille se pousse au-dessus de lui.
 */
function ChampSaisie({ type, valeur, onChange, onValider, langue, focus = true, masque = false,
                      libre = false }: {
  type: TypeSaisie; valeur: string; onChange: (v: string) => void;
  onValider: () => void; langue: "fr" | "en";
  /** Le clavier s'ouvre tout seul — pas sur un menu, où il couvrirait les choix. */
  focus?: boolean;
  /** Ce qu'on tape ne s'affiche pas (une réponse pendant le code secret). */
  masque?: boolean;
  /** Une réponse à l'opérateur : le type ne choisit que le clavier, rien
   *  n'est refusé (`reponseLibre`). « 1 », « 00 », « # » partent tels quels. */
  libre?: boolean;
}) {
  const t = textesGuichet[langue];
  const { perdue } = useSession();
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
    if (!propre) annonce = { texte: t.montantIntrouvable, doute: true };
    else if (propre !== brut && nombre(Number(propre), langue) !== brut) {
      annonce = { texte: t.partira(`${nombre(Number(propre), langue)} FCFA`) };
    }
  }
  const chiffres = type !== "texte";
  // LE NUMÉRO ET LE MONTANT S'ÉCRIVENT LISIBLES, À MESURE QU'ON TAPE :
  // « 677 12 34 56 », « 250 000 ». Neuf chiffres collés, on ne voyait pas
  // qu'il en manquait un ; un zéro de trop ne sautait pas aux yeux. Pas sur
  // une réponse libre à l'opérateur : « 00 », « # » y partent tels quels.
  const enForme = !libre && (type === "numero" || type === "montant");
  const changer = (v: string) => onChange(
    enForme ? enFormeDansLeChamp(type, apresEffacement(valeur, v), langue) : v);
  // Assez grands pour se lire d'un coup d'œil, le téléphone à bout de bras.
  const tailleChiffres = enForme ? 32 : 24;
  return (
    <View style={{ alignSelf: "stretch" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                     borderBottomWidth: 2, borderColor: couleurs.encre }}>
        <ChampTexte
          value={valeur}
          onChangeText={changer}
          autoFocus={focus}
          secureTextEntry={masque}
          // Pendant la session, le pavé du téléphone porte « * » et « # » :
          // « # » (retour) doit pouvoir se taper même sur une question de montant.
          keyboardType={type === "numero" || (libre && type === "montant") ? "phone-pad"
            : type === "montant" ? "number-pad" : "default"}
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          returnKeyType="done"
          onSubmitEditing={onValider}
          placeholder={type === "numero" ? t.numeroPlaceholder
            : type === "montant" ? "0" : t.reponsePlaceholder}
          placeholderTextColor={couleurs.encrePale}
          accessibilityLabel={type === "numero" ? t.numeroPlaceholder
            : type === "montant" ? t.combien : t.reponsePlaceholder}
          style={{
            // `minWidth: 0` : sans lui, un champ « flex » prend la largeur de
            // son texte — un numéro collé ou l'invite le poussaient hors de
            // l'écran, à droite.
            flex: 1, minWidth: 0, paddingVertical: espaces.sm, color: couleurs.encre,
            fontFamily: chiffres ? polices.demi : polices.moyen,
            fontSize: chiffres ? tailleChiffres : textes.titre,
            fontVariant: chiffres ? ["tabular-nums"] : undefined,
            letterSpacing: enForme ? 0.5 : undefined,
            textAlign: type === "montant" ? "right" : "left",
          }}
        />
        {type === "montant" ? (
          <Texte taille={enForme ? textes.titre : textes.intertitre} ton="pale" poids="moyen">FCFA</Texte>
        ) : null}
      </View>
      <Texte taille={textes.petit} ton={annonce?.doute ? "negatif" : "doux"}
             accessibilityLiveRegion="polite"
             style={{ marginTop: espaces.sm, minHeight: 20 }}>
        {annonce?.texte ?? ""}
      </Texte>
    </View>
  );
}

/** UNE QUESTION DU FORMULAIRE, SUR UN ÉCRAN À ELLE : la question, le champ,
 *  les montants de tous les jours ou les visages déjà connus, « Continuer ». */
function EtapeSaisie({
  titre, type, valeur, onChange, recents, onRecent, bouton, onValider, langue,
}: {
  titre: string;
  type: TypeChamp;
  valeur: string;
  onChange: (v: string) => void;
  recents?: (ClientRecent & { enregistre?: boolean })[];
  onRecent: (numero: string) => void;
  bouton: string;
  onValider: () => void;
  langue: "fr" | "en";
}) {
  const t = textesGuichet[langue];
  const { perdue } = useSession();
  const valide = pret(type, valeur);
  const propre = valeurPropre(type, valeur);
  const valider = () => { if (valide) onValider(); };

  return (
    <View style={{ flex: 1 }}>
      <Defilement contentContainerStyle={{ padding: espaces.xl, gap: espaces.xl }}>
        <Texte taille={textes.titre} poids="demi" style={{ lineHeight: 32 }}>{titre}</Texte>
        <ChampSaisie type={type} valeur={valeur} onChange={onChange}
                     onValider={valider} langue={langue} />

        {/* Les montants de tous les jours, sous le montant. */}
        {type === "montant" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
            {MONTANTS.map((m) => {
              const choisi = Number(propre) === m;
              return (
                <Pressable key={m} accessibilityRole="button" onPress={() => onChange(enFormeDansLeChamp("montant", String(m), langue))}
                  style={({ pressed }) => ({
                    paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                    borderRadius: rayons.rond,
                    backgroundColor: choisi ? couleurs.encre
                      : pressed ? couleurs.surface3 : couleurs.surface2,
                  })}>
                  <Texte taille={textes.petit} poids="moyen" chiffresAlignes
                         style={choisi ? { color: couleurs.surfaceHaute } : undefined}>
                    {nombre(m, langue)}
                  </Texte>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* UN NUMÉRO DÉJÀ VU SE CHOISIT, IL NE SE RETAPE PAS. La faute de
            frappe sur le chiffre vers lequel l'argent part est la plus chère
            de toutes. Un visage, un prénom : on reconnaît avant de lire. */}
        {recents?.length ? (
          <View style={{ gap: espaces.sm }}>
            <Texte taille={textes.legende} ton="pale">
              {recents.some((r) => r.enregistre)
                ? textesBeneficiaires[langue].vosBenef : t.clientsRecents}
            </Texte>
            <Defilement horizontal showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: espaces.md }}>
              {recents.map((r) => (
                <Visage key={r.numero} client={r}
                        choisi={numeroPropre(r.numero) === numeroPropre(propre)}
                        onPress={() => onRecent(r.numero)} />
              ))}
            </Defilement>
          </View>
        ) : null}
      </Defilement>
      <GrosBouton libelle={bouton} desactive={!valide} onPress={valider} />
    </View>
  );
}

/**
 * RÉPONDRE À L'OPÉRATEUR, quand il pose une question que l'application ne
 * sert pas seule. Un vrai champ, là aussi : il accepte des LETTRES. Une
 * question qu'on ne savait pas classer ouvrait un pavé de chiffres — et un
 * opérateur qui demandait un motif, un nom, une référence ne pouvait pas
 * recevoir de réponse.
 */
function ZoneReponse({ type, entete, recents, onEnvoyer, langue, reduit, choix = [], onChoix,
                      secretement = false, onRevenir }: {
  type: TypeSaisie;
  entete: React.ReactNode;
  recents?: (ClientRecent & { enregistre?: boolean })[];
  onEnvoyer: (valeur: string) => void;
  langue: "fr" | "en";
  reduit: boolean;
  /** Les choix que l'écran de l'opérateur propose — des RACCOURCIS. Le
   *  message reste entier au-dessus ; le champ reste là en dessous. */
  choix?: { numero: string; libelle: string }[];
  onChoix?: (numero: string) => void;
  /** Pendant le code secret : la réponse part protégée comme un code. */
  secretement?: boolean;
  onRevenir?: () => void;
}) {
  const t = textesGuichet[langue];
  const [valeur, setValeur] = useState("");
  // LE TYPE NE REFUSE RIEN. Un écran lu « numéro » qui demandait en fait
  // « 1=Oui 2=Non » laissait Envoyer éteint sur « 1 » : on ne pouvait ni
  // confirmer, ni revenir, ni annuler. Voir `@noyau/deroule`.
  const valide = reponsePrete(type, valeur);
  const envoyer = () => {
    if (!valide) return;
    onEnvoyer(reponseLibre(type, valeur));
    setValeur("");
  };
  // UNE ZONE DE RÉPONSE, TOUJOURS. Sur le téléphone, chaque message de
  // l'opérateur arrive avec sa case à remplir ; ici, la case se cachait
  // derrière un petit lien « Taper une autre réponse » qu'on ne voyait pas.
  // Les choix lus dans le message sont des raccourcis en plus — jamais à
  // la place : si la lecture se trompe, on tape ce qu'on veut.
  return (
    <Animated.View style={{ flex: 1 }}
      entering={reduit ? undefined : FadeInDown.duration(240)}>
      <Defilement contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg }}>
        {entete}
        {choix.length && onChoix ? (
          <View style={{ gap: espaces.sm }}>
            {choix.map((c) => (
              <Choix key={`${c.numero}-${c.libelle}`} numero={c.numero} libelle={c.libelle}
                     onPress={() => onChoix(c.numero)} />
            ))}
          </View>
        ) : null}
        <View style={{ paddingHorizontal: espaces.xs, gap: espaces.xs }}>
          <Texte taille={textes.petit} ton="doux" poids="moyen">{t.votreReponse}</Texte>
          <ChampSaisie type={type} valeur={valeur} onChange={setValeur}
                       onValider={envoyer} langue={langue}
                       focus={choix.length === 0} masque={secretement} libre />
          {secretement ? (
            <Texte taille={textes.legende} ton="pale">{t.reponseProtegee}</Texte>
          ) : null}
        </View>
        {recents?.length ? (
          <Defilement horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: espaces.md }}>
            {recents.map((r) => (
              <Visage key={r.numero} client={r} choisi={false} onPress={() => onEnvoyer(r.numero)} />
            ))}
          </Defilement>
        ) : null}
        {onRevenir ? (
          <Pressable accessibilityRole="button" onPress={onRevenir} hitSlop={8}
            style={({ pressed }) => ({ alignSelf: "center", padding: espaces.sm,
                                        opacity: pressed ? 0.5 : 1 })}>
            <Texte taille={textes.petit} ton="doux" style={{ textDecorationLine: "underline" }}>
              {t.revenirAuPave}
            </Texte>
          </Pressable>
        ) : null}
      </Defilement>
      <GrosBouton libelle={t.envoyer} desactive={!valide} onPress={envoyer} />
    </Animated.View>
  );
}

/**
 * L'ÉCRAN EN COURS DE L'OPÉRATEUR — un seul, comme sur le téléphone. Qui
 * parle, ce qu'il dit, mot pour mot, et ses choix en boutons. Il entre en
 * montant doucement : on voit qu'un nouvel écran est arrivé.
 */
function EcranOperateur({ texte, copie, op, couleur, t, reduit, serre, choix, onChoix, onAutre }: {
  texte: string; copie: string; op: string; couleur: string; t: T; reduit: boolean;
  /** Le pavé du code partage l'écran : le message se fait plus compact. */
  serre?: boolean;
  choix: { numero: string; libelle: string }[];
  onChoix: (numero: string) => void;
  onAutre?: () => void;
}) {
  return (
    <Animated.View style={{ flex: 1 }}
      entering={reduit ? undefined : FadeInDown.duration(240)}>
      <Defilement contentContainerStyle={{ padding: espaces.lg, gap: espaces.md }}>
        <CarteOperateur texte={texte} copie={copie} op={op} couleur={couleur} t={t}
                        serre={serre} />
        {choix.length ? (
          <View style={{ gap: espaces.sm }}>
            {choix.map((c) => (
              <Choix key={`${c.numero}-${c.libelle}`} numero={c.numero} libelle={c.libelle}
                     onPress={() => onChoix(c.numero)} />
            ))}
          </View>
        ) : null}
        {onAutre ? (
          <Pressable accessibilityRole="button" onPress={onAutre} hitSlop={8}
            style={({ pressed }) => ({ alignSelf: "center", padding: espaces.sm,
                                        opacity: pressed ? 0.5 : 1 })}>
            <Texte taille={textes.petit} ton="doux">{t.autreReponse}</Texte>
          </Pressable>
        ) : null}
      </Defilement>
    </Animated.View>
  );
}

/** Le message de l'opérateur, dans sa carte : qui parle, le texte entier,
 *  « Copier ». */
function CarteOperateur({ texte, copie, op, couleur, t, serre }: {
  texte: string; copie: string; op: string; couleur: string; t: T; serre?: boolean;
}) {
  const { height } = useWindowDimensions();
  // CE QU'ON SIGNE DOIT TENIR À L'ÉCRAN AVEC LE PAVÉ. Sur un petit iPhone,
  // le message de l'opérateur en grand (20 points) et le pavé du code
  // dessous ne tenaient pas ensemble : on ne voyait plus que la fin —
  // « Entrez votre code secret » — et l'on signait sans lire le montant ni
  // le nom. Quand le pavé est là et que l'écran est court, le message passe
  // à la taille du texte courant : un écran USSD fait au plus 182
  // caractères, qui tiennent alors en entier au-dessus du pavé.
  const compact = serre && height < 900;
  const [copiee, setCopiee] = useState(false);
  const copier = () => {
    // Voir `presse-papiers.ts`. Le texte reste de toute façon sélectionnable
    // à l'appui long.
    if (!copierTexte(copie)) return;
    setCopiee(true);
    setTimeout(() => setCopiee(false), 1600);
  };
  return (
    <View style={{
      borderRadius: 20, borderWidth: 1, borderColor: couleurs.trait,
      backgroundColor: couleurs.surfaceHaute, gap: espaces.sm,
      paddingHorizontal: espaces.lg, paddingVertical: espaces.md,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: rayons.rond, backgroundColor: couleur }} />
        <Texte taille={textes.legende} ton="pale" poids="moyen" style={{ flex: 1 }}>{op}</Texte>
        <Pressable accessibilityRole="button" onPress={copier} hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Texte taille={textes.legende} ton="pale">{copiee ? t.copie : t.copier}</Texte>
        </Pressable>
      </View>
      {/* Le texte du réseau, mot pour mot : jamais traduit, toujours entier,
          et sélectionnable — appui long → Copier. */}
      {texte ? (
        <Texte selectable taille={compact ? textes.corps : textes.intertitre}
               style={{ lineHeight: compact ? 22 : 27 }}>
          {texte}
        </Texte>
      ) : null}
    </View>
  );
}

/**
 * LE RÉSEAU RÉPOND — comme le « code USSD en cours » d'un téléphone. Un rond
 * qui respire à la couleur de l'opérateur, une phrase, et ce qu'on vient
 * d'envoyer : on sait qu'on a été entendu, et l'écran ne reste jamais blanc.
 * Le souffle tourne sur le fil de l'interface (Reanimated) : il ne retient
 * rien, même quand le réseau traîne.
 */
function Patience({ texte, couleur, envoye, t, reduit }: {
  texte: string; couleur: string; envoye: string | null; t: T; reduit: boolean;
}) {
  const souffle = useSharedValue(0);
  useEffect(() => {
    if (reduit) return;
    souffle.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduit]);
  const anneau = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + souffle.value * 0.25 }],
    opacity: 0.3 - souffle.value * 0.2,
  }));
  return (
    <Animated.View accessibilityLiveRegion="polite"
      entering={reduit ? undefined : FadeIn.duration(200)}
      style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: espaces.lg,
               paddingHorizontal: espaces.xl }}>
      <View style={{ width: 96, height: 96, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={[{
          position: "absolute", width: 96, height: 96, borderRadius: rayons.rond,
          backgroundColor: couleur,
        }, anneau]} />
        <View style={{ width: 60, height: 60, borderRadius: rayons.rond, borderWidth: 3,
                       borderColor: couleur, backgroundColor: couleurs.surfaceHaute,
                       alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 10, height: 10, borderRadius: rayons.rond,
                         backgroundColor: couleur }} />
        </View>
      </View>
      <Texte taille={textes.intertitre} poids="moyen" style={{ textAlign: "center" }}>
        {texte}
      </Texte>
      {envoye ? (
        <View style={{ backgroundColor: couleurs.surface2, borderRadius: rayons.rond,
                       paddingHorizontal: espaces.md, paddingVertical: espaces.xs + 2 }}>
          <Texte taille={textes.petit} ton="doux" chiffresAlignes>{t.envoye(envoye)}</Texte>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** Un client récent : ses initiales dans un rond, son prénom dessous. */
function Visage({ client, choisi, onPress }: {
  client: ClientRecent; choisi: boolean; onPress: () => void;
}) {
  const nom = client.nom.trim();
  const mots = nom.split(/\s+/).filter(Boolean);
  const initiales = mots.length
    ? (mots[0][0] + (mots[1]?.[0] ?? "")).toUpperCase()
    : client.numero.slice(-2);
  // Dans une LISTE, on coupe : les visages s'alignent, l'œil parcourt. Mais
  // sur DEUX lignes : deux « Nkengafac » se distinguent par le second mot.
  const court = mots.length
    ? mots.slice(0, 2).map((m) => m[0] + m.slice(1).toLowerCase()).join(" ")
    : formaterNumero(client.numero);
  return (
    <Pressable accessibilityRole="button"
               accessibilityLabel={`${nom || ""} ${formaterNumero(client.numero)}`.trim()}
               onPress={onPress}
               style={({ pressed }) => ({ width: 72, alignItems: "center", gap: espaces.xs,
                                           opacity: pressed ? 0.6 : 1 })}>
      <View style={{
        width: 52, height: 52, borderRadius: rayons.rond, alignItems: "center",
        justifyContent: "center",
        backgroundColor: choisi ? couleurs.encre : couleurs.surfaceHaute,
        borderWidth: 1, borderColor: choisi ? couleurs.encre : couleurs.trait,
      }}>
        <Texte poids="demi" style={choisi ? { color: couleurs.surfaceHaute } : undefined}>
          {initiales}
        </Texte>
      </View>
      <Texte taille={textes.legende} ton="doux" numberOfLines={2}
             style={{ textAlign: "center", lineHeight: 15 }}>{court}</Texte>
    </Pressable>
  );
}

/**
 * LE PAVÉ — à nous, dans l'écran. Trois colonnes, quatre rangées, de grandes
 * touches sans bordure qui s'éclairent sous le doigt.
 */
function Pave({ onChiffre, onEffacer, etiquetteEffacer }: {
  onChiffre: (c: string) => void;
  onEffacer: () => void;
  etiquetteEffacer: string;
}) {
  const { height } = useWindowDimensions();
  // La hauteur d'une touche suit celle de l'écran : sur un petit téléphone,
  // chaque point gagné sur le pavé va au message de l'opérateur, au-dessus.
  // Quarante points restent une touche confortable sous le pouce.
  const haut = height < 700 ? 40 : height < 800 ? 44 : height < 900 ? 50 : 54;
  const rangees: (string | null)[][] = [
    ["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [null, "0", "⌫"],
  ];
  return (
    <View style={{ paddingHorizontal: espaces.lg, paddingBottom: espaces.sm }}>
      {rangees.map((r, i) => (
        <View key={i} style={{ flexDirection: "row" }}>
          {r.map((x, j) => x == null ? <View key={j} style={{ flex: 1, height: haut }} /> : (
            <Pressable key={j} accessibilityRole="button"
              accessibilityLabel={x === "⌫" ? etiquetteEffacer : x}
              onPress={() => (x === "⌫" ? onEffacer() : onChiffre(x))}
              style={({ pressed }) => ({
                flex: 1, height: haut, alignItems: "center", justifyContent: "center",
                borderRadius: rayons.carte * 2,
                backgroundColor: pressed ? couleurs.surface2 : "transparent",
              })}>
              <Texte taille={26}
                     poids={x === "⌫" ? "normal" : "moyen"} chiffresAlignes
                     maxFontSizeMultiplier={1.1}
                     ton={x === "⌫" ? "doux" : "normal"}>
                {x}
              </Texte>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Le grand bouton du bas — un seul par écran. */
function GrosBouton({ libelle, onPress, desactive }: {
  libelle: string; onPress: () => void; desactive?: boolean;
}) {
  const { height } = useWindowDimensions();
  return (
    <View style={{ paddingHorizontal: espaces.lg }}>
      <Pressable accessibilityRole="button" disabled={desactive} onPress={onPress}
        accessibilityState={{ disabled: Boolean(desactive) }}
        style={({ pressed }) => ({
          height: height < 800 ? 48 : 56,
          borderRadius: 14, alignItems: "center", justifyContent: "center",
          backgroundColor: desactive ? couleurs.surface3
            : pressed ? couleurs.accentAppui : couleurs.accent,
          transform: [{ scale: pressed && !desactive ? 0.98 : 1 }],
        })}>
        <Texte poids="demi" taille={17}
               style={{ color: desactive ? couleurs.encrePale : couleurs.surfaceHaute }}>
          {libelle}
        </Texte>
      </Pressable>
    </View>
  );
}

/** La carte d'où part l'opération : le logo de l'opérateur et son nom, sur
 *  une ligne de légende — sans cadre, pour ne rien prendre en hauteur. */
function PastilleCarte({ libelle, operateur }: { libelle: string; operateur: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs,
                   maxWidth: "100%" }}>
      {operateurReconnu(operateur) ? (
        <LogoOperateur operateur={operateur} taille={12} />
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: rayons.rond,
                       backgroundColor: couleurOperateur(operateur) }} />
      )}
      <Texte taille={textes.legende} ton="pale" numberOfLines={1} style={{ flexShrink: 1 }}>
        {libelle}
      </Texte>
    </View>
  );
}

/** Une rangée de la vérification : l'étiquette pâle à gauche, la valeur à
 *  droite, entière — sur deux lignes s'il le faut, jamais coupée. */
function RangeeRecap({ etiquette, children }: { etiquette: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: espaces.md,
                   paddingHorizontal: espaces.lg, paddingVertical: espaces.md }}>
      <Texte taille={textes.petit} ton="pale" style={{ paddingTop: 2 }}>{etiquette}</Texte>
      <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>{children}</View>
    </View>
  );
}

/**
 * LE CODE SECRET. Des points, le pavé, « Valider ». Les chiffres ne vivent
 * que dans l'état de ce composant : jamais affichés, jamais journalisés,
 * envoyés seulement à « Valider » — puis aussitôt oubliés ici, et masqués
 * en base par le robot sitôt lus. Trois choses qu'on serait tenté
 * d'ajouter, et qu'il ne faut PAS : le clavier du système (suggestions,
 * historique, claviers tiers), un « afficher le code » (le pavé sert dans un
 * taxi, dans une file), une vibration par chiffre (son rythme donne la
 * longueur du code).
 */
function EtapeCode({ onValider, onAutre, t }: {
  onValider: (code: string) => void; onAutre: () => void; t: T;
}) {
  const [code, setCode] = useState("");
  const { height } = useWindowDimensions();
  // Sur un écran court, la note (« jamais enregistré ») se tait : le cadenas
  // le dit déjà, et ses deux lignes reviennent au message de l'opérateur.
  const court = height < 800;
  const valider = () => {
    if (code.length < LONGUEUR_CODE_MIN) return;
    onValider(code);
    setCode("");            // rien ne subsiste après l'envoi
  };
  return (
    // Posé SOUS l'échange, pas à sa place : le message qui réclame le code
    // — ce qu'on va signer — reste lisible juste au-dessus.
    <View style={{ borderTopWidth: 1, borderColor: couleurs.trait,
                   paddingTop: court ? espaces.sm : espaces.md }}>
      <View style={{ alignItems: "center", gap: espaces.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <Icone nom="Lock" taille={court ? 16 : 18} couleur={couleurs.encre} />
          <Texte taille={court ? textes.corps : textes.intertitre} poids="demi">{t.codeTitre}</Texte>
        </View>
        {court ? null : <Texte taille={textes.legende} ton="pale">{t.codeNote}</Texte>}
        <View accessibilityLabel={t.chiffresComposes(code.length)}
              style={{ flexDirection: "row", gap: espaces.md,
                       marginVertical: court ? espaces.xs : espaces.sm,
                       height: 16, alignItems: "center" }}>
          {Array.from({ length: Math.max(LONGUEUR_CODE_MIN, code.length) }).map((_, i) => (
            <View key={i} style={{
              width: 14, height: 14, borderRadius: rayons.rond,
              backgroundColor: i < code.length ? couleurs.encre : "transparent",
              borderWidth: 1.5, borderColor: i < code.length ? couleurs.encre : couleurs.encrePale,
            }} />
          ))}
        </View>
      </View>
      <Pave onChiffre={(x) => setCode((v) => (v.length >= LONGUEUR_CODE_MAX ? v : v + x))}
            onEffacer={() => setCode((v) => v.slice(0, -1))}
            etiquetteEffacer={t.effacerDernier} />
      {/* LE PAVÉ N'EST PAS UNE PRISON. La lecture a vu « code » dans le
          message ; elle peut se tromper, ou l'opérateur attendre autre chose
          (« 1 » pour confirmer, « 0 » pour revenir). On peut toujours
          répondre autrement — et ce qu'on tape alors part protégé comme un
          code, au cas où ce SERAIT le code. */}
      <Pressable accessibilityRole="button" onPress={onAutre}
        style={({ pressed }) => ({
          alignSelf: "center", marginTop: court ? 0 : espaces.xs,
          // De l'air sous lui : collé à « Valider », on visait l'un pour l'autre.
          marginBottom: espaces.md,
          paddingVertical: espaces.sm, paddingHorizontal: espaces.lg,
          borderRadius: rayons.bouton, borderWidth: 1, borderColor: couleurs.trait,
          backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
        })}>
        <Texte taille={textes.petit} poids="moyen">{t.repondreAutrement}</Texte>
      </Pressable>
      <GrosBouton libelle={t.valider} desactive={code.length < LONGUEUR_CODE_MIN}
                  onPress={valider} />
    </View>
  );
}

/** Un choix du menu de l'opérateur : une rangée qu'on touche. */
function Choix({ numero, libelle, onPress }: {
  numero: string; libelle: string; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: espaces.md,
        paddingHorizontal: espaces.lg, paddingVertical: espaces.md + 2,
        borderRadius: 14, borderWidth: 1, borderColor: couleurs.trait,
        backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
        // Le doigt se sent : le choix s'enfonce d'un rien sous lui.
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      <View style={{ width: 28, height: 28, borderRadius: rayons.rond,
                     backgroundColor: couleurs.surface2, alignItems: "center",
                     justifyContent: "center" }}>
        <Texte taille={textes.petit} ton="doux" chiffresAlignes>{numero}</Texte>
      </View>
      <Texte taille={17} poids="moyen" style={{ flex: 1 }}>{libelle}</Texte>
      <Icone nom="Chevron" taille={18} couleur={couleurs.encrePale} />
    </Pressable>
  );
}

/** C'est fini : ce que l'opérateur a dit, en une phrase et une couleur. */
function Fin({
  issue, titre, texte, note, fil, details, onDetails, repondreQuandMeme,
  bouton, onTerminer, t, proposition,
}: {
  proposition?: React.ReactNode;
  issue: Issue;
  titre: string;
  texte: string;
  note?: string;
  fil: Msg[];
  details: boolean;
  onDetails: () => void;
  repondreQuandMeme?: () => void;
  bouton: string;
  onTerminer: () => void;
  t: T;
}) {
  const icone: NomIcone = issue === "reussie" ? "Check"
    : issue === "reponse" ? "Bubble" : issue === "incertaine" ? "Inbox" : "Close";
  const teinte = issue === "reussie" ? couleurs.positifVif
    : issue === "reponse" || issue === "incertaine" ? couleurs.encre : couleurs.negatif;
  // LA COCHE SE POSE : elle grossit d'un rien en apparaissant, 240 ms —
  // le FadeIn de 300 ms dépassait la borne de l'application. Rien ne
  // rebondit. « Réduire les animations » : elle est là, immobile.
  const reduit = useMouvementReduit();
  const avance = useSharedValue(reduit ? 1 : 0);
  useEffect(() => {
    avance.value = reduit ? 1 : withTiming(1, { duration: 240, easing: COURBE });
  }, [reduit, avance]);
  const arrivee = useAnimatedStyle(() => ({
    opacity: avance.value,
    transform: [{ scale: 0.92 + 0.08 * avance.value }],
  }));
  return (
    <View style={{ flex: 1 }}>
      <Defilement contentContainerStyle={{
        flexGrow: 1, justifyContent: "center", alignItems: "center",
        padding: espaces.xl, gap: espaces.lg,
      }}>
        <Animated.View style={[{
          width: 88, height: 88, borderRadius: rayons.rond, alignItems: "center",
          justifyContent: "center", backgroundColor: teinte,
        }, arrivee]}>
          <Icone nom={icone} taille={40} couleur={couleurs.surfaceHaute} />
        </Animated.View>
        <Texte taille={textes.titre} poids="demi" style={{ textAlign: "center" }}>
          {titre}
        </Texte>
        {/* Le texte du réseau, mot pour mot : jamais traduit. Pour une simple
            réponse (un solde, un numéro), c'est lui l'information — en grand. */}
        {texte ? (
          <Texte selectable taille={issue === "reponse" ? textes.intertitre : textes.corps}
                 ton={issue === "reponse" ? "normal" : "doux"}
                 style={{ textAlign: "center", lineHeight: issue === "reponse" ? 28 : 22 }}>
            {texte}
          </Texte>
        ) : null}
        {note ? (
          <Texte taille={textes.petit} ton="pale" style={{ textAlign: "center", lineHeight: 20 }}>
            {note}
          </Texte>
        ) : null}
        {proposition}
        {repondreQuandMeme ? (
          // Un vrai bouton, pas un lien gris : quand le boîtier ne dit pas
          // si le réseau attend encore, c'est la seule porte vers la suite.
          <Pressable accessibilityRole="button" onPress={repondreQuandMeme}
            style={({ pressed }) => ({
              paddingVertical: espaces.md, paddingHorizontal: espaces.xl,
              borderRadius: rayons.bouton, borderWidth: 1.5, borderColor: couleurs.encre,
              backgroundColor: pressed ? couleurs.surface2 : "transparent",
            })}>
            <Texte poids="demi">{t.repondreQuandMeme}</Texte>
          </Pressable>
        ) : null}

        {/* L'ÉCHANGE ENTIER, d'un geste : ce qu'on a envoyé, ce que
            l'opérateur a répondu. Le code secret n'y est jamais — quatre
            points. */}
        {fil.length > 1 ? (
          <Pressable accessibilityRole="button" onPress={onDetails} hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginTop: espaces.md })}>
            <Texte taille={textes.petit} ton="doux">
              {details ? t.masquerDetails : t.details}
            </Texte>
          </Pressable>
        ) : null}
        {details ? (
          <View style={{ alignSelf: "stretch", gap: espaces.sm }}>
            {fil.map((m, k) => (
              <View key={k} style={{
                alignSelf: m.de === "vous" ? "flex-end" : "flex-start", maxWidth: "85%",
                backgroundColor: m.de === "vous" ? couleurs.accent : couleurs.surfaceHaute,
                borderRadius: 14, paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
              }}>
                <Texte taille={textes.petit} selectable
                       style={m.de === "vous" ? { color: couleurs.surfaceHaute } : undefined}>
                  {m.texte}
                </Texte>
              </View>
            ))}
          </View>
        ) : null}
      </Defilement>
      <GrosBouton libelle={bouton} onPress={onTerminer} />
    </View>
  );
}

/**
 * « Enregistrer ce bénéficiaire ? » — à la fin d'un transfert réussi. Le nom
 * est déjà écrit (celui de l'opérateur) ; on peut le raccourcir — « Maman »
 * se retrouve mieux que « NKENGAFAC MBOUNGOU JEANNE-CLAIRE EPSE TCHOUMI ».
 */
function ProposerBeneficiaire({ carte, numero, nomInitial, langue, onFait }: {
  carte: string; numero: string; nomInitial: string; langue: "fr" | "en";
  onFait?: () => void;
}) {
  const tb = textesBeneficiaires[langue];
  const [nom, setNom] = useState(nomInitial);
  const [etat, setEtat] = useState<"repos" | "envoi" | "fait" | "erreur">("repos");
  const enCours = useRef(false);
  const enregistrer = async () => {
    if (enCours.current || !nom.trim()) return;
    enCours.current = true;
    setEtat("envoi");
    try {
      await agirSurBeneficiaire({ geste: "enregistrer", carte, numero, nom: nomPropre(nom) });
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
        <Icone nom="Check" taille={18} couleur={couleurs.positif} />
        <Texte ton="doux">{tb.enregistre} · {nomPropre(nom)}</Texte>
      </View>
    );
  }
  return (
    <View style={{
      alignSelf: "stretch", backgroundColor: couleurs.surfaceHaute, borderRadius: 14,
      padding: espaces.lg, gap: espaces.md, borderWidth: 1, borderColor: couleurs.trait,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
        <Icone nom="Personnes" taille={20} couleur={couleurs.encre} />
        <Texte poids="demi">{tb.enregistrerCeBenef}</Texte>
      </View>
      <ChampTexte value={nom} onChangeText={setNom} placeholder={tb.nomAide}
                  placeholderTextColor={couleurs.encrePale} autoCapitalize="words"
                  style={{
                    borderBottomWidth: 1.5, borderColor: couleurs.encre,
                    paddingVertical: espaces.sm, fontFamily: polices.moyen,
                    fontSize: textes.intertitre, color: couleurs.encre,
                  }} />
      <Texte taille={textes.petit} ton="pale" chiffresAlignes>{formaterNumero(numero)}</Texte>
      {etat === "erreur" ? <Texte taille={textes.petit} ton="negatif">{tb.echec}</Texte> : null}
      <Pressable accessibilityRole="button" disabled={!nom.trim() || etat === "envoi"}
        onPress={() => void enregistrer()}
        style={({ pressed }) => ({
          alignSelf: "flex-start", paddingHorizontal: espaces.lg, paddingVertical: espaces.sm + 2,
          borderRadius: rayons.rond,
          backgroundColor: !nom.trim() ? couleurs.surface3
            : pressed ? couleurs.accentAppui : couleurs.accent,
        })}>
        <Texte poids="demi" taille={textes.petit} style={{ color: couleurs.surfaceHaute }}>
          {tb.enregistrer}
        </Texte>
      </Pressable>
    </View>
  );
}
