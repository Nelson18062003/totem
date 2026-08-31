// L'analyse de la semaine : les sept derniers jours, le total, la comparaison
// avec la semaine d'avant, les clients qui reviennent.
//
// POURQUOI CE FICHIER EXISTE. Ce calcul était écrit DEUX FOIS — dans
// `web/app/analyse/page.tsx` et dans `mobile/src/app/analyse.tsx` —, à la
// virgule près. Deux copies d'un calcul d'argent, c'est deux chiffres qui
// finiront par diverger sans que personne ne le voie : le propriétaire
// regarde la page ou le téléphone, jamais les deux côte à côte. Une seule
// vérité, deux façons de la montrer.
//
// CE QUE LES DEUX COPIES SE TROMPAIENT ENSEMBLE. La semaine en cours se
// comptait en JOURS DE CALENDRIER (du début du jour J-6 à maintenant), la
// semaine précédente en HEURES (les 168 heures d'avant). La première fenêtre
// s'arrête à l'heure qu'il est ; la seconde est toujours pleine. Une caisse
// parfaitement régulière — mêmes encaissements, tous les jours, aux mêmes
// heures — affichait donc « −14 % » chaque matin, remontant à 0 % seulement
// après la dernière vente du soir. Un chiffre juste, comparé à la mauvaise
// chose, reste un chiffre faux : le propriétaire ouvrait sa caisse sur un
// effondrement imaginaire.
//
// Ici, la fenêtre précédente est la MÊME fenêtre, décalée de sept jours
// exactement. Les deux couvrent la même durée, la même heure de fin, le même
// moment de la journée. Une caisse qui ne bouge pas affiche 0 %.

import type { Langue } from "./langue";
import { FUSEAU_DEFAUT, jourLocal, type Paiement } from "./types";

const JOUR_MS = 86_400_000;

/** Les jours montrés par le graphe, aujourd'hui compris. */
export const JOURS_MONTRES = 7;

// Un formateur par (langue, fuseau), gardé : en construire un par appel
// coûtait des milliers d'objets par rendu sur un petit téléphone.
const formateursNom = new Map<string, Intl.DateTimeFormat>();

function nomDuJour(d: Date, langue: Langue, fuseau: string): string {
  const cle = `${langue}|${fuseau}`;
  let f = formateursNom.get(cle);
  if (!f) {
    f = new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR",
      { timeZone: fuseau, weekday: "short" });
    formateursNom.set(cle, f);
  }
  // « lun. » devient « Lun », « Mon » reste « Mon » : sans point, une
  // majuscule initiale dans les deux langues.
  const nom = f.format(d).replace(".", "");
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

const formateursHeure = new Map<string, Intl.DateTimeFormat>();

/**
 * Le temps écoulé depuis minuit, vu du terminal, en millisecondes.
 *
 * On ne reconstruit pas une date : on demande au système quelle heure il est
 * LÀ-BAS, et on retranche. Le décalage du fuseau, quel qu'il soit, est déjà
 * dans la réponse — y compris les fuseaux à la demi-heure ou au quart d'heure
 * (Téhéran, Katmandou), qu'un calcul en heures pleines aurait ratés.
 *
 * Un changement d'heure survenu DANS la journée en cours décalerait ce compte
 * d'une heure. Les fuseaux d'Afrique de l'Ouest et centrale, ceux des caisses
 * servies par TOTEM, n'en ont pas ; et une heure d'écart, un jour par an, sur
 * une borne de fenêtre, ne change pas un ordre de grandeur.
 */
function depuisMinuit(instant: number, fuseau: string): number {
  let f = formateursHeure.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: fuseau, hour12: false,
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    formateursHeure.set(fuseau, f);
  }
  let h = 0, m = 0, s = 0;
  for (const p of f.formatToParts(new Date(instant))) {
    // Minuit se dit « 24 » dans certaines locales : 24 h après minuit, c'est
    // zéro heure après minuit.
    if (p.type === "hour") h = Number(p.value) % 24;
    else if (p.type === "minute") m = Number(p.value);
    else if (p.type === "second") s = Number(p.value);
  }
  return ((h * 60 + m) * 60 + s) * 1000 + (instant % 1000 + 1000) % 1000;
}

/**
 * Le début de la fenêtre de N jours qui finit maintenant.
 *
 * C'est le début du jour le plus ancien MONTRÉ, dans le fuseau du terminal —
 * pas « maintenant moins N × 24 h ». La différence n'est pas théorique : le
 * bilan CSV « la semaine » se coupait à 168 heures pendant que le graphe
 * juste au-dessus dessinait des jours de calendrier. À 18 h, le fichier
 * portait six heures d'un jour que le graphe ne montrait pas, et son total
 * ne tombait pas juste avec le chiffre affiché. Deux réponses à « la
 * semaine », dans le même écran.
 */
export function debutDeFenetre(
  maintenant: number, fuseau: string, jours: number = JOURS_MONTRES,
): number {
  return maintenant - (jours - 1) * JOUR_MS - depuisMinuit(maintenant, fuseau);
}

