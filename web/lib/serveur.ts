// Lecture de la base Supabase — côté serveur uniquement.
//
// Les règles de la base (sql/schema.sql) refusent toute lecture sans session :
// la clé utilisée ici ne quitte donc JAMAIS le serveur. Elle vient de deux
// variables d'environnement (sur Vercel : Settings → Environment Variables,
// en local : web/.env.local) :
//
//   SUPABASE_URL   https://xxxxxxxxxxxx.supabase.co   (docs/CLOUD.md)
//   SUPABASE_CLE   la clé de service — server-only, pas de NEXT_PUBLIC_
//
// Tant que l'application n'a pas son écran de connexion (Supabase Auth), la
// clé de service est le seul moyen de lire ; elle reste acceptable parce
// qu'elle ne transite que du serveur de l'application vers Supabase. Le jour
// où la connexion existe, on la remplace par la clé publique + session.
//
// Le Raspberry Pi reste la source de vérité : ici on ne fait que LIRE ce
// qu'il a poussé. Aucune donnée n'est inventée : sans variables, les écrans
// sont vides et le disent.

import type { Beneficiaire, Donnees, EtatTerminal, Paiement, RaccourciAppris, Sim } from "@noyau/types";
import { estNature } from "@noyau/natures";
import { estCategorie, jourLocal } from "@noyau/types";
import type { Langue } from "@noyau/langue";
import { libelleJour } from "@noyau/periodes";
import {
  ageDuSigneDeVie, boitierSansNouvelles, enPlaceSelon, presenceDeLaCarte, signalLu,
  type Presence,
} from "@noyau/boitier";
import { textesApi } from "@noyau/textes/api";
import type { Portee } from "./portee";
import {
  boitierVu, cartesLesPlusRecentes, entenduLe, leBoitierMontre, type LigneBoitier,
} from "./boitiers";

const url = process.env.SUPABASE_URL;
const cle = process.env.SUPABASE_CLE;

export const relie = Boolean(url && cle);

// Le fuseau du terminal, réglable (voir lib/fuseau.ts). Il découpe les
// journées : c'est la caisse qui décide de ce qu'est « aujourd'hui ».
import { FUSEAU } from "./fuseau";
import { AsyncLocalStorage } from "node:async_hooks";
import { lireDansLaDemonstration, tablesDeDemonstration } from "./demonstration";

// LA SOURCE DE LA DÉMONSTRATION. Quand une lecture se fait « dans » la
// démonstration, `lire` répond depuis ce jeu inventé et ne touche JAMAIS la
// base : il n'y a pas de chemin, même mal filtré, par lequel une vraie ligne
// arriverait à l'examinateur. Le contexte suit l'appel et lui seul — deux
// requêtes simultanées, l'une du propriétaire, l'autre de l'examinateur, ne
// se mélangent pas.
const sourceDeDemonstration = new AsyncLocalStorage<Record<string, Record<string, unknown>[]>>();

/**
 * Le chemin d'une requête, SANS ce qu'elle cherchait — pour le journal.
 *
 * Un chemin porte parfois une donnée personnelle : la recherche d'un compte
 * s'écrit « utilisateurs?courriel=eq.nom@exemple.cm ». Journalisé tel quel, à
 * la moindre erreur de la base, le courriel du propriétaire (ou d'un invité)
 * se retrouvait écrit dans les journaux du serveur, qui se gardent longtemps
 * et se lisent à plusieurs.
 *
 * On garde ce qui sert à comprendre la panne — la table, les filtres employés
 * — et on retire les valeurs. Un journal doit dire QUELLE requête a échoué,
 * pas ce qu'elle cherchait.
 */
/** Colonne ou table absente : la base n'a pas encore reçu sa migration. */
function defautDeSchema(corps: string): boolean {
  const c = corps.toLowerCase();
  return c.includes("pgrst204") || c.includes("pgrst205") || c.includes("42703")
    || c.includes("schema cache") || c.includes("could not find")
    || c.includes("does not exist");
}

function sansValeurs(chemin: string): string {
  return chemin.replace(
    /(=(?:eq|neq|ilike|like|lt|lte|gt|gte|in|is)\.)[^&]*/gi, "$1…");
}

/**
 * Une lecture qui dit AUSSI combien de lignes la base avait à donner.
 *
 * PostgREST répond « content-range: 0-999/1834 » quand on le lui demande :
 * mille lignes rendues, mille huit cent trente-quatre disponibles. Sans ce
 * total, une lecture plafonnée est indiscernable d'une lecture complète — le
 * bilan d'un trimestre s'arrêtait à mille lignes et ne le disait à personne.
 *
 * Le comptage exact coûte un parcours à la base : il ne se demande que là où
 * la troncature serait un mensonge (l'export comptable), pas à chaque page.
 */
async function lireEtCompter<T>(chemin: string): Promise<{ lignes: T[]; total: number | null }> {
  const demo = sourceDeDemonstration.getStore();
  if (demo) {
    const lignes = lireDansLaDemonstration(demo, chemin) as T[];
    return { lignes, total: lignes.length };
  }
  if (!relie) return { lignes: [], total: null };
  try {
    const r = await fetch(`${url}/rest/v1/${chemin}`, {
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        prefer: "count=exact",
      },
      cache: "no-store",
    });
    if (!r.ok) {
      console.error(`Supabase : ${sansValeurs(chemin)} → ${r.status}`);
      return { lignes: [], total: null };
    }
    const lignes = (await r.json()) as T[];
    // « 0-999/1834 », ou « */1834 », ou rien du tout si la base ne compte pas.
    const brut = r.headers.get("content-range") ?? "";
    const apres = brut.slice(brut.indexOf("/") + 1);
    const total = /^\d+$/.test(apres) ? Number(apres) : null;
    return { lignes, total };
  } catch (e) {
    console.error(`Supabase injoignable : ${String(e)}`);
    return { lignes: [], total: null };
  }
}

async function lire<T>(chemin: string): Promise<T[]> {
  const demo = sourceDeDemonstration.getStore();
  if (demo) return lireDansLaDemonstration(demo, chemin) as T[];
  if (!relie) return [];
  try {
    const r = await fetch(`${url}/rest/v1/${chemin}`, {
      headers: { apikey: cle!, authorization: `Bearer ${cle}` },
      cache: "no-store",
    });
    if (!r.ok) {
      console.error(`Supabase : ${sansValeurs(chemin)} → ${r.status}`);
      return [];
    }
    return (await r.json()) as T[];
  } catch (e) {
    // On ne NOTE pas cette panne-là dans la base : la base est justement ce
    // qui ne répond pas. Écrire ici demanderait un second aller-retour, qui
    // échouerait pareillement — et une panne qui se raconte deux fois reste
    // une panne. C'est l'écran qui le dit à la personne, tout de suite.
    console.error(`Supabase injoignable : ${String(e)}`);
    return [];
  }
}

// --- Ce que le robot écrit (colonnes de sql/schema.sql) ----------------------

// `vu_le`, et l'oreille de la base (`entendu_le`, `revenu_le`), et la
// sortie de flotte : voir lib/boitiers.ts.
type LigneTerminal = LigneBoitier & {
  nom: string | null; version: string | null;
  sante?: { resume?: string; en_attente?: number } | null;
};
type LigneCarte = {
  // Le boîtier qui a vu cette carte (la base tient une ligne par boîtier et
  // par carte). C'est D'APRÈS LUI qu'on juge si elle est là.
  terminal?: string | null;
  iccid: string; operateur: string | null; libelle: string | null;
  nom?: string | null; numero: string | null;
  premiere_vue: string | null; derniere_vue: string | null;
};
type LigneCompte = {
  terminal?: string | null;
  iccid: string | null; libelle: string; operateur: string | null;
  reseau: string | null; itinerance: boolean; numero: string | null;
  solde: number | null; signal: number | null; maj: string;
  // L'heure du SOLDE, distincte de « maj » qui date la LIGNE. Optionnelle :
  // une base pas encore migrée ne la porte pas.
  solde_maj?: string | null;
};
type LigneRecu = {
  numero: string; reference: string | null; chemin: string;
  terminal?: string | null;
};
type LigneRaccourci = {
  operateur: string; nom: string; libelle: string | null; etapes: string | null;
};

type LignePaiement = {
  id: number; source_id?: number | null; expediteur?: string | null;
  terminal?: string | null;
  compte: string | null; carte: string | null; sens: string;
  montant: number | null; tiers: string | null; numero: string | null;
  reference: string | null; solde_apres: number | null; texte: string;
  categorie?: string | null; nature?: string | null;
  emis_le?: string | null; recu_le: string;
  // Quand le propriétaire a ouvert ce SMS sur la plateforme. `null` = pas
  // encore lu ; `undefined` = base pas encore migrée (la notion n'existe pas).
  lu_le?: string | null;
};

// --- Mise en forme des dates -------------------------------------------------

// La locale des dates suit la langue de l'écran ; le fuseau, lui, ne bouge
// jamais : l'argent vit à Douala.
const LOCALE: Record<Langue, string> = { en: "en-GB", fr: "fr-FR" };

function heure(ts: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit", minute: "2-digit", timeZone: FUSEAU,
  }).format(new Date(ts));
}

function dateCourte(ts: string | null, langue: Langue): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat(LOCALE[langue], {
    day: "numeric", month: "short", year: "numeric", timeZone: FUSEAU,
  }).format(new Date(ts));
}

// L'âge, ARRONDI VERS LE BAS : 4 min 55 s se dit « il y a 4 min ». Arrondi
// au plus près, 175 s et 185 s s'écrivaient tous deux « il y a 3 min » —
// l'un sous « actif », l'autre sous « muet », de part et d'autre du seuil.
function ecartHumain(age: number | null, langue: Langue): string {
  if (age == null) return langue === "en" ? "never seen" : "jamais vu";
  const s = Math.max(0, Math.floor(age));
  const forme = (n: number, unite: string) =>
    langue === "en" ? `${n} ${unite} ago` : `il y a ${n} ${unite}`;
  if (s < 60) return forme(s, "s");
  if (s < 3600) return forme(Math.floor(s / 60), "min");
  if (s < 86_400) return forme(Math.floor(s / 3600), "h");
  return forme(Math.floor(s / 86_400), langue === "en" ? "d" : "j");
}

// --- Le chargement complet ---------------------------------------------------

/**
 * Ce qu'on dit d'un boîtier, mesuré à `maintenant` — l'horloge de la
 * PLATEFORME, au moment de répondre.
 *
 * `vuLe` et `vuIlYa` voyagent avec la réponse : le téléphone fait vieillir
 * l'âge lui-même entre deux lectures, sans requête, et ne compare jamais
 * l'instant à sa propre horloge. `enLigne` et `majTexte` restent pour les
 * applications déjà installées — une photo prise ici, qu'elles affichent
 * telle quelle.
 */
