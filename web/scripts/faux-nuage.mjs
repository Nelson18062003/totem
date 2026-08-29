// Un faux Supabase, pour essayer la plateforme et l'application SANS toucher
// à la vraie base ni au terminal de Douala.
//
//     node scripts/faux-nuage.mjs            (écoute sur 4999)
//
// Puis on lance la plateforme en la pointant ici :
//
//     SUPABASE_URL=http://127.0.0.1:4999 SUPABASE_CLE=peu-importe \
//     SESSION_SECRET=... TOTEM_MOT_DE_PASSE=... npx next start
//
// Il répond comme PostgREST sur les quelques tables que la plateforme lit, et
// surtout : il JOUE LE RÔLE DU ROBOT. Une commande déposée passe à « faite »
// après un instant, avec une réponse d'opérateur plausible — y compris la
// demande du code secret. C'est ce qui permet de dérouler une opération
// entière, du formulaire au pavé, sans SIM.
//
// Les données sont inventées et le disent : « Faux MTN », « Faux Orange ».
// Rien ici ne doit servir en production.

import { createServer } from "node:http";

const MAINTENANT = new Date().toISOString();
const il_y_a = (min) => new Date(Date.now() - min * 60000).toISOString();

const TABLES = {
  terminaux: [{
    id: "douala-faux", nom: "Douala (faux)", vu_le: MAINTENANT,
    version: "0.0.0-essai", sante: { resume: "essai local", en_attente: 0 },
  }],
  cartes: [
    { iccid: "89237010000000008901", operateur: "MTN", libelle: "MTN ·8901",
      nom: "Caisse principale", numero: "677123456",
      premiere_vue: il_y_a(60 * 24 * 30), derniere_vue: MAINTENANT },
    { iccid: "89237020000000004432", operateur: "Orange", libelle: "Orange ·4432",
      nom: "", numero: "699001122",
      premiere_vue: il_y_a(60 * 24 * 10), derniere_vue: MAINTENANT },
  ],
  comptes: [
    { iccid: "89237010000000008901", libelle: "MTN ·8901", operateur: "MTN",
      reseau: "MTN CM", itinerance: false, numero: "677123456",
      solde: 412500, signal: 22, maj: il_y_a(12) },
    { iccid: "89237020000000004432", libelle: "Orange ·4432", operateur: "Orange",
      reseau: "Orange CM", itinerance: false, numero: "699001122",
      solde: 87300, signal: 18, maj: il_y_a(40) },
  ],
  paiements: [
    { id: 3, source_id: 3, expediteur: "MTNMobileMoney", terminal: "douala-faux",
      compte: "MTN ·8901", carte: "89237010000000008901", sens: "entree",
      montant: 20000, tiers: "NKENGAFAC M.", numero: "677998877",
      reference: "PP240829.1042.A31245", solde_apres: 412500,
      texte: "Vous avez recu 20 000 FCFA de NKENGAFAC M. (677998877). Ref: PP240829.1042.A31245. Nouveau solde: 412 500 FCFA.",
      categorie: "encaissement", nature: null,
      emis_le: il_y_a(18), recu_le: il_y_a(18), lu_le: null },
    { id: 2, source_id: 2, expediteur: "OrangeMoney", terminal: "douala-faux",
      compte: "Orange ·4432", carte: "89237020000000004432", sens: "sortie",
      montant: 5000, tiers: "BOUTIQUE AKWA", numero: "690112233",
      reference: "OM240829.0915.77321", solde_apres: 87300,
      texte: "Transfert de 5 000 FCFA vers BOUTIQUE AKWA effectue. Frais: 100 FCFA. Solde: 87 300 FCFA.",
      categorie: "envoi", nature: null,
      emis_le: il_y_a(95), recu_le: il_y_a(95), lu_le: il_y_a(90) },
    { id: 4, source_id: 4, expediteur: "MTN", terminal: "douala-faux",
      compte: "MTN ·8901", carte: "89237010000000008901", sens: null,
      montant: null, tiers: null, numero: null, reference: null, solde_apres: null,
      // Une ligne ECRITE AVANT le masquage du robot : elle porte le code en
      // clair. C'est exactement le cas que l'ecran doit rattraper.
      texte: "Votre code de confirmation est 483921. Ne le communiquez a personne.",
      categorie: "code", nature: null,
      emis_le: il_y_a(45), recu_le: il_y_a(45), lu_le: null },
    { id: 1, source_id: 1, expediteur: "MTN", terminal: "douala-faux",
      compte: "MTN ·8901", carte: "89237010000000008901", sens: null,
      montant: null, tiers: null, numero: null, reference: null, solde_apres: null,
      texte: "Rechargez votre compte et gagnez des bonus. Composez *126#.",
      categorie: "publicite", nature: null,
      emis_le: il_y_a(300), recu_le: il_y_a(300), lu_le: il_y_a(280) },
  ],
  recus: [],
  raccourcis: [
    { operateur: "MTN", nom: "solde", libelle: "Solde", etapes: "*126#,5,1" },
    { operateur: "MTN", nom: "depot", libelle: "Depot", etapes: "*126#,1,1" },
    { operateur: "MTN", nom: "retrait", libelle: "Retrait", etapes: "*126#,2" },
    { operateur: "MTN", nom: "transfert", libelle: "Transfert", etapes: "*126#,1,2" },
    { operateur: "Orange", nom: "solde", libelle: "Solde", etapes: "#150*1#" },
  ],
  evenements: [],
};

