// Lire ce que le réseau demande — la même lecture des deux côtés.
//
// Pendant une session USSD, l'opérateur pose ses questions en texte libre.
// Deux décisions en découlent, et toutes deux touchent à l'argent :
//
//   1. « Est-ce le CODE SECRET qu'on me demande ? » → si oui, le pavé
//      s'ouvre, et ce qui se compose ne s'affiche jamais ni ne se journalise.
//   2. « Puis-je répondre tout seul avec ce que le propriétaire a saisi ? »
//      → si oui, le numéro ou le montant part sans qu'on redemande.
//
// Ces deux réponses vivent ICI, dans le noyau, et non dans chaque écran. Si
// la plateforme et le téléphone jugeaient différemment, le même message
// d'opérateur ouvrirait le pavé d'un côté et une zone de texte ordinaire de
// l'autre — le code secret partirait alors en clair, visible à l'écran et
// dans l'historique. Une seule lecture, donc.
//
// Ce qu'on lit ici est du TEXTE D'OPÉRATEUR, jamais celui de nos écrans : les
// motifs portent le français ET l'anglais, parce que les opérateurs
// camerounais écrivent dans les deux langues, et parfois mélangent.
//
// LE MESSAGE DE L'OPÉRATEUR N'EST JAMAIS RETOUCHÉ ICI : on le LIT pour
// proposer des raccourcis (des boutons, un champ du bon type, le pavé). Ce
// qu'il a écrit s'affiche ailleurs, tel quel, et une réponse libre reste
// toujours possible. Dans le doute, la lecture rend la main — et quand le
// doute porte sur le code secret, elle le traite COMME un code.

/** Ce qu'un champ du formulaire sait remplir. */
export type TypeChamp = "numero" | "montant";

/** La question du réseau ↔ le champ qui peut y répondre tout seul. */
export const RECONNAISSANCE: { motif: RegExp; type: TypeChamp }[] = [
  // « agent » n'en fait plus partie : « Enter Agent ID » recevait le numéro
  // du bénéficiaire. « Numero de l'agent » reste reconnu par « numero ».
  { motif: /num[ée]ro|b[ée]n[ée]ficiaire|abonn[ée]|destinataire|t[ée]l[ée]phone|number|recipient|beneficiary|receiver|subscriber|phone|msisdn|mobile\s+no/i, type: "numero" },
  { motif: /montant|somme|combien|amount|how\s+much|\bvaleur\b|\bvalue\b/i, type: "montant" },
];

// UN NUMÉRO N'EST PAS TOUJOURS UN TÉLÉPHONE. « Entrez le numero de facture »,
// « Enter reference number », « Enter the number of months » recevaient le
// numéro du bénéficiaire, tout seuls — une transaction fausse, et le champ,
// consommé, ne servait plus la vraie question d'après. Une phrase qui nomme
// l'un de ces objets n'est pas servie : on rend la main.
const RE_PAS_UN_TELEPHONE =
  /factur|invoice|\bbill\b|r[ée]f[ée]rence|\bref\b|\bcompte\b|account|contrat|contract|compteur|meter|\bcarte\b|\bcard\b|\bmois\b|\bmonths?\b|\bjours?\b|\bdays?\b|\bid\b|identifiant|transaction|commande|\border\b|dossier|ticket|police|policy|re[çc]u|receipt|s[ée]rie|serial|voucher|badge|\bcni\b|passeport|passport/i;

// Une ligne de choix numéroté : « 1. Envoyer », « 2) Retirer », « 3 - Solde ».
//
// Le « : » est admis, des opérateurs l'emploient — mais il sépare aussi les
// heures, et « 10:44 » n'est pas un choix de menu. Les dates non plus
// (« 12-05-2026 »). On n'écarte QUE ces deux formes : la première version
// refusait tout libellé commençant par deux chiffres, et « 1. 50 Mo »,
// « 2. 25 000 F », « 3. 10 Go 30j » cessaient d'être des choix — un menu de
// montants recevait alors le montant tout seul, là où l'opérateur attendait
// 1, 2 ou 3. Même règle côté robot (totem/app.py, RE_OPTION).
const PAS_UNE_DATE = "(?!\\d{1,2}[.\\-/](?:\\d{4}\\b|\\d{1,2}(?![\\d.,])))";
const SEPARATEUR = `(?:[.)\\-][ \\t]*${PAS_UNE_DATE}|:[ \\t]*(?!\\d{2}(?:\\D|$)))`;
const RE_OPTION = new RegExp(`^[ \\t]*\\d{1,2}[ \\t]*${SEPARATEUR}\\S`, "gm");

