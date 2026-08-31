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

import type { Donnees, EtatTerminal, Paiement, RaccourciAppris, Sim } from "@noyau/types";
import { estNature } from "@noyau/natures";
import { estCategorie, jourLocal } from "@noyau/types";
import type { Langue } from "@noyau/langue";

const url = process.env.SUPABASE_URL;
const cle = process.env.SUPABASE_CLE;

export const relie = Boolean(url && cle);

// Le fuseau du terminal, réglable (voir lib/fuseau.ts). Il découpe les
// journées : c'est la caisse qui décide de ce qu'est « aujourd'hui ».
import { FUSEAU } from "./fuseau";

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

type LigneTerminal = {
  id: string; nom: string | null; vu_le: string | null; version: string | null;
  sante?: { resume?: string; en_attente?: number } | null;
};
type LigneCarte = {
  iccid: string; operateur: string | null; libelle: string | null;
  nom?: string | null; numero: string | null;
  premiere_vue: string | null; derniere_vue: string | null;
};
type LigneCompte = {
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

function libelleJour(ts: string, langue: Langue): string {
  const jour = jourLocal(new Date(ts), FUSEAU);
  const present = new Date();
  if (jour === jourLocal(present, FUSEAU)) return langue === "en" ? "Today" : "Aujourd’hui";
  if (jour === jourLocal(new Date(present.getTime() - 86_400_000), FUSEAU)) {
    return langue === "en" ? "Yesterday" : "Hier";
  }
  return new Intl.DateTimeFormat(LOCALE[langue], {
    day: "numeric", month: "long", timeZone: FUSEAU,
  }).format(new Date(ts));
}

function dateCourte(ts: string | null, langue: Langue): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat(LOCALE[langue], {
    day: "numeric", month: "short", year: "numeric", timeZone: FUSEAU,
  }).format(new Date(ts));
}

function ecartHumain(ts: string | null, langue: Langue): string {
  if (!ts) return langue === "en" ? "never seen" : "jamais vu";
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  const forme = (n: number, unite: string) =>
    langue === "en" ? `${n} ${unite} ago` : `il y a ${n} ${unite}`;
  if (s < 60) return forme(s, "s");
  if (s < 3600) return forme(Math.round(s / 60), "min");
  if (s < 86_400) return forme(Math.round(s / 3600), "h");
  return forme(Math.round(s / 86_400), langue === "en" ? "d" : "j");
}

// Une carte est « en place » si le terminal l'a vue il y a moins de dix
// minutes : au-delà, elle a été retirée (ou le terminal s'est tu — et alors
// c'est lui qu'on signale comme muet).
const EN_PLACE_MS = 10 * 60 * 1000;

// --- Le chargement complet ---------------------------------------------------

function versTerminal(t: LigneTerminal | undefined, langue: Langue): EtatTerminal | null {
  return t
    ? {
        id: t.id,
        nom: t.nom || t.id.charAt(0).toUpperCase() + t.id.slice(1),
        enLigne: Boolean(t.vu_le && Date.now() - new Date(t.vu_le).getTime() < 3 * 60 * 1000),
        majTexte: ecartHumain(t.vu_le, langue),
        version: t.version ?? "",
        sante: t.sante?.resume ?? "",
        enAttente: t.sante?.en_attente ?? 0,
      }
    : null;
}

/** Le terminal seul — pour la coquille, qui n'a pas besoin du reste.
 *  Avant, elle rechargeait TOUT (SMS et reçus compris) à chaque page :
 *  chaque clic payait deux fois le plein tarif. */
export async function chargerTerminal(langue: Langue): Promise<EtatTerminal | null> {
  const terminaux = await lire<LigneTerminal>(
    "terminaux?select=*&order=vu_le.desc.nullslast&limit=1");
  return versTerminal(terminaux[0], langue);
}

