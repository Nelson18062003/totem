// --- Codes USSD par opérateur ------------------------------------------------
// Le guichet n'a pas les mêmes codes d'un opérateur à l'autre, et rien ne se
// devine : ceux-ci ont été composés sur un vrai téléphone (totem/codes.py).
// Les réglages permettent de les corriger et d'en ajouter d'autres.
export type CodeUssd = { cle: string; libelle: string; code: string };

export const codesUssd: Record<string, CodeUssd[]> = {
  Orange: [
    { cle: "menu", libelle: "Menu", code: "#148#" },
    { cle: "depot", libelle: "Dépôt", code: "#148*2#" },
    { cle: "retrait", libelle: "Retrait", code: "#148*3#" },
    { cle: "transfert", libelle: "Transfert", code: "#148*4#" },
    { cle: "solde", libelle: "Solde", code: "#148*5#" },
    { cle: "mon_numero", libelle: "Mon numéro", code: "#148*7*6#" },
  ],
  // MTN : seule la porte d'entrée MoMo est relevée pour l'instant — les codes
  // profonds (dépôt direct, solde direct…) restent à composer sur le vrai
  // téléphone, puis à apprendre au robot (💾 sur Telegram) ou à saisir dans
  // les Réglages. On ne devine pas un chiffre qui déplace de l'argent.
  MTN: [
    { cle: "menu", libelle: "Menu MoMo", code: "*126#" },
  ],
};

export const codeUssd = (op: string, cle: string) =>
  (codesUssd[op] ?? []).find((c) => c.cle === cle)?.code ?? "";

// Les clés des boutons STANDARDS du guichet — les mêmes pour tout opérateur.
// C'est cette liste que les Réglages proposent de remplir, opérateur par
// opérateur : chaque bouton s'attribue son code, sans toucher au code source.
export const CLES_GUICHET = [
  "menu", "depot", "retrait", "transfert", "solde", "mon_numero",
] as const;

// Les ÉTAPES d'un geste du guichet, par ordre de confiance :
//   1. le bouton défini ou appris par le propriétaire (base « raccourcis »),
//      qui l'emporte toujours — c'est lui qui vient du terrain ;
//   2. le code du catalogue de départ (relevé sur un vrai téléphone) ;
//   3. la porte du menu de l'opérateur : la session s'ouvre sur le menu, le
//      propriétaire choisit l'option, la plateforme répond seule aux
//      questions qu'elle reconnaît (numéro, montant).
// Rien n'est deviné : chaque étape vient du propriétaire ou de l'opérateur.
export const etapesGeste = (
  op: string,
  cle: string,
  appris: { nom: string; etapes: string[] }[] = [],
): string[] => {
  const propre = appris.find((r) => r.nom === cle && r.etapes.length);
  if (propre) return propre.etapes;
  const direct = codeUssd(op, cle);
  if (direct) return [direct];
  const menuAppris = appris.find((r) => r.nom === "menu" && r.etapes.length);
  if (menuAppris) return menuAppris.etapes;
  const menu = codeUssd(op, "menu");
  return menu ? [menu] : [];
};

// --- Les variables d'un raccourci --------------------------------------------
//
// Un code peut porter des TROUS à remplir : « *126*1*{numero}*{montant}# ».
// Le guichet les remplit avec ce que le propriétaire vient de saisir, puis
// compose le code ENTIER d'un coup — le réseau ne pose plus qu'une question,
// celle du code secret.
//
// Deux façons de faire, au choix de qui écrit le raccourci :
//   · AVEC variables — le code part complet, direct, en une fois ;
//   · SANS variables — le code ouvre le menu, et la plateforme répond aux
//     questions une à une, comme avant.
// Le code lui-même dit laquelle : aucun réglage à côté.
export const VARIABLES = ["numero", "montant", "point"] as const;

const RE_VARIABLE = /\{([a-zA-Z_]+)\}/g;

/** Les variables citées par un parcours, dans l'ordre d'apparition. */
export function variablesDe(etapes: string[]): string[] {
  const vues: string[] = [];
  for (const e of etapes) {
    for (const m of e.matchAll(RE_VARIABLE)) {
      if (!vues.includes(m[1])) vues.push(m[1]);
    }
  }
  return vues;
}

/** Ce parcours part-il complet, d'un seul coup ? */
export const aDesVariables = (etapes: string[]) => variablesDe(etapes).length > 0;

/** Une variable inconnue rend le raccourci inutilisable : autant le dire. */
export const variablesInconnues = (etapes: string[]) =>
  variablesDe(etapes).filter(
    (v) => !(VARIABLES as readonly string[]).includes(v));

// Le champ qui répond à une variable. « {numero} » et « {point} » désignent
// tous deux un numéro de téléphone : selon le geste, le formulaire l'appelle
// l'un ou l'autre — on accepte les deux plutôt que d'exiger le bon mot.
function sourcePour(nom: string, valeurs: Record<string, string>) {
  const candidats = nom === "numero" ? ["numero", "point"]
    : nom === "point" ? ["point", "numero"]
    : [nom];
  for (const cle of candidats) {
    const v = valeurs[cle];
    if (v != null && String(v).trim()) return { cle, valeur: String(v) };
  }
  return null;
}

/**
 * Remplit les trous d'un parcours. Renvoie le parcours prêt à composer et
 * les champs CONSOMMÉS — ceux-là ne doivent plus être resaisis quand le
 * réseau posera ses questions, puisqu'ils voyagent déjà dans le code.
 *
 * Un trou sans valeur reste tel quel : on ne compose jamais un code amputé
 * en silence — l'appelant le voit et s'arrête.
 */
