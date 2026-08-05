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

import type { Donnees, EtatTerminal, Paiement, Sim } from "./types";

const url = process.env.SUPABASE_URL;
const cle = process.env.SUPABASE_CLE;

export const relie = Boolean(url && cle);

const FUSEAU = "Africa/Douala"; // l'argent vit à Douala : les heures aussi

async function lire<T>(chemin: string): Promise<T[]> {
  if (!relie) return [];
  try {
    const r = await fetch(`${url}/rest/v1/${chemin}`, {
      headers: { apikey: cle!, authorization: `Bearer ${cle}` },
      cache: "no-store",
    });
    if (!r.ok) {
      console.error(`Supabase : ${chemin} → ${r.status}`);
      return [];
    }
    return (await r.json()) as T[];
  } catch (e) {
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
};
type LigneRecu = { numero: string; reference: string | null; chemin: string };

type LignePaiement = {
  id: number; source_id?: number | null; expediteur?: string | null;
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

function heure(ts: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit", minute: "2-digit", timeZone: FUSEAU,
  }).format(new Date(ts));
}

function jourLocal(d: Date): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU }).format(d);
}

function libelleJour(ts: string): string {
  const jour = jourLocal(new Date(ts));
  const present = new Date();
  if (jour === jourLocal(present)) return "Aujourd’hui";
  if (jour === jourLocal(new Date(present.getTime() - 86_400_000))) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", timeZone: FUSEAU,
  }).format(new Date(ts));
}

function dateCourte(ts: string | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "short", year: "numeric", timeZone: FUSEAU,
  }).format(new Date(ts));
}

