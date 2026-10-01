// Les lettres que la plateforme envoie : le code d'entrée, et l'invitation.
//
// Écrites court, et pour quelqu'un qui n'est pas informaticien. Le code est
// dans le SUJET aussi : sur un téléphone, on le lit dans la notification sans
// ouvrir la lettre.
//
// Elles disent toujours ce qu'il faut faire si l'on n'a rien demandé — rien —
// et ne contiennent jamais de lien vers lequel « cliquer pour entrer » : un
// lien dans une lettre est ce que copie la première imitation venue.

const en = {
  codeSujet: (code: string) => `${code} — your TOTEM sign-in code`,
  codeTexte: (code: string) =>
    `Your TOTEM sign-in code is:\n\n    ${code}\n\n` +
    "Type it on the sign-in screen. It works once, for 10 minutes.\n\n" +
    "If you did not ask for it, do nothing: without the code, nobody can " +
    "get in. Never give this code to anyone — TOTEM will never ask you for " +
    "it by phone or by message.",
  invitationSujet: "You now have access to TOTEM",
  invitationTexte: (adresse: string) =>
    "The owner of a TOTEM has just given you access.\n\n" +
    `Open ${adresse} (or the TOTEM app), type this email address, and you ` +
    "will receive a code to get in. There is no password to remember.\n\n" +
    "If you were not expecting this, you can ignore this message.",
};

const fr: typeof en = {
  codeSujet: (code: string) => `${code} — votre code d’entrée TOTEM`,
  codeTexte: (code: string) =>
    `Votre code d’entrée TOTEM est :\n\n    ${code}\n\n` +
    "Tapez-le sur l’écran de connexion. Il sert une fois, pendant 10 minutes.\n\n" +
    "Si vous ne l’avez pas demandé, ne faites rien : sans le code, personne " +
    "n’entre. Ne donnez jamais ce code à personne — TOTEM ne vous le " +
    "demandera jamais par téléphone ni par message.",
  invitationSujet: "Vous avez maintenant accès à TOTEM",
  invitationTexte: (adresse: string) =>
    "Le propriétaire d’un TOTEM vient de vous ouvrir l’accès.\n\n" +
    `Ouvrez ${adresse} (ou l’application TOTEM), tapez cette adresse de ` +
    "courriel, et vous recevrez un code pour entrer. Il n’y a aucun mot de " +
    "passe à retenir.\n\n" +
    "Si vous ne vous y attendiez pas, vous pouvez ignorer ce message.",
};

export const textesCourrier = { en, fr } as const;