// UN MENU A AU MOINS DEUX CHOIX.
//
// Une SEULE ligne numérotée ne fait pas un menu. Deux messages d'opérateur
// parfaitement ordinaires désarmaient pourtant la garde du code :
//
//   « 10:44 \n Entrez votre code secret »        (l'heure en tête)
//   « 1. Entrez votre code PIN pour confirmer »  (une demande numérotée)
//
// Le pavé ne s'ouvrait pas, le code se tapait dans la zone de texte
// ordinaire, et partait SANS le drapeau « secret » — il restait EN CLAIR
// dans le nuage, pour toujours.
const MENU_MINIMUM = 2;

/** Le message est-il une liste de choix ? (au moins deux lignes numérotées) */
function estUnMenu(texte: string): boolean {
  return (texte.match(RE_OPTION) ?? []).length >= MENU_MINIMUM;
}

// Le vocabulaire du code secret, volontairement LARGE : masquer une saisie
// anodine ne coûte rien, laisser passer un code l'écrit en clair.
//
// « NIP » (Numéro d'Identification Personnel) est le mot COURANT en Afrique
// francophone. « \bpin\b » ne voyait ni « mPIN », ni « PINCODE », ni
// « PIN2 », ni « PIN_MoMo » (pas de frontière de mot) ; « secret » ne voyait
// pas « clé secrète » ; « mot de passe » pas « mot-de-passe ». Le même
// vocabulaire vit dans le robot (totem/app.py, RE_DEMANDE_CODE).
const RE_SECRET =
  /\bn\.?i\.?p\.?\b|(?:\b|m|e-?)pin(?:\d|_|code|\b)|\bp\.i\.n\b|\bmdp\b|\bcodes?\b|secr[eè]t|confidentiel|confidential|mot[\s-]*de[\s-]*passe|password|passcode|passphrase/i;

// Une demande se reconnaît à ses verbes, ou à sa ponctuation finale. Les
// verbes de CHOIX (« choisissez ») demandent un choix, pas une saisie : ils
// comptent pour dire qu'on attend une réponse, jamais pour dire qu'on
// attend le code.
const VERBES_SAISIE =
  "entre[zr]|saisi(?:r|ssez)|tape[zr]|indique[zr]|r[ée]pond|veuillez|compose[zr]|renseigne[zr]|\\benter\\b|\\btype\\b|reply|please|input|provide|\\bdial\\b";
const VERBES_CHOIX = "choisi(?:r|ssez)|choose|select";
const RE_SAISIE = new RegExp(`${VERBES_SAISIE}|[?:]\\s*$`, "i");
const RE_CHOIX_VERBE = new RegExp(VERBES_CHOIX, "i");
const RE_DEMANDE = new RegExp(`${VERBES_SAISIE}|${VERBES_CHOIX}|[?:]\\s*$`, "i");

// Une phrase qui NOMME le code sans le demander : une mise en garde (« Ne
// partagez jamais votre code PIN ») ou un code qu'on VOUS donne (« Code de
// retrait : 4821 »). Le pavé s'ouvrait dessus, à la place du bouton « 00.
// Next » ou « 1. Confirmer » — et, sur un message de réussite, sous une
// session close. Une telle phrase n'est écartée que si elle ne demande rien :
// « Entrez votre code, ne le partagez jamais » reste une demande.
const RE_MISE_EN_GARDE =
  /jamais|never|ne\s+(?:le\s+|la\s+|les\s+)?(?:partag|communiqu|divulgu|donn|transm|r[ée]v[ée]l)|do\s+not\s+(?:share|disclose|give)|don'?t\s+(?:share|disclose|give)/i;
const RE_CODE_DONNE =
  /(?:\bcodes?\b|\bpin\b|\bn\.?i\.?p\b)(?:\s+(?:de|du|d'|of|for)\s*[A-Za-zÀ-ÿ']+){0,2}\s*(?::|=|est|is)?\s*\d{4,}/i;

// Un CONSEIL n'est ni une demande ni une issue. « Transfert effectué avec
// succès. En cas d'erreur, appelez le 8000 » s'affichait « Opération
// refusée », avec la vibration d'échec — et le propriétaire refaisait le
// transfert : le bénéficiaire était payé deux fois. « To cancel, dial
// *126*9# » ouvrait un champ sous une fin.
const RE_CONSEIL =
  /en\s+cas\s+d|pour\s+annuler|pour\s+toute|to\s+(?:cancel|reverse)|in\s+case\s+of|if\s+(?:this|you)|si\s+(?:cette|vous)|annulation\s+possible|(?:can|may)\s+be\s+(?:cancel|revers)|peut\s+(?:[êe]tre\s+)?annul|expires?\s+(?:dans|le|[àa]|in|on|at)\b|valable|valid\s+(?:for|until)/i;
