// Les textes du papier de dix codes.
//
// Un mot est interdit ici : « secours ». Il dit à la personne qu'elle est en
// difficulté au moment où elle ne l'est pas encore, et il fait remettre la
// chose à plus tard. On dit ce que c'est : un papier, dans un tiroir, qui
// ouvre la porte le jour où le téléphone et la boîte mail sont hors de portée
// en même temps.
//
// La phrase la plus importante de l'écran n'est pas une consigne, c'est un
// aveu : « nous ne pouvons pas vous les remontrer ». Elle est vraie — la base
// ne garde que des empreintes — et c'est ce qui fait qu'on la croit.

const en = {
  titre: "Ten codes, on paper",
  // Une phrase, et elle dit QUAND ça sert. « In case of emergency » ne dit
  // rien à personne ; « the day your phone and your mailbox are both out of
  // reach » se reconnaît.
  aQuoiCaSert:
    "The day your phone and your mailbox are both out of reach — a stolen "
    + "phone with your mail open inside it — these ten codes are what gets you "
    + "back to your shop. Each one works once.",

  // Avant la fabrication.
  fabriquer: "Make my ten codes",
  fabriquerAide: "They appear once, on this screen, and never again.",
  fabriquerEnCours: "Making them…",
  fabriquerRate:
    "The codes could not be made. Nothing changed — your old paper, if you "
    + "have one, still works. Try again.",

  // La feuille elle-même.
  feuilleTitre: "TOTEM — ten codes to get back in",
  feuilleDit: "Each code works once. Cross it out when you use it.",
  entete: (nom: string, date: string) => `${nom} · made ${date}`,
  serie: (n: number) => `Paper no. ${n}`,

  // Les gestes. Pas d'envoi par mail : voir le commentaire dans feuille.tsx.
  copier: "Copy",
  copie: "Copied",
  telecharger: "Save",
  imprimer: "Print",
  gestesAide:
    "No printer? Save the file or copy the codes, then write them out by hand "
    + "and delete the file.",

  ouLeMettreTitre: "Not in your phone, and not in the shop",
  ouLeMettre:
    "In the phone, it dies with the phone. In the shop, it burns or floods "
    + "with the terminal — a copy kept next to the original is not a spare. "
    + "Take it home.",
  quandCaBaisseTitre: "We tell you when the paper is running low",
  quandCaBaisse:
    "You will see how many are left every time you come back here. Make ten "
    + "new ones before the last one is gone.",
  siPerduTitre: "If you lose the paper too",
  siPerdu:
    "The owner of your shop can let you back in. You will never be locked out "
    + "with nobody to call.",

  promesse: "I have put this paper somewhere safe",
  promesseFort: "we cannot show these codes again, not even if you ask",
  continuer: "Take me to the shop",

  // Au retour, plus tard : on compte, on ne remontre rien.
  dejaTitre: "Your paper is made",
  deja: (restants: number, total: number) =>
    `${restants} of ${total} codes are still good.`,
  dejaFabriqueLe: (date: string) => `Made ${date}`,
  dejaJamaisRemontre:
    "We cannot show them again — we only keep a fingerprint of each one, never "
    + "the code itself. If the paper is lost, make ten new ones.",
  presqueFini:
    "Only one code left. Make ten new ones now, while you still have a way in.",
  refaire: "Make ten new ones",
  refaireAide:
    "The codes on your old paper stop working the moment the new ones appear. "
    + "Tear the old sheet up.",

  // Le nom du fichier téléchargé, et l'en-tête qu'il porte.
  fichier: "totem-ten-codes.txt",
};

const fr: typeof en = {
  titre: "Dix codes, sur papier",
  aQuoiCaSert:
    "Le jour où votre téléphone et votre boîte mail sont hors de portée en "
    + "même temps — un téléphone volé avec votre messagerie ouverte dedans — "
    + "ces dix codes sont ce qui vous ramène dans votre boutique. Chacun sert "
    + "une fois.",

  fabriquer: "Fabriquer mes dix codes",
  fabriquerAide: "Ils s'affichent une fois, sur cet écran, et plus jamais.",
  fabriquerEnCours: "Fabrication…",
  fabriquerRate:
    "Les codes n'ont pas pu être fabriqués. Rien n'a changé — votre ancien "
    + "papier, si vous en avez un, marche toujours. Réessayez.",

  feuilleTitre: "TOTEM — dix codes pour rentrer",
  feuilleDit: "Chaque code sert une fois. Barrez-le quand vous vous en servez.",
  entete: (nom: string, date: string) => `${nom} · fabriqué le ${date}`,
  serie: (n: number) => `Papier n° ${n}`,

  copier: "Copier",
  copie: "Copié",
  telecharger: "Enregistrer",
  imprimer: "Imprimer",
  gestesAide:
    "Pas d'imprimante ? Enregistrez le fichier ou copiez les codes, recopiez-"
    + "les à la main, puis effacez le fichier.",

  ouLeMettreTitre: "Pas dans le téléphone, et pas dans la boutique",
  ouLeMettre:
    "Dans le téléphone, il meurt avec le téléphone. Dans la boutique, il brûle "
    + "ou s'inonde avec le terminal — une copie gardée à côté de l'original "
    + "n'est pas un double. Emportez-le chez vous.",
  quandCaBaisseTitre: "On vous dit quand le papier s'épuise",
  quandCaBaisse:
    "Vous verrez combien il en reste à chaque fois que vous revenez ici. "
    + "Fabriquez-en dix nouveaux avant que le dernier ne parte.",
  siPerduTitre: "Si vous perdez le papier aussi",
  siPerdu:
    "La propriétaire de votre commerce peut vous laisser rentrer. Vous ne "
    + "serez jamais enfermé dehors sans personne à appeler.",

  promesse: "J'ai rangé ce papier en lieu sûr",
  promesseFort: "nous ne pourrons pas vous remontrer ces codes, même si vous le demandez",
  continuer: "Aller à la boutique",

  dejaTitre: "Votre papier est fait",
  deja: (restants: number, total: number) =>
    `${restants} codes sur ${total} sont encore bons.`,
  dejaFabriqueLe: (date: string) => `Fabriqué le ${date}`,
  dejaJamaisRemontre:
    "Nous ne pouvons pas les remontrer — nous n'en gardons qu'une empreinte, "
    + "jamais le code. Si le papier est perdu, fabriquez-en dix nouveaux.",
  presqueFini:
    "Il ne reste qu'un code. Fabriquez-en dix nouveaux maintenant, pendant "
    + "que vous avez encore un chemin.",
  refaire: "Fabriquer dix nouveaux codes",
  refaireAide:
    "Les codes de l'ancien papier cessent de marcher à l'instant où les "
    + "nouveaux apparaissent. Déchirez l'ancienne feuille.",

  fichier: "totem-dix-codes.txt",
};

export const textesPapier = { en, fr } as const;
