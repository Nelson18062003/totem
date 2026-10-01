// Ce que l'écran dit après « Envoyer un essai » — une seule règle pour le
// navigateur et le téléphone.
//
// POURQUOI ELLE VIT ICI. L'écran disait « Remis. Votre téléphone a sonné »
// dès qu'UN téléphone avait sonné. Avec un Android qui sonne et un iPhone
// muet, le propriétaire lisait « Remis », et la cause de l'iPhone — connue,
// écrite, en français — ne s'affichait jamais. Il cherchait ailleurs.
//
// La règle tient en une phrase : UN SEUL TÉLÉPHONE QUI N'A PAS SONNÉ SUFFIT
// À NE PAS DIRE « REMIS ». On nomme alors chaque téléphone, et ce qui lui
// est arrivé.

/** Ce que la plateforme rend pour un téléphone (jamais son jeton). */
export type VerdictAppareil = {
  nom: string;
  plateforme: string;
  etat: "remis" | "enRoute" | "refuse" | "oublie";
  cause?: string;
};

export type ReponseEssai = {
  servis: number;
  enRoute?: number;
  oublies: number;
  aucun?: boolean;
  soucis?: string[];
  /** Absent d'une plateforme d'avant cette règle : on retombe sur le total. */
  appareils?: VerdictAppareil[];
};

/** Les mots dont la règle a besoin — ceux de `textesReglages`. */
export type MotsEssai = {
  essaiAucunAppareil: string;
  essaiRemis: string;
  essaiEnRoute: string;
  essaiEchec: string;
  essaiOublies: string;
  essaiPasTous: string;
  essaiAppareil: (nom: string, plateforme: string) => string;
  essaiAppareilRemis: string;
  essaiAppareilEnRoute: string;
  essaiAppareilRefuse: string;
};

/** La phrase à afficher, et si c'est une mauvaise nouvelle. */
export function messageDEssai(t: MotsEssai, r: ReponseEssai): { rate: boolean; texte: string } {
  if (r.aucun) return { rate: true, texte: t.essaiAucunAppareil };
  const oublies = r.oublies ? ` (${r.oublies} ${t.essaiOublies})` : "";

  const muets = (r.appareils ?? []).filter((a) => a.etat === "refuse");
  if (muets.length && (r.servis > 0 || r.enRoute)) {
    // Certains ont sonné, d'autres non : la seule nouvelle qui compte est
    // celle des seconds. Chaque téléphone est nommé, avec son verdict.
    const lignes = (r.appareils ?? [])
      .filter((a) => a.etat !== "oublie")
      .map((a) => {
        const nom = t.essaiAppareil(a.nom, a.plateforme);
        if (a.etat === "remis") return `${nom} : ${t.essaiAppareilRemis}`;
        if (a.etat === "enRoute") return `${nom} : ${t.essaiAppareilEnRoute}`;
        return `${nom} : ${t.essaiAppareilRefuse}${a.cause ? ` — ${a.cause}` : ""}`;
      });
    return { rate: true, texte: [t.essaiPasTous, ...lignes].join("\n") + oublies };
  }

  if (r.servis > 0 || r.enRoute) {
    // REMIS, OU SEULEMENT PARTI : ce n'est pas la même nouvelle. Le service
    // confirme la remise dans un second temps ; tant qu'il ne l'a pas fait,
    // on ne promet rien.
    return { rate: false, texte: (r.servis > 0 ? t.essaiRemis : t.essaiEnRoute) + oublies };
  }
  return {
    rate: true,
    texte: t.essaiEchec + (r.soucis?.length ? ` — ${r.soucis.join(" · ")}` : ""),
  };
}