function versTerminal(
  t: LigneTerminal | undefined, langue: Langue, maintenant = Date.now(),
): EtatTerminal | null {
  if (!t) return null;
  const vuIlYa = ageDuSigneDeVie(t.entendu_le, t.vu_le, maintenant);
  return {
    id: t.id,
    nom: t.nom || t.id.charAt(0).toUpperCase() + t.id.slice(1),
    enLigne: !boitierSansNouvelles(vuIlYa),
    majTexte: ecartHumain(vuIlYa, langue),
    version: t.version ?? "",
    sante: t.sante?.resume ?? "",
    enAttente: t.sante?.en_attente ?? 0,
    // L'instant d'où l'âge se mesure : l'heure où la BASE l'a entendu,
    // quand elle la connaît. La date que le Pi a écrite peut avoir une
    // heure de retard après une coupure de courant — le téléphone
    // afficherait « muet depuis 13:05 » d'un boîtier entendu à 14:05.
    vuLe: entenduLe(t),
    vuIlYa,
  };
}

/** Le terminal seul — pour la coquille, qui n'a pas besoin du reste.
 *  Avant, elle rechargeait TOUT (SMS et reçus compris) à chaque page :
 *  chaque clic payait deux fois le plein tarif. */
export async function chargerTerminal(
  langue: Langue, portee: Portee,
): Promise<EtatTerminal | null> {
  // RIEN À MONTRER sans carte : un inscrit du grand public n'a pas de
  // boîtier, et celui d'un autre client ne le regarde pas.
  if (!portee.tout && portee.cartes.length === 0) return null;
  const [terminaux, siens] = await Promise.all([
    lire<LigneTerminal>("terminaux?select=*&order=vu_le.desc.nullslast&limit=50"),
    portee.tout ? Promise.resolve(null)
      : lire<{ terminal?: string | null }>(
          `cartes?select=terminal&iccid=in.${listeDeCartes(portee.cartes)}`),
  ]);
  return versTerminal(leBoitierMontre(boitiersDeSesCartes(terminaux, siens)), langue);
}

/**
 * Les boîtiers qu'une personne a le droit de voir : TOUS pour le
 * propriétaire (`siens` vaut null), sinon ceux qui portent SES cartes.
 *
 * `leBoitierMontre` prend le DERNIER boîtier entendu dans toute la flotte.
 * Avec l'inscription publique, le client B voyait donc le nom, la version et
 * la santé du boîtier que le client A venait de brancher chez lui — et un
 * inscrit sans carte, celui de TOTEM.
 */
function boitiersDeSesCartes<T extends { id: string }>(
  terminaux: T[], siens: { terminal?: string | null }[] | null,
): T[] {
  if (siens === null) return terminaux;
  const ids = new Set(siens.map((c) => c.terminal).filter((t): t is string => Boolean(t)));
  return terminaux.filter((t) => ids.has(t.id));
}

/** Une liste d'ICCID prête pour un filtre « in.(…) ». Chaque valeur est
 *  relavée ici : la base exige déjà la forme, on ne s'en remet pas à elle. */
function listeDeCartes(cartes: string[]): string {
  const propres = cartes.filter((c) => /^[A-Za-z0-9]{1,32}$/.test(c));
  return encodeURIComponent(`(${propres.map((c) => `"${c}"`).join(",")})`);
}

/** Les écrans de la démonstration : la MÊME lecture que les vrais, sur le
 *  jeu inventé. La portée vaut « tout » — tout ce jeu lui appartient, et rien
 *  d'autre n'y entre. */
export function chargerDonneesDeDemonstration(
  langue: Langue, bornes?: Parameters<typeof chargerDonnees>[2],
): Promise<Donnees> {
  return sourceDeDemonstration.run(
    tablesDeDemonstration(), () => chargerDonnees(langue, { tout: true }, bornes));
}

/** Le terminal de la démonstration, pour la coquille du site. */
export function chargerTerminalDeDemonstration(langue: Langue): Promise<EtatTerminal | null> {
  return sourceDeDemonstration.run(
    tablesDeDemonstration(), () => chargerTerminal(langue, { tout: true }));
}