export async function chargerDonnees(
  langue: Langue,
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
  bornes?: { sms?: number; recus?: number; depuis?: string; compter?: boolean },
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
  const [terminaux, cartes, comptes, releve, recus, boutons] = await Promise.all([
    lire<LigneTerminal>("terminaux?select=*&order=vu_le.desc.nullslast&limit=1"),
    lire<LigneCarte>("cartes?select=*&order=derniere_vue.desc.nullslast"),
    lire<LigneCompte>("comptes?select=*"),
    nSms > 0
      ? (bornes?.compter
          ? lireEtCompter<LignePaiement>(
              `paiements?select=*${filtreDate}&order=recu_le.desc&limit=${nSms}`)
          : lire<LignePaiement>(
              `paiements?select=*${filtreDate}&order=recu_le.desc&limit=${nSms}`)
              .then((lignes) => ({ lignes, total: null as number | null })))
      : Promise.resolve({ lignes: [] as LignePaiement[], total: null as number | null }),
    nRecus > 0
      ? lire<LigneRecu>(`recus?select=*&order=etabli_le.desc&limit=${nRecus}`)
      : Promise.resolve([] as LigneRecu[]),
    // Les boutons appris par le robot. Table absente (base pas migrée) :
    // `lire` rend [] sans bruit — les écrans montrent juste moins de boutons.
    lire<LigneRaccourci>("raccourcis?select=*&order=id"),
  ]);

  const lignes = releve.lignes;
  // La base avait-elle plus à donner que ce qu'on a demandé ? La réponse
  // n'intéresse que l'export comptable — mais elle ne peut se calculer QUE
  // ici, au moment de la lecture.
  const smsTronques = releve.total != null && releve.total > lignes.length;

  const terminal = versTerminal(terminaux[0], langue);

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
      date: libelleJour(moment(l), langue),
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
    const compte = comptes.find((x) => x.iccid === c.iccid);
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
    // lui-même ; à défaut (base pas encore migrée), on retombe sur « maj »,
    // comme avant.
    const soldeMaj = solde != null && compte
      ? heure(compte.solde_maj ?? compte.maj) : null;
    const enPlace = Boolean(
      c.derniere_vue && Date.now() - new Date(c.derniere_vue).getTime() < EN_PLACE_MS,
    );
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
      signal: compte?.signal ?? null,
      enPlace,
      premiereVue: dateCourte(c.premiere_vue, langue),
      derniereVue: dateCourte(c.derniere_vue, langue),
      nbPaiements: entrees.length,
      totalRecu: entrees.reduce((s, l) => s + Number(l.montant ?? 0), 0),
    };
  });

  // Les boutons appris, par opérateur — le pendant web du carnet du robot.
  const raccourcis: Record<string, RaccourciAppris[]> = {};
  for (const b of boutons) {
    const etapes = (b.etapes ?? "").split(",").filter(Boolean);
    if (!b.operateur || !etapes.length) continue;
    (raccourcis[b.operateur] ??= []).push({
      nom: b.nom, libelle: b.libelle || b.nom, etapes,
    });
  }

  return { relie, terminal, sims, paiements, raccourcis, fuseau: FUSEAU,
           smsTronques };
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

async function terminalVise(): Promise<string | null> {
  const t = await lire<{ id: string }>(
    "terminaux?select=id&order=vu_le.desc.nullslast&limit=1");
  return t[0]?.id ?? null;
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
      const deja = await lire<{ id: number }>(
        `commandes?select=id&terminal=eq.${encodeURIComponent(terminal)}`
        + `&cle=eq.${encodeURIComponent(cleIntention)}&limit=1`);
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

export async function chargerActualite(): Promise<{ dernier: number; nonLus: number }> {
  if (!relie) return { dernier: 0, nonLus: 0 };
  const entetes = { apikey: cle!, authorization: `Bearer ${cle}` };
  let dernier = 0;
  let nonLus = 0;
  try {
    const r = await fetch(`${url}/rest/v1/paiements?select=id&order=id.desc&limit=1`, {
      headers: entetes, cache: "no-store",
    });
    if (r.ok) {
      const lignes = (await r.json()) as { id: number }[];
      dernier = lignes[0]?.id ?? 0;
    }
    // Le compte est lu dans l'en-tête « content-range » (« 0-0/42 » → 42).
    // Base pas encore migrée (colonne absente) → réponse 400 → zéro, sans bruit.
    const c = await fetch(`${url}/rest/v1/paiements?select=id&lu_le=is.null&limit=1`, {
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
): Promise<boolean> {
  if (!relie) return false;
  try {
    const r = await fetch(`${url}/rest/v1/appareils`, {
      method: "POST",
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        jeton, plateforme, nom, vu_le: new Date().toISOString(),
      }),
      cache: "no-store",
    });
    return r.ok;
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

export async function lireCommande(
  id: number,
): Promise<{ etat: string; resultat: string | null } | null> {
  const lignes = await lire<{ id: number; etat: string; resultat: string | null }>(
    `commandes?select=id,etat,resultat&id=eq.${id}&limit=1`);
  const c = lignes.find((x) => x.id === id);
  return c ? { etat: c.etat, resultat: c.resultat } : null;
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
  role: "proprietaire" | "invite";
  approuve: boolean;
  creeLe: string | null;
  vuLe: string | null;
};

type LigneUtilisateur = {
  id: number; courriel: string; empreinte: string;
  role: string; approuve: boolean;
  cree_le: string | null; vu_le: string | null;
};

const versUtilisateur = (l: LigneUtilisateur): Utilisateur => ({
  id: l.id,
  courriel: l.courriel,
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
): Promise<Utilisateur | "refuse" | null> {
  const r = await ecrire("utilisateurs", "POST", [{
    courriel, empreinte, role, approuve,
  }]);
  if (!r) return null;
  // 409 : une contrainte d'unicité a parlé (code Postgres 23505).
  if (r.status === 409) return "refuse";
  if (!r.ok) return null;
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
    "utilisateurs?select=id,courriel,role,approuve,cree_le,vu_le" +
    "&order=cree_le.asc&limit=200");
  return lignes.map(versUtilisateur);
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

/** Les jetons des appareils inscrits — comme le robot les lit.
 *
 *  Sert à l'essai de notification : la plateforme doit pouvoir sonner
 *  elle-même, une fois, pour que le propriétaire sache tout de suite si son
 *  téléphone répond. Le reste du temps, c'est le robot qui sonne. */
export async function listerAppareils(): Promise<
  { jeton: string; nom: string | null; plateforme: string | null }[]
> {
  return lire("appareils?select=jeton,nom,plateforme&order=vu_le.desc&limit=20");
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
