// Les textes de « comment voulez-vous entrer, désormais ? ».
//
// L'écran arrive juste après les six chiffres : le compte vient de naître, la
// personne est dedans, et elle n'a rien demandé. Tout ce qui est proposé ici
// doit donc pouvoir être REFUSÉ sans que rien ne se ferme — le mail continue
// de marcher, aujourd'hui et pour toujours.
//
// Deux mots sont interdits : « sécuriser » (il fait peur pour vendre) et
// « recommandé » (il transforme un choix en note scolaire). On dit ce que
// chaque chemin fait, et le jour où il sert.

const en = {
  titre: "How will you get in, from now on?",
  sousTitre:
    "Your account exists and you are inside. Nothing below is required — the "
    + "code by email keeps working, today and always.",

  // La question du comptoir. Elle est posée AVANT quoi que ce soit, et la
  // réponse RETIRE une voie au lieu d'ajouter un avertissement.
  questionTitre: "First — whose phone is this?",
  aMoi: "Mine",
  aMoiDit: "It stays with me, and nobody else opens it",
  boutique: "The shop's",
  boutiqueDit: "It lives on the counter, several of us use it",

  // Le refus qui compte, dit sans que ça sonne comme une punition.
  comptoirTitre: "Then we will not set up this phone",
  comptoirDit:
    "A phone's lock proves the phone, not the person. On a handset that stays "
    + "on the counter, it would belong to whoever picks it up — and the shop's "
    + "journal would carry your name for what someone else did. You keep "
    + "getting in by email, which is exactly right here.",
  comptoirSession:
    "On a shared handset your session also closes at the end of the day, "
    + "rather than tomorrow afternoon.",

  // Le verrouillage du téléphone. Les mots du bouton lui-même vivent dans
  // « textes/cles.ts » — c'est le même bouton partout, il parle d'une voix.
  telephoneTitre: "Your phone's own lock",
  telephoneDit:
    "Your fingerprint, your face, or the pattern you already use. Nothing "
    + "leaves the phone, and a fake TOTEM cannot use it — your phone refuses "
    + "to answer anyone but us.",

  // « Pas maintenant » est un vrai chemin, pas un renoncement.
  plusTard: "Not now — I'll keep using email",
  plusTardDit:
    "Nothing is lost, and nobody will ask you again on every screen. A code "
    + "reaches your mailbox whenever you need one, and you can set this phone "
    + "up any day from your settings.",

  // Le papier, l'étape suivante.
  papierTitre: "Ten codes, on paper",
  papierDit:
    "The one path that needs no phone, no network and no electricity. It is "
    + "what gets you back in the day your phone and your mailbox are out of "
    + "reach at the same time.",
  papierGeste: "Make my ten codes",

  application: "Take me to the shop",

  jamaisPinTitre: "None of this is your Mobile Money PIN",
  jamaisPin:
    "Your PIN stays on the SIM, typed at the counter, at the moment of an "
    + "operation. It never gets you into TOTEM, and TOTEM never asks for it.",
};

const fr: typeof en = {
  titre: "Comment voulez-vous entrer, désormais ?",
  sousTitre:
    "Votre compte existe et vous êtes dedans. Rien de ce qui suit n'est "
    + "obligatoire — le code par mail continue de marcher, aujourd'hui et "
    + "toujours.",

  questionTitre: "D'abord — ce téléphone, il est à qui ?",
  aMoi: "À moi",
  aMoiDit: "Il reste avec moi, et personne d'autre ne l'ouvre",
  boutique: "À la boutique",
  boutiqueDit: "Il vit sur le comptoir, plusieurs s'en servent",

  comptoirTitre: "Alors on ne configure pas ce téléphone",
  comptoirDit:
    "Le verrouillage d'un téléphone prouve le téléphone, pas la personne. Sur "
    + "un combiné qui reste sur le comptoir, il appartiendrait à qui le "
    + "ramasse — et le journal de la boutique porterait votre nom pour ce "
    + "qu'un autre a fait. Vous entrez par mail, et c'est exactement ce qu'il "
    + "faut ici.",
  comptoirSession:
    "Sur un combiné partagé, votre session se ferme aussi en fin de journée, "
    + "plutôt que demain après-midi.",

  telephoneTitre: "Le verrouillage de votre téléphone",
  telephoneDit:
    "Votre empreinte, votre visage, ou le schéma dont vous vous servez déjà. "
    + "Rien ne quitte le téléphone, et un faux TOTEM ne peut pas s'en servir — "
    + "votre téléphone refuse de répondre à quelqu'un d'autre que nous.",

  plusTard: "Pas maintenant — je continue par mail",
  plusTardDit:
    "Rien n'est perdu, et on ne vous le redemandera pas à chaque écran. Un "
    + "code arrive dans votre boîte quand vous en avez besoin, et vous pourrez "
    + "configurer ce téléphone n'importe quel jour depuis vos réglages.",

  papierTitre: "Dix codes, sur papier",
  papierDit:
    "Le seul chemin qui ne demande ni téléphone, ni réseau, ni électricité. "
    + "C'est lui qui vous ramène le jour où votre téléphone et votre boîte "
    + "mail sont hors de portée en même temps.",
  papierGeste: "Fabriquer mes dix codes",

  application: "Aller à la boutique",

  jamaisPinTitre: "Rien de tout cela n'est votre code PIN Mobile Money",
  jamaisPin:
    "Votre PIN reste sur la puce, tapé au comptoir, au moment d'une "
    + "opération. Il ne fait entrer dans TOTEM en aucun cas, et TOTEM ne le "
    + "demande jamais.",
};

export const textesFacon = { en, fr } as const;