export async function chargerDonnees(
  langue: Langue,
  // CE QUE LA PERSONNE A LE DROIT DE VOIR — obligatoire, à dessein : un
  // appelant qui l'oublierait ne compile pas. Voir lib/portee.ts.
  portee: Portee,
  // Chaque page dit ce dont elle a besoin : l'accueil montre 6 SMS, inutile
  // d'en charger 1000. `sms: 0` saute la requête entièrement. ATTENTION :
  // les compteurs des cartes (nbPaiements, totalRecu) ne comptent que ce qui
  // est chargé — la page qui les affiche (Comptes) charge donc tout.
  //
  // `depuis` : ne rapporter que les SMS relevés à partir de cet instant (ISO).
  // Le découpage d'une PÉRIODE se fait dans la BASE, pas après coup sur une
  // page arbitraire : le bilan CSV chargeait les mille derniers SMS puis
  // écartait ce qui dépassait — sur une caisse active, un trimestre demandé
  // rendait cinq semaines, sans un mot.
  //
  // `compter` : demander AUSSI à la base combien de lignes elle avait. Le
  // comptage exact lui coûte un parcours complet — il ne se paie que là où
  // ignorer une troncature serait un mensonge (l'export comptable), pas à
  // chaque ouverture d'écran.
  //
  // `lignes` : COMPTER LOIN, RAPPORTER PEU. L'écran des cartes demandait
  // mille SMS — non pour les montrer, il ne les regarde jamais, mais pour que
  // les compteurs par carte (nbPaiements, totalRecu) soient calculés sur la
  // même profondeur que le web. Le serveur comptait bien, puis renvoyait les
  // mille lignes, textes de SMS compris : 264 Ko sur le réseau mobile de
  // Douala pour afficher des soldes de cartes.
  //
  // C'ÉTAIT UN DRAPEAU (`sansLignes`), ET UN DRAPEAU NE SE RÉUNIT PAS. Sur le
  // téléphone, les quatre onglets restent montés ensemble et partagent une
  // seule demande : l'écran des cartes n'en veut aucune, l'accueil en veut
  // trente. Le plus grand besoin commun n'est ni « aucune » ni « toutes » —
  // c'est un NOMBRE. Avec un drapeau, il fallait choisir, et choisir « avec
  // les lignes » rapportait les mille.
  //
  // Absent, il vaut « autant que `sms` » : qui n'a rien précisé veut tout ce
  // qu'il a demandé.
  bornes?: { sms?: number; recus?: number; depuis?: string; compter?: boolean;
             lignes?: number },
): Promise<Donnees> {
  const nSms = bornes?.sms ?? 1000;
  const nRecus = bornes?.recus ?? 1000;
  // Le filtre porte sur `recu_le` — la seule colonne d'heure qui ne manque
  // jamais (l'heure réseau, elle, est absente de la moitié des SMS). Un SMS
  // relevé en retard après une coupure porte donc une heure de relève
  // postérieure à son heure d'émission : la borne est prise LARGE, et le
  // tri fin se fait ensuite sur l'heure qui fait foi.
  const filtreDate = bornes?.depuis
    ? `&recu_le=gte.${encodeURIComponent(bornes.depuis)}` : "";
  // « select=* » à dessein : exiger une colonne par son nom rend l'écran
  // VIDE quand la base a une migration de retard (la requête entière est
  // refusée). Avec l'étoile, une colonne absente donne un affichage un peu
  // moins riche — jamais une liste vide. Les champs du type non présents
  // arrivent à undefined, que chaque lecture traite déjà comme null.
  //
  // LA PORTÉE SE POSE DANS LA BASE, pas après coup : un invité ne doit pas
  // recevoir mille lignes dont on jetterait neuf cents — la limite mordrait
  // sur les SMS des autres, et ses propres messages manqueraient. Une portée
  // sans carte ne demande rien du tout.
  const rien = !portee.tout && portee.cartes.length === 0;
  const dans = portee.tout ? "" : listeDeCartes(portee.cartes);
  const filtreCarte = portee.tout ? "" : `&iccid=in.${dans}`;
  const filtrePaiement = portee.tout ? "" : `&carte=in.${dans}`;
  const vide = <T,>() => Promise.resolve([] as T[]);
  const [terminaux, cartesBrutes, comptesBruts, releve, recus, boutons, carnet,
         vuesDeLaFlotte] = await Promise.all([
    // TOUS les boîtiers, pas « le dernier qui a parlé » : chaque carte se
    // juge d'après le SIEN. Dès deux boîtiers, celui qui tombait ne se
    // voyait pas tant que l'autre parlait. L'écran montre comme « le
    // terminal » le dernier entendu (`leBoitierMontre`).
    lire<LigneTerminal>("terminaux?select=*&order=vu_le.desc.nullslast&limit=50"),
    rien ? vide<LigneCarte>()
      : lire<LigneCarte>(`cartes?select=*${filtreCarte}&order=derniere_vue.desc.nullslast`),
    rien ? vide<LigneCompte>() : lire<LigneCompte>(`comptes?select=*${filtreCarte}`),
    nSms > 0 && !rien
      ? (bornes?.compter
          ? lireEtCompter<LignePaiement>(
              `paiements?select=*${filtreDate}${filtrePaiement}&order=recu_le.desc&limit=${nSms}`)
          : lire<LignePaiement>(
              `paiements?select=*${filtreDate}${filtrePaiement}&order=recu_le.desc&limit=${nSms}`)
              .then((lignes) => ({ lignes, total: null as number | null })))
      : Promise.resolve({ lignes: [] as LignePaiement[], total: null as number | null }),
    nRecus > 0
      ? lire<LigneRecu>(`recus?select=*&order=etabli_le.desc&limit=${nRecus}`)
      : Promise.resolve([] as LigneRecu[]),
    // Les boutons appris par le robot. Table absente (base pas migrée) :
    // `lire` rend [] sans bruit — les écrans montrent juste moins de boutons.
    //
    // Un inscrit sans carte n'en reçoit aucun : le carnet du propriétaire
    // ne le regarde pas (filtré par opérateur plus bas pour les autres).
    rien ? vide<LigneRaccourci>() : lire<LigneRaccourci>("raccourcis?select=*&order=id"),
    // Le carnet des bénéficiaires, carte par carte — même portée que le
    // reste. Table absente (base pas migrée) : un carnet vide, sans bruit.
    rien ? vide<Beneficiaire>()
      : lire<Beneficiaire>(
          `beneficiaires?select=id,carte,numero,nom${filtrePaiement}&order=nom.asc&limit=500`),
    // La plus récente vue de CHAQUE boîtier, toutes cartes confondues — y
    // compris celles qu'on ne montre pas à cette personne. Elle ne sort pas
    // d'ici : elle sert seulement à dire si son boîtier a relu ses puces.
    // Sans elle, celui à qui on n'a confié qu'une carte verrait cette
    // carte « inconnue » dès qu'on la retire, faute de voir les autres.
    // Le propriétaire a déjà toutes les cartes sous la main.
    portee.tout || rien ? vide<{ terminal?: string | null; derniere_vue: string | null }>()
      : lire<{ terminal?: string | null; derniere_vue: string | null }>(
          "cartes?select=terminal,derniere_vue"),
  ]);

  // Revérifié ici, ligne par ligne : ce que la base a filtré, on le
  // refiltre — la portée ne dépend pas de la bonne volonté d'un service
  // distant (ni d'un faux nuage qui ignorerait un filtre).
  const visible = (iccid: string | null | undefined) =>
    portee.tout || (iccid != null && portee.cartes.includes(iccid));
  // UNE carte, UNE ligne. La base en tient une par boîtier qui l'a vue : une
  // puce passée d'un boîtier à l'autre y figure deux fois. On garde celle du
  // boîtier qui l'a vue en DERNIER — c'est là qu'elle est, et c'est là que
  // ses demandes partent (`terminalDeLaCarte`).
  const instant = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);
  const laPlusRecente = new Map<string, LigneCarte>();
  for (const c of cartesBrutes) {
    if (!visible(c.iccid)) continue;
    const deja = laPlusRecente.get(c.iccid);
    if (!deja || instant(c.derniere_vue) > instant(deja.derniere_vue)) {
      laPlusRecente.set(c.iccid, c);
    }
  }
  // L'ordre reste celui de la base : les plus récemment vues d'abord.
  const cartes = cartesBrutes.filter((c) => laPlusRecente.get(c.iccid) === c);
  const comptes = comptesBruts.filter((c) => visible(c.iccid));
  const lignes = releve.lignes.filter((l) => visible(l.carte));
  // La base avait-elle plus à donner que ce qu'on a demandé ? La réponse
  // n'intéresse que l'export comptable — mais elle ne peut se calculer QUE
  // ici, au moment de la lecture.
  const smsTronques = releve.total != null && releve.total > releve.lignes.length;

  // L'HEURE DE LA RÉPONSE, prise une fois : l'âge de chaque boîtier et
  // `serveurA` se mesurent au même instant, sur la même horloge.
  const maintenant = Date.now();
  // LE TERMINAL MONTRÉ, choisi parmi ceux qui portent les cartes de la
  // personne — aucun sans carte (voir `boitiersDeSesCartes`).
  const terminal = rien ? null : versTerminal(
    leBoitierMontre(boitiersDeSesCartes(terminaux, portee.tout ? null : cartes)),
    langue, maintenant);
  const boitiers = new Map(terminaux.map((t) => [t.id, t]));
  const plusRecentes = cartesLesPlusRecentes(portee.tout ? cartesBrutes : vuesDeLaFlotte);
  const aujourdhui = jourLocal(new Date(maintenant), FUSEAU);

  // Le numéro d'un reçu se termine par l'identifiant de la ligne du journal
  // (« TM-2026-0731-0042 » → 42) : c'est un lien EXACT avec son SMS — mais
  // seulement dans SA famille et sur SON terminal. Le préfixe compte : les
  // reçus de solde USSD (« TS-… ») numérotent leur propre journal, qui
  // démarre lui aussi à 1 — sans le préfixe, un relevé de solde s'accrochait
  // au SMS n° 42 et le client téléchargeait le mauvais document.
  const ligneDuRecu = (numero: string): number | null => {
    const m = /-(\d+)$/.exec(numero);
    return m ? Number(m[1]) : null;
  };
  const memeTerminal = (r: LigneRecu, l: LignePaiement): boolean =>
    r.terminal == null || l.terminal == null || r.terminal === l.terminal;
  const recuDe = (l: LignePaiement): string | null => {
    const parReference = l.reference
      ? recus.find((r) => r.reference && r.reference === l.reference
                          && memeTerminal(r, l))
      : undefined;
    if (parReference) return parReference.numero;
    if (l.source_id == null) return null;
    return recus.find((r) => r.numero.startsWith("TM-")
                             && memeTerminal(r, l)
                             && ligneDuRecu(r.numero) === l.source_id)
      ?.numero ?? null;
  };

  // Chaque SMS affiche QUI l'a envoyé, comme la messagerie du téléphone :
  // « OrangeMoney », « Orange », « MTN »… Les lignes d'avant cette colonne
  // n'ont pas l'expéditeur : on affiche alors l'opérateur de la carte.
  const nomDe = (l: LignePaiement): string => {
    if (l.expediteur) return l.expediteur;
    const operateur = (l.compte ?? "").split(" ")[0];
    return operateur || l.tiers || l.numero || "SMS";
  };

  // L'heure retenue pour l'ordre et l'affichage : l'heure RÉSEAU du SMS quand
  // on la connaît (elle diverge de l'heure de relève après une coupure), sinon
  // l'heure de relève. On trie ici, côté serveur, indépendamment de l'ordre
  // renvoyé par la base (qui peut être en retard sur une migration).
  const moment = (l: LignePaiement): string => l.emis_le || l.recu_le;
  // Les valeurs venues de la base repassent par la liste connue : un
  // terminal plus récent que l'écran ne doit jamais casser l'affichage —
  // une catégorie inconnue se montre « message », une nature impossible
  // s'ignore (seules les quatre natures choisissables existent), et le SMS
  // reste lisible en entier.
  const parNature = (v: string | null | undefined): Paiement["nature"] =>
    (estNature(v) ? v : null);

  // Chaque ligne est un SMS reçu par une carte ; ceux que le robot a compris
  // portent un montant, les autres restent lisibles tels quels.
  const paiements: Paiement[] = [...lignes]
    .sort((a, b) => (moment(a) < moment(b) ? 1 : moment(a) > moment(b) ? -1 : 0))
    .map((l) => ({
      id: String(l.id),
      // Le libellé COMPLET du compte (« MTN ·8901 »), plus le premier mot :
      // deux cartes du même opérateur doivent rester deux caisses dans les
      // filtres — « MTN » tout court les fondait en une seule.
      sim: l.compte || l.carte || "—",
      carte: l.carte ?? "",
      // Le robot laisse le sens vide quand le SMS ne permet pas de trancher :
      // on l'affiche comme inconnu, jamais comme une sortie par défaut.
      sens: (l.sens === "entree" ? "in" : l.sens === "sortie" ? "out" : "?") as "in" | "out" | "?",
      nom: nomDe(l),
      tiers: l.tiers ?? "",
      numero: l.numero ?? "",
      montant: l.montant == null ? null : Number(l.montant),
      heure: heure(moment(l)),
      // Le libellé du NOYAU, celui que le téléphone forme lui-même : un
      // « Aujourd'hui » ne s'écrit que d'une façon. Il reste envoyé pour les
      // applications déjà installées ; les nouvelles le reforment à partir
      // de `jour`, au moment de dessiner — relu le lendemain, il mentait.
      date: libelleJour(jourLocal(new Date(moment(l)), FUSEAU), aujourdhui, langue),
      jour: jourLocal(new Date(moment(l)), FUSEAU),
      recuLe: moment(l),
      // Catégorie devinée ; « message » à défaut (vieux SMS sans la colonne,
      // ou valeur d'un terminal plus récent que cet écran).
      categorie: (l.categorie && estCategorie(l.categorie)
        ? l.categorie : "message") as Paiement["categorie"],
      nature: parNature(l.nature),
      reference: l.reference ?? "",
      soldeApres: l.solde_apres == null ? null : Number(l.solde_apres),
      smsBrut: l.texte,
      recu: recuDe(l),
      sourceId: l.source_id ?? null,
      terminal: l.terminal ?? null,
      // Non lu SEULEMENT si la base connaît la notion (colonne présente) et
      // que la ligne n'a jamais été ouverte. Base pas migrée → tout est « lu » :
      // la fonctionnalité dort, elle ne crie pas faux.
      nonLu: l.lu_le === null,
    }));

  const sims: Sim[] = cartes.map((c) => {
    // Le compte relevé par LE boîtier qui porte la carte, à défaut un autre.
    const compte = comptes.find((x) => x.iccid === c.iccid && x.terminal === c.terminal)
      ?? comptes.find((x) => x.iccid === c.iccid);
    const entrees = lignes.filter((l) => l.carte === c.iccid && l.sens === "entree");
    // Le solde vient du terminal, point : une réponse USSD, ou un SMS de
    // relevé envoyé par l'opérateur (MTN répond ainsi en itinérance).
    // Toujours l'annonce de l'opérateur — jamais un calcul à nous.
    const solde = compte?.solde == null ? null : Number(compte.solde);
    // « D'après l'interrogation de 09:47 » lisait « maj » — l'heure à laquelle
    // la LIGNE a été touchée, que le signe de vie du robot remet à jour toutes
    // les soixante secondes. Le solde paraissait donc toujours frais, même
    // vieux de plusieurs heures : la phrase qui devait rassurer sur son âge
    // était précisément celle qui le masquait. « solde_maj » date le solde
    // lui-même.
    //
    // On ne retombe sur « maj » que si la COLONNE manque (base pas encore
    // migrée : `undefined`). Une colonne présente mais VIDE dit « on ne sait
    // pas quand ce solde a été relevé » — et « je ne sais pas » ne se
    // remplace pas par l'heure du dernier signe de vie, qui avance toute
    // seule et ferait paraître frais un solde de la veille.
    const instantDuSolde = solde != null && compte
      ? (compte.solde_maj === undefined ? compte.maj : compte.solde_maj) ?? null
      : null;
    const soldeMaj = instantDuSolde ? heure(instantDuSolde) : null;
    // Le même instant, entier : l'écran en tire le JOUR (« hier à 21:54 »).
    const soldeLe = instantDuSolde;
    // LA PRÉSENCE, JUGÉE D'APRÈS SON BOÎTIER. Muet, il ne permet de conclure
    // ni à la présence ni à l'absence : « inconnue ». Une coupure de courant
    // de dix minutes déclarait toutes les cartes retirées — et, au retour,
    // le signe de vie arrivé avant les cartes les déclarait retirées encore
    // une minute. Sorti de la flotte, il ne reviendra pas : retirée.
    const hote = c.terminal ? boitiers.get(c.terminal) : undefined;
    const vu = boitierVu(hote, plusRecentes, maintenant);
    const presence: Presence = presenceDeLaCarte(vu, c.derniere_vue);
    // L'ÉTAT DE SON BOÎTIER À ELLE — pas celui du boîtier montré en tête
    // (le dernier entendu). Avec deux boîtiers, le téléphone disait
    // « Terminal hors ligne » sur la carte d'un boîtier qui parlait, et
    // datait le silence de l'autre avec l'heure du premier. Et « inconnue »
    // seule ne dit pas qu'il se tait : elle dit aussi « il vient de
    // revenir ». Le même verdict que le guichet (`terminalDeLaCarte`) :
    // l'écran ne met en pause que ce que la plateforme refuserait.
    // L'instant est celui de `terminal.vuLe` — l'heure où la base l'a
    // entendu, sur SON horloge. Une carte sans boîtier connu n'en dit rien.
    const sonBoitier = c.terminal
      ? { boitierMuet: boitierSansNouvelles(vu.vuIlYa), boitierVuLe: entenduLe(hote) }
      : {};
    return {
      iccid: c.iccid,
      libelle: compte?.libelle || c.libelle || `Carte ·${c.iccid.slice(-4)}`,
      operateur: compte?.operateur || c.operateur || "?",
      reseau: compte?.reseau ?? "",
      itinerance: compte?.itinerance ?? false,
      nom: c.nom || "",
      numero: compte?.numero || c.numero || "",
      solde,
      soldeMaj,
      soldeLe,
      // 99 (« je ne sais pas », dit le modem) n'est pas un signal : `null`.
      signal: signalLu(compte?.signal),
      enPlace: enPlaceSelon(presence),
      presence,
      ...sonBoitier,
      premiereVue: dateCourte(c.premiere_vue, langue),
      derniereVue: dateCourte(c.derniere_vue, langue),
      nbPaiements: entrees.length,
      totalRecu: entrees.reduce((s, l) => s + Number(l.montant ?? 0), 0),
    };
  });

  // Les boutons appris, par opérateur — le pendant web du carnet du robot.
  // Celui qui tient des cartes ne reçoit que les boutons de LEURS
  // opérateurs : c'est de quoi les manier, rien de plus.
  const sesOperateurs = new Set(sims.map((x) => x.operateur));
  const raccourcis: Record<string, RaccourciAppris[]> = {};
  for (const b of boutons) {
    const etapes = (b.etapes ?? "").split(",").filter(Boolean);
    if (!b.operateur || !etapes.length) continue;
    if (!portee.tout && !sesOperateurs.has(b.operateur)) continue;
    (raccourcis[b.operateur] ??= []).push({
      nom: b.nom, libelle: b.libelle || b.nom, etapes,
    });
  }

  return {
    relie, terminal, sims, raccourcis, fuseau: FUSEAU, smsTronques,
    serveurA: new Date(maintenant).toISOString(),
    // Revérifiés ici, comme les SMS : la portée ne dépend pas d'un filtre
    // distant.
    beneficiaires: carnet.filter((b) => visible(b.carte)),
    // Les compteurs des cartes sont déjà calculés : les lignes qui ont servi
    // à les calculer n'ont plus rien à faire sur le réseau.
    paiements: bornes?.lignes != null ? paiements.slice(0, bornes.lignes) : paiements,
  };
}

