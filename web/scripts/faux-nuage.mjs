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

// Les horodatages se calculent À CHAQUE DEMANDE, pas au démarrage.
// Figés au lancement, ils vieillissent : au bout de dix minutes le terminal
// passe pour muet et les cartes pour retirées — l'inverse de ce qu'on veut
// pour essayer les écrans.
const maintenant = () => new Date().toISOString();
const il_y_a = (min) => new Date(Date.now() - min * 60000).toISOString();

const tables = () => ({
  terminaux: [{
    id: "douala-faux", nom: "Douala (faux)", vu_le: maintenant(),
    version: "0.0.0-essai", sante: { resume: "essai local", en_attente: 0 },
  }],
  cartes: [
    // « nom » est le nom COMMERCIAL — ce qu'on donne à qui veut payer, ce
    // que la fiche des coordonnées affiche. « Caisse principale » était un
    // libellé de tiroir, pas un nom qu'on écrit sur un virement.
    { iccid: "89237010000000008901", operateur: "MTN", libelle: "MTN ·8901",
      nom: "ETS NKENGAFAC", numero: "677123456",
      premiere_vue: il_y_a(60 * 24 * 30), derniere_vue: maintenant() },
    { iccid: "89237020000000004432", operateur: "Orange", libelle: "Orange ·4432",
      nom: "", numero: "699001122",
      premiere_vue: il_y_a(60 * 24 * 10), derniere_vue: maintenant() },
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
    ...[...smsEnPlus].reverse(),
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
      // Un SMS à code de connexion : il porte un code en clair, et il doit se
      // lire ENTIER. C'est le message du propriétaire, sur sa carte — on n'y
      // touche pas. L'écran l'affiche tel quel, 483921 compris.
      texte: "Votre code de confirmation est 483921. Ne le communiquez a personne.",
      categorie: "code", nature: null,
      emis_le: il_y_a(45), recu_le: il_y_a(45), lu_le: null },
    { id: 1, source_id: 1, expediteur: "MTN", terminal: "douala-faux",
      compte: "MTN ·8901", carte: "89237010000000008901", sens: null,
      montant: null, tiers: null, numero: null, reference: null, solde_apres: null,
      texte: "Rechargez votre compte et gagnez des bonus. Composez *126#.",
      categorie: "publicite", nature: null,
      emis_le: il_y_a(300), recu_le: il_y_a(300), lu_le: il_y_a(280) },
    // Trois consultations de solde d'affilée : c'est elles qui font
    // apparaître le PLI (« n vérifications répétées ») — sans elles, l'état
    // replié de la liste resterait invisible à tout essai.
    ...[[10, 40], [11, 55], [12, 70]].map(([id, minutes]) => ({
      id, source_id: id, expediteur: "MTN", terminal: "douala-faux",
      compte: "MTN ·8901", carte: "89237010000000008901", sens: null,
      montant: null, tiers: null, numero: null, reference: null,
      solde_apres: null,
      texte: "Votre solde MoMo est de 412 500 FCFA.",
      categorie: "solde", nature: null,
      emis_le: il_y_a(minutes), recu_le: il_y_a(minutes), lu_le: il_y_a(30),
    })),
    // Une semaine d'encaissements étalés sur les jours : sans eux, l'écran
    // Analyse n'aurait qu'une barre, et les « principaux clients » qu'un
    // nom — un écran d'essai doit montrer l'écran plein, pas son squelette.
    ...[
      [5, 35000, "MAMA CLARISSE", "670334455", 1500],
      [6, 12500, "NKENGAFAC M.", "677998877", 2900],
      [7, 8000, "TAILLEUR JEAN", "651672233", 4360],
      [8, 50000, "ETS KAMDEM", "699887711", 7180],
      [9, 15000, "MAMA CLARISSE", "670334455", 8640],
    ].map(([id, montant, tiers, numero, minutes]) => ({
      id, source_id: id, expediteur: "MTNMobileMoney", terminal: "douala-faux",
      compte: "MTN ·8901", carte: "89237010000000008901", sens: "entree",
      montant, tiers, numero, reference: `PP2408.${id}.E${id}${id}`,
      solde_apres: null,
      texte: `Vous avez recu ${montant.toLocaleString("fr-FR")} FCFA de ` +
             `${tiers} (${numero}).`,
      categorie: "encaissement", nature: null,
      emis_le: il_y_a(minutes), recu_le: il_y_a(minutes), lu_le: il_y_a(minutes - 5),
    })),
  ],
  recus: [
    // Un reçu DÉJÀ établi, pour l'encaissement de NKENGAFAC M. (même
    // référence). Sans lui, aucun écran d'essai ne peut montrer l'état
    // « le reçu existe, on l'ouvre » — le bouton principal de la fiche.
    { numero: "TM-20250829-0003", reference: "PP240829.1042.A31245",
      terminal: "douala-faux", chemin: "2025/TM-20250829-0003.pdf",
      etabli_le: il_y_a(16) },
  ],
  raccourcis: [
    { operateur: "MTN", nom: "solde", libelle: "Solde", etapes: "*126#,5,1" },
    { operateur: "MTN", nom: "depot", libelle: "Depot", etapes: "*126#,1,1" },
    { operateur: "MTN", nom: "retrait", libelle: "Retrait", etapes: "*126#,2" },
    { operateur: "MTN", nom: "transfert", libelle: "Transfert", etapes: "*126#,1,2" },
    { operateur: "Orange", nom: "solde", libelle: "Solde", etapes: "#150*1#" },
  ],
  evenements: [],
});