function ecartHumain(ts: string | null): string {
  if (!ts) return "jamais vu";
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86_400)} j`;
}

// Une carte est « en place » si le terminal l'a vue il y a moins de dix
// minutes : au-delà, elle a été retirée (ou le terminal s'est tu — et alors
// c'est lui qu'on signale comme muet).
const EN_PLACE_MS = 10 * 60 * 1000;

// --- Le chargement complet ---------------------------------------------------

export async function chargerDonnees(): Promise<Donnees> {
  // « select=* » à dessein : exiger une colonne par son nom rend l'écran
  // VIDE quand la base a une migration de retard (la requête entière est
  // refusée). Avec l'étoile, une colonne absente donne un affichage un peu
  // moins riche — jamais une liste vide. Les champs du type non présents
  // arrivent à undefined, que chaque lecture traite déjà comme null.
  const [terminaux, cartes, comptes, lignes, recus] = await Promise.all([
    lire<LigneTerminal>("terminaux?select=*&order=vu_le.desc.nullslast&limit=1"),
    lire<LigneCarte>("cartes?select=*&order=derniere_vue.desc.nullslast"),
    lire<LigneCompte>("comptes?select=*"),
    lire<LignePaiement>("paiements?select=*&order=recu_le.desc&limit=1000"),
    lire<LigneRecu>("recus?select=*&order=etabli_le.desc&limit=1000"),
  ]);

  const t = terminaux[0];
  const terminal: EtatTerminal | null = t
    ? {
        id: t.id,
        nom: t.nom || t.id.charAt(0).toUpperCase() + t.id.slice(1),
        enLigne: Boolean(t.vu_le && Date.now() - new Date(t.vu_le).getTime() < 3 * 60 * 1000),
        majTexte: ecartHumain(t.vu_le),
        version: t.version ?? "",
        sante: t.sante?.resume ?? "",
        enAttente: t.sante?.en_attente ?? 0,
      }
    : null;

  // Le numéro d'un reçu se termine par l'identifiant de la ligne du journal
  // (« TM-2026-0731-0042 » → 42) : c'est un lien EXACT avec son SMS, valable
  // pour les transferts comme pour les soldes — aucune devinette.
  const ligneDuRecu = (numero: string): number | null => {
    const m = /-(\d+)$/.exec(numero);
    return m ? Number(m[1]) : null;
  };
  const recuDe = (l: LignePaiement): string | null => {
    const parReference = l.reference
      ? recus.find((r) => r.reference && r.reference === l.reference)
      : undefined;
    if (parReference) return parReference.numero;
    if (l.source_id == null) return null;
    return recus.find((r) => ligneDuRecu(r.numero) === l.source_id)?.numero ?? null;
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
  const parNature = (v: string | null | undefined): Paiement["nature"] =>
    (v as Paiement["nature"]) || null;

  // Chaque ligne est un SMS reçu par une carte ; ceux que le robot a compris
  // portent un montant, les autres restent lisibles tels quels.
  const paiements: Paiement[] = [...lignes]
    .sort((a, b) => (moment(a) < moment(b) ? 1 : moment(a) > moment(b) ? -1 : 0))
    .map((l) => ({
      id: String(l.id),
      sim: (l.compte ?? "").split(" ")[0] || l.carte || "—",
      // Le robot laisse le sens vide quand le SMS ne permet pas de trancher :
      // on l'affiche comme inconnu, jamais comme une sortie par défaut.
      sens: (l.sens === "entree" ? "in" : l.sens === "sortie" ? "out" : "?") as "in" | "out" | "?",
      nom: nomDe(l),
      numero: l.numero ?? "",
      montant: l.montant == null ? null : Number(l.montant),
      heure: heure(moment(l)),
      date: libelleJour(moment(l)),
      recuLe: moment(l),
      // Catégorie devinée ; « message » à défaut (vieux SMS sans la colonne).
      categorie: (l.categorie as Paiement["categorie"]) || "message",
      nature: parNature(l.nature),
      reference: l.reference ?? "",
      soldeApres: l.solde_apres == null ? null : Number(l.solde_apres),
      smsBrut: l.texte,
      recu: recuDe(l),
      sourceId: l.source_id ?? null,
      // Non lu SEULEMENT si la base connaît la notion (colonne présente) et
      // que la ligne n'a jamais été ouverte. Base pas migrée → tout est « lu » :
      // la fonctionnalité dort, elle ne crie pas faux.
      nonLu: l.lu_le === null,
    }));

  const sims: Sim[] = cartes.map((c) => {
    const compte = comptes.find((x) => x.iccid === c.iccid);
    const entrees = lignes.filter((l) => l.carte === c.iccid && l.sens === "entree");
    // Le solde vient du terminal, point : c'est l'interrogation réseau
    // (déclenchée depuis la plateforme) qui le met à jour — jamais un SMS.
    const solde = compte?.solde == null ? null : Number(compte.solde);
    const soldeSource =
      solde != null && compte ? `l’interrogation du ${heure(compte.maj)}` : "";
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
      soldeSource,
      signal: compte?.signal ?? null,
      enPlace,
      premiereVue: dateCourte(c.premiere_vue),
      derniereVue: dateCourte(c.derniere_vue),
      nbPaiements: entrees.length,
      totalRecu: entrees.reduce((s, l) => s + Number(l.montant ?? 0), 0),
    };
  });

  return { relie, terminal, sims, paiements };
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
): Promise<number | null> {
  if (!relie) return null;
  const terminal = await terminalVise();
  if (!terminal) return null;
  try {
    const r = await fetch(`${url}/rest/v1/commandes`, {
      method: "POST",
      headers: {
        apikey: cle!, authorization: `Bearer ${cle}`,
        "content-type": "application/json", prefer: "return=representation",
      },
      body: JSON.stringify({ terminal, type: genre, parametres }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const lignes = (await r.json()) as { id: number }[];
    return lignes[0]?.id ?? null;
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

export async function lireCommande(
  id: number,
): Promise<{ etat: string; resultat: string | null } | null> {
  const lignes = await lire<{ id: number; etat: string; resultat: string | null }>(
    `commandes?select=id,etat,resultat&id=eq.${id}&limit=1`);
  const c = lignes.find((x) => x.id === id);
  return c ? { etat: c.etat, resultat: c.resultat } : null;
}