/** La fiche d'un reçu archivé : sa date d'établissement, qui avance à chaque
 *  refabrication — c'est elle qui dit à l'écran que le nouveau document est
 *  vraiment en place. */
export async function chargerFicheRecu(
  numero: string,
): Promise<{ etabliLe: string | null } | null> {
  if (!relie) return null;
  const propre = numero.replace(/[^A-Za-z0-9._-]/g, "");
  const fiches = await lire<{ numero: string; etabli_le: string | null }>(
    `recus?select=numero,etabli_le&numero=eq.${propre}&limit=1`,
  );
  const fiche = fiches.find((f) => f.numero === propre);
  return fiche ? { etabliLe: fiche.etabli_le ?? null } : null;
}

/**
 * LE REÇU DE CE SMS EST-IL LÀ ? Une question minuscule, posée par la fiche
 * d'un SMS d'argent qui attend son document (voir `recuAttendu` dans le
 * noyau) : quelques fois, sur une minute au plus — jamais un pouls.
 *
 * Avant, le téléphone apprenait l'arrivée du SMS (la notification), jamais
 * celle du reçu, déposé quelques secondes plus tard : la fiche restait sur
 * « Établir le reçu », et l'on refaisait un document qui existait déjà.
 *
 * Le lien est celui de l'écran (`recuDe` dans `chargerDonnees`) : par la
 * référence d'opérateur, sinon par le numéro de ligne du journal, dans la
 * famille « TM- » et sur le même boîtier. La portée se vérifie sur la ligne
 * du SMS : un SMS d'une carte qui n'est pas la sienne n'a pas de reçu ici.
 */
export async function recuDuSms(id: number, portee: Portee): Promise<string | null> {
  if (!relie || !Number.isInteger(id) || id <= 0) return null;
  if (!portee.tout && portee.cartes.length === 0) return null;
  const sms = (await lire<{
    id: number; carte: string | null; reference: string | null;
    source_id?: number | null; terminal?: string | null;
  }>(`paiements?select=id,carte,reference,source_id,terminal&id=eq.${id}&limit=1`))
    .find((l) => l.id === id);
  if (!sms) return null;
  // Revérifiée ici, ligne par ligne : un filtre qu'un service distant
  // ignorerait ne doit rien laisser passer.
  if (!portee.tout && (sms.carte == null || !portee.cartes.includes(sms.carte))) return null;
  const memeBoitier = (r: { terminal?: string | null }) =>
    r.terminal == null || sms.terminal == null || r.terminal === sms.terminal;
  if (sms.reference) {
    const parReference = (await lire<{ numero: string; reference: string | null; terminal?: string | null }>(
      `recus?select=numero,reference,terminal&reference=eq.${encodeURIComponent(sms.reference)}&limit=5`))
      .find((r) => r.reference === sms.reference && memeBoitier(r));
    if (parReference) return parReference.numero;
  }
  if (sms.source_id == null) return null;
  // « TM-2026-0731-0042 » : le numéro finit par la ligne du journal, sur
  // quatre chiffres au moins. On demande les numéros qui FINISSENT ainsi,
  // puis on revérifie le nombre exact (« …-10042 » finit aussi par 0042).
  const fin = String(sms.source_id).padStart(4, "0");
  const candidats = await lire<{ numero: string; terminal?: string | null }>(
    `recus?select=numero,terminal&numero=like.TM-*-${fin}&order=etabli_le.desc&limit=20`);
  return candidats.find((r) => /^TM-/.test(r.numero)
    && Number(/-(\d+)$/.exec(r.numero)?.[1]) === sms.source_id
    && memeBoitier(r))?.numero ?? null;
}

/**
 * Ce reçu appartient-il à une carte que la personne peut voir ?
 *
 * Un numéro de reçu se DEVINE (« TM-2026-0731-0042 », puis 0043…) : sans
 * cette question, un invité aurait téléchargé, numéro après numéro, les reçus
 * de toutes les cartes de la maison. On retrouve donc le SMS du reçu — par la
 * référence d'opérateur, ou par le numéro de ligne du journal, exactement
 * comme l'écran fait le lien (voir `recuDe` plus haut) — et on demande si sa
 * carte est dans la portée. Introuvable : non.
 */
export async function recuVisible(numero: string, portee: Portee): Promise<boolean> {
  if (portee.tout) return true;
  if (!relie || portee.cartes.length === 0) return false;
  const propre = numero.replace(/[^A-Za-z0-9._-]/g, "");
  const fiche = (await lire<{ numero: string; reference: string | null; terminal?: string | null }>(
    `recus?select=numero,reference,terminal&numero=eq.${propre}&limit=1`,
  )).find((f) => f.numero === propre);
  if (!fiche) return false;
  const dans = `&carte=in.${listeDeCartes(portee.cartes)}`;
  const aSaCarte = (l: { carte: string | null }) =>
    l.carte != null && portee.cartes.includes(l.carte);
  if (fiche.reference) {
    const parReference = await lire<{ carte: string | null; terminal?: string | null }>(
      `paiements?select=carte,terminal&reference=eq.${encodeURIComponent(fiche.reference)}`
      + `${dans}&limit=5`);
    if (parReference.some((l) => aSaCarte(l)
        && (fiche.terminal == null || l.terminal == null || l.terminal === fiche.terminal))) {
      return true;
    }
  }
  const ligne = propre.startsWith("TM-") ? /-(\d+)$/.exec(propre) : null;
  if (ligne) {
    const parLigne = await lire<{ carte: string | null; terminal?: string | null }>(
      `paiements?select=carte,terminal&source_id=eq.${ligne[1]}${dans}&limit=5`);
    return parLigne.some((l) => aSaCarte(l)
      && (fiche.terminal == null || l.terminal == null || l.terminal === fiche.terminal));
  }
  return false;
}