// --- Le robot joué : une commande reçoit sa réponse d'opérateur -------------
//
// Le scénario suit ce qu'une vraie session MoMo fait : le code ouvre le menu,
// chaque réponse avance, et à la fin l'opérateur réclame le code secret.
const commandes = new Map();
let prochainId = 1;

// LES COMPTES. Une vraie table, en mémoire, avec ce que PostgREST sait faire
// dessus : compter, chercher par courriel, insérer, modifier, supprimer.
//
// Elle commence VIDE, à dessein : c'est le seul moyen d'essayer le chemin qui
// compte le plus — la toute première inscription, celle qui fait de vous le
// propriétaire. Un compte posé d'avance masquerait exactement ce cas-là.
const utilisateurs = new Map();     // id → ligne
let prochainCompte = 1;

// Les téléphones inscrits pour les notifications, par jeton.
const appareils = new Map();

// Les SMS ajoutés à chaud pendant un essai (voir « /essai/nouveau-sms »).
const smsEnPlus = [];

function reponsePour(commande) {
  const { type, parametres } = commande;
  if (type === "ussd_fin") return "Session terminee.";
  // Le nom ou le numéro d'une carte, un bouton du carnet : le vrai robot
  // écrit dans sa table ; le faux se contente d'acquiescer — l'écran qui
  // attend « faite » doit pouvoir dérouler son chemin heureux.
  if (type === "identite" || type === "raccourci") return "C'est note.";
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

  // Un SMS qui tombe PENDANT qu'on regarde. Sans cela, impossible d'éprouver
  // que l'application se met à jour toute seule : elle n'aurait jamais rien
  // de neuf à découvrir.
  //
  //     curl -X POST http://127.0.0.1:4999/essai/nouveau-sms
  if (req.method === "POST" && chemin === "/essai/nouveau-sms") {
    smsEnPlus.push({
      id: 900000 + smsEnPlus.length,
      terminal: "douala-faux", source_id: 900 + smsEnPlus.length,
      // Le MÊME ICCID que la carte semée plus haut : avec une faute de
      // frappe ici, le SMS ajouté à chaud n'était jamais attribué à la
      // carte — les compteurs par carte l'excluaient en silence.
      compte: "MTN ·8901", carte: "89237010000000008901",
      expediteur: "MTNMobileMoney", categorie: "encaissement",
      sens: "entree", montant: 7500, tiers: "ESSAI Direct",
      texte: "Vous avez recu 7 500 FCFA de ESSAI Direct (677000000).",
      recu_le: maintenant(), moment: maintenant(), lu_le: null,
    });
    return repondre({ ajoutes: smsEnPlus.length });
  }

  // --- LES APPAREILS (les téléphones à faire sonner) ----------------------
  if (chemin === "/rest/v1/appareils") {
    if (req.method === "POST") {
      let brut = "";
      for await (const mm of req) brut += mm;
      for (const a of [].concat(JSON.parse(brut || "[]"))) {
        appareils.set(a.jeton, { ...a, vu_le: maintenant() });
      }
      return repondre([], 201);
    }
    if (req.method === "DELETE") {
      const eq = url.searchParams.get("jeton");
      if (eq) appareils.delete(decodeURIComponent(eq.replace("eq.", "")));
      return repondre([], 204);
    }
    return repondre([...appareils.values()]);
  }

  // --- LES COMPTES -------------------------------------------------------
  if (chemin === "/rest/v1/utilisateurs") {
    const lignes = [...utilisateurs.values()];
    const filtre = url.searchParams.get("courriel");
    const parId = url.searchParams.get("id");
    const vise = () => lignes.filter((u) => {
      if (filtre && u.courriel !== filtre.replace("eq.", "")) return false;
      if (parId && u.id !== Number(parId.replace("eq.", ""))) return false;
      return true;
    });

    if (req.method === "GET") {
      const trouvees = vise();
      // « prefer: count=exact » veut le total dans « content-range », et c'est
      // ce total que la plateforme lit pour savoir si un compte existe déjà.
      return repondre(trouvees, 200, {
        "content-range": `0-${Math.max(0, trouvees.length - 1)}/${lignes.length}`,
      });
    }

    if (req.method === "POST") {
      let brut = "";
      for await (const mm of req) brut += mm;
      const entrantes = JSON.parse(brut || "[]");
      const creees = [];
      for (const u of [].concat(entrantes)) {
        // L'unicite du courriel est tenue par la BASE, pas par l'appelant :
        // c'est elle qui doit refuser, sinon deux inscriptions simultanees
        // creeraient deux comptes pour la meme adresse.
        if ([...utilisateurs.values()].some((x) => x.courriel === u.courriel)) {
          return repondre({ code: "23505", message: "duplicate key" }, 409);
        }
        const ligne = {
          id: prochainCompte++, courriel: u.courriel, empreinte: u.empreinte,
          role: u.role ?? "invite", approuve: Boolean(u.approuve),
          cree_le: maintenant(), vu_le: null,
        };
        utilisateurs.set(ligne.id, ligne);
        creees.push(ligne);
      }
      return repondre(creees, 201);
    }

    if (req.method === "PATCH") {
      let brut = "";
      for await (const mm of req) brut += mm;
      const champs = JSON.parse(brut || "{}");
      for (const u of vise()) Object.assign(u, champs);
      return repondre([], 204);
    }

    if (req.method === "DELETE") {
      for (const u of vise()) utilisateurs.delete(u.id);
      return repondre([], 204);
    }
  }

  // Les tables ordinaires.
  const m = /^\/rest\/v1\/(\w+)$/.exec(chemin);
  const T = tables();
  if (m && T[m[1]]) {
    let lignes = T[m[1]];
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
