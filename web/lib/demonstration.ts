// LE COMPTE DE DÉMONSTRATION — pour les examinateurs d'Apple et de Google.
//
// Un magasin d'applications n'accepte TOTEM qu'après qu'un examinateur l'a
// ouvert et vu fonctionner. Lui donner un vrai compte, c'était lui confier
// une vraie carte SIM : il pouvait y lancer un transfert, avec de vrais
// francs derrière. Ce compte-ci n'en tient aucune.
//
// CE QU'IL VOIT : un jeu de données inventé — deux cartes, une caisse, des
// SMS — servi par le même chemin que les vrais écrans (`chargerDonnees`),
// mais dont chaque lecture répond depuis la mémoire, sans jamais toucher la
// base. Les opérations se déroulent pour de faux : menu, numéro, montant,
// confirmation, code secret, « opération réussie » — sans SIM, sans réseau,
// sans un franc.
//
// CE QU'IL NE VOIT PAS : rien de la maison. Pour toutes les autres routes,
// sa portée est VIDE (`porteeDe` → RIEN) : un compte sans carte, ce que les
// harnais des cartes éprouvent déjà. Il n'administre rien, ne s'inscrit pas
// aux notifications, n'établit aucun reçu.
//
// SES IDENTIFIANTS SONT PUBLICS, et c'est voulu : ils sont dans la fiche du
// magasin (`mobile/store.config.js`), donc dans le dépôt. Ce n'est pas une
// faille — ils n'ouvrent qu'une vitrine. Le propriétaire peut la fermer :
// `DEMONSTRATION=non` dans les variables de la plateforme.

import { cookies } from "next/headers";
import { COOKIE_SESSION, SUJET_DEMONSTRATION, sujetDeSession } from "@/lib/session";

export const COURRIEL_DEMONSTRATION = "examen@totemlabs.app";
export const MOTDEPASSE_DEMONSTRATION = "TOTEM-Examen-2026";

/** La vitrine est-elle ouverte ? Oui, sauf si le propriétaire l'a fermée. */
export const demonstrationOuverte = () =>
  (process.env.DEMONSTRATION || "").trim().toLowerCase() !== "non";

/** Celui qui demande est-il le compte de démonstration ? */
export async function estDemonstration(req?: Request): Promise<boolean> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret || !demonstrationOuverte()) return false;
  const boite = await cookies();
  const porte = req?.headers.get("authorization");
  const [schema, valeur] = porte?.split(" ") ?? [];
  const jeton = boite.get(COOKIE_SESSION)?.value ??
    (schema?.toLowerCase() === "bearer" && valeur ? valeur : undefined);
  return (await sujetDeSession(secret, jeton)) === SUJET_DEMONSTRATION;
}

// ---------------------------------------------------------------------------
// LE JEU DE DONNÉES — inventé, et qui le dit (« Démo »). Les heures se
// calculent à chaque lecture : figées, elles vieilliraient, et le terminal
// passerait pour muet au bout de dix minutes.
// ---------------------------------------------------------------------------

const MTN = "89237010000000000001";
const ORANGE = "89237020000000000002";
const TERMINAL = "demonstration";

