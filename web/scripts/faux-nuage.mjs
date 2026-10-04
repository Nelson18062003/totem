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

// UNE FLOTTE, SUR DEMANDE (FAUX_FLOTTE=1). Un seul boîtier ne peut pas
// montrer une demande partie au MAUVAIS boîtier : il n'y en a pas d'autre.
// Avec la flotte, un second boîtier — « akwa-faux » — a donné signe de vie
// PLUS RÉCEMMENT que celui de Douala, et porte une carte à lui ; une troisième
// carte a été retirée il y a une heure et demie. C'est exactement la
// situation où « le dernier terminal vivant » se trompe.
// Voir scripts/verifier-l-adressage.mjs.
const FLOTTE = process.env.FAUX_FLOTTE === "1";

// UN BOÎTIER QU'ON FAIT TAIRE (« /essai/taire »). Ici, chaque boîtier était
// toujours vivant : son signe de vie se recalculait à « maintenant » à chaque
// lecture. Aucun essai ne pouvait donc montrer ce que la plateforme dit d'un
// boîtier coupé du courant — ni ce qu'elle fait d'une demande déposée pour
// lui. Un boîtier muet garde ce qu'il avait écrit AU MOMENT de se taire : son
// dernier signe de vie, et la dernière fois qu'il a vu ses cartes — un peu
// avant (il relit ses puces toutes les minutes).
const muets = new Map();             // terminal → depuis combien de minutes
// L'heure du SOLDE d'une carte, imposée par un essai (« /essai/solde-maj ») :
// `null` pour « la base a la colonne, et elle est vide ». Sans cela, aucun
// essai ne distinguait une colonne vide d'une colonne absente — et la
// plateforme remplaçait « on ne sait pas » par l'heure du signe de vie.
const heuresDeSolde = new Map();      // iccid → minutes, ou null
// LE SIGNAL d'une carte, imposé par un essai (« /essai/signal »). Les cartes
// de Douala captaient toujours à 22 et 18 sur 31 — deux barres et plus — et
// aucun essai ne pouvait voir la pastille de l'onglet Comptes rester VERTE
// sur une carte qui n'avait qu'une barre sur l'accueil.
const signaux = new Map();           // iccid → force (0 à 31, ou 99)

// L'HORLOGE DE CHAQUE PI (« /essai/horloge »). Le vrai boîtier date ce qu'il
// écrit — son signe de vie, la dernière vue de ses cartes — sur SON heure,
// qui peut retarder d'une heure après une coupure de courant. Ici, tous les
// boîtiers avaient l'heure exacte : aucun essai ne pouvait voir la
// plateforme mesurer un silence sur l'horloge de celui qui se tait.
const retards = new Map();           // terminal → minutes de retard
const horloge = (terminal, minutesAvant) =>
  il_y_a(minutesAvant + (retards.get(terminal) ?? 0));

// L'OREILLE DE LA BASE (sql/schema.sql, déclencheur « terminaux_entendu ») :
// l'heure où la base a ENTENDU le boîtier, et depuis quand il parle sans
// interruption — sur l'horloge de la base, pas sur la sienne. Une base pas
// encore migrée ne les a pas (« /essai/base?oreille=non »).
let oreille = true;
const revenus = new Map();           // terminal → instant (ms) de son retour
// Le boîtier revenu dont les cartes n'ont PAS encore été republiées
// (« /essai/reveiller?cartes=plus-tard », puis « /essai/cartes ») : le vrai
// robot envoie son signe de vie et ses cartes par deux chemins séparés, et
// les cartes arrivent jusqu'à une minute après. Ici, le réveil rafraîchissait
// les deux ensemble — la panne du retour était invisible.
const cartesPasRelues = new Map();   // terminal → minutes : vues pour la dernière fois avant
// Une carte qu'un boîtier vivant ne voit plus (« /essai/carte-perdue ») — y
// compris la SEULE carte d'un boîtier, qui n'en voit alors plus aucune.
const cartesPerdues = new Map();     // iccid → minutes depuis la dernière vue
// Un boîtier sorti de la flotte (« /essai/retirer ») : volé, grillé.
const retires = new Map();           // terminal → instant (ms) de la mise hors service
// UN TOUR DE TRANSMISSION RATÉ (« /essai/cartes-en-retard »). Le boîtier
// parle, son signe de vie est frais — mais la poussée de ses cartes a
// échoué : la base porte des cartes vues `secondes` AVANT ce signe de vie
// (horloge du boîtier). Un robot d'hier envoyait ses cartes dans le tour des
// transmissions, une minute après son signe de vie, et ne retentait qu'au
// tour suivant : 3 min 10 s d'écart d'un seul hoquet, et la plateforme
// disait « retirée » d'une carte bien en place. Ici, signe de vie et cartes
// avançaient toujours ensemble — l'écart ne pouvait pas se voir.
const cartesEnRetard = new Map();    // terminal → secondes derrière son signe de vie

// UNE CARTE DONT ON NE CONNAÎT PAS LE BOÎTIER (« /essai/carte-sans-boitier ») :
// une ligne sans « terminal », comme une base d'avant la flotte en garde.
// La plateforme n'a alors rien à dire de son boîtier — ni « muet », ni heure.
const cartesSansBoitier = new Set(); // iccid

// Le silence ordinaire de chaque boîtier, en minutes, quand aucun essai ne
// l'a fait taire : en flotte, Douala n'est PAS le dernier à avoir parlé.
const silenceOrdinaire = (terminal) => (terminal === "douala-faux" && FLOTTE ? 1 : 0);

/** Depuis combien de minutes on n'a plus entendu ce boîtier. */
const silence = (terminal, sinon) => muets.get(terminal) ?? sinon;
/** Son dernier signe de vie, daté par LUI. */
const signeDeVie = (terminal, sinon) => horloge(terminal, silence(terminal, sinon));
/** La dernière vue de ses cartes en place, datée par lui : un peu avant de
 *  se taire, ou avant son retour tant qu'il ne les a pas republiées. */
const vueParLe = (terminal) => horloge(terminal,
  muets.has(terminal) ? muets.get(terminal) + 0.5
    : cartesPasRelues.has(terminal) ? cartesPasRelues.get(terminal) + 0.5
      : cartesEnRetard.has(terminal)
        ? silence(terminal, silenceOrdinaire(terminal)) + cartesEnRetard.get(terminal) / 60
        : 0);

