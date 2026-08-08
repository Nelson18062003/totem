// Les textes du verrouillage du téléphone.
//
// Aucun de ces mots n'est technique. Ni « clé d'accès », ni « authentifieur »,
// ni « WebAuthn » : le propriétaire n'est pas informaticien, et ce qu'il fait
// vraiment c'est poser son doigt sur son téléphone. On nomme ça.
//
// La règle qui a écrit ces phrases : dire ce qui se passe, pas ce qu'on
// utilise. « Ce téléphone vous reconnaîtra » plutôt que « clé enregistrée ».

const en = {
  poser: "Set up my phone",
  poserAide:
    "Next time, your fingerprint gets you in. Nothing to remember, nothing to type.",
  poserEnCours: "Waiting for your phone…",
  poserFait: "Done. This phone will recognise you from now on.",
  // Le cas qui change tout le jour de la perte : la clé vit aussi dans le
  // compte du fabricant, donc un téléphone neuf la retrouvera.
  poserFaitSauvegardee:
    "Done. This phone will recognise you from now on — and since it saves "
    + "this to your account, a new phone will find it again.",
  poserRate: "Your phone did not confirm. You can try again, or skip for now.",
  poserImpossible:
    "This browser cannot use your phone's lock. You will keep signing in by email.",
  plusTard: "Not now",

  // La liste, dans les réglages.
  titreListe: "Phones that recognise you",
  aucune: "No phone recognises you yet. You sign in by email.",
  jamaisServie: "never used",
  sauvegardeeOui: "saved to your account",
  sauvegardeeNon: "only on this device",
  retirer: "This phone is no longer mine",
  retirerEtFermer: "Remove it and close everything",
  // Dit sous le bouton, parce que c'est la question qu'on se pose en le
  // regardant.
  retirerAide:
    "You can still get in by email afterwards. Removing the last one locks "
    + "nobody out.",
  volee:
    "If the phone was stolen, close everything as well: otherwise it stays "
    + "open until tonight.",
};

const fr: typeof en = {
  poser: "Configurer mon téléphone",
  poserAide:
    "La prochaine fois, votre empreinte vous fait entrer. Rien à retenir, rien à taper.",
  poserEnCours: "En attente de votre téléphone…",
  poserFait: "C'est fait. Ce téléphone vous reconnaîtra désormais.",
  poserFaitSauvegardee:
    "C'est fait. Ce téléphone vous reconnaîtra désormais — et comme il "
    + "enregistre cela dans votre compte, un téléphone neuf le retrouvera.",
  poserRate: "Votre téléphone n'a pas confirmé. Vous pouvez réessayer, ou remettre à plus tard.",
  poserImpossible:
    "Ce navigateur ne sait pas se servir du verrouillage du téléphone. "
    + "Vous continuerez à entrer par mail.",
  plusTard: "Pas maintenant",

  titreListe: "Les téléphones qui vous reconnaissent",
  aucune: "Aucun téléphone ne vous reconnaît encore. Vous entrez par mail.",
  jamaisServie: "jamais servi",
  sauvegardeeOui: "enregistré dans votre compte",
  sauvegardeeNon: "seulement sur cet appareil",
  retirer: "Ce téléphone n'est plus à moi",
  retirerEtFermer: "Le retirer et tout fermer",
  retirerAide:
    "Vous pourrez toujours entrer par mail ensuite. Retirer le dernier "
    + "n'enferme personne dehors.",
  volee:
    "Si le téléphone a été volé, fermez tout aussi : sinon il reste ouvert "
    + "jusqu'à ce soir.",
};

export const textesCles = { en, fr } as const;