// --- Le robot joué : une commande reçoit sa réponse d'opérateur -------------
//
// Le scénario suit ce qu'une vraie session MoMo fait : le code ouvre le menu,
// chaque réponse avance, et à la fin l'opérateur réclame le code secret.
const commandes = new Map();
let prochainId = 1;

function reponsePour(commande) {
  const { type, parametres } = commande;
  if (type === "ussd_fin") return "Session terminee.";
  if (type === "ussd") {
    const code = String(parametres.code ?? "");
    // Un code complet (avec le numéro et le montant dedans) va droit au code
    // secret ; un code d'entrée ouvre le menu.
    if (code.split("*").length > 3) {
      return "Confirmer le transfert de 5 000 FCFA vers 677998877 ?\nEntrez votre code secret:";
    }
    return "MTN MoMo\n1. Transfert d'argent\n2. Retrait\n3. Paiement\n4. Mon compte\n5. Mon solde";
  }
  // Une réponse dans la session : on avance dans le scénario.
  const n = commande.tour ?? 0;
  if (parametres.secret) return "Operation reussie. Nouveau solde: 407 500 FCFA.";
  if (n === 0) return "Entrez le numero du beneficiaire:";
  if (n === 1) return "Entrez le montant:";
  return "Confirmer l'operation ?\nEntrez votre code secret:";
}

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const chemin = url.pathname;
  const repondre = (corps, statut = 200, entetes = {}) => {
    res.writeHead(statut, { "content-type": "application/json", ...entetes });
    res.end(JSON.stringify(corps));
  };

  // Dépôt d'une commande.
  if (req.method === "POST" && chemin === "/rest/v1/commandes") {
    let brut = "";
    for await (const m of req) brut += m;
    const c = JSON.parse(brut || "{}");
    const id = prochainId++;
    // Le tour compte les réponses déjà données dans CETTE session.
    const tour = [...commandes.values()].filter(
      (x) => x.type === "ussd_reponse" && !x.parametres?.secret).length;
    const enregistree = { ...c, id, tour, etat: "en_attente", resultat: null, depose: Date.now() };
    commandes.set(id, enregistree);
    // Le « robot » répond après un instant, comme le vrai le ferait.
    setTimeout(() => {
      enregistree.etat = "faite";
      enregistree.resultat = reponsePour(enregistree);
    }, 700);
    return repondre([{ id }]);
  }

  // Lecture d'une commande.
  if (chemin === "/rest/v1/commandes") {
    const eq = url.searchParams.get("id");
    const id = eq ? Number(eq.replace("eq.", "")) : null;
    const c = commandes.get(id);
    return repondre(c ? [{ id: c.id, etat: c.etat, resultat: c.resultat }] : []);
  }

  // Les tables ordinaires.
  const m = /^\/rest\/v1\/(\w+)$/.exec(chemin);
  if (m && TABLES[m[1]]) {
    let lignes = TABLES[m[1]];
    if (url.searchParams.get("lu_le") === "is.null") {
      lignes = lignes.filter((l) => l.lu_le === null);
    }
    const limite = Number(url.searchParams.get("limit") || 0);
    if (limite) lignes = lignes.slice(0, limite);
    return repondre(lignes, 200,
      { "content-range": `0-${Math.max(0, lignes.length - 1)}/${lignes.length}` });
  }

  return repondre({ message: "table inconnue (faux nuage)" }, 404);
});

serveur.listen(4999, "127.0.0.1", () => {
  console.log("faux nuage sur http://127.0.0.1:4999");
  console.log("  2 cartes, 3 SMS, des raccourcis MTN et Orange");
  console.log("  les commandes reçoivent une réponse d'opérateur après ~0,7 s");
});
