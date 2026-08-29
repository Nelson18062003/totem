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