const RE_CONSEIL_DEMANDE = /en\s+cas\s+d|pour\s+annuler|pour\s+toute|to\s+(?:cancel|reverse)|in\s+case\s+of/i;

const RE_REUSSIE =
  /succ[eè]s|r[ée]ussi|effectu[ée]|a\s+[ée]t[ée]\s+(?:envoy|transf|cr[ée]dit|d[ée]bit)|confirm[ée]e?\b|successful|completed|has\s+been\s+(?:sent|transferred|credited)/i;
const RE_REFUSEE =
  /[ée]chec|[ée]chou|refus|insuffisant|invalide|incorrect|erron|erreur|impossible|non\s+autoris|expir|annul|failed|failure|error|insufficient|invalid|declined|not\s+allowed|cancel/i;
// « non effectué », « unsuccessful », « not completed » : une réussite NIÉE
// est un refus, pas une réussite.
const SUCCES_NIE =
  "(?:\\bnon\\s+|\\bpas\\s+(?:[ée]t[ée]\\s+)?|n'a\\s+pas\\s+(?:[ée]t[ée]\\s+)?|\\bnot\\s+(?:been\\s+)?|\\bun)(?:effectu|r[ée]ussi|successful|completed|confirm)";
const RE_SUCCES_NIE = new RegExp(SUCCES_NIE, "i");
const RE_SUCCES_NIE_PARTOUT = new RegExp(SUCCES_NIE, "gi");
// « Code incorrect. Il vous reste 2 essais » : l'opérateur attend un nouvel
// essai, sans poser de question. C'est encore le pavé — jamais un champ en
// clair où le second essai, le VRAI code, se taperait.
const RE_NOUVEL_ESSAI =
  /reste\s+\d+\s+(?:essai|tentative)|\d+\s+(?:essais?|tentatives?|attempts?|tries)\s+(?:restant|remaining|left)|try\s+again|r[ée]essa?y|retry|remaining\s+attempts?|attempts?\s+(?:remaining|left)/i;

/** Les phrases d'un texte — une par ligne, et coupées après . ! ? ; */
function phrases(texte: string): string[] {
  return texte.replace(/([.!?;])[ \t]+/g, "$1\n").split("\n")
    .map((p) => p.trim()).filter(Boolean);
}

/** Ce qu'il dit du code, phrases de mise en garde et codes donnés écartés. */
function phrasesUtiles(texte: string): string[] {
  return phrases(texte).filter((p) =>
    RE_SAISIE.test(p) || !(RE_MISE_EN_GARDE.test(p) || RE_CODE_DONNE.test(p)));
}

/** L'issue que le texte annonce — dans le doute, aucune. */
function issueDe(texte: string): "reussie" | "refusee" | null {
  const t = phrases(texte).filter((p) => !RE_CONSEIL.test(p)).join("\n");
  const echec = RE_SUCCES_NIE.test(t) || RE_REFUSEE.test(t);
  const succes = RE_REUSSIE.test(t.replace(RE_SUCCES_NIE_PARTOUT, " "));
  // Les deux à la fois : on ne tranche pas. « Refusée » fait refaire un
  // transfert peut-être parti ; « réussie », croire arrivé un argent qui ne
  // l'est pas. Le message, lui, reste à l'écran en entier.
  return echec && !succes ? "refusee" : succes && !echec ? "reussie" : null;
}

/** Le texte demande-t-il quelque chose ? (les conseils ne demandent rien) */
function demandeQuelqueChose(texte: string): boolean {
  return phrases(texte).some((p) => !RE_CONSEIL_DEMANDE.test(p) && RE_DEMANDE.test(p));
}

/** Les champs qu'une phrase DEMANDE — pas ceux qu'elle se contente de nommer. */
function typesDemandes(texte: string): TypeChamp[] {
  const types = new Set<TypeChamp>();
  for (const p of phrases(texte)) {
    if (RE_CONSEIL_DEMANDE.test(p) || !RE_DEMANDE.test(p)) continue;
    for (const r of RECONNAISSANCE) {
      if (!r.motif.test(p)) continue;
      if (r.type === "numero" && RE_PAS_UN_TELEPHONE.test(p)) continue;
      types.add(r.type);
    }
  }
  return [...types];
}