export function tablesDeDemonstration(): Record<string, Record<string, unknown>[]> {
  const maintenant = new Date().toISOString();
  const il_y_a = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const encaissement = (
    id: number, carte: string, montant: number, tiers: string, numero: string,
    minutes: number, solde: number | null,
  ) => {
    const mtn = carte === MTN;
    return {
      id, source_id: id, terminal: TERMINAL, carte,
      compte: mtn ? "MTN ·0001" : "Orange ·0002",
      expediteur: mtn ? "MTNMobileMoney" : "OrangeMoney",
      sens: "entree", montant, tiers, numero,
      reference: `DEMO.${id}.${minutes}`, solde_apres: solde,
      texte: `Vous avez recu ${montant.toLocaleString("fr-FR")} FCFA de ${tiers} (${numero}).`
        + (solde ? ` Nouveau solde: ${solde.toLocaleString("fr-FR")} FCFA.` : ""),
      categorie: "encaissement", nature: null,
      emis_le: il_y_a(minutes), recu_le: il_y_a(minutes),
      lu_le: minutes > 60 ? il_y_a(minutes - 5) : null,
    };
  };
  return {
    // Comme la vraie base : le signe de vie daté par le boîtier (`vu_le`), et
    // l'oreille de la base — quand elle l'a entendu, depuis quand il parle
    // sans interruption. La vitrine montre un boîtier qui va bien.
    terminaux: [{
      id: TERMINAL, nom: "Démo", vu_le: maintenant, version: "demonstration",
      sante: { resume: "démonstration", en_attente: 0 },
      entendu_le: maintenant, revenu_le: il_y_a(60 * 24),
    }],
    cartes: [
      { terminal: TERMINAL, iccid: MTN, operateur: "MTN", libelle: "MTN ·0001",
        nom: "BOUTIQUE DÉMO", numero: "670000001",
        premiere_vue: il_y_a(60 * 24 * 30), derniere_vue: maintenant },
      { terminal: TERMINAL, iccid: ORANGE, operateur: "Orange", libelle: "Orange ·0002",
        nom: "", numero: "690000002",
        premiere_vue: il_y_a(60 * 24 * 12), derniere_vue: maintenant },
    ],
    // Comme le vrai robot : « maj » date la LIGNE (le signe de vie la
    // rafraîchit à chaque tour), « solde_maj » date le SOLDE. Sans la
    // seconde, la vitrine aurait daté ses soldes de « maintenant ».
    comptes: [
      { terminal: TERMINAL, iccid: MTN, libelle: "MTN ·0001", operateur: "MTN",
        reseau: "MTN", itinerance: false, numero: "670000001",
        solde: 245000, signal: 22, maj: maintenant, solde_maj: il_y_a(8) },
      { terminal: TERMINAL, iccid: ORANGE, libelle: "Orange ·0002", operateur: "Orange",
        reseau: "Orange", itinerance: false, numero: "690000002",
        solde: 58500, signal: 18, maj: maintenant, solde_maj: il_y_a(35) },
    ],
    paiements: [
      encaissement(12, MTN, 25000, "CLIENT DÉMO A", "670000011", 4, 245000),
      encaissement(11, MTN, 10000, "CLIENT DÉMO B", "670000012", 22, 220000),
      {
        id: 10, source_id: 10, terminal: TERMINAL, carte: ORANGE, compte: "Orange ·0002",
        expediteur: "OrangeMoney", sens: "sortie", montant: 5000,
        tiers: "FOURNISSEUR DÉMO", numero: "690000013",
        reference: "DEMO.10", solde_apres: 58500,
        texte: "Transfert de 5 000 FCFA vers FOURNISSEUR DÉMO effectue. Solde: 58 500 FCFA.",
        categorie: "envoi", nature: null,
        emis_le: il_y_a(70), recu_le: il_y_a(70), lu_le: il_y_a(65),
      },
      {
        id: 9, source_id: 9, terminal: TERMINAL, carte: MTN, compte: "MTN ·0001",
        expediteur: "MTN", sens: null, montant: null, tiers: null, numero: null,
        reference: null, solde_apres: null,
        texte: "Votre solde MoMo est de 210 000 FCFA.",
        categorie: "solde", nature: null,
        emis_le: il_y_a(150), recu_le: il_y_a(150), lu_le: il_y_a(140),
      },
      encaissement(8, MTN, 35000, "CLIENT DÉMO C", "670000014", 60 * 26, null),
      encaissement(7, ORANGE, 15000, "CLIENT DÉMO D", "690000015", 60 * 30, null),
      encaissement(6, MTN, 8000, "CLIENT DÉMO A", "670000011", 60 * 50, null),
      encaissement(5, MTN, 50000, "CLIENT DÉMO E", "670000016", 60 * 75, null),
      encaissement(4, ORANGE, 12500, "CLIENT DÉMO B", "670000012", 60 * 98, null),
      encaissement(3, MTN, 20000, "CLIENT DÉMO C", "670000014", 60 * 122, null),
    ],
    recus: [],
    raccourcis: [
      { operateur: "MTN", nom: "solde", libelle: "Solde", etapes: "*126#,5" },
      { operateur: "MTN", nom: "depot", libelle: "Dépôt", etapes: "*126#,1" },
      { operateur: "MTN", nom: "retrait", libelle: "Retrait", etapes: "*126#,2" },
      { operateur: "MTN", nom: "transfert", libelle: "Transfert", etapes: "*126#,1" },
      { operateur: "Orange", nom: "solde", libelle: "Solde", etapes: "#150#,5" },
      { operateur: "Orange", nom: "depot", libelle: "Dépôt", etapes: "#150#,1" },
      { operateur: "Orange", nom: "retrait", libelle: "Retrait", etapes: "#150#,2" },
      { operateur: "Orange", nom: "transfert", libelle: "Transfert", etapes: "#150#,1" },
    ],
    beneficiaires: [],
  };
}

/** Une lecture « à la PostgREST » sur le jeu inventé : la table, l'ordre,
 *  la limite. Jamais de réseau. Les filtres de portée n'ont pas lieu d'être
 *  ici : tout ce jeu appartient à la démonstration. */
