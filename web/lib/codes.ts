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

// Le code d'un GESTE du guichet : le code profond quand il est relevé, sinon
// la porte du menu de l'opérateur. Un geste sans code direct n'est pas un
// geste impossible : la session s'ouvre sur le menu, le propriétaire choisit
// l'option, et la plateforme répond seule aux questions qu'elle reconnaît
// (numéro, montant). Rien n'est deviné : chaque étape est celle du réseau.
export const codeGeste = (op: string, cle: string) =>
  codeUssd(op, cle) || codeUssd(op, "menu");