export async function chargerRecu(numero: string): Promise<ArrayBuffer | null> {
  if (!relie) return null;
  const propre = numero.replace(/[^A-Za-z0-9._-]/g, "");
  const fiches = await lire<{ numero: string; chemin: string }>(
    `recus?select=numero,chemin&numero=eq.${propre}&limit=1`,
  );
  // On revérifie le numéro nous-mêmes : le chemin servi ne dépend jamais
  // de ce que le service distant a bien voulu filtrer.
  const chemin = fiches.find((f) => f.numero === propre)?.chemin;
  if (!chemin) return null;
  try {
    const r = await fetch(`${url}/storage/v1/object/recus/${chemin}`, {
      headers: { apikey: cle!, authorization: `Bearer ${cle}` },
      cache: "no-store",
    });
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

// --- Le canal de commandes ---------------------------------------------------
// L'application dépose une demande ; le robot de Douala la relève, l'exécute
// sur la vraie SIM, et écrit le résultat ici même.

/** Le boîtier d'une demande qui ne vise aucune carte : le dernier entendu,
 *  parmi ceux qui sont encore en service. */
export async function terminalVise(): Promise<string | null> {
  const t = await lire<LigneTerminal>(
    "terminaux?select=*&order=vu_le.desc.nullslast&limit=50");
  return leBoitierMontre(t)?.id ?? null;
}

/**
 * LE TERMINAL QUI PORTE CETTE CARTE — et ce qu'on sait d'elle et de lui.
 * `null` : aucun boîtier ne l'a jamais vue.
 *
 * Une demande qui vise une carte partait au terminal « le dernier à avoir
 * donné signe de vie ». Avec un seul boîtier, c'était le bon. Avec deux, un
 * transfert sur la MTN du boîtier B partait au boîtier A, qui n'a pas cette
 * carte. Plus il y a de boîtiers, plus la demande tombe à côté.
 *
 * Une demande vise une CARTE, pas un boîtier : elle part à celui qui a vu
 * la carte en dernier. Chaque terminal rafraîchit `derniere_vue` à chaque
 * relecture de ses puces (environ toutes les minutes) ; une carte déplacée
 * d'un boîtier à l'autre suit donc d'elle-même.
 *
 * DEUX REFUS, ET ILS NE SE CONFONDENT PAS :
 *   — `muet` : son boîtier ne donne plus de nouvelles. Une demande déposée
 *     maintenant attendrait son retour — des heures, peut-être — et il la
 *     composerait alors, numéro et montant compris, pour un écran qui a
 *     abandonné depuis longtemps ;
 *   — `presence: "retiree"` : le boîtier parle et ne la voit plus, ou il
 *     est sorti de la flotte.
 * La règle « vue il y a moins de dix minutes » confondait les deux : une
 * coupure de courant passait pour un retrait, et un boîtier muet depuis six
 * minutes recevait encore des demandes.
 *
 * « inconnue » D'UN BOÎTIER QUI PARLE n'est pas un refus : il vient de
 * revenir et n'a pas encore republié ses cartes. La demande part chez lui ;
 * il compose si la puce est là, et répond lui-même « cette carte n'est pas
 * dans le terminal » sinon. La refuser, c'était renvoyer chaque geste de la
 * minute qui suit une coupure.
 */
export async function terminalDeLaCarte(
  iccid: string,
): Promise<{ terminal: string; presence: Presence; muet: boolean } | null> {
  if (!/^[A-Za-z0-9]{1,32}$/.test(iccid)) return null;
  const vues = await lire<{ terminal: string; derniere_vue: string | null }>(
    `cartes?select=terminal,derniere_vue&iccid=eq.${iccid}`
    + "&order=derniere_vue.desc.nullslast&limit=1");
  const vue = vues[0];
  if (!vue?.terminal) return null;
  const id = encodeURIComponent(vue.terminal);
  const [lignes, siennes] = await Promise.all([
    lire<LigneTerminal>(`terminaux?select=*&id=eq.${id}&limit=1`),
    // La plus fraîche de SES cartes : dit s'il a relu ses puces depuis son
    // retour.
    lire<{ terminal?: string | null; derniere_vue: string | null }>(
      `cartes?select=terminal,derniere_vue&terminal=eq.${id}`
      + "&order=derniere_vue.desc.nullslast&limit=1"),
  ]);
  const hote = lignes.find((x) => x.id === vue.terminal);
  const boitier = boitierVu(hote, cartesLesPlusRecentes(siennes), Date.now());
  return {
    terminal: vue.terminal,
    presence: presenceDeLaCarte(boitier, vue.derniere_vue),
    muet: boitierSansNouvelles(boitier.vuIlYa),
  };
}

/** Ce boîtier se tait-il ? Mesuré depuis l'heure où la base l'a entendu.
 *  Inconnu de la base : oui — on ne dépose rien pour un boîtier dont on ne
 *  sait rien. */
export async function boitierMuet(id: string): Promise<boolean> {
  const t = (await lire<LigneTerminal>(
    `terminaux?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)).find((x) => x.id === id);
  return boitierSansNouvelles(ageDuSigneDeVie(t?.entendu_le, t?.vu_le, Date.now()));
}

/**
 * LA DEMANDE DÉJÀ DÉPOSÉE POUR CE GESTE — même clé d'intention, quel que
 * soit le boîtier où elle attend. `null` : ce geste n'a encore rien déposé.
 *
 * Le guichet la cherche AVANT de juger le boîtier. Un geste rejoué (la
 * réponse du premier envoi s'est perdue en route) pendant que le boîtier
 * se tait s'entendait dire « rien n'est parti » — alors que sa demande
 * attendait dans la base, et partirait au retour du boîtier, sans que
 * l'écran ait d'identifiant pour la suivre ni l'annuler. Une vérification
 * faite avant l'écriture ne garantissait rien ; c'est la clé qui garantit.
 *
 * Rend aussi à QUI elle est (`par`, nommé par la plateforme) et sur quelle
 * carte : le guichet ne rend pas la demande d'un autre.
 */
export async function demandeDuGeste(
  cleIntention: string,
): Promise<{ id: number; par: string | null; carte: string | null } | null> {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(cleIntention)) return null;
  const lignes = await lire<{
    id: number; cle?: string | null; parametres: Record<string, unknown> | null;
  }>(`commandes?select=id,cle,parametres&cle=eq.${encodeURIComponent(cleIntention)}`
     + "&order=id.asc&limit=1");
  // Revérifiée ici : on ne s'en remet pas au filtre d'un service distant.
  const c = lignes.find((x) => x.cle === cleIntention);
  if (!c) return null;
  const par = c.parametres?.par;
  const carte = c.parametres?.carte ?? c.parametres?.iccid;
  return {
    id: c.id,
    par: typeof par === "string" ? par : null,
    carte: typeof carte === "string" ? carte : await carteDeLaCommande(c.id),
  };
}

export async function creerCommande(
  genre: string,
  parametres: Record<string, unknown>,
  // Le terminal à qui la demande s'adresse. Quand la demande concerne un SMS
  // précis (un reçu), c'est le terminal qui a REÇU ce SMS — jamais « le
  // dernier qui a donné signe de vie », qui, avec deux boîtiers, chercherait
  // le message dans le mauvais journal et fabriquerait le reçu d'un autre.
  terminalCible?: string | null,
  // LA CLÉ D'INTENTION. Tirée au hasard par l'écran, UNE par geste. Deux
  // envois de la même clé sont le même geste : le second ne crée pas de
  // seconde demande, il retrouve la première. C'est ce qui empêche qu'un code
  // USSD complet — bénéficiaire et montant compris — soit composé deux fois,
  // et donc que l'argent parte deux fois, quand une requête est présentée
  // deux fois sans que personne l'ait voulu.
  cleIntention?: string | null,
): Promise<number | null> {
  if (!relie) return null;
  const terminal = terminalCible || (await terminalVise());
  if (!terminal) return null;
  const ligne: Record<string, unknown> = { terminal, type: genre, parametres };
  if (cleIntention) ligne.cle = cleIntention;
  try {
    const r = await fetch(`${url}/rest/v1/commandes`, {
      method: "POST",
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        "content-type": "application/json", prefer: "return=representation",
      },
      body: JSON.stringify(ligne),
      cache: "no-store",
    });
    if (r.ok) {
      const lignes = (await r.json()) as { id: number }[];
      return lignes[0]?.id ?? null;
    }
    // 409 = l'index d'unicité a parlé : ce geste a DÉJÀ sa demande. On rend
    // la première plutôt qu'un échec — l'écran suit alors la commande qui
    // existe, exactement comme s'il n'avait envoyé qu'une fois.
    if (r.status === 409 && cleIntention) {
      const deja = await lire<{ id: number; parametres: Record<string, unknown> | null }>(
        `commandes?select=id,parametres&terminal=eq.${encodeURIComponent(terminal)}`
        + `&cle=eq.${encodeURIComponent(cleIntention)}&limit=1`);
      // La demande d'un AUTRE ne se rend pas : on ne suit que les siennes.
      // (`par` absent : une demande d'avant, ou dont le robot a effacé le
      // code secret — on la rend, comme avant.)
      const auteur = deja[0]?.parametres?.par;
      if (typeof auteur === "string" && typeof parametres.par === "string"
          && auteur !== parametres.par) return null;
      return deja[0]?.id ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

// La NATURE choisie par le propriétaire pour un SMS (depot/retrait/transfert/
// solde). C'est une métadonnée d'affichage, pas le contenu du SMS : le robot
// ne réécrit jamais une ligne déjà transmise, donc c'est ici qu'on la pose,
// directement sur la ligne visée par son identifiant.
export async function definirNature(
  id: number,
  nature: string | null,
): Promise<boolean> {
  if (!relie) return false;
  try {
    const r = await fetch(`${url}/rest/v1/paiements?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        "content-type": "application/json", prefer: "return=minimal",
      },
      body: JSON.stringify({ nature }),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

// --- La veille : ce qui permet à l'écran de bouger tout seul -----------------
// Deux chiffres légers, interrogés régulièrement par le navigateur : le dernier
// SMS connu (s'il monte, l'écran se rafraîchit) et le nombre de non-lus (la
// pastille du menu). Volontairement minuscule : la veille passe souvent.

export async function chargerActualite(
  portee: Portee,
): Promise<{ dernier: number; nonLus: number }> {
  if (!relie) return { dernier: 0, nonLus: 0 };
  // La pastille compte les SMS de SES cartes : un invité qui verrait monter
  // un chiffre pour des messages qu'il ne peut pas ouvrir apprendrait déjà
  // quelque chose de la caisse des autres.
  if (!portee.tout && portee.cartes.length === 0) return { dernier: 0, nonLus: 0 };
  const dans = portee.tout ? "" : `&carte=in.${listeDeCartes(portee.cartes)}`;
  const entetes = { apikey: cle!, authorization: `Bearer ${cle}` };
  let dernier = 0;
  let nonLus = 0;
  try {
    const r = await fetch(`${url}/rest/v1/paiements?select=id${dans}&order=id.desc&limit=1`, {
      headers: entetes, cache: "no-store",
    });
    if (r.ok) {
      const lignes = (await r.json()) as { id: number }[];
      dernier = lignes[0]?.id ?? 0;
    }
    // Le compte est lu dans l'en-tête « content-range » (« 0-0/42 » → 42).
    // Base pas encore migrée (colonne absente) → réponse 400 → zéro, sans bruit.
    const c = await fetch(`${url}/rest/v1/paiements?select=id${dans}&lu_le=is.null&limit=1`, {
      headers: { ...entetes, prefer: "count=exact" }, cache: "no-store",
    });
    if (c.ok) {
      const plage = c.headers.get("content-range");
      nonLus = Number(plage?.split("/")[1] ?? 0) || 0;
    }
  } catch {
    /* cloud injoignable : la prochaine veille réessaiera */
  }
  return { dernier, nonLus };
}

/** Marque un SMS comme lu : le propriétaire vient d'ouvrir sa fiche. */
export async function marquerLu(id: number): Promise<boolean> {
  if (!relie) return false;
  try {
    const r = await fetch(`${url}/rest/v1/paiements?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        "content-type": "application/json", prefer: "return=minimal",
      },
      body: JSON.stringify({ lu_le: new Date().toISOString() }),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Inscrit (ou rafraîchit) un téléphone qui veut recevoir les notifications.
 *
 * Le jeton d'Expo est la clé : réinstaller l'application en donne un neuf, et
 * l'ancien s'éteint tout seul chez Expo. On écrase donc sans état d'âme —
 * `merge-duplicates` fait un « upsert », ce qui remet `vu_le` à jour à chaque
 * ouverture de l'application.
 *
 * Le téléphone n'écrit JAMAIS dans la base lui-même : il passe par ici,
 * c'est-à-dire par un serveur qui a vérifié sa session.
 */
export async function enregistrerAppareil(
  jeton: string, plateforme: string, nom: string,
  // À QUI SONNE CE TÉLÉPHONE. `null` : au propriétaire (ou à la clé de
  // secours, qui ne désigne personne). Un numéro : à ce compte, qui ne
  // recevra que les SMS des cartes qu'on lui a confiées — le robot fait le
  // tri au moment d'annoncer.
  utilisateur: number | null,
  pourLeProprietaire: boolean,
): Promise<boolean> {
  if (!relie) return false;
  const poser = (corps: Record<string, unknown>) => fetch(`${url}/rest/v1/appareils`, {
    method: "POST",
    headers: {
      apikey: cle!, authorization: `Bearer ${cle}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(corps),
    cache: "no-store",
  });
  try {
    const base = { jeton, plateforme, nom, vu_le: new Date().toISOString() };
    const r = await poser({ ...base, utilisateur });
    if (r.ok) return true;
    // BASE PAS ENCORE MIGRÉE (la colonne « utilisateur » manque). Le
    // téléphone du propriétaire s'inscrit comme avant. Celui d'un titulaire,
    // JAMAIS sans son nom : inscrit sans propriétaire, il serait pris pour
    // celui du propriétaire et recevrait chaque SMS de la maison.
    if (r.status === 400 && pourLeProprietaire && defautDeSchema(await r.text())) {
      return (await poser(base)).ok;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Compte un essai de mot de passe, dans la BASE, et rend le total.
 *
 * `null` quand la base ne répond pas — et ce `null` compte : le frein doit
 * alors retomber sur son seau en mémoire, jamais fermer la porte. Une base
 * injoignable ne doit pas être un verrou sur sa propre maison ; c'est déjà la
 * raison d'être de la clé de secours.
 *
 * Le comptage est fait par la base en UNE instruction (voir
 * `compter_un_essai` dans sql/schema.sql) : lire ici puis écrire là
 * reproduirait exactement la course qu'on veut fermer.
 */
export async function compterUnEssai(
  seau: string, fenetreS: number,
): Promise<number | null> {
  if (!relie) return null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/compter_un_essai`, {
      method: "POST",
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ la_cle: seau, fenetre_s: fenetreS }),
      cache: "no-store",
      // Un frein ne doit jamais faire attendre plus que ce qu'il freine.
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return null;
    const n = await r.json();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LE JOURNAL DES INCIDENTS
//
// Le terminal tient le sien depuis toujours — modem redémarré, SMS illisible,
// nuage injoignable — et il le pousse dans « evenements ». Personne ne le
// lisait : aucun écran ne l'affichait. On collectait pour jeter.
//
// La plateforme, elle, n'écrivait rien : ses pannes partaient dans la sortie
// d'erreur de l'hébergeur, que le propriétaire n'ouvrira jamais. Quand
// quelque chose casse un dimanche à Douala, il faut qu'il reste quelque
// chose à lire — par lui, pas par un informaticien.
// ---------------------------------------------------------------------------

/**
 * Note un incident de la plateforme.
 *
 * CE QUI PEUT ENTRER ICI : une phrase écrite PAR NOUS, en français, qui décrit
 * ce qui s'est passé. « La base n'a pas répondu. » « Un bilan a été coupé à
 * 20 000 lignes. »
 *
 * CE QUI NE PEUT PAS Y ENTRER, jamais : un code PIN, un mot de passe, un
 * courriel, un code à usage unique, le texte d'un SMS. Un journal se garde
 * longtemps et se lit à plusieurs — c'est exactement l'endroit où une donnée
 * personnelle survit à tout le reste. Les valeurs de requête sont déjà
 * effacées des messages d'erreur (`sansValeurs`) pour cette raison.
 *
 * Elle n'attend pas et n'échoue jamais bruyamment : noter un incident ne doit
 * pas pouvoir causer un second incident. Si la base ne répond pas, il n'y a
 * rien à faire de plus — et c'est précisément le cas où elle ne répondra pas.
 */
export function noterIncident(texte: string): void {
  if (!relie || !texte) return;
  void fetch(`${url}/rest/v1/evenements`, {
    method: "POST",
    headers: {
      apikey: cle!, authorization: `Bearer ${cle}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify([{
      terminal: null,
      // La plateforme n'a pas de journal local à numéroter : l'instant fait
      // l'affaire, et la contrainte d'unicité ne porte que sur les lignes
      // qui ont un terminal.
      source_id: Date.now(),
      texte: texte.slice(0, 500),
      survenu_le: new Date().toISOString(),
    }]),
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  }).catch(() => { /* un journal muet vaut mieux qu'une panne de plus */ });
}

export type Incident = {
  id: number;
  quand: string;
  /** « Le terminal » ou « La plateforme » — l'objet, pas la technique. */
  qui: string;
  texte: string;
};

/** Les derniers incidents, du plus récent au plus ancien. */
export async function lireIncidents(limite = 100): Promise<Incident[]> {
  const lignes = await lire<{
    id: number; terminal: string | null; texte: string; survenu_le: string;
  }>(`evenements?select=id,terminal,texte,survenu_le`
     + `&order=survenu_le.desc&limit=${Math.min(Math.max(1, limite), 500)}`);
  return lignes.map((l) => ({
    id: l.id,
    quand: l.survenu_le,
    qui: l.terminal ?? "",
    texte: l.texte,
  }));
}

/** La carte d'un SMS — pour savoir si la main qui le touche en est le
 *  titulaire. Par son identifiant en base, ou par celui du journal du
 *  terminal (`source_id`, ce que porte une demande de reçu). */
export async function carteDuSms(
  par: { id: number } | { source: number; terminal?: string | null },
): Promise<string | null> {
  const filtre = "id" in par
    ? `id=eq.${par.id}`
    : `source_id=eq.${par.source}` + (par.terminal
      ? `&terminal=eq.${encodeURIComponent(par.terminal)}` : "");
  const lignes = await lire<{ carte: string | null }>(
    `paiements?select=carte&${filtre}&limit=2`);
  // Deux terminaux peuvent porter le même numéro de journal : sans terminal
  // pour trancher, deux réponses différentes ne désignent AUCUNE carte.
  const cartes = new Set(lignes.map((l) => l.carte));
  return cartes.size === 1 ? lignes[0].carte : null;
}

/** La carte de la session USSD où tombe une réponse qui ne la nomme pas :
 *  celle de la DERNIÈRE ouverture déposée PAR LA MÊME PERSONNE.
 *
 *  C'était « la dernière ouverture déposée pour ce terminal », juste tant
 *  que le robot ne tenait qu'une session à la fois. Il en tient maintenant
 *  une par carte et par personne : la dernière ouverture du terminal peut
 *  être celle de quelqu'un d'autre, sur une autre carte, et la réponse
 *  légitime de la première personne partait vers une carte qui n'était pas
 *  la sienne — refusée par la carte, au robot, mais refusée quand même. La
 *  personne, elle, ne se trompe pas de session ; et sa dernière ouverture
 *  dit aussi sur quel boîtier elle est.
 *
 *  Sans personne (plateforme sans verrou : le développement local), on
 *  garde l'ancien chemin — la dernière ouverture du terminal.
 *
 *  Seulement la dernière : si elle ne nomme aucune carte, on ne remonte
 *  pas plus loin chercher une session plus ancienne. Si c'est la mauvaise,
 *  la carte refusera d'écrire : elle revérifie qui tient son menu. */
export async function carteDeLaSession(
  par: string | null, terminal?: string | null,
): Promise<string | null> {
  let filtre: string;
  if (par && /^[A-Za-z0-9:_-]{1,40}$/.test(par)) {
    filtre = `&parametres->>par=eq.${encodeURIComponent(par)}`;
  } else {
    const t = terminal || (await terminalVise());
    if (!t) return null;
    filtre = `&terminal=eq.${encodeURIComponent(t)}`;
  }
  const lignes = await lire<{ parametres: Record<string, unknown> | null }>(
    `commandes?select=parametres&type=eq.ussd${filtre}&order=id.desc&limit=1`);
  const carte = lignes[0]?.parametres?.carte;
  return typeof carte === "string" && /^\d{1,22}$/.test(carte) ? carte : null;
}

/** La carte visée par une demande déjà déposée — sans jamais rendre ses
 *  paramètres à l'écran (une réponse peut porter le code secret). */
export async function carteDeLaCommande(id: number): Promise<string | null> {
  const lignes = await lire<{ id: number; type: string; parametres: Record<string, unknown> | null; terminal: string | null }>(
    `commandes?select=id,type,parametres,terminal&id=eq.${id}&limit=1`);
  const c = lignes.find((x) => x.id === id);
  if (!c) return null;
  const p = c.parametres ?? {};
  const carte = typeof p.carte === "string" ? p.carte
    : typeof p.iccid === "string" ? p.iccid : null;
  if (carte) return carte;
  if (typeof p.source_id === "number") {
    return carteDuSms({ source: p.source_id, terminal: c.terminal });
  }
  return null;
}

export async function lireCommande(
  id: number,
): Promise<{ etat: string; resultat: string | null } | null> {
  const lignes = await lire<{ id: number; etat: string; resultat: string | null }>(
    `commandes?select=id,etat,resultat&id=eq.${id}&limit=1`);
  const c = lignes.find((x) => x.id === id);
  return c ? { etat: c.etat, resultat: c.resultat } : null;
}

/** Qui a déposé cette demande (`par`, nommé par la plateforme), sur quelle
 *  carte, et où elle en est — sans jamais rendre ses paramètres. `par` est
 *  absent d'une demande d'avant, ou d'une réponse dont le robot a effacé le
 *  code secret (il ne garde que le drapeau et la carte). */
export async function auteurDeLaCommande(
  id: number,
): Promise<{ par: string | null; carte: string | null; etat: string } | null> {
  const lignes = await lire<{
    id: number; etat: string; terminal: string | null;
    parametres: Record<string, unknown> | null;
  }>(`commandes?select=id,etat,terminal,parametres&id=eq.${id}&limit=1`);
  const c = lignes.find((x) => x.id === id);
  if (!c) return null;
  const par = c.parametres?.par;
  return {
    par: typeof par === "string" ? par : null,
    carte: await carteDeLaCommande(id),
    etat: c.etat,
  };
}

/** Les phrases qu'une ANNULATION écrit dans le résultat, dans les deux
 *  langues : c'est à elles qu'on reconnaît, plus tard, une demande annulée
 *  depuis l'écran — le robot n'écrit jamais ces mots-là. */
const PHRASES_D_ANNULATION = new Set(
  Object.values(textesApi).map((t) => t.demandeAnnulee));

/**
 * ANNULER une demande que le boîtier n'a pas encore prise.
 *
 * L'écran abandonne au bout d'une trentaine de secondes sans réponse. Il ne
 * retirait rien : la demande restait « en attente », et un boîtier revenu
 * des heures plus tard la composait — numéro et montant compris — pour un
 * écran qui avait dit « le terminal n'a pas répondu » depuis longtemps.
 *
 * LA CONDITION FAIT TOUT. Le passage « en attente » → « échouée » ne se fait
 * QUE si la demande est encore en attente : le filtre `etat=eq.en_attente`
 * fait partie de l'écriture, donc du même verrou de ligne que la réclamation
 * du robot (`reclamer`, totem/nuage.py), qui pose la même condition. Des
 * deux, un seul gagne, et chacun le sait :
 *   — l'annulation a pris : le robot ne la prendra plus, RIEN n'est parti ;
 *   — elle n'a pas pris : le robot l'a déjà en main (ou l'a finie) — l'écran
 *     ne doit SURTOUT PAS dire « rien n'est parti ».
 *
 * Rend « annulee », l'état où elle se trouvait (elle n'a pas pris), ou
 * `null` quand la base n'a pas répondu — et alors on ne sait pas.
 */
export async function annulerCommande(
  id: number, langue: Langue,
): Promise<{ annulee: boolean; etat: string } | null> {
  if (!relie || !Number.isInteger(id)) return null;
  const champs: Record<string, unknown> = {
    etat: "echouee", resultat: textesApi[langue].demandeAnnulee,
    traitee_le: new Date().toISOString(),
  };
  // LE CODE SECRET NE SURVIT PAS À UNE ANNULATION. Une réponse qui le porte
  // attend le robot avec lui, en clair ; c'est le robot qui l'efface, en la
  // traitant (`_parametres_masques`). Annulée, elle ne sera jamais traitée :
  // sans ceci, le code resterait dans la base pour toujours, sur une ligne
  // « échouée » que personne ne relit. On garde ce que le robot garde — le
  // drapeau, la carte — et la personne, qui dit à qui est la demande.
  //
  // SANS RELECTURE, PAS D'ÉCRITURE. `lire` rend une liste VIDE quand la base
  // hoquette : on ne savait plus si la demande portait un code, on écrivait
  // quand même l'annulation — qui réussissait — et le code restait dans la
  // ligne close, pour toujours. Une annulation dont on ne peut pas masquer
  // le code n'est pas faite : `null`, et l'écran dit « incertaine » (elle
  // peut encore partir — regardez vos SMS). Une base à jour le retire de
  // toute façon dans la même écriture que la fermeture (déclencheur
  // « commandes_code_efface », sql/schema.sql) ; ceci tient la promesse sur
  // une base qui n'a pas encore reçu la migration.
  const avant = await lire<{ id: number; parametres: Record<string, unknown> | null }>(
    `commandes?select=id,parametres&id=eq.${id}&limit=1`);
  const relue = avant.find((x) => x.id === id);
  if (!relue) return null;
  const parametres = relue.parametres;
  if (parametres?.secret === true) {
    champs.parametres = Object.fromEntries(Object.entries(parametres)
      .filter(([cle]) => ["secret", "carte", "par", "langue"].includes(cle)));
  }
  // La condition `etat=eq.en_attente` fait partie de l'écriture : si le
  // robot l'a réclamée entre la lecture ci-dessus et maintenant, rien n'est
  // touché — ni l'état, ni ses paramètres. Seul l'identifiant revient :
  // la ligne entière porterait le code qu'on vient d'effacer.
  const r = await ecrire(
    `commandes?id=eq.${id}&etat=eq.en_attente&select=id`, "PATCH", champs);
  if (!r?.ok) return null;
  const changees = (await r.json().catch(() => null)) as { id: number }[] | null;
  if (!Array.isArray(changees)) return null;
  if (changees.some((c) => c.id === id)) return { annulee: true, etat: "echouee" };
  // Rien n'a changé : elle n'était plus en attente. Où en est-elle ?
  const lignes = await lire<{ id: number; etat: string; resultat: string | null }>(
    `commandes?select=id,etat,resultat&id=eq.${id}&limit=1`);
  const c = lignes.find((x) => x.id === id);
  if (!c) return null;
  // Une annulation REDEMANDÉE (la réponse de la première s'est perdue en
  // route) retrouve la sienne : c'est le même geste, il a pris.
  if (c.etat === "echouee" && c.resultat && PHRASES_D_ANNULATION.has(c.resultat)) {
    return { annulee: true, etat: c.etat };
  }
  return { annulee: false, etat: c.etat };
}

// ---------------------------------------------------------------------------
// LES COMPTES
//
// Tout ce qui touche à la table `utilisateurs` passe par ici, et seulement
// par ici. Aucune de ces fonctions n'est appelée depuis un composant client :
// elles vivent derrière les routes API, qui vérifient la session avant.
//
// L'empreinte du mot de passe ne SORT jamais de ce fichier autrement que
// pour être vérifiée sur place (voir `lib/motdepasse.ts`). Elle n'entre dans
// aucune réponse, aucun journal, aucun message.
// ---------------------------------------------------------------------------

export type Utilisateur = {
  id: number;
  courriel: string;
  /** Le prénom et le nom, tels que le propriétaire les a saisis en créant
   *  le compte. Vides pour un compte d'avant (la colonne n'existait pas). */
  prenom: string;
  nom: string;
  /** L'adresse postale et le téléphone donnés à l'inscription publique —
   *  de quoi joindre la personne pour installer sa carte. Vides pour un
   *  compte d'avant, ou créé par le propriétaire sans les connaître. */
  adresse: string;
  telephone: string;
  role: "proprietaire" | "invite";
  approuve: boolean;
  creeLe: string | null;
  vuLe: string | null;
};

type LigneUtilisateur = {
  id: number; courriel: string; empreinte: string;
  prenom?: string | null; nom?: string | null;
  adresse?: string | null; telephone?: string | null;
  role: string; approuve: boolean;
  cree_le: string | null; vu_le: string | null;
};

const versUtilisateur = (l: LigneUtilisateur): Utilisateur => ({
  id: l.id,
  courriel: l.courriel,
  prenom: l.prenom ?? "",
  nom: l.nom ?? "",
  adresse: l.adresse ?? "",
  telephone: l.telephone ?? "",
  role: l.role === "proprietaire" ? "proprietaire" : "invite",
  approuve: Boolean(l.approuve),
  creeLe: l.cree_le,
  vuLe: l.vu_le,
});

/** Écrit dans la base avec la clé de service. Rend la réponse brute. */
async function ecrire(
  chemin: string, methode: string, corps: unknown, entetes: Record<string, string> = {},
): Promise<Response | null> {
  if (!relie) return null;
  try {
    return await fetch(`${url}/rest/v1/${chemin}`, {
      method: methode,
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...entetes,
      },
      body: JSON.stringify(corps),
      cache: "no-store",
    });
  } catch (e) {
    console.error(`Supabase injoignable : ${String(e)}`);
    return null;
  }
}

/** Combien de comptes existent. Sert à savoir si celui qu'on crée est LE
 *  premier — celui du propriétaire, qui n'a personne pour l'approuver.
 *
 *  Rend `null` si la base ne répond pas : « je ne sais pas » n'est pas
 *  « zéro ». Confondre les deux ferait du prochain inscrit un propriétaire
 *  parce que Supabase a hoqueté — la pire des portes dérobées. */
export async function compterUtilisateurs(): Promise<number | null> {
  if (!relie) return null;
  try {
    const r = await fetch(`${url}/rest/v1/utilisateurs?select=id&limit=1`, {
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        prefer: "count=exact", range: "0-0",
      },
      cache: "no-store",
    });
    if (!r.ok) return null;
    // PostgREST met le total dans « content-range » : « 0-0/7 ».
    const total = r.headers.get("content-range")?.split("/")[1];
    if (total === undefined || total === "*") return null;
    const n = Number(total);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

/** Le compte portant ce courriel, EMPREINTE COMPRISE — pour la vérifier.
 *
 *  Le seul endroit où l'empreinte sort de la base. Elle ne doit pas quitter
 *  la route qui appelle ceci. */
export async function utilisateurAVerifier(
  courriel: string,
): Promise<{ compte: Utilisateur; empreinte: string } | null> {
  if (!relie || !courriel) return null;
  const lignes = await lire<LigneUtilisateur>(
    `utilisateurs?courriel=eq.${encodeURIComponent(courriel)}&limit=1`);
  const l = lignes[0];
  return l ? { compte: versUtilisateur(l), empreinte: l.empreinte } : null;
}

/** Le compte portant cet identifiant. Sans empreinte : on ne la sort que
 *  pour la vérifier, et cette fonction-ci sert à afficher. */
export async function utilisateurParId(id: number): Promise<Utilisateur | null> {
  if (!relie || !Number.isInteger(id)) return null;
  const lignes = await lire<LigneUtilisateur>(
    `utilisateurs?select=id,courriel,role,approuve,cree_le,vu_le&id=eq.${id}&limit=1`);
  return lignes[0] ? versUtilisateur(lignes[0] as LigneUtilisateur) : null;
}

/**
 * Crée un compte.
 *
 * Trois réponses, et la distinction compte :
 *   — le compte,   quand il est né ;
 *   — « refuse »,  quand la BASE a dit non : le courriel est déjà pris, ou
 *                  un propriétaire existe déjà. C'est une règle, pas une
 *                  panne — et la seule qui tienne, puisqu'elle s'applique au
 *                  moment de l'écriture (voir l'index du propriétaire unique
 *                  dans sql/schema.sql) ;
 *   — null,        quand la base n'a pas répondu du tout.
 *
 * Confondre les deux derniers ferait répondre « réessayez » à quelqu'un dont
 * la demande ne pourra jamais aboutir — et « impossible » à quelqu'un qu'un
 * simple hoquet du réseau a écarté.
 *
 * Jamais un compte à moitié créé : PostgREST écrit la ligne ou ne l'écrit pas.
 */
export async function creerUtilisateur(
  courriel: string, empreinte: string,
  role: "proprietaire" | "invite", approuve: boolean,
  // Ce qu'on sait de la personne. Chaque champ ne part que s'il est rempli :
  // le propriétaire qui crée un vendeur ne connaît pas forcément son adresse.
  identite: { prenom?: string; nom?: string; adresse?: string; telephone?: string } = {},
): Promise<Utilisateur | "refuse" | null> {
  const ligne: Record<string, unknown> = { courriel, empreinte, role, approuve };
  if (identite.prenom) ligne.prenom = identite.prenom;
  if (identite.nom) ligne.nom = identite.nom;
  if (identite.adresse) ligne.adresse = identite.adresse;
  if (identite.telephone) ligne.telephone = identite.telephone;
  const r = await ecrire("utilisateurs", "POST", [ligne]);
  if (!r) return null;
  // 409 : une contrainte d'unicité a parlé (code Postgres 23505).
  if (r.status === 409) return "refuse";
  if (!r.ok) {
    // UNE BASE PAS ENCORE MIGRÉE se dit ici, en clair, dans le journal du
    // serveur : sans les colonnes « adresse » et « telephone », AUCUNE
    // inscription ne passe — et l'écran ne peut dire que « impossible ».
    const texte = await r.text().catch(() => "");
    if (defautDeSchema(texte)) {
      console.error("La table « utilisateurs » n'a pas encore les colonnes de "
        + "l'inscription publique : jouez migrations/20261004_inscription_publique.sql.");
    }
    return null;
  }
  const lignes = (await r.json().catch(() => [])) as LigneUtilisateur[];
  return lignes[0] ? versUtilisateur(lignes[0]) : null;
}

/** Note l'heure de la connexion réussie, et rafraîchit l'empreinte si le
 *  nombre de tours a été augmenté depuis. Ni l'un ni l'autre ne doit pouvoir
 *  faire échouer une connexion : on ignore l'échec. */
export async function noterConnexion(
  id: number, nouvelleEmpreinte?: string,
): Promise<void> {
  const champs: Record<string, unknown> = { vu_le: new Date().toISOString() };
  if (nouvelleEmpreinte) champs.empreinte = nouvelleEmpreinte;
  await ecrire(`utilisateurs?id=eq.${id}`, "PATCH", champs,
               { prefer: "return=minimal" });
}

/** Tous les comptes, pour l'écran du propriétaire. Sans les empreintes. */
export async function listerUtilisateurs(): Promise<Utilisateur[]> {
  const lignes = await lire<LigneUtilisateur>(
    // « select=* » à dessein : le prénom et le nom n'existent qu'après la
    // migration du 1er octobre — les nommer rendrait la liste VIDE sur une
    // base en retard. L'empreinte arrive avec l'étoile, mais `versUtilisateur`
    // ne la recopie pas : elle ne sort pas d'ici.
    //
    // LES PLUS RÉCENTS D'ABORD, puis remis dans l'ordre d'arrivée. Avec
    // l'inscription publique, « les deux cents premiers » excluaient
    // justement ceux qui attendent leur puce : les derniers inscrits.
    "utilisateurs?select=*&order=cree_le.desc&limit=500");
  return lignes.map(versUtilisateur).reverse();
}

/** Pose une nouvelle empreinte de mot de passe. L'appelant a déjà prouvé
 *  qu'il connaît l'ancienne : cette fonction ne fait qu'écrire. */
export async function definirEmpreinte(
  id: number, empreinte: string,
): Promise<boolean> {
  if (!Number.isInteger(id)) return false;
  const r = await ecrire(`utilisateurs?id=eq.${id}`, "PATCH", { empreinte },
                         { prefer: "return=minimal" });
  return Boolean(r?.ok);
}

/** Le propriétaire ouvre — ou referme — la porte à un compte. */
export async function definirApprobation(
  id: number, approuve: boolean,
): Promise<boolean> {
  if (!Number.isInteger(id)) return false;
  const r = await ecrire(`utilisateurs?id=eq.${id}`, "PATCH", { approuve },
                         { prefer: "return=minimal" });
  return Boolean(r?.ok);
}

/** Le propriétaire supprime un compte. Le sien, jamais : la route le refuse. */
export async function supprimerUtilisateur(id: number): Promise<boolean> {
  if (!relie || !Number.isInteger(id)) return false;
  try {
    const r = await fetch(`${url}/rest/v1/utilisateurs?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: cle!, authorization: `Bearer ${cle}` },
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// LES CARTES DE CHACUN
//
// Quelle personne voit quelle carte. Le propriétaire voit tout et n'a pas de
// ligne ici ; un invité sans ligne ne voit rien. La règle qui s'en sert vit
// dans `lib/portee.ts` — ici, on ne fait que lire et écrire la liste.
// ---------------------------------------------------------------------------

/** Les cartes confiées à ce compte. Une base muette rend une liste vide :
 *  dans le doute, on ne montre pas. */
export async function cartesDe(id: number): Promise<string[]> {
  if (!relie || !Number.isInteger(id)) return [];
  const lignes = await lire<{ utilisateur: number; iccid: string }>(
    `attributions?select=utilisateur,iccid&utilisateur=eq.${id}`);
  return lignes.filter((l) => l.utilisateur === id).map((l) => l.iccid);
}

/** Toutes les attributions : numéro de compte → ses cartes. */
export async function listerAttributions(): Promise<Map<number, string[]>> {
  const lignes = await lire<{ utilisateur: number; iccid: string }>(
    "attributions?select=utilisateur,iccid&order=attribuee_le.asc");
  const parCompte = new Map<number, string[]>();
  for (const l of lignes) {
    parCompte.set(l.utilisateur, [...(parCompte.get(l.utilisateur) ?? []), l.iccid]);
  }
  return parCompte;
}

/** Confie une carte à quelqu'un. Déjà confiée : c'est fait, pas une erreur. */
export async function attribuerCarte(id: number, iccid: string): Promise<boolean> {
  if (!Number.isInteger(id) || !/^[A-Za-z0-9]{1,32}$/.test(iccid)) return false;
  const r = await ecrire("attributions?on_conflict=utilisateur,iccid", "POST",
    [{ utilisateur: id, iccid }],
    { prefer: "resolution=ignore-duplicates,return=minimal" });
  return Boolean(r?.ok);
}

/** Reprend une carte. Déjà reprise : c'est fait aussi. */
export async function retirerCarte(id: number, iccid: string): Promise<boolean> {
  if (!relie || !Number.isInteger(id) || !/^[A-Za-z0-9]{1,32}$/.test(iccid)) return false;
  try {
    const r = await fetch(
      `${url}/rest/v1/attributions?utilisateur=eq.${id}&iccid=eq.${iccid}`,
      { method: "DELETE", headers: { apikey: cle!, authorization: `Bearer ${cle}` },
        cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

/** Les jetons des appareils inscrits — comme le robot les lit.
 *
 *  Sert à l'essai de notification : la plateforme doit pouvoir sonner
 *  elle-même, une fois, pour que le propriétaire sache tout de suite si son
 *  téléphone répond. Le reste du temps, c'est le robot qui sonne. */
export async function listerAppareils(
  // Les téléphones de qui ? `null` : ceux du propriétaire, inscrits sans nom
  // de compte (la clé de secours, les inscriptions d'avant). Un numéro : ceux
  // de ce compte — et, pour le propriétaire, AUSSI ceux d'avant.
  utilisateur: number | null, proprietaire: boolean,
): Promise<{ jeton: string; nom: string | null; plateforme: string | null }[]> {
  const qui = utilisateur == null ? "utilisateur=is.null"
    : proprietaire ? `or=(utilisateur.is.null,utilisateur.eq.${utilisateur})`
      : `utilisateur=eq.${utilisateur}`;
  type Appareil = { jeton: string; nom: string | null; plateforme: string | null };
  if (!relie) return [];
  try {
    const r = await fetch(
      `${url}/rest/v1/appareils?select=jeton,nom,plateforme&${qui}&order=vu_le.desc&limit=20`,
      { headers: { apikey: cle!, authorization: `Bearer ${cle}` }, cache: "no-store" });
    if (r.ok) return (await r.json()) as Appareil[];
    // Base pas encore migrée : la colonne manque. Tous les téléphones sont
    // alors ceux du propriétaire — seul lui a jamais pu en inscrire. Un
    // titulaire, lui, n'en a aucun.
    if (defautDeSchema(await r.text()) && (utilisateur == null || proprietaire)) {
      return lire<Appareil>("appareils?select=jeton,nom,plateforme&order=vu_le.desc&limit=20");
    }
    return [];
  } catch {
    return [];
  }
}

/** Oublie un appareil dont Expo dit qu'il n'existe plus.
 *
 *  Sans ce ménage, un téléphone désinstallé garde sa ligne pour toujours, et
 *  chaque notification part vers une adresse morte — jusqu'au jour où l'on
 *  compte les appareils servis et où le chiffre ment. */
export async function oublierAppareil(jeton: string): Promise<boolean> {
  if (!relie || !jeton) return false;
  try {
    const r = await fetch(
      `${url}/rest/v1/appareils?jeton=eq.${encodeURIComponent(jeton)}`,
      { method: "DELETE", headers: { apikey: cle!, authorization: `Bearer ${cle}` },
        cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// LES BÉNÉFICIAIRES
//
// Le carnet suit la CARTE. Qui peut écrire dedans se décide dans la route
// (`maniement`) : ces fonctions ne font qu'écrire ce qu'on leur donne, déjà
// nettoyé — la base retient de toute façon la forme du numéro et du nom.
// ---------------------------------------------------------------------------

async function ecrireBeneficiaires(
  methode: "POST" | "PATCH" | "DELETE", chemin: string, corps?: unknown,
  entetes: Record<string, string> = {},
): Promise<boolean> {
  if (!relie) return false;
  try {
    const r = await fetch(`${url}/rest/v1/${chemin}`, {
      method: methode,
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        "content-type": "application/json", prefer: "return=minimal", ...entetes,
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Enregistre un bénéficiaire — ou renomme celui que la carte connaît déjà
 *  sous ce numéro : une carte ne connaît un numéro qu'une fois. */
export function enregistrerBeneficiaire(
  carte: string, numero: string, nom: string, par: number | null,
): Promise<boolean> {
  return ecrireBeneficiaires("POST", "beneficiaires?on_conflict=carte,numero",
    { carte, numero, nom, cree_par: par, maj_le: new Date().toISOString() },
    { prefer: "resolution=merge-duplicates,return=minimal" });
}

export async function beneficiaireParId(id: number): Promise<Beneficiaire | null> {
  const lignes = await lire<Beneficiaire>(
    `beneficiaires?select=id,carte,numero,nom&id=eq.${id}&limit=1`);
  return lignes.find((b) => b.id === id) ?? null;
}

export function renommerBeneficiaire(id: number, nom: string): Promise<boolean> {
  return ecrireBeneficiaires("PATCH", `beneficiaires?id=eq.${id}`,
    { nom, maj_le: new Date().toISOString() });
}

export function supprimerBeneficiaire(id: number): Promise<boolean> {
  return ecrireBeneficiaires("DELETE", `beneficiaires?id=eq.${id}`);
}
