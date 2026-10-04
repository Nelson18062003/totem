// TÉMOIN FIGÉ : la lecture d'un écran telle qu'elle était au commit 9bd8990, avant
// l'audit adverse. Les tests du déroulé la rejouent pour prouver que l'ancien
// comportement échoue — sans dépendre de la lecture du jour, qui progresse.
// Ne pas corriger ce fichier : c'est un témoin.

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

/** Ce qu'un champ du formulaire sait remplir. */
export type TypeChamp = "numero" | "montant";

/** La question du réseau ↔ le champ qui peut y répondre tout seul. */
export const RECONNAISSANCE: { motif: RegExp; type: TypeChamp }[] = [
  { motif: /num[ée]ro|beneficiaire|b[ée]n[ée]ficiaire|abonn[ée]|agent|destinataire|t[ée]l[ée]phone|number|recipient|beneficiary|receiver|subscriber|phone|msisdn|mobile\s+no/i, type: "numero" },
  { motif: /montant|somme|combien|amount|how\s+much|\bvaleur\b|\bvalue\b/i, type: "montant" },
];

// Une ligne de choix numéroté : « 1. Envoyer », « 2) Retirer », « 3 - Solde ».
//
// Le « : » est admis, des opérateurs l'emploient — mais il sépare aussi les
// heures, et « 10:44 » n'est pas un choix de menu. On écarte donc ce qui a la
// forme d'un horodatage.
const RE_OPTION = /^[ \t]*\d{1,2}[ \t]*[.):\-][ \t]*(?!\d{2}(?:\D|$))\S/gm;

// UN MENU A AU MOINS DEUX CHOIX — et c'est tout l'enjeu du code secret.
//
// Une SEULE ligne numérotée ne fait pas un menu. Deux messages d'opérateur
// parfaitement ordinaires désarmaient pourtant la garde :
//
//   « 10:44 \n Entrez votre code secret »        (l'heure en tête)
//   « 1. Entrez votre code PIN pour confirmer »  (une demande numérotée)
//
// Les deux étaient déclarés « menu », donc PAS une demande de code. Le pavé
// ne s'ouvrait pas, le code se tapait dans la zone de texte ordinaire, il
// s'affichait dans le fil de la conversation, et il partait SANS le drapeau
// « secret » — le robot ne l'effaçait donc jamais, et le code secret Mobile
// Money restait EN CLAIR dans le nuage, pour toujours. Exactement ce que
// l'en-tête de ce fichier promet d'empêcher.
const MENU_MINIMUM = 2;

/** Le message est-il une liste de choix ? (au moins deux lignes numérotées) */
function estUnMenu(texte: string): boolean {
  return (texte.match(RE_OPTION) ?? []).length >= MENU_MINIMUM;
}

// « NIP » (Numéro d'Identification Personnel) est le mot COURANT pour le
// code secret Mobile Money en Afrique francophone — plus que « PIN ». Sans
// lui, « Saisir votre NIP » n'ouvrait pas le pavé, et le code partait en
// clair. Même correctif que côté robot.
const RE_SECRET =
  /\bn\.?i\.?p\.?\b|\bpin\b|\bmdp\b|\bcodes?\b|secret|confidentiel|confidential|mot\s+de\s+passe|password|passcode/i;

/**
 * Le réseau réclame-t-il le code secret ?
 *
 * Se tromper coûte cher dans les deux sens : dire oui à tort ouvre le pavé
 * sur une question ordinaire (gênant) ; dire non à tort fait taper le code
 * dans une zone de texte ordinaire, où il s'affiche et reste (grave). D'où
 * la garde sur les menus : un message qui liste des options numérotées n'est
 * jamais une demande de code, même s'il contient le mot.
 */