// ---------------------------------------------------------------------------
// LA SURCOUCHE : lire un écran de l'opérateur comme une application le ferait.
//
// L'opérateur envoie un bloc de texte — « MTN MoMo\n1. Transfert\n2. Retrait »
// — et on le LIT : ce qui est la question, ce qui est un choix, ce qu'il
// attend en retour, et s'il dit que c'est fini. L'écran en fait des boutons,
// un champ du bon type, ou un écran de fin.
//
// RIEN N'EST INVENTÉ. Chaque choix garde le libellé de l'opérateur, mot pour
// mot, et le numéro qu'il faut lui renvoyer.
// ---------------------------------------------------------------------------

/** Un choix du menu de l'opérateur : ce qu'on lui renvoie, et son libellé. */
export type ChoixReseau = { numero: string; libelle: string };

export type EcranReseau = {
  /** Ce qui n'est pas un choix : le titre du menu, la question, l'annonce. */
  texte: string;
  /** Les choix numérotés — des raccourcis ; vide quand il n'y en a pas. */
  choix: ChoixReseau[];
  /** Ce que l'opérateur attend de nous. « rien » : il annonce, il ne demande plus. */
  attend: "secret" | "choix" | "numero" | "montant" | "texte" | "rien";
  /** Quand il n'attend plus rien : a-t-il dit que c'était fait, ou refusé ? */
  issue: "reussie" | "refusee" | null;
  /** Le message NOMME un code (dans une question, un choix, une mise en
   *  garde) : une réponse tapée librement doit alors partir comme un code —
   *  masquée, avec le drapeau « secret ». Dans le doute, c'est un code. */
  parleDuCode: boolean;
};

const RE_LIGNE_CHOIX = new RegExp(`^[ \\t]*(\\d{1,2})[ \\t]*${SEPARATEUR}(\\S.*)$`);

// LES MENUS NE SONT PAS LES NÔTRES : ils changent sans prévenir, d'un
// opérateur à l'autre, d'une langue à l'autre. On lit leur FORME.
//
//   — le numéro suivi d'une simple espace, puis d'une LETTRE : « 1 Transfert ».
//     La lettre est exigée : « 1 000 FCFA » n'est pas un choix. Et il faut
//     deux lignes QUI SE SUIVENT, numérotées dans l'ordre : « 2 SMS restants /
//     1 Appel manqué » est un relevé, pas un menu ;
//   — la navigation : « 0 Retour », « 00 Accueil », « 98 Suivant »,
//     « #. Retour », « *: Menu ». Le « # » et l'« * » ne sont des choix
//     qu'avec un MOT de navigation : « * Prix TTC » est une puce, et un
//     bouton « Prix TTC » enverrait « * » à l'opérateur.
const MOTS_DE_NAVIGATION =
  "next|suivant|suite|la\\s+suite|page\\s+suivante|nxt|more|plus|back|retour|pr[ée]c[ée]dent|previous|prev|accueil|home|main\\s+menu|menu|confirm(?:er)?|valider|annuler|cancel|quitter|exit|oui|non|yes|no";
const RE_NAVIGATION = new RegExp(`^(?:${MOTS_DE_NAVIGATION})\\b`, "i");
const RE_LIGNE_SOUPLE = /^[ \t]*(\d{1,2})[ \t]+(?=[A-Za-zÀ-ÿ])(\S.*)$/;
const RE_LIGNE_NAVIGATION = new RegExp(
  `^[ \\t]*([#*])[ \\t]*(?:[.):\\-][ \\t]*|[ \\t]+)(?=(?:${MOTS_DE_NAVIGATION})\\b)(\\S.*)$`, "i");

/** Un message en forme de menu, au sens large. */
function estUnMenuSouple(texte: string): boolean {
  if (estUnMenu(texte)) return true;
  const lignes = texte.split("\n").filter((l) => l.trim());
  for (let i = 0; i + 1 < lignes.length; i++) {
    const a = RE_LIGNE_SOUPLE.exec(lignes[i]);
    const b = RE_LIGNE_SOUPLE.exec(lignes[i + 1]);
    if (a && b && Number(b[1]) === Number(a[1]) + 1) return true;
  }
  return false;
}

