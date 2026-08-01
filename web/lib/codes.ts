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
  // Aucun code MTN relevé sur le terrain pour l'instant — on ne devine pas.
  MTN: [],
};

export const codeUssd = (op: string, cle: string) =>
  (codesUssd[op] ?? []).find((c) => c.cle === cle)?.code ?? "";