export function demandeUnCode(texte: string): boolean {
  const t = texte || "";
  return !estUnMenu(t) && RE_SECRET.test(t);
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
  // UN MENU N'EST PAS UNE QUESTION. « Transfert d'argent / 1. Vers un numero
  // MTN / 2. Vers un autre reseau » contient le mot « numero » sans rien
  // demander de tel : on y répondait tout seul, et le numéro du bénéficiaire
  // partait COMME CHOIX DE MENU sur la vraie SIM — une branche non voulue
  // s'ouvrait, et le champ étant consommé, la vraie question qui suivait ne
  // pouvait plus être servie. Un menu se lit, il ne se remplit pas.
  if (estUnMenu(texte)) return undefined;
  // UNE PAGE QUI SE TOURNE N'EST PAS UNE QUESTION NON PLUS. « Confirm: Float
  // Transfer … having mobile number 237… / 00. Next » nomme un numéro sans
  // en demander : y répondre tout seul enverrait le numéro du bénéficiaire
  // là où l'opérateur attend « 00 ».
  if (lireLeTexte(texte).attend === "choix") return undefined;

  const correspondants = restants.filter((c) =>
    RECONNAISSANCE.some((r) => r.type === c.type && r.motif.test(texte)));
  // Un SEUL champ reconnu : c'est lui. Plusieurs — une question qui nomme À
  // LA FOIS le montant et le bénéficiaire (« Montant à envoyer au
  // bénéficiaire ») — on ne DEVINE pas : `find` rendait le premier de la
  // liste (le numéro), et le numéro partait là où le réseau attendait un
  // montant. On rend la main au propriétaire, comme pour une question
  // inconnue. Zéro : on rend la main aussi.
  return correspondants.length === 1 ? correspondants[0] : undefined;
}

// ---------------------------------------------------------------------------
// LA SURCOUCHE : lire un écran de l'opérateur comme une application le ferait.
//
// L'opérateur envoie un bloc de texte — « MTN MoMo\n1. Transfert\n2. Retrait »
// — et l'application le montrait tel quel, en demandant de taper « 1 ». Un
// terminal, pas une application. On le LIT donc : ce qui est la question, ce
// qui est un choix, ce qu'il attend en retour, et s'il dit que c'est fini.
// L'écran en fait des boutons, un champ du bon type, ou un écran de fin.
//
// RIEN N'EST INVENTÉ. Chaque choix garde le libellé de l'opérateur, mot pour
// mot, et le numéro qu'il faut lui renvoyer ; le texte brut reste consultable.
// Ce qu'on ne sait pas lire reste du texte, avec un champ libre : dans le
// doute, on rend la main — comme partout ailleurs dans ce fichier.
// ---------------------------------------------------------------------------

/** Un choix du menu de l'opérateur : ce qu'on lui renvoie, et son libellé. */
export type ChoixReseau = { numero: string; libelle: string };

export type EcranReseau = {
  /** Ce qui n'est pas un choix : le titre du menu, la question, l'annonce. */
  texte: string;
  /** Les choix numérotés — vide si ce n'est pas un menu. */
  choix: ChoixReseau[];
  /** Ce que l'opérateur attend de nous. « rien » : il annonce, il ne demande plus. */
  attend: "secret" | "choix" | "numero" | "montant" | "texte" | "rien";
  /** Quand il n'attend plus rien : a-t-il dit que c'était fait, ou refusé ? */
  issue: "reussie" | "refusee" | null;
};

const RE_LIGNE_CHOIX = /^[ \t]*(\d{1,2})[ \t]*[.):\-][ \t]*(?!\d{2}(?:\D|$))(\S.*)$/;