// DEUX CHOIX SUR UNE MÊME LIGNE : « 00.Next 0.Back » donnait UN bouton,
// « Next 0.Back », et le retour disparaissait. On coupe — mais seulement
// devant un choix de navigation ou le numéro qui SUIT, pour qu'un libellé
// comme « Forfait 2-Go » ne se coupe pas.
const RE_CHOIX_SUIVANT = /[ \t]+(?=(?:\d{1,2}|[#*])[.):>-][ \t]*[A-Za-zÀ-ÿ])/;
const RE_MORCEAU = /^(\d{1,2}|[#*])[.):>-][ \t]*(\S.*)$/;

function decouperLeLibelle(numero: string, libelle: string): ChoixReseau[] {
  const morceaux = libelle.split(RE_CHOIX_SUIVANT);
  const choix: ChoixReseau[] = [{ numero, libelle: morceaux[0].trim() }];
  for (const morceau of morceaux.slice(1)) {
    const m = RE_MORCEAU.exec(morceau.trim());
    const precedent = choix[choix.length - 1];
    if (m && (RE_NAVIGATION.test(m[2]) || Number(m[1]) === Number(precedent.numero) + 1)) {
      choix.push({ numero: m[1], libelle: m[2].trim() });
    } else {
      precedent.libelle = `${precedent.libelle} ${morceau.trim()}`;
    }
  }
  return choix;
}

/** Les choix portés par une ligne, sous l'une des trois formes. */
function choixDeLaLigne(ligne: string): ChoixReseau[] | null {
  const m = RE_LIGNE_CHOIX.exec(ligne) ?? RE_LIGNE_SOUPLE.exec(ligne)
    ?? RE_LIGNE_NAVIGATION.exec(ligne);
  return m ? decouperLeLibelle(m[1], m[2].trim()) : null;
}

// UN MESSAGE LONG SE TOURNE COMME UNE PAGE. Un écran USSD tient au plus 182
// caractères ; au-delà, l'opérateur coupe et termine par la navigation :
//
//   « Confirm: Float Transfer for FCFA 5000 To -<NOM DE SOCIÉTÉ DE SOIXANTE
//     LETTRES> having mobile number 237672502815.
//     00. Next »
//
// Une DERNIÈRE ligne en forme de choix n'est pas une fin : l'opérateur dit
// quoi taper ensuite. Elle devient un bouton. La navigation se reconnaît
// aussi COLLÉE à la phrase, sous toutes les formes rencontrées — « …815.
// 00. Next », « …815 00.Next », « .00.Next », « . 00>Next », « . 00 Next> »,
// « 00. Page suivante », « 1. Yes 2. No » — et dite en phrase : « Reply 00
// for more », « Tapez 00 pour la suite ». Toujours avec un MOT de
// navigation : « …au 677. 12 mois » n'est pas un choix.
const RE_NAV_COLLEE_SEPAREE = new RegExp(
  `(^|[.!?:;,][ \\t]*|[ \\t])(\\d{1,2}|[#*])[ \\t]*[.):>\\-][ \\t]*(${MOTS_DE_NAVIGATION})[ \\t]*>?[ \\t]*$`, "i");
const RE_NAV_COLLEE_ESPACEE = new RegExp(
  `([.!?:;,])[ \\t]+(\\d{1,2}|[#*])[ \\t]+(${MOTS_DE_NAVIGATION})[ \\t]*>?[ \\t]*$`, "i");
const RE_TAPEZ_POUR =
  /(^|[.!?:;,][ \t]*)((?:reply|send|dial|press|enter|tapez|envoyez|composez|r[ée]pondez|appuyez\s+sur)\s+(\d{1,2}|[#*])\s+(?:for|to|pour)\s+[^.!?\n]+?)[ \t]*[.!]?[ \t]*$/i;
// « 98 Suivant », sans ponctuation, sur sa propre ligne.
const RE_LIGNE_NAVIGATION_SOUPLE = new RegExp(
  `^\\s*(\\d{1,2})\\s+(${MOTS_DE_NAVIGATION})\\s*$`, "i");

/** Les choix que porte la FIN du message, et le message sans eux. */
function choixDeFin(reste: string[]): { choix: ChoixReseau[]; avant: string[] } | null {
  const derniere = reste[reste.length - 1] ?? "";
  if (reste.length >= 2) {
    const c = RE_LIGNE_CHOIX.exec(derniere) ?? RE_LIGNE_NAVIGATION.exec(derniere)
      ?? RE_LIGNE_NAVIGATION_SOUPLE.exec(derniere);
    if (c) return { choix: decouperLeLibelle(c[1], c[2].trim()), avant: reste.slice(0, -1) };
  }
  let ligne = derniere;
  const choix: ChoixReseau[] = [];
  for (let i = 0; i < 4; i++) {
    const m = RE_NAV_COLLEE_SEPAREE.exec(ligne) ?? RE_NAV_COLLEE_ESPACEE.exec(ligne);
    if (!m) break;
    choix.unshift({ numero: m[2], libelle: m[3].trim() });
    // On garde la ponctuation qui finissait la phrase (« …237672502815. »).
    ligne = (ligne.slice(0, m.index) + m[1].trim()).trim();
  }
  if (!choix.length) {
    const m = RE_TAPEZ_POUR.exec(ligne);
    if (m) {
      choix.push({ numero: m[3], libelle: m[2].trim() });
      ligne = (ligne.slice(0, m.index) + m[1].trim()).trim();
    }
  }
  if (!choix.length) return null;
  return { choix, avant: [...reste.slice(0, -1), ligne].filter(Boolean) };
}

type Decoupe = { choix: ChoixReseau[]; reste: string[] };

function decouper(source: string): Decoupe {
  const menu = estUnMenuSouple(source);
  const choix: ChoixReseau[] = [];
  const reste: string[] = [];
  for (const ligne of source.split("\n")) {
    const c = menu ? choixDeLaLigne(ligne) : null;
    if (c) choix.push(...c);
    else if (ligne.trim()) reste.push(ligne.trim());
  }
  return { choix, reste };
}

// LA GARDE DU CODE SECRET.
//
// La première règle disait : « un message qui liste au moins deux options
// n'est jamais une demande de code ». Or MTN et Orange ajoutent leur
// navigation au pied de presque tous leurs écrans :
//
//   « Entrez votre PIN pour confirmer / 0. Retour / 00. Accueil »
//   « Entrez votre code secret / 1. Valider / 0. Retour »
//
// Deux lignes numérotées : un « menu », donc pas de pavé. Le code se tapait
// dans la zone de réponse, s'affichait, partait sans le drapeau « secret »
// et restait en clair dans la base. La règle regarde donc CE QUI EST DEMANDÉ :
//
//   — le code est nommé hors des choix, dans une phrase qui le DEMANDE
//     (verbe de saisie, « : » ou « ? » final) : c'est le code, menu ou pas ;
//   — il est nommé hors des choix sans être demandé (« Code secret », « Code
//     PIN incorrect ») : c'est le code, SAUF si le message offre au moins un
//     vrai choix — pas de la navigation (« Gérer mon code secret / 1)
//     Changer / 2) Retour » est un menu) ;
//   — il n'est nommé que DANS les choix (« 3. Changer code PIN ») : un menu ;
//   — il n'est nommé que dans une mise en garde ou un code qu'on nous donne,
//     et rien n'est demandé : ce n'est pas une demande de code.
//
// La même règle vit dans le robot (totem/app.py, `_demande_un_code`).
function codeDemande(d: Decoupe): boolean {
  const sujet = d.reste.join("\n");
  if (!RE_SECRET.test(sujet)) return false;
  const utiles = phrasesUtiles(sujet);
  const nomme = utiles.filter((p) => RE_SECRET.test(p));
  if (!nomme.length && !utiles.some((p) => RE_SAISIE.test(p))) return false;
  const vraisChoix = d.choix.filter((c) => !RE_NAVIGATION.test(c.libelle));
  const leDemande = nomme.some((p) => RE_SAISIE.test(p) && !RE_CHOIX_VERBE.test(p));
  return vraisChoix.length === 0 || leDemande;
}

/**
 * Le réseau réclame-t-il le code secret ?
 *
 * Se tromper coûte cher dans les deux sens : dire oui à tort ouvre le pavé
 * sur une question ordinaire (gênant, et « Répondre autrement » reste là) ;
 * dire non à tort fait taper le code dans une zone de texte ordinaire, où il
 * s'affiche et reste (grave). Dans le doute, oui.
 */
export function demandeUnCode(texte: string): boolean {
  return codeDemande(decouper((texte || "").replace(/\r/g, "")));
}

/**
 * Parmi les champs pas encore consommés, celui qui répond à cette question —
 * ou `undefined` si aucun ne convient, auquel cas on rend la main au
 * propriétaire. On ne devine JAMAIS une réponse qu'on n'a pas.
 */
export function champPourQuestion<T extends { type: TypeChamp }>(
  texte: string,
  restants: readonly T[],
): T | undefined {
  const lu = lireLeTexte(texte);
  // UN MESSAGE QUI NOMME UN CODE NE SE REMPLIT JAMAIS TOUT SEUL. « Enter your
  // mPIN to confirm transfer to number 677… » recevait le numéro du
  // bénéficiaire : un essai de code brûlé — trois, et le compte est bloqué.
  if (lu.parleDuCode) return undefined;
  // Seule une question qui DEMANDE un numéro ou un montant se remplit. Un
  // menu, une page qui se tourne (« …having mobile number 237…. Reply 00 for
  // more »), une phrase qui NOMME un numéro sans le demander : on rend la
  // main. Le numéro partait là où l'opérateur attendait « 00 ».
  if (lu.attend !== "numero" && lu.attend !== "montant") return undefined;
  // Plusieurs champs du même type encore à servir : on ne choisit pas.
  const correspondants = restants.filter((c) => c.type === lu.attend);
  return correspondants.length === 1 ? correspondants[0] : undefined;
}

/** Ce que le RÉSEAU a dit de la session, quand le boîtier le rapporte :
 *  « attend » — il attend une réponse (+CUSD: 1) ; « fini » — il a fermé
 *  (+CUSD: 0 ou 2). Absent d'un boîtier d'avant : on lit alors le texte. */
export type EtatDuReseau = "attend" | "fini";

/** Lit un écran de l'opérateur. Ne lève jamais, n'invente rien.
 *
 *  `reseau` : ce que le réseau a dit de la session. C'est lui qui SAIT si
 *  l'on peut encore répondre ; le texte ne fait que le laisser deviner. */
export function lireEcran(
  brut: string | null | undefined, reseau?: EtatDuReseau | null,
): EcranReseau {
  const lu = lireLeTexte(brut);
  if (reseau === "fini") {
    // Le réseau a raccroché : plus rien ne part, même si le texte demande.
    if (lu.attend === "rien") return lu;
    const texte = [lu.texte, ...lu.choix.map((c) => `${c.numero}. ${c.libelle}`)]
      .filter(Boolean).join("\n");
    return { texte, choix: [], attend: "rien", issue: issueDe(lu.texte), parleDuCode: lu.parleDuCode };
  }
  if (reseau === "attend" && lu.attend === "rien") {
    // Il attend, et le texte ne dit pas quoi. S'il parle du code (« Code PIN
    // incorrect. Il vous reste 2 essais »), c'est le pavé : le second essai
    // est le VRAI code. Sinon, un champ libre — jamais « Terminé » sur une
    // session encore ouverte.
    const attend = demandeUnCode(brut ?? "") ? "secret" : "texte";
    return { ...lu, attend, issue: null };
  }
  return lu;
}

function lireLeTexte(brut: string | null | undefined): EcranReseau {
  const source = (brut ?? "").replace(/\r/g, "");
  const d = decouper(source);
  const texte = d.reste.join("\n");
  const parleDuCode = RE_SECRET.test(source);

  // LE CODE D'ABORD. Un refus ou une réussite SANS question ni nouvel essai
  // (« Wrong PIN. Transaction failed. », « Votre code PIN a été modifié avec
  // succès ») parle de code sans en demander : c'est une FIN. Avec une
  // question (« Code incorrect, entrez votre code ») ou un essai restant
  // (« Il vous reste 2 essais »), c'est encore le pavé — et si le réseau dit
  // qu'il attend, `lireEcran` rouvre le pavé quoi qu'il en soit. Les choix
  // de navigation restent connus de l'écran.
  if (codeDemande(d)) {
    const issue = issueDe(texte);
    const fin = issue !== null && !demandeQuelqueChose(texte) && !RE_NOUVEL_ESSAI.test(texte);
    if (!fin) return { texte, choix: d.choix, attend: "secret", issue: null, parleDuCode: true };
    return { texte, choix: [], attend: "rien", issue, parleDuCode: true };
  }
  if (d.choix.length >= MENU_MINIMUM) {
    return { texte, choix: d.choix, attend: "choix", issue: null, parleDuCode };
  }

  // La question, sans les choix qui la terminent (« Entrez le montant /
  // 0. Retour ») : c'est ELLE qui dit quel champ on attend.
  const fin = choixDeFin(d.reste);
  const question = fin ? fin.avant.join("\n") : texte;
  const choix = fin?.choix ?? [];
  const types = typesDemandes(question);
  if (types.length === 1) return { texte: question, choix, attend: types[0], issue: null, parleDuCode };
  if (demandeQuelqueChose(question)) return { texte: question, choix, attend: "texte", issue: null, parleDuCode };
  // Rien de demandé, mais la fin dit quoi taper : une page qui se tourne,
  // pas une fin.
  if (fin) return { texte: question, choix, attend: "choix", issue: null, parleDuCode };
  return { texte, choix: [], attend: "rien", issue: issueDe(texte), parleDuCode };
}

// ---------------------------------------------------------------------------
// LE MESSAGE SE LIT DANS SON ORDRE, ET UNE SEULE FOIS.
//
// Les choix d'un menu sont des TUILES qu'on touche — c'est ce que le
// propriétaire aimait. Mais chaque ligne de l'opérateur doit rester
// quelque part, à sa place, et une seule fois :
//
//   — une version retirait « 00. Next » sans le montrer nulle part :
//     « pourquoi tu as supprimé ça du message de l'opérateur ? » ;
//   — la suivante affichait le message entier PUIS chaque choix en tuile :
//     neuf lignes en devenaient dix-huit, « tu as tué l'expérience ».
//
// On découpe donc le message en lignes, dans l'ordre : une ligne qui porte
// UN choix devient sa tuile, à l'endroit où l'opérateur l'a écrite ; les
// autres restent du texte (le titre, « … », une mise en garde). Ce qui ne
// tient pas sur une ligne à lui — deux choix sur une ligne (« 00.Next
// 0.Back »), une navigation collée à la phrase (« …815. 00. Next ») —
// reste dans le texte tel quel et ressort dans `restants`, en tuiles sous
// le message.
// ---------------------------------------------------------------------------

/** Une ligne du message, telle que l'opérateur l'a écrite ; `numero` si
 *  la toucher revient à répondre ce choix. */
export type LigneDuMessage = { texte: string; numero?: string; libelle?: string };

const RE_DEBUT_DE_CHOIX = /^[ \t]*(\d{1,2}|[#*])[ \t]*(?:[.):>\-][ \t]*|[ \t]+)?(.*?)[ \t]*$/;

export function lignesDuMessage(
  texte: string | null | undefined, choix: readonly ChoixReseau[],
): { lignes: LigneDuMessage[]; restants: ChoixReseau[] } {
  const lignes: LigneDuMessage[] = [];
  const pris = new Set<ChoixReseau>();
  for (const brute of (texte ?? "").replace(/\r/g, "").split("\n")) {
    const m = RE_DEBUT_DE_CHOIX.exec(brute);
    const c = m ? choix.find((x) => !pris.has(x) && x.numero === m[1]
                                    && x.libelle === m[2]) : undefined;
    if (c) { pris.add(c); lignes.push({ texte: brute, numero: c.numero, libelle: c.libelle }); }
    else lignes.push({ texte: brute });
  }
  // UNE SEULE LIGNE DE CHOIX NE FAIT PAS UN MENU. « …having mobile number
  // 237…. / 00. Next » est une page de texte qui se tourne : son message
  // reste ENTIER dans la carte — le propriétaire l'a demandé —, et « Next »
  // se touche sous lui.
  if (lignes.filter((l) => l.numero).length < 2) {
    for (const l of lignes) { delete l.numero; delete l.libelle; }
    pris.clear();
  }
  // Les blancs du bout ne s'affichent pas ; ceux du milieu, si — l'opérateur
  // les a mis (« …8:Bank & Finance / / … / 9:Next »).
  while (lignes.length && !lignes[lignes.length - 1].texte.trim()) lignes.pop();
  while (lignes.length && !lignes[0].texte.trim()) lignes.shift();
  return { lignes, restants: choix.filter((x) => !pris.has(x)) };
}

/** Un morceau de ce qui suit le titre : une tuile, ou du texte de l'opérateur. */
export type MorceauDuMenu =
  | { texte: string; numero?: undefined; libelle?: undefined }
  | { texte: string; numero: string; libelle: string };

/**
 * Le titre (ce qui précède le premier choix sur sa ligne, mot pour mot) et
 * la suite, dans l'ordre : tuiles et lignes de texte. Sans choix sur une
 * ligne à lui, le titre est le message entier. Les lignes de texte qui se
 * suivent restent un seul morceau ; les blancs entre deux tuiles tombent —
 * l'espace entre tuiles les remplace.
 */
export function menuEnTuiles(lignes: readonly LigneDuMessage[]): {
  titre: string; suite: MorceauDuMenu[];
} {
  const premier = lignes.findIndex((l) => l.numero);
  if (premier < 0) return { titre: lignes.map((l) => l.texte).join("\n"), suite: [] };
  const titre = lignes.slice(0, premier).map((l) => l.texte).join("\n").trim();
  const suite: MorceauDuMenu[] = [];
  for (const l of lignes.slice(premier)) {
    if (l.numero) { suite.push({ texte: l.texte, numero: l.numero, libelle: l.libelle ?? l.texte.trim() }); continue; }
    const avant = suite[suite.length - 1];
    if (avant && !avant.numero) avant.texte += `\n${l.texte}`;
    else suite.push({ texte: l.texte });
  }
  for (const m of suite) if (!m.numero) m.texte = m.texte.trim();
  return { titre, suite: suite.filter((m) => m.numero || m.texte) };
}