/** Une ligne de « terminaux », telle que la base la porte. */
function boitier(id, nom, minutes) {
  const ligne = {
    id, nom, vu_le: signeDeVie(id, minutes),
    version: "0.0.0-essai", sante: { resume: "essai local", en_attente: 0 },
  };
  if (oreille) {
    ligne.entendu_le = il_y_a(silence(id, minutes));
    ligne.revenu_le = revenus.has(id) ? new Date(revenus.get(id)).toISOString()
      : il_y_a(silence(id, minutes) + 60 * 24);
  }
  if (retires.has(id)) {
    ligne.retire_le = new Date(retires.get(id)).toISOString();
    ligne.retire_motif = "essai : boîtier volé";
  }
  return ligne;
}

// Des FONCTIONS, comme `tables` : figées au démarrage, leurs heures
// vieillissaient — la carte d'Akwa passait pour retirée au bout de dix
// minutes d'essai, et un boîtier qu'on faisait taire ne se taisait pas.
const cartesDeLaFlotte = () => FLOTTE ? [
  { terminal: "akwa-faux",
    iccid: "89237010000000009999", operateur: "MTN", libelle: "MTN ·9999",
    nom: "BOUTIQUE AKWA", numero: "677000999",
    premiere_vue: il_y_a(60 * 24 * 3), derniere_vue: vueParLe("akwa-faux") },
  { terminal: "douala-faux",
    iccid: "89237020000000007777", operateur: "Orange", libelle: "Orange ·7777",
    nom: "", numero: "",
    premiere_vue: il_y_a(60 * 24 * 60), derniere_vue: horloge("douala-faux", 90) },
] : [];
// La carte d'Akwa a un compte, et son modem ne sait pas dire son signal :
// « 99 », ce que répond un vrai modem sans réseau. L'écran en tirait quatre
// barres pleines.
const comptesDeLaFlotte = () => FLOTTE ? [
  { terminal: "akwa-faux",
    iccid: "89237010000000009999", libelle: "MTN ·9999", operateur: "MTN",
    reseau: "MTN CM", itinerance: false, numero: "677000999",
    solde: 12000, signal: 99, maj: signeDeVie("akwa-faux", 1),
    solde_maj: il_y_a(30) },
] : [];