export function lireDansLaDemonstration(
  tables: Record<string, Record<string, unknown>[]>, chemin: string,
): Record<string, unknown>[] {
  const [table, requete = ""] = chemin.split("?");
  const params = new URLSearchParams(requete);
  let lignes = [...(tables[table] ?? [])];
  const ordre = params.get("order");
  if (ordre) {
    const [champ, sens] = ordre.split(".");
    lignes.sort((a, b) => {
      const x = String(a[champ] ?? ""), y = String(b[champ] ?? "");
      return sens === "desc" ? y.localeCompare(x) : x.localeCompare(y);
    });
  }
  const limite = Number(params.get("limit"));
  if (Number.isInteger(limite) && limite > 0) lignes = lignes.slice(0, limite);
  return lignes;
}

// ---------------------------------------------------------------------------
// LES OPÉRATIONS, JOUÉES POUR DE FAUX — et SANS ÉTAT. Une plateforme peut
// tourner sur plusieurs machines : une réponse rangée en mémoire sur l'une
// serait introuvable sur l'autre. La réponse voyage donc DANS le numéro de
// la demande, et la lecture la retrouve par le calcul.
// ---------------------------------------------------------------------------

const BASE_DEMANDE = 8_000_000_000_000;
const GENRES = ["menu", "numero", "montant", "confirmer", "reussi", "fin", "solde"] as const;
type GenreReponse = (typeof GENRES)[number];

/** Le numéro d'une demande jouée : ce que l'opérateur répondra, encodé. */
export function demandeJouee(type: string, parametres: Record<string, unknown>): number {
  let genre: GenreReponse;
  let montant = 0;
  const texte = String(parametres.texte ?? "").trim();
  if (type === "ussd_fin") genre = "fin";
  else if (type === "solde") genre = "solde";
  else if (type === "ussd") {
    const code = String(parametres.code ?? "");
    // Un code complet (numéro et montant dedans) va droit à la confirmation.
    const morceaux = code.split("*").filter(Boolean);
    genre = morceaux.length > 3 ? "confirmer" : "menu";
    if (genre === "confirmer") montant = Number(morceaux[morceaux.length - 1].replace(/\D/g, "")) || 0;
  } else if (parametres.secret === true) genre = "reussi";
  else if (texte === "5") genre = "solde";
  else if (/^\d{1,2}$/.test(texte)) genre = "numero";
  else if (/^\d{8,15}$/.test(texte)) genre = "montant";
  else {
    genre = "confirmer";
    montant = Number(texte.replace(/\D/g, "")) || 0;
  }
  return BASE_DEMANDE + GENRES.indexOf(genre) * 1_000_000_000 + Math.min(montant, 999_999_999);
}

/** Les gestes qu'une démonstration peut jouer. Les autres (reçu, identité
 *  d'une carte, carnet des boutons) écrivent quelque chose quelque part :
 *  ils sont refusés, comme à un compte sans carte. */
export const GESTES_DE_DEMONSTRATION = new Set(["solde", "ussd", "ussd_reponse", "ussd_fin"]);

/** Ce que l'opérateur « répond » à une demande jouée — ou null si ce numéro
 *  n'en est pas une. */
export function reponseJouee(id: number): { etat: string; resultat: string } | null {
  if (!Number.isSafeInteger(id) || id < BASE_DEMANDE) return null;
  const reste = id - BASE_DEMANDE;
  const genre = GENRES[Math.floor(reste / 1_000_000_000)];
  const montant = reste % 1_000_000_000;
  const somme = `${montant.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
  switch (genre) {
    case "menu":
      return { etat: "faite", resultat:
        "Mobile Money (DEMO)\n1. Transfert / Depot\n2. Retrait\n3. Paiement\n5. Mon solde" };
    case "numero":
      return { etat: "faite", resultat: "Entrez le numero du beneficiaire:" };
    case "montant":
      return { etat: "faite", resultat: "Entrez le montant:" };
    case "confirmer":
      return { etat: "faite", resultat:
        `Transfert de ${somme} vers CLIENT DEMO (670000011).\nFrais : 0 FCFA.\n`
        + "Confirmer l'operation ?\nEntrez votre code secret:" };
    case "reussi":
      return { etat: "faite", resultat:
        "Operation reussie (DEMONSTRATION : aucun argent n'a bouge)." };
    case "solde":
      return { etat: "faite", resultat: "Votre solde est de 245 000 FCFA (DEMONSTRATION)." };
    case "fin":
      return { etat: "faite", resultat: "Session terminee." };
    default:
      return null;
  }
}