// LES MENUS NE SONT PAS LES NÔTRES : ils changent sans prévenir, d'un
// opérateur à l'autre, d'une langue à l'autre, d'une semaine à l'autre. On
// ne les apprend donc pas par cœur — on lit leur FORME. Deux formes de plus
// que « 1. Libellé » se rencontrent :
//
//   — le numéro suivi d'une simple espace, puis d'une LETTRE : « 1 Transfert ».
//     La lettre est exigée : « 1 000 FCFA » n'est pas un choix ;
//   — la navigation : « 0 Retour », « 00 Accueil », « 98 Suivant »,
//     « #. Retour », « *: Menu ». Le « # » et l'« * » ne comptent jamais pour
//     DIRE qu'un message est un menu (une puce « * Frais : 0 FCFA » n'en fait
//     pas un) ; ils ne sont lus comme choix que dans un message qui en est
//     déjà un.
//
// LA GARDE DU CODE SECRET N'EST PAS ÉLARGIE. `demandeUnCode` garde sa règle,
// la même que celle du robot : un message qui parle de code et n'est pas un
// menu au sens strict ouvre le pavé. La forme souple ne fait un menu que si
// le message ne parle PAS de code — dans le doute, le pavé.
const RE_LIGNE_SOUPLE = /^[ \t]*(\d{1,2})[ \t]+(?=[A-Za-zÀ-ÿ])(\S.*)$/;
const RE_LIGNE_NAVIGATION = /^[ \t]*([#*])[ \t]*(?:[.):\-][ \t]*|[ \t]+(?=[A-Za-zÀ-ÿ]))(\S.*)$/;

/** Un message en forme de menu, au sens large — jamais quand il parle de code. */
function estUnMenuSouple(texte: string): boolean {
  if (estUnMenu(texte)) return true;
  if (RE_SECRET.test(texte)) return false;
  const lignes = texte.split("\n").filter((l) => RE_LIGNE_SOUPLE.test(l));
  return lignes.length >= MENU_MINIMUM;
}

/** Le choix porté par une ligne, sous l'une des trois formes. */
function choixDeLaLigne(ligne: string): ChoixReseau | null {
  const m = RE_LIGNE_CHOIX.exec(ligne) ?? RE_LIGNE_SOUPLE.exec(ligne)
    ?? RE_LIGNE_NAVIGATION.exec(ligne);
  return m ? { numero: m[1], libelle: m[2].trim() } : null;
}

// Une demande se reconnaît à ses verbes, ou à sa ponctuation finale.
const RE_DEMANDE =
  /entre[zr]|saisi(?:r|ssez)|tape[zr]|indique[zr]|choisi(?:r|ssez)|r[ée]pond|veuillez|compose[zr]|renseigne[zr]|enter|type|choose|select|reply|please|input|provide|dial|\?\s*$|:\s*$/im;
const RE_REUSSIE =
  /succ[eè]s|r[ée]ussi|effectu[ée]|a\s+[ée]t[ée]\s+(?:envoy|transf|cr[ée]dit|d[ée]bit)|confirm[ée]e?\b|successful|completed|has\s+been\s+(?:sent|transferred|credited)/i;
const RE_REFUSEE =
  /[ée]chec|[ée]chou|refus|insuffisant|invalide|incorrect|erron|erreur|impossible|non\s+autoris|expir|annul|failed|failure|error|insufficient|invalid|declined|not\s+allowed|cancel/i;

// UN MESSAGE LONG SE TOURNE COMME UNE PAGE. Un écran USSD tient au plus 182
// caractères ; au-delà, l'opérateur coupe et termine par la navigation :
//
//   « Confirm: Float Transfer for FCFA 5000 To -<NOM DE SOCIÉTÉ DE SOIXANTE
//     LETTRES> having mobile number 237672502815.
//     00. Next »
//
// Le message ne pose aucune question — pas de verbe, pas de « ? », pas de
// « : » final — et une seule ligne numérotée ne fait pas un menu. L'écran
// le prenait donc pour une FIN : « Terminé », et un petit lien « répondre
// quand même ». La suite (le choix « Confirmer », puis le code secret) ne
// venait qu'en tapant « 00 » à l'aveugle. Ce sont les raisons sociales — les
// gros clients, les gros montants — qui ont les noms longs.
//
// Une DERNIÈRE ligne en forme de choix n'est pas une fin : l'opérateur dit
// quoi taper ensuite. Elle devient un bouton. La navigation se reconnaît
// aussi collée à la phrase (« …237672502815. 00. Next »), mais seulement
// avec un mot de navigation : « …au 677. 12 mois » n'est pas un choix.
const MOTS_DE_NAVIGATION =
  "next|suivant|suite|more|plus|back|retour|pr[ée]c[ée]dent|previous|accueil|home|menu|main\\s+menu|confirm(?:er)?|valider";
const RE_NAVIGATION_COLLEE = new RegExp(
  `[.!?:;,]\\s+(\\d{1,2}|[#*])\\s*[.):\\-]?\\s*(${MOTS_DE_NAVIGATION})\\s*$`, "i");
// « 98 Suivant », sans ponctuation, sur sa propre ligne : la forme souple,
// mais avec un mot de navigation — « 12 mois offerts » n'en est pas un.
const RE_LIGNE_NAVIGATION_SOUPLE = new RegExp(
  `^\\s*(\\d{1,2})\\s+(${MOTS_DE_NAVIGATION})\\s*$`, "i");

/** Le choix que porte la FIN du message, et le message sans lui. */
function choixDeFin(reste: string[]): { choix: ChoixReseau; avant: string[] } | null {
  const derniere = reste[reste.length - 1] ?? "";
  if (reste.length >= 2) {
    const c = RE_LIGNE_CHOIX.exec(derniere) ?? RE_LIGNE_NAVIGATION.exec(derniere)
      ?? RE_LIGNE_NAVIGATION_SOUPLE.exec(derniere);
    if (c) return { choix: { numero: c[1], libelle: c[2].trim() }, avant: reste.slice(0, -1) };
  }
  const m = RE_NAVIGATION_COLLEE.exec(derniere);
  if (!m) return null;
  // On garde la ponctuation qui finissait la phrase (« …237672502815. »).
  const phrase = derniere.slice(0, m.index + 1).trim();
  return {
    choix: { numero: m[1], libelle: m[2].trim() },
    avant: [...reste.slice(0, -1), phrase].filter(Boolean),
  };
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
    const issue = RE_REFUSEE.test(brut ?? "") ? "refusee"
      : RE_REUSSIE.test(brut ?? "") ? "reussie" : null;
    const texte = [lu.texte, ...lu.choix.map((c) => `${c.numero}. ${c.libelle}`)]
      .filter(Boolean).join("\n");
    return { texte, choix: [], attend: "rien", issue };
  }
  if (reseau === "attend" && lu.attend === "rien") {
    // Il attend, et le texte ne dit pas quoi : un champ libre — jamais
    // « Terminé » sur une session encore ouverte.
    return { ...lu, attend: "texte", issue: null };
  }
  return lu;
}

function lireLeTexte(brut: string | null | undefined): EcranReseau {
  const source = (brut ?? "").replace(/\r/g, "");
  const lignes = source.split("\n");
  const choix: ChoixReseau[] = [];
  const reste: string[] = [];
  const menu = estUnMenuSouple(source);
  for (const ligne of lignes) {
    const c = menu ? choixDeLaLigne(ligne) : null;
    if (c) choix.push(c);
    else if (ligne.trim()) reste.push(ligne.trim());
  }
  const texte = reste.join("\n");

  let attend: EcranReseau["attend"];
  // « Wrong PIN. Transaction failed. » parle de code sans en demander : c'est
  // une FIN, refusée. L'ouvrir en pavé ferait taper un code qui ne part
  // nulle part. Un refus SANS question n'attend plus rien ; avec une
  // question (« Code incorrect, entrez votre code »), c'est encore le pavé.
  if (demandeUnCode(source) && !(RE_REFUSEE.test(source) && !RE_DEMANDE.test(source))) {
    attend = "secret";
  }
  else if (choix.length >= MENU_MINIMUM) attend = "choix";
  else {
    const type = RECONNAISSANCE.filter((r) => r.motif.test(source)).map((r) => r.type);
    attend = type.length === 1 && RE_DEMANDE.test(source) ? type[0]
      : RE_DEMANDE.test(source) ? "texte" : "rien";
  }

  // Rien de demandé, mais la dernière ligne dit quoi taper : une page qui
  // se tourne, pas une fin.
  if (attend === "rien") {
    const fin = choixDeFin(reste);
    if (fin) return { texte: fin.avant.join("\n"), choix: [fin.choix], attend: "choix", issue: null };
  }

  // L'issue ne se lit que sur un message qui ne demande plus rien : « Code
  // incorrect, entrez votre code » est un refus SUIVI d'une question — la
  // session continue, ce n'est pas une fin.
  const issue = attend !== "rien" ? null
    : RE_REFUSEE.test(source) ? "refusee"
      : RE_REUSSIE.test(source) ? "reussie" : null;

  return { texte, choix: attend === "choix" ? choix : [], attend, issue };
}