const tables = () => ({
  beneficiaires,
  terminaux: [
    // En flotte, Douala n'est PAS le dernier à avoir parlé : Akwa l'est.
    boitier("douala-faux", "Douala (faux)", silenceOrdinaire("douala-faux")),
    ...(FLOTTE ? [boitier("akwa-faux", "Akwa (faux)", silenceOrdinaire("akwa-faux"))] : []),
  ],
  // La console lit ces trois registres. Vides ici : personne n'y écrit
  // encore, et c'est justement l'état que ses écrans doivent savoir dire.
  // Les freins, eux, se remplissent quand on essaie des mots de passe — la
  // table se recalcule depuis le seau à chaque demande, filtres compris.
  alertes: [],
  versions: [],
  freins: [...freins.entries()].map(([cle, e]) =>
    ({ cle, n: e.n, vu: new Date(e.vu).toISOString() })),
  cartes: [
    // « nom » est le nom COMMERCIAL — ce qu'on donne à qui veut payer, ce
    // que la fiche des coordonnées affiche. « Caisse principale » était un
    // libellé de tiroir, pas un nom qu'on écrit sur un virement.
    //
    // « terminal » : la vraie base le porte sur chaque ligne (unique
    // (terminal, iccid)), et la console s'en sert pour dire quel boîtier
    // tient quelle puce. Sans lui, la flotte disait « aucune SIM jamais
    // vue » au-dessus de deux cartes bien présentes.
    { terminal: "douala-faux",
      iccid: "89237010000000008901", operateur: "MTN", libelle: "MTN ·8901",
      nom: "ETS NKENGAFAC", numero: "677123456",
      premiere_vue: il_y_a(60 * 24 * 30), derniere_vue: vueParLe("douala-faux") },
    { terminal: "douala-faux",
      iccid: "89237020000000004432", operateur: "Orange", libelle: "Orange ·4432",
      nom: "", numero: "699001122",
      premiere_vue: il_y_a(60 * 24 * 10), derniere_vue: vueParLe("douala-faux") },
    ...cartesDeLaFlotte(),
    ...[...cartesSansBoitier].map((iccid) => ({ terminal: null,
      iccid, operateur: "MTN", libelle: `MTN ·${iccid.slice(-4)}`, nom: "", numero: "",
      premiere_vue: il_y_a(60 * 24 * 90), derniere_vue: il_y_a(60 * 24) })),
  ].map((c) => cartesPerdues.has(c.iccid)
    ? { ...c, derniere_vue: horloge(c.terminal, cartesPerdues.get(c.iccid)) }
    : c),
  comptes: [
    { terminal: "douala-faux",
      iccid: "89237010000000008901", libelle: "MTN ·8901", operateur: "MTN",
      reseau: "MTN CM", itinerance: false, numero: "677123456",
      solde: 412500, signal: 22, maj: il_y_a(12) },
    { terminal: "douala-faux",
      iccid: "89237020000000004432", libelle: "Orange ·4432", operateur: "Orange",
      reseau: "Orange CM", itinerance: false, numero: "699001122",
      solde: 87300, signal: 18, maj: il_y_a(40) },
    ...comptesDeLaFlotte(),
  ].map((c) => heuresDeSolde.has(c.iccid)
    ? { ...c, solde_maj: heuresDeSolde.get(c.iccid) == null ? null
        : il_y_a(heuresDeSolde.get(c.iccid)) }
    : c).map((c) => signaux.has(c.iccid) ? { ...c, signal: signaux.get(c.iccid) } : c),
  paiements: [
    ...[...smsEnPlus].reverse(),
    // UN NOM VOLONTAIREMENT LONG. La fiche coupait son titre à une ligne :
    // « NKENGAFAC MBOUNGOU… » — et c'est précisément la question qu'on se
    // pose en ouvrant la fiche. Sans un nom long ici, aucun essai ne pouvait
    // le voir : les données de démonstration tenaient toutes sur une ligne.
    { id: 20, source_id: 20, expediteur: "MTNMobileMoney", terminal: "douala-faux",
      compte: "MTN ·8901", carte: "89237010000000008901", sens: "entree",
      montant: 45000, tiers: "NKENGAFAC MBOUNGOU JEANNE-CLAIRE EPSE TCHOUMI",
      numero: "677445566", reference: "PP260831.1042.A31245X7",
      solde_apres: 457500,
      texte: "Vous avez recu 45 000 FCFA de NKENGAFAC MBOUNGOU JEANNE-CLAIRE "
           + "EPSE TCHOUMI (677445566). Ref: PP260831.1042.A31245X7. "
           + "Nouveau solde: 457 500 FCFA.",
      categorie: "encaissement", nature: null,
      emis_le: il_y_a(5), recu_le: il_y_a(5), lu_le: null },
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
    // Le menu, puis « 1 » : le réseau demande alors le numéro, puis le
    // montant, et l'écran répond SEUL avec ce qu'on a saisi — c'est ce
    // chemin qu'un dépôt MTN suit vraiment.
    { operateur: "MTN", nom: "depot", libelle: "Depot", etapes: "*126#,1" },
    { operateur: "MTN", nom: "retrait", libelle: "Retrait", etapes: "*126#,2" },
    { operateur: "MTN", nom: "transfert", libelle: "Transfert", etapes: "*126#,1" },
    { operateur: "Orange", nom: "solde", libelle: "Solde", etapes: "#150*1#" },
  ],
  // CE QUE LE TERMINAL A REMARQUÉ. La table existait ici, vide : rien ne
  // pouvait donc éprouver l'écran qui la montre. Un contrôle qui regarde une
  // liste vide passe au vert sans rien voir.
  evenements: [
    { id: 3, terminal: "douala-faux", source_id: 3,
      texte: "Le modem ne répondait plus : il a été redémarré.",
      survenu_le: il_y_a(90), cree_le: il_y_a(90) },
    { id: 2, terminal: "douala-faux", source_id: 2,
      texte: "SMS d'argent illisible (MTNMobileMoney) : lecture incomplète, "
           + "opération comptée nulle part",
      survenu_le: il_y_a(240), cree_le: il_y_a(240) },
    // Un incident SANS terminal : c'est la plateforme qui parle.
    { id: 1, terminal: null, source_id: 1,
      texte: "Un bilan de 90 jours a été coupé : la caisse porte plus de "
           + "20 000 messages sur cette période.",
      survenu_le: il_y_a(1500), cree_le: il_y_a(1500) },
  ],
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

// LES CARTES DE CHACUN — « attributions ». Une vraie table, avec ce que la
// vraie base fait respecter : une carte une seule fois par personne, un
// compte qui doit exister, et l'effacement d'un compte qui emporte ses cartes.
// Sans ces règles ici, aucun harnais ne pourrait voir une portée qui fuit.
const attributions = [];             // { utilisateur, iccid, attribuee_le }

// LE CARNET DES BÉNÉFICIAIRES — avec les règles de la vraie base : un numéro
// une seule fois par carte, un numéro qui en est un, un nom qui n'est pas
// vide. Sans elles, aucun harnais ne verrait un doublon passer.
const beneficiaires = [];             // { id, carte, numero, nom, cree_par, … }
let prochainBeneficiaire = 1;

// Les SMS ajoutés à chaud pendant un essai (voir « /essai/nouveau-sms »).
const smsEnPlus = [];
// Les essais de mot de passe comptés, comme la table « freins ».
const freins = new Map();

// LE ROBOT JOUÉ, ET CE QUI PEUT LE RETENIR. Il RÉCLAME une demande avant de
// la composer, comme le vrai (`reclamer`, totem/nuage.py) : « en cours »
// seulement si elle est ENCORE en attente — une demande annulée entre-temps
// ne se compose plus. Il ne réclamait rien : il passait la demande à
// « faite » d'office, et aucun essai ne pouvait voir une annulation perdre
// la course, ni la gagner.
//
// Il attend tant que son boîtier se tait (« /essai/taire ») : c'est
// exactement ce que fait le vrai, qui compose à son retour ce qu'on lui a
// laissé. Et il se règle (« /essai/robot ») :
//   — « pause » : il ne réclame rien — le boîtier vit, mais n'a pas encore
//     relevé la demande ;
//   — « lent »  : il réclame, puis ne finit pas — la demande reste « en
//     cours », comme pendant une vraie session USSD ;
//   — « normal ».
let allure = "normal";

// UN HOQUET DE LA BASE, SUR UNE LECTURE PRÉCISE (« /essai/hoquet »). La
// plateforme relit une demande avant de l'annuler, pour en effacer le code
// secret ; `lire` rend une liste VIDE quand la base ne répond pas. Ici, la
// base répondait toujours : aucun essai ne pouvait voir une annulation
// partir sans ce masquage. Le hoquet vise la lecture par ce qu'elle
// demande (`select`), et compte ceux qu'il a servis — un hoquet qui ne
// tomberait jamais ferait passer l'essai pour rien.
const hoquets = new Map();           // select → combien de lectures refuser encore
let hoquetsServis = 0;

// LA RÈGLE DE LA BASE « commandes_code_efface » (sql/schema.sql), imitée :
// une demande secrète qui se FERME (« faite », « échouée ») perd son code
// dans la même écriture — quel qu'en soit l'auteur. Une base pas encore
// migrée ne l'a pas (« /essai/base?effacement=non ») : c'est là que la
// plateforme doit tenir la promesse seule.
let effacementParLaBase = true;
const GARDES_D_UNE_DEMANDE_CLOSE = ["secret", "carte", "iccid", "par", "langue"];
function regleDeLaBase(commande) {
  if (!effacementParLaBase) return;
  if (!["faite", "echouee"].includes(commande.etat)) return;
  if (commande.parametres?.secret !== true) return;
  commande.parametres = Object.fromEntries(Object.entries(commande.parametres)
    .filter(([cle]) => GARDES_D_UNE_DEMANDE_CLOSE.includes(cle)));
}

function servir(enregistree) {
  if (enregistree.etat === "en_attente") {
    if (allure === "pause" || muets.has(enregistree.terminal)) {
      setTimeout(() => servir(enregistree), 200);
      return;
    }
    enregistree.etat = "en_cours";       // la réclamation : il la tient
  }
  if (enregistree.etat !== "en_cours") return;   // annulée, ou déjà finie
  if (allure === "lent") {
    setTimeout(() => servir(enregistree), 200);
    return;
  }
  enregistree.etat = "faite";
  enregistree.resultat = reponsePour(enregistree);
  // LE CODE SECRET S'EFFACE, COMME CHEZ LE VRAI ROBOT : il ne reste que
  // le drapeau et la carte (`_parametres_masques`). Sans cette
  // imitation, la commande gardait ici ses paramètres d'origine, et
  // aucun harnais ne pouvait voir qu'un effacement trop large rendait
  // la réponse illisible à celui dont c'est la carte.
  if (enregistree.parametres?.secret) {
    const carte = enregistree.parametres.carte;
    enregistree.parametres = typeof carte === "string"
      ? { secret: true, carte } : { secret: true };
  }
}

function reponsePour(commande) {
  const { type, parametres } = commande;
  if (type === "ussd_fin") return "Session terminee.";
  // Le nom ou le numéro d'une carte, un bouton du carnet : le vrai robot
  // écrit dans sa table ; le faux se contente d'acquiescer — l'écran qui
  // attend « faite » doit pouvoir dérouler son chemin heureux.
  if (type === "identite" || type === "raccourci") return "C'est note.";
  // Le reçu : la phrase du vrai robot (totem/pilotage.py), numéro compris —
  // l'application y lit le numéro pour proposer le partage tout de suite.
  if (type === "recu") {
    return "Reçu TM-2026-1003-0042 en fabrication : il sera archivé et "
      + "téléchargeable dans un instant.";
  }
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
  // Comme un vrai opérateur : ce qu'on va signer, PUIS la demande du code.
  // Un écran qui ne montrerait que « votre code secret » ferait signer à
  // l'aveugle — et sans ces lignes ici, aucun harnais ne pourrait le voir.
  //
  // AUSSI LONG QU'UN VRAI ÉCRAN. Un écran USSD tient au plus 182 caractères,
  // et ceux qui réclament le code secret s'en approchent : montant, nom,
  // numéro, frais, commission, solde. L'ancienne réponse en faisait 97 —
  // elle tenait partout, et l'écran du code a passé tous les essais en
  // cachant le message sur un petit iPhone. Une donnée d'essai trop sage
  // cache le défaut au lieu de le montrer.
  return "Depot de 5 000 FCFA vers JEAN DUPONT KAMGA NGONO (677998877).\n"
    + "Frais : 0 FCFA. Commission : 25 FCFA.\nSolde apres : 407 500 FCFA.\n"
    + "Confirmer l'operation ?\nEntrez votre code secret:";
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
    // L'INDEX D'UNICITÉ, imité. La vraie base porte un index partiel sur
    // (terminal, cle) : deux demandes de même clé ne peuvent pas coexister, et
    // PostgREST répond 409. Sans cette imitation, le faux nuage acceptait tout
    // et l'on ne pouvait pas éprouver l'idempotence — un harnais qui ne peut
    // pas voir la faute ne mesure rien.
    if (c.cle) {
      const jumelle = [...commandes.values()].find(
        (x) => x.cle === c.cle && x.terminal === c.terminal);
      if (jumelle) {
        res.writeHead(409, { "content-type": "application/json" });
        return res.end(JSON.stringify({
          code: "23505", message: "duplicate key value violates unique constraint",
        }));
      }
    }
    const id = prochainId++;
    // Le tour compte les réponses déjà données dans CETTE session — depuis
    // la dernière ouverture. Compté sur tout le faux nuage, il faisait
    // commencer la deuxième opération d'un essai au milieu du scénario.
    const ouverture = Math.max(0, ...[...commandes.values()]
      .filter((x) => x.type === "ussd").map((x) => x.id));
    const tour = [...commandes.values()].filter(
      (x) => x.type === "ussd_reponse" && !x.parametres?.secret && x.id > ouverture).length;
    const enregistree = { ...c, id, tour, etat: "en_attente", resultat: null, depose: Date.now() };
    commandes.set(id, enregistree);
    // Le « robot » répond après un instant, comme le vrai le ferait.
    setTimeout(() => servir(enregistree), 700);
    return repondre([{ id }]);
  }

  // UNE ÉCRITURE CONDITIONNELLE, comme PostgREST la fait : les filtres de
  // l'adresse (« id=eq.12&etat=eq.en_attente ») font partie de l'écriture.
  // Une ligne qui ne les remplit plus n'est PAS touchée, et la réponse le
  // dit — une liste vide. C'est sur ce « rien n'a changé » que repose
  // l'annulation : sans cette imitation, une annulation arrivée trop tard
  // passait pour réussie, et l'écran aurait dit « rien n'est parti » d'une
  // demande en train de se composer.
  if (req.method === "PATCH" && chemin === "/rest/v1/commandes") {
    let brut = "";
    for await (const m of req) brut += m;
    const champs = JSON.parse(brut || "{}");
    const filtres = [...url.searchParams].filter(([k]) => k !== "select");
    const vise = [...commandes.values()].filter((x) => filtres.every(([k, v]) => {
      const [op, ...reste] = v.split(".");
      return op === "eq" && String(x[k]) === reste.join(".");
    }));
    for (const x of vise) {
      Object.assign(x, champs);
      regleDeLaBase(x);
    }
    if (/return=representation/.test(req.headers.prefer || "")) {
      return repondre(vise.map((x) => ({ id: x.id, etat: x.etat, resultat: x.resultat })));
    }
    res.writeHead(204);
    return res.end();
  }

  // Faire taire un boîtier, ou le réveiller :
  //
  //     curl -X POST "http://127.0.0.1:4999/essai/taire?terminal=douala-faux&minutes=11"
  //     curl -X POST "http://127.0.0.1:4999/essai/reveiller?terminal=douala-faux"
  if (req.method === "POST" && chemin === "/essai/taire") {
    const terminal = url.searchParams.get("terminal") || "douala-faux";
    muets.set(terminal, Number(url.searchParams.get("minutes") || 11));
    return repondre({ muet: terminal, depuis: muets.get(terminal) });
  }
  // Le réveil fait ce que fait la base : elle note son RETOUR (« revenu_le »).
  // Avec « cartes=plus-tard », il redonne signe de vie AVANT de republier
  // ses cartes, comme le vrai robot ; « /essai/cartes » les republie.
  if (req.method === "POST" && chemin === "/essai/reveiller") {
    const terminal = url.searchParams.get("terminal") || "douala-faux";
    const avant = muets.get(terminal);
    muets.delete(terminal);
    if (avant != null) {
      revenus.set(terminal, Date.now());
      if (url.searchParams.get("cartes") === "plus-tard") cartesPasRelues.set(terminal, avant);
    }
    return repondre({ muets: [...muets.keys()], cartesPasRelues: [...cartesPasRelues.keys()] });
  }
  if (req.method === "POST" && chemin === "/essai/cartes") {
    cartesPasRelues.delete(url.searchParams.get("terminal") || "douala-faux");
    return repondre({ cartesPasRelues: [...cartesPasRelues.keys()] });
  }
  // Le temps qui passe depuis son retour, sans attendre trois minutes :
  //     curl -X POST ".../essai/revenu?terminal=akwa-faux&minutes=10"
  if (req.method === "POST" && chemin === "/essai/revenu") {
    const terminal = url.searchParams.get("terminal") || "douala-faux";
    revenus.set(terminal, Date.now() - Number(url.searchParams.get("minutes") || 0) * 60000);
    return repondre({ terminal, revenu: new Date(revenus.get(terminal)).toISOString() });
  }
  //     curl -X POST ".../essai/horloge?terminal=douala-faux&retard=8"
  if (req.method === "POST" && chemin === "/essai/horloge") {
    const terminal = url.searchParams.get("terminal") || "douala-faux";
    const retard = Number(url.searchParams.get("retard") || 0);
    if (retard) retards.set(terminal, retard); else retards.delete(terminal);
    return repondre({ terminal, retard });
  }
  //     curl -X POST ".../essai/base?oreille=non"   (une base pas encore migrée)
  //     curl -X POST ".../essai/base?effacement=non" (sans « commandes_code_efface »)
  if (req.method === "POST" && chemin === "/essai/base") {
    if (url.searchParams.has("oreille")) oreille = url.searchParams.get("oreille") !== "non";
    if (url.searchParams.has("effacement")) {
      effacementParLaBase = url.searchParams.get("effacement") !== "non";
    }
    return repondre({ oreille, effacement: effacementParLaBase });
  }
  //     curl -X POST ".../essai/cartes-en-retard?terminal=douala-faux&secondes=190"   (&annuler=1)
  if (req.method === "POST" && chemin === "/essai/cartes-en-retard") {
    const terminal = url.searchParams.get("terminal") || "douala-faux";
    if (url.searchParams.get("annuler")) cartesEnRetard.delete(terminal);
    else cartesEnRetard.set(terminal, Number(url.searchParams.get("secondes") || 190));
    return repondre({ cartesEnRetard: Object.fromEntries(cartesEnRetard) });
  }
  //     curl -X POST ".../essai/carte-sans-boitier?iccid=…"   (&annuler=1)
  if (req.method === "POST" && chemin === "/essai/carte-sans-boitier") {
    const iccid = url.searchParams.get("iccid") || "";
    if (url.searchParams.get("annuler")) cartesSansBoitier.delete(iccid);
    else if (/^\d{19,20}$/.test(iccid)) cartesSansBoitier.add(iccid);
    return repondre({ cartesSansBoitier: [...cartesSansBoitier] });
  }
  //     curl -X POST ".../essai/hoquet?select=id,parametres&fois=1"
  if (req.method === "POST" && chemin === "/essai/hoquet") {
    const select = url.searchParams.get("select") || "";
    const fois = Number(url.searchParams.get("fois") ?? 1);
    if (fois > 0) hoquets.set(select, fois); else hoquets.delete(select);
    return repondre({ hoquets: Object.fromEntries(hoquets), servis: hoquetsServis });
  }
  //     curl -X POST ".../essai/retirer?terminal=akwa-faux"   (&annuler=1)
  if (req.method === "POST" && chemin === "/essai/retirer") {
    const terminal = url.searchParams.get("terminal") || "douala-faux";
    if (url.searchParams.get("annuler")) retires.delete(terminal);
    else retires.set(terminal, Date.now());
    return repondre({ retires: [...retires.keys()] });
  }
  //     curl -X POST ".../essai/carte-perdue?iccid=…&minutes=20"   (&annuler=1)
  if (req.method === "POST" && chemin === "/essai/carte-perdue") {
    const iccid = url.searchParams.get("iccid") || "";
    if (url.searchParams.get("annuler")) cartesPerdues.delete(iccid);
    else cartesPerdues.set(iccid, Number(url.searchParams.get("minutes") || 20));
    return repondre({ cartesPerdues: [...cartesPerdues.keys()] });
  }
  //     curl -X POST ".../essai/signal?iccid=…&valeur=9"   (&annuler=1)
  if (req.method === "POST" && chemin === "/essai/signal") {
    const iccid = url.searchParams.get("iccid") || "";
    if (url.searchParams.get("annuler")) signaux.delete(iccid);
    else signaux.set(iccid, Number(url.searchParams.get("valeur")));
    return repondre({ signaux: Object.fromEntries(signaux) });
  }
  //     curl -X POST "http://127.0.0.1:4999/essai/solde-maj?iccid=…&minutes=null"
  if (req.method === "POST" && chemin === "/essai/solde-maj") {
    const iccid = url.searchParams.get("iccid") || "";
    const minutes = url.searchParams.get("minutes");
    heuresDeSolde.set(iccid, minutes == null || minutes === "null" ? null : Number(minutes));
    return repondre({ iccid, minutes: heuresDeSolde.get(iccid) });
  }
  // L'allure du robot joué : « pause », « lent » ou « normal » (voir `servir`).
  if (req.method === "POST" && chemin === "/essai/robot") {
    const voulue = url.searchParams.get("allure") || "normal";
    allure = ["pause", "lent"].includes(voulue) ? voulue : "normal";
    return repondre({ allure });
  }

  // Lecture d'une commande.
  if (chemin === "/rest/v1/commandes") {
    const select = url.searchParams.get("select") ?? "";
    if ((hoquets.get(select) ?? 0) > 0) {
      hoquets.set(select, hoquets.get(select) - 1);
      hoquetsServis++;
      return repondre({ message: "hoquet d'essai : la base ne répond pas" }, 503);
    }
    // Retrouver une demande PAR SA CLÉ : c'est ce que fait la plateforme après
    // un 409, pour rendre la demande déjà créée au lieu d'un échec.
    // Le guichet la cherche aussi AVANT de juger le boîtier, tous boîtiers
    // confondus : il lit sa clé, sa carte et qui l'a déposée.
    const parCle = url.searchParams.get("cle");
    if (parCle) {
      const cle = parCle.replace("eq.", "");
      const terminal = (url.searchParams.get("terminal") ?? "").replace("eq.", "");
      const c = [...commandes.values()]
        .find((x) => x.cle === cle && (!terminal || x.terminal === terminal));
      return repondre(c ? [{ id: c.id, cle: c.cle, etat: c.etat, resultat: c.resultat,
                             parametres: c.parametres ?? {}, terminal: c.terminal }] : []);
    }
    // La DERNIÈRE ouverture d'un terminal : c'est là que la plateforme lit
    // la carte d'une réponse qui ne dit pas la sienne. Filtres, ordre et
    // limite comme PostgREST les applique.
    const parType = url.searchParams.get("type");
    if (parType) {
      const type = parType.replace("eq.", "");
      const terminal = (url.searchParams.get("terminal") ?? "").replace("eq.", "");
      // « parametres->>par=eq.c:12 » : la dernière ouverture d'UNE personne.
      // La vraie base sait filtrer dans le JSON ; sans cette imitation, le
      // faux nuage rendrait la dernière ouverture de n'importe qui, et aucun
      // harnais ne verrait une réponse partir vers la session d'un autre.
      const par = (url.searchParams.get("parametres->>par") ?? "").replace("eq.", "");
      const limite = Number(url.searchParams.get("limit") ?? 1000);
      const lignes = [...commandes.values()]
        .filter((x) => x.type === type && (!terminal || x.terminal === terminal)
          && (!par || String(x.parametres?.par ?? "") === par))
        .sort((x, y) => url.searchParams.get("order") === "id.desc" ? y.id - x.id : x.id - y.id)
        .slice(0, limite)
        .map((x) => ({ id: x.id, type: x.type, parametres: x.parametres ?? {},
                       terminal: x.terminal ?? null }));
      return repondre(lignes);
    }
    const eq = url.searchParams.get("id");
    const id = eq ? Number(eq.replace("eq.", "")) : null;
    const c = commandes.get(id);
    // Ce que la plateforme demande, comme PostgREST le rend : la carte d'une
    // commande se lit dans ses paramètres — c'est elle qui dit à qui la
    // commande appartient.
    return repondre(c ? [{ id: c.id, type: c.type, parametres: c.parametres ?? {},
                           terminal: c.terminal ?? null, etat: c.etat,
                           resultat: c.resultat }] : []);
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

  // Une caisse qui TOURNE DEPUIS DES MOIS. Les cinq encaissements semés plus
  // haut suffisent à remplir un écran ; ils ne suffisent pas à éprouver ce
  // qui casse sur une vraie caisse : une période plus large que ce qu'une
  // lecture rapporte, et un bilan qui s'arrête sans le dire.
  //
  //     curl -X POST "http://127.0.0.1:4999/essai/semer?jours=120&parJour=20"
  if (req.method === "POST" && chemin === "/essai/semer") {
    const jours = Number(url.searchParams.get("jours") || 120);
    const parJour = Number(url.searchParams.get("parJour") || 20);
    // Un encaissement par tranche d'heures, à heure FIXE : le harnais doit
    // pouvoir dire, sans deviner, lequel tombe dans la fenêtre et lequel non.
    const pas = Math.floor((20 * 3600000) / Math.max(1, parJour));
    for (let j = 0; j < jours; j++) {
      for (let k = 0; k < parJour; k++) {
        // 02 h 00 + k × pas, en remontant de j jours.
        const t = new Date(Date.now() - j * 86400000);
        t.setUTCHours(2, 0, 0, 0);
        const quand = new Date(t.getTime() + k * pas);
        if (quand.getTime() > Date.now()) continue;
        const iso = quand.toISOString();
        smsEnPlus.push({
          id: 500000 + smsEnPlus.length, source_id: 500 + smsEnPlus.length,
          terminal: "douala-faux",
          compte: "MTN ·8901", carte: "89237010000000008901",
          expediteur: "MTNMobileMoney", categorie: "encaissement",
          sens: "entree", montant: 1000, tiers: "SEMEUR", numero: "677000001",
          reference: null, solde_apres: null,
          texte: "Vous avez recu 1 000 FCFA de SEMEUR (677000001).",
          nature: null, emis_le: iso, recu_le: iso, moment: iso, lu_le: null,
        });
      }
    }
    return repondre({ semes: smsEnPlus.length });
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
    // À QUI SONNE CHAQUE TÉLÉPHONE — le filtre que la vraie base applique.
    // Sans lui, « les téléphones de ce compte » rendait tous les téléphones,
    // et le harnais ne pouvait pas voir un essai sonner chez un autre.
    const quiEst = (a, regle) => {
      const [col, op, val] = regle.split(".");
      if (col !== "utilisateur") return true;
      if (op === "is") return a.utilisateur == null;
      if (op === "eq") return String(a.utilisateur) === val;
      return true;
    };
    let liste = [...appareils.values()];
    const u = url.searchParams.get("utilisateur");
    if (u) liste = liste.filter((a) => quiEst(a, `utilisateur.${u}`));
    const ou = url.searchParams.get("or");
    if (ou) {
      const regles = ou.replace(/^\(|\)$/g, "").split(",");
      liste = liste.filter((a) => regles.some((r) => quiEst(a, r)));
    }
    return repondre(liste);
  }

  // --- LE FREIN, COMPTÉ COMME LA VRAIE BASE LE COMPTE --------------------
  //
  // La plateforme demande à la BASE de compter ses essais de mot de passe :
  // c'est le seul moyen que toutes les instances partagent un seau. Sans
  // cette imitation ici, le harnais du frein mesurerait le seau de secours en
  // mémoire — c'est-à-dire pas ce qui tourne en production.
  //
  // Le comptage est fait D'UN SEUL GESTE, comme le « insert … on conflict »
  // de la vraie base : lire puis écrire laisserait passer une rafale.
  if (req.method === "POST" && chemin === "/rest/v1/rpc/compter_un_essai") {
    let brut = "";
    for await (const mm of req) brut += mm;
    const { la_cle: cle, fenetre_s: fenetre } = JSON.parse(brut || "{}");
    const present = Date.now();
    const e = freins.get(cle);
    const n = e && present - e.vu <= fenetre * 1000 ? e.n + 1 : 1;
    freins.set(cle, { n, vu: present });
    return repondre(n);
  }

  // --- LES CARTES DE CHACUN -------------------------------------------------
  if (chemin === "/rest/v1/attributions") {
    const filtre = (nom) => {
      const v = url.searchParams.get(nom);
      return v ? decodeURIComponent(v.replace(/^eq\./, "")) : null;
    };
    if (req.method === "POST") {
      let brut = "";
      for await (const mm of req) brut += mm;
      for (const a of [].concat(JSON.parse(brut || "[]"))) {
        if (!utilisateurs.has(Number(a.utilisateur))) {
          return repondre({ code: "23503", message: "violates foreign key constraint" }, 409);
        }
        if (!/^[A-Za-z0-9]{1,32}$/.test(String(a.iccid))) {
          return repondre({ code: "23514", message: "attributions_iccid_forme" }, 400);
        }
        const deja = attributions.some(
          (x) => x.utilisateur === Number(a.utilisateur) && x.iccid === a.iccid);
        if (deja) {
          // « resolution=ignore-duplicates » : la vraie base se tait ; sans,
          // elle refuse. Le faux nuage fait pareil.
          if (/ignore-duplicates/.test(req.headers.prefer || "")) continue;
          return repondre({ code: "23505", message: "duplicate key" }, 409);
        }
        attributions.push({
          utilisateur: Number(a.utilisateur), iccid: a.iccid, attribuee_le: maintenant(),
        });
      }
      return repondre([], 201);
    }
    const u = filtre("utilisateur");
    const i = filtre("iccid");
    const vise = (x) => (u == null || x.utilisateur === Number(u)) && (i == null || x.iccid === i);
    if (req.method === "DELETE") {
      for (let k = attributions.length - 1; k >= 0; k--) {
        if (vise(attributions[k])) attributions.splice(k, 1);
      }
      return repondre([], 204);
    }
    return repondre(attributions.filter(vise));
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
      // L'ORDRE ET LA LIMITE, comme la vraie base : la plateforme demande
      // les plus récents d'abord, puis les remet dans l'ordre d'arrivée.
      let trouvees = vise();
      if ((url.searchParams.get("order") ?? "").startsWith("cree_le.desc")) {
        trouvees = [...trouvees].reverse();
      }
      const limite = Number(url.searchParams.get("limit"));
      if (Number.isInteger(limite) && limite > 0) trouvees = trouvees.slice(0, limite);
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
        // IL N'Y A QU'UN PROPRIÉTAIRE, et c'est la BASE qui le tient — index
        // « utilisateurs_un_seul_proprietaire ». Sans cette règle ici, trois
        // inscriptions lancées ensemble donnaient trois propriétaires, et
        // aucun harnais n'aurait pu voir la course.
        if (u.role === "proprietaire"
            && [...utilisateurs.values()].some((x) => x.role === "proprietaire")) {
          return repondre({ code: "23505", message: "duplicate key value violates "
            + "unique constraint \"utilisateurs_un_seul_proprietaire\"" }, 409);
        }
        // LES BORNES DE L'INSCRIPTION PUBLIQUE — celles que la vraie base
        // tient (migrations/20261004_inscription_publique.sql). Sans elles
        // ici, un harnais ne pourrait pas voir la plateforme envoyer à la
        // base ce que la base refuserait.
        if (u.telephone != null && !/^\+?[0-9]{6,15}$/.test(String(u.telephone))) {
          return repondre({ code: "23514", message: "utilisateurs_telephone_forme" }, 400);
        }
        if (u.adresse != null) {
          const a = String(u.adresse).trim();
          if (a.length < 1 || a.length > 200) {
            return repondre({ code: "23514", message: "utilisateurs_adresse_forme" }, 400);
          }
        }
        if ((u.prenom != null && String(u.prenom).length > 80)
            || (u.nom != null && String(u.nom).length > 80)) {
          return repondre({ code: "23514", message: "utilisateurs_nom_forme" }, 400);
        }
        const ligne = {
          id: prochainCompte++, courriel: u.courriel, empreinte: u.empreinte,
          role: u.role ?? "invite", approuve: Boolean(u.approuve),
          prenom: u.prenom ?? null, nom: u.nom ?? null,
          adresse: u.adresse ?? null, telephone: u.telephone ?? null,
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
      // LE DERNIER PROPRIÉTAIRE NE S'EFFACE PAS — déclencheur
      // « un_proprietaire_reste ». Sans cette règle ici, la table se vidait,
      // la plateforme rouvrait ses inscriptions, et un passant du réseau
      // devenait propriétaire. Aucun harnais n'aurait pu le voir.
      for (const u of vise()) {
        if (u.role === "proprietaire"
            && ![...utilisateurs.values()].some(
                 (x) => x.role === "proprietaire" && x.id !== u.id)) {
          return repondre({ code: "23514", message: "Le compte du propriétaire "
            + "ne se supprime pas : la plateforme resterait sans propriétaire." },
            400);
        }
      }
      for (const u of vise()) {
        utilisateurs.delete(u.id);
        // « on delete cascade » : ses cartes partent avec lui.
        for (let k = attributions.length - 1; k >= 0; k--) {
          if (attributions[k].utilisateur === u.id) attributions.splice(k, 1);
        }
        // …et ses téléphones aussi (« appareils_utilisateur_fk », on delete
        // cascade). Sans cette ligne, la suppression de son compte laissait
        // ses téléphones inscrits ici — et aucun harnais ne l'aurait vu.
        for (const [jeton, a] of appareils) {
          if (a.utilisateur != null && Number(a.utilisateur) === u.id) appareils.delete(jeton);
        }
        // « on delete set null » : ce qu'il a créé reste, sans son nom.
        for (const b of beneficiaires) if (b.cree_par === u.id) b.cree_par = null;
      }
      return repondre([], 204);
    }
  }

  // --- CE QUE LE ROBOT ÉCRIT ---------------------------------------------
  //
  // Le terminal de Douala POUSSE ses SMS ici (« POST /rest/v1/paiements » avec
  // « on_conflict=terminal,source_id »). Le faux nuage ne savait pas les
  // recevoir : la dernière étape de la chaîne — du modem jusqu'à l'écran —
  // n'avait donc jamais été parcourue par personne. Le robot d'un côté, la
  // plateforme de l'autre, et rien au milieu pour vérifier qu'ils parlent du
  // MÊME message.
  //
  // « merge-duplicates » : un SMS retransmis met à jour sa ligne au lieu d'en
  // créer une seconde. C'est ce qui permet au robot de relire ses messages
  // passés quand son lecteur s'améliore — et c'est aussi ce qui empêche un
  // paiement d'être compté deux fois après une coupure de courant.
  if (chemin === "/rest/v1/beneficiaires" && req.method !== "GET") {
    let brut = "";
    for await (const mm of req) brut += mm;
    const vise = () => {
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      return beneficiaires.filter((b) => String(b.id) === id);
    };
    const mauvais = (b) => !/^[A-Za-z0-9]{1,32}$/.test(String(b.carte ?? ""))
      || !/^[0-9]{8,15}$/.test(String(b.numero ?? ""))
      || !String(b.nom ?? "").trim() || String(b.nom).trim().length > 80;
    if (req.method === "POST") {
      const fusion = (req.headers.prefer || "").includes("merge-duplicates");
      for (const b of [].concat(JSON.parse(brut || "[]"))) {
        if (mauvais(b)) return repondre({ code: "23514", message: "check violation" }, 400);
        const deja = beneficiaires.find((x) => x.carte === b.carte && x.numero === b.numero);
        if (deja && !fusion) return repondre({ code: "23505", message: "duplicate key" }, 409);
        if (deja) Object.assign(deja, b);
        else beneficiaires.push({ id: prochainBeneficiaire++, cree_le: maintenant(), ...b });
      }
      return repondre([], 201);
    }
    if (req.method === "PATCH") {
      const champs = JSON.parse(brut || "{}");
      for (const b of vise()) {
        if (mauvais({ ...b, ...champs })) return repondre({ code: "23514" }, 400);
        Object.assign(b, champs);
      }
      return repondre([], 204);
    }
    if (req.method === "DELETE") {
      for (const b of vise()) beneficiaires.splice(beneficiaires.indexOf(b), 1);
      return repondre([], 204);
    }
  }

  const ecriture = /^\/rest\/v1\/(\w+)$/.exec(chemin);
  if (req.method === "POST" && ecriture && tables()[ecriture[1]]) {
    const nom = ecriture[1];
    let brut = "";
    for await (const mm of req) brut += mm;
    const entrantes = [].concat(JSON.parse(brut || "[]"));
    const cles = (url.searchParams.get("on_conflict") || "").split(",")
                    .map((c) => c.trim()).filter(Boolean);
    const memeLigne = (a, b) => cles.every((c) => String(a[c]) === String(b[c]));
    for (const ligne of entrantes) {
      const deja = cles.length ? smsEnPlus.find((x) => memeLigne(x, ligne)) : null;
      if (deja) Object.assign(deja, ligne);
      else smsEnPlus.push({ id: 700000 + smsEnPlus.length, lu_le: null, ...ligne });
    }
    return repondre([], 201);
  }

  // Les tables ordinaires.
  //
  // CE FAUX NUAGE DOIT SAVOIR TRONQUER, ET LE DIRE. Il rendait autrefois le
  // total APRÈS avoir appliqué la limite : « 1000 lignes sur 1000 » quand la
  // base en avait 1834. Un contrôle qui ne peut pas voir la troncature ne
  // garde rien — et c'est exactement la panne qu'on cherchait ici (un bilan
  // de trimestre amputé sans un mot). Le vrai PostgREST compte AVANT.
  const m = /^\/rest\/v1\/(\w+)$/.exec(chemin);
  const T = tables();
  if (m && T[m[1]]) {
    let lignes = T[m[1]];

    // Les filtres de colonne : « recu_le=gte.2026-08-01 », « lu_le=is.null »…
    for (const [champ, brut] of url.searchParams) {
      if (["select", "order", "limit", "offset", "or"].includes(champ)) continue;
      const [op, ...reste] = brut.split(".");
      const valeur = reste.join(".");
      lignes = lignes.filter((l) => {
        const v = l[champ];
        switch (op) {
          case "is": return valeur === "null" ? v == null : v != null;
          case "eq": return String(v) === valeur;
          case "neq": return String(v) !== valeur;
          case "gte": return v != null && String(v) >= valeur;
          case "gt": return v != null && String(v) > valeur;
          case "lte": return v != null && String(v) <= valeur;
          case "lt": return v != null && String(v) < valeur;
          // « in.("a","b") » — la portée d'un invité passe par là. Sans ce
          // filtre, le faux nuage rendait TOUT, et la plateforme devait
          // refiltrer seule : un harnais n'aurait pas vu un filtre oublié.
          case "in": {
            const liste = decodeURIComponent(valeur).replace(/^\(|\)$/g, "")
              .split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
            return v != null && liste.includes(String(v));
          }
          default: return true;
        }
      });
    }

    // L'ordre demandé : « recu_le.desc », « id.asc »…
    const tri = url.searchParams.get("order");
    if (tri) {
      const [col, ...options] = tri.split(",")[0].split(".");
      const descendant = options.includes("desc");
      lignes = [...lignes].sort((a, b) => {
        const x = a[col], y = b[col];
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * (descendant ? -1 : 1);
      });
    }

    // Le total se compte AVANT la limite : c'est lui qui révèle la coupe.
    const total = lignes.length;
    const limite = Number(url.searchParams.get("limit") || 0);
    if (limite) lignes = lignes.slice(0, limite);
    return repondre(lignes, 200,
      { "content-range": `0-${Math.max(0, lignes.length - 1)}/${total}` });
  }

  return repondre({ message: "table inconnue (faux nuage)" }, 404);
});

// Le port se règle : deux harnais lancés à la suite ne doivent pas se
// disputer la même écoute — et surtout, aucun ne doit mesurer le faux nuage
// de l'autre.
const PORT_NUAGE = Number(process.env.PORT || 4999);

serveur.listen(PORT_NUAGE, "127.0.0.1", () => {
  console.log(`faux nuage sur http://127.0.0.1:${PORT_NUAGE}`);
  console.log("  2 cartes, 3 SMS, des raccourcis MTN et Orange");
  console.log("  les commandes reçoivent une réponse d'opérateur après ~0,7 s");
});