export function remplirVariables(
  etapes: string[],
  valeurs: Record<string, string>,
): { etapes: string[]; consommees: string[]; manquantes: string[] } {
  const consommees: string[] = [];
  const manquantes: string[] = [];
  const remplies = etapes.map((e) =>
    e.replace(RE_VARIABLE, (tout, nom: string) => {
      const source = sourcePour(nom, valeurs);
      // Seuls les chiffres entrent dans un code : un espace ou un « + »
      // couperait la chaîne AT côté modem.
      const chiffres = source ? source.valeur.replace(/\D/g, "") : "";
      // Une valeur qui ne laisse AUCUN chiffre (« abc », « + », « — ») est un
      // TROU, pas une réponse. La marquer consommée composait un code amputé
      // — « *126*1**# », le montant absent — en silence, ce que le docstring
      // promet justement de ne jamais faire. On la déclare manquante :
      // l'appelant s'arrête et dit lequel manque.
      if (!chiffres) {
        if (!manquantes.includes(nom)) manquantes.push(nom);
        return tout;
      }
      if (source && !consommees.includes(source.cle)) consommees.push(source.cle);
      return chiffres;
    }));
  return { etapes: remplies, consommees, manquantes };
}

// ---------------------------------------------------------------------------
// Les blocs : un code qui se construit à la main, morceau par morceau
// ---------------------------------------------------------------------------

/**
 * Ce que chaque trou ATTEND. Un trou n'est pas un mot posé au hasard dans un
 * code : c'est une case qui réclame une nature précise — un numéro de
 * téléphone, une somme. L'écran s'en sert pour dire au propriétaire ce qu'il
 * pose, et pour lui montrer à quoi ça ressemblera une fois rempli.
 */
export const NATURES_VARIABLE = {
  numero: "telephone",
  point: "telephone",
  montant: "montant",
} as const;

/** Un aperçu plausible, pour montrer le code tel que le réseau le recevra. */
export const EXEMPLES_VARIABLE: Record<string, string> = {
  numero: "677123456",
  point: "690000001",
  montant: "50000",
};

export type Bloc =
  | { sorte: "texte"; valeur: string }
  | { sorte: "trou"; nom: string };

/**
 * Découpe un code en blocs — « *126*1*{numero}# » devient trois morceaux :
 * les chiffres, le trou, les chiffres. C'est cette liste que l'écran affiche
 * et que l'on réordonne ; le code reste la seule vérité, on la recompose à
 * chaque fois.
 */
export function decouperEnBlocs(code: string): Bloc[] {
  const blocs: Bloc[] = [];
  let reste = code;
  const motif = /\{([A-Za-z_]+)\}/;
  for (let m = reste.match(motif); m; m = reste.match(motif)) {
    const avant = reste.slice(0, m.index);
    if (avant) blocs.push({ sorte: "texte", valeur: avant });
    blocs.push({ sorte: "trou", nom: m[1] });
    reste = reste.slice((m.index ?? 0) + m[0].length);
  }
  if (reste) blocs.push({ sorte: "texte", valeur: reste });
  return blocs;
}

/** Le chemin inverse : des blocs au code. */
export const recomposer = (blocs: Bloc[]) =>
  blocs.map((b) => (b.sorte === "texte" ? b.valeur : `{${b.nom}}`)).join("");

export type VerdictCode =
  | { ok: true }
  | { ok: false; motif: "vide" | "malformee" | "inconnue" | "code" | "etape";
      detail?: string };

/**
 * Le même jugement que le robot, rendu ici tout de suite.
 *
 * Le robot reste l'autorité — il revérifie tout à la réception. Mais lui
 * répondre « non » après un aller-retour au terminal est une mauvaise façon
 * d'apprendre : autant dire ce qui cloche pendant qu'on écrit.
 */
export function verdictCode(etapes: string[]): VerdictCode {
  if (!etapes.length) return { ok: false, motif: "vide" };
  for (const e of etapes) {
    // Une lettre ou une accolade qui SURVIT au bouchage des trous, c'est un
    // trou mal écrit : « {montan » sans fermeture, « numero} » sans ouverture.
    if (/[A-Za-z_{}]/.test(e.replace(/\{[A-Za-z_]+\}/g, "0"))) {
      return { ok: false, motif: "malformee" };
    }
  }
  const inconnues = variablesInconnues(etapes);
  if (inconnues.length) {
    return { ok: false, motif: "inconnue", detail: `{${inconnues[0]}}` };
  }
  // Le code se juge une fois ses trous bouchés : « *126*1*{numero}# » a bien
  // la forme d'un code, et c'est cette forme-là qui compte.
  if (!/^[*#][\d*#]{0,60}#$/.test(etapes[0].replace(/\{[A-Za-z_]+\}/g, "0"))) {
    return { ok: false, motif: "code" };
  }
  for (const e of etapes.slice(1)) {
    if (/^\{[A-Za-z_]+\}$/.test(e)) continue;      // un trou à lui seul
    if (!/^\d{1,2}$/.test(e)) return { ok: false, motif: "etape", detail: e };
  }
  return { ok: true };
}

/** Le code tel que le réseau le recevra, avec des valeurs d'exemple. */
export const apercuRempli = (etapes: string[]) =>
  remplirVariables(etapes, EXEMPLES_VARIABLE).etapes;