export type JourEncaisse = { jour: string; montant: number };
export type ClientFidele = { nom: string; nb: number; total: number };

export type ResumeSemaine = {
  /** Les sept derniers jours, du plus ancien au plus récent. */
  jours: JourEncaisse[];
  /** Ce qui est entré sur la fenêtre montrée. */
  total: number;
  /** Le même total, une semaine plus tôt, sur une fenêtre identique. */
  precedente: number;
  /** L'écart en pourcentage, ou null quand la semaine d'avant était vide. */
  evolution: number | null;
  moyenne: number;
  meilleur: JourEncaisse;
  /** La plus haute barre, jamais zéro : c'est un dénominateur. */
  max: number;
  /** Les cinq clients qui ont le plus payé, sur tout l'historique chargé. */
  clients: ClientFidele[];
};

/** Un encaissement chiffré — le reste (publicité, message, échec) ne compte pas. */
function estUnEncaissement(p: Paiement): boolean {
  return p.sens === "in" && p.montant != null;
}

/**
 * Tout ce que l'écran d'analyse montre, calculé une fois.
 *
 * `maintenant` se passe pour que les tests puissent se placer à une heure
 * précise ; en service, c'est l'instant présent.
 */
export function resumeSemaine(
  paiements: Paiement[],
  langue: Langue,
  fuseau: string = FUSEAU_DEFAUT,
  maintenant: number = Date.now(),
): ResumeSemaine {
  // Le jour de CHAQUE paiement se calcule UNE fois, dans une table — pas à
  // chaque jour de la semaine : sept passages sur mille paiements, c'était
  // des secondes de gel sur un petit Android.
  //
  // Une date illisible est ÉCARTÉE, pas propagée : `jourLocal` lève sur une
  // date invalide, et une seule ligne abîmée aurait vidé l'écran entier — la
  // page d'analyse serait tombée pour tout le monde à cause d'un caractère.
  // Mieux vaut un encaissement absent d'un graphe qu'un graphe absent.
  const parJour = new Map<string, number>();
  const encaissements: { montant: number; instant: number; client: string }[] = [];
  for (const p of paiements) {
    if (!estUnEncaissement(p)) continue;
    const instant = new Date(p.recuLe).getTime();
    if (!Number.isFinite(instant)) continue;
    // LE CLIENT, C'EST « tiers » — la personne qui a payé. « nom » est
    // l'EXPÉDITEUR du SMS (« MTNMobileMoney »), le même pour tous les
    // encaissements d'un opérateur : grouper dessus fondait tous les clients
    // en une seule ligne au nom de l'opérateur.
    encaissements.push({ montant: p.montant ?? 0, instant, client: p.tiers || p.nom });
    const cle = jourLocal(new Date(instant), fuseau);
    parJour.set(cle, (parJour.get(cle) ?? 0) + (p.montant ?? 0));
  }

  const jours: JourEncaisse[] = [];
  for (let i = JOURS_MONTRES - 1; i >= 0; i--) {
    const d = new Date(maintenant - i * JOUR_MS);
    jours.push({
      jour: nomDuJour(d, langue, fuseau),
      montant: parJour.get(jourLocal(d, fuseau)) ?? 0,
    });
  }

  // La fenêtre montrée : du début du jour le plus ancien du graphe jusqu'à
  // maintenant. C'est elle, et non « les 168 dernières heures », que le
  // graphe dessine.
  const debutFenetre = debutDeFenetre(maintenant, fuseau, JOURS_MONTRES);

  // Le total se lit sur la fenêtre, pas sur la somme des barres : un
  // encaissement daté du futur (horloge de terminal en avance) tomberait
  // dans la barre d'aujourd'hui sans appartenir à la fenêtre comparée.
  let total = 0;
  let precedente = 0;
  const debutPrecedente = debutFenetre - JOURS_MONTRES * JOUR_MS;
  const finPrecedente = maintenant - JOURS_MONTRES * JOUR_MS;
  for (const { instant, montant } of encaissements) {
    if (instant >= debutFenetre && instant <= maintenant) total += montant;
    else if (instant >= debutPrecedente && instant <= finPrecedente) precedente += montant;
  }

  const evolution = precedente > 0
    ? Math.round(((total - precedente) / precedente) * 100)
    : null;

  const parClient = new Map<string, { nb: number; total: number }>();
  for (const { client, montant } of encaissements) {
    const c = parClient.get(client) ?? { nb: 0, total: 0 };
    c.nb += 1;
    c.total += montant;
    parClient.set(client, c);
  }
  const clients = [...parClient.entries()]
    .map(([nom, v]) => ({ nom, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    jours,
    total,
    precedente,
    evolution,
    moyenne: Math.round(total / JOURS_MONTRES),
    meilleur: jours.reduce((a, b) => (b.montant > a.montant ? b : a)),
    max: Math.max(...jours.map((d) => d.montant), 1),
    clients,
  };
}
