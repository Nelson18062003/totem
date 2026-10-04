// LA FICHE APP STORE — ce qu'Apple affiche, et ce que son examinateur lit.
//
// Envoyée chez Apple par le bouton « Fiche App Store » de GitHub
// (`.github/workflows/fiche-app-store.yml`), avec la clé d'Apple rangée dans
// les secrets du dépôt. Rien ne se tape à la main dans App Store Connect,
// sauf ce qu'Apple réserve au titulaire du compte (voir docs/APP-STORE.md).
//
// LE CONTACT D'APPLE — qui Apple appelle si son examinateur a une question —
// est écrit ici, à la demande du propriétaire : les variables de GitHub ne
// se posent pas par programme. Une variable APPLE_CONTACT_* posée dans
// GitHub, si elle existe un jour, passe devant.
//
// LE COMPTE D'EXAMEN, LUI, EST ÉCRIT EN CLAIR — à dessein. C'est la vitrine
// de démonstration de la plateforme (web/lib/demonstration.ts) : elle ne
// montre que des données inventées, ne touche à aucune vraie carte, et ses
// opérations sont jouées pour de faux. `verifier-la-demonstration` exige que
// ces identifiants soient bien ceux que la plateforme accepte.
//
// LES TEXTES suivent les deux règles de la fiche Google Play
// (docs/PLAY-STORE.md) : on ne dit pas « suivre l'argent » — TOTEM n'en
// détient et n'en fait transiter aucun —, et on ne nomme aucun pays.
//
// Les captures sont dans `store/apple/screenshot/` : elles se refabriquent
// avec `scripts/captures-boutique.mjs … iphone fr|en`, sur le faux nuage,
// jamais sur de vraies données.

const env = (nom) => (process.env[nom] || "").trim();

// Le contact du propriétaire.
const CONTACT = {
  prenom: "Nelson",
  nom: "Soh",
  courriel: "nelsonsoh2003@gmail.com",
  telephone: "+33745645891",
};

// La vitrine de démonstration — les MÊMES que dans web/lib/demonstration.ts.
const EXAMEN_COURRIEL = "examen@totemlabs.app";
const EXAMEN_MOTDEPASSE = "TOTEM-Examen-2026";

// Les captures d'une langue, dans l'ordre où Apple les montre.
// L'iPad aussi : l'application s'y installe (« supportsTablet »), et Apple
// refuse la soumission sans la série du 13 pouces (2048 × 2732).
const SERIE = ["1-caisses", "2-encaissements", "3-actions", "4-cartes"];
const captures = (langue) => Object.fromEntries(
  ["APP_IPHONE_67", "APP_IPAD_PRO_3GEN_129"].map((format) => [format,
    SERIE.map((nom) => `store/apple/screenshot/${langue}/${format}/${nom}.png`)]),
);

// LE NOM SUR L'APP STORE — le seul qu'Apple veut UNIQUE au monde. « TOTEM »
// tout court est déjà pris par une autre application, sur un autre compte :
// l'envoi de la fiche a été refusé pour cela. C'est le nom sous lequel la
// fiche a été créée dans App Store Connect, donc un nom déjà à nous. Le nom
// sous l'icône du téléphone, lui, reste « TOTEM » (app.json).
const NOM_SUR_LE_MAGASIN = "TOTEM by Bonzinilabs";

const CONFIDENTIALITE = "https://totemlabs.app/confidentialite";

// LES DESCRIPTIONS — pour TOUT LE MONDE. TOTEM est une application grand
// public (décision du propriétaire) : n'importe qui la télécharge, crée son
// compte, et atteint ses comptes Mobile Money d'où qu'il soit. Une première
// version parlait de « boutique », de « vendeurs », d'« agents » : elle
// décrivait UNE entreprise, et la règle 3.2 d'Apple renvoie une application
// d'entreprise vers d'autres distributions. Chaque ligne ci-dessous est une
// chose que l'application fait vraiment, aujourd'hui.

const descriptionFr = `Vos comptes Mobile Money, d'où que vous soyez.

Votre compte Mobile Money vit sur une carte SIM. Loin de chez vous, à l'étranger, sans réseau, ou simplement sans cette SIM dans votre téléphone, vous ne l'atteignez plus. TOTEM vous le rend.

COMMENT ÇA MARCHE

Votre carte SIM est placée dans un boîtier TOTEM, relié à Internet. L'application est l'écran de ce boîtier : vous y voyez vos cartes, et vous y faites ce que vous feriez sur le téléphone qui les porte, depuis n'importe où.

COMMENCER

• Créez votre compte dans l'application. Il s'ouvre tout de suite.
• Ajoutez votre carte : envoyez votre puce à TOTEM, qui la place dans un boîtier, ou branchez votre propre boîtier TOTEM chez vous. Pas encore de compte Mobile Money ? TOTEM peut vous aider à en ouvrir un chez l'opérateur.
• TOTEM rattache la carte à votre compte, et elle apparaît dans l'application. Vous ne voyez que vos cartes ; seule l'équipe TOTEM, qui fait fonctionner les boîtiers, y a accès.

CE QUE VOUS POUVEZ FAIRE

• Voir chaque carte d'un coup d'œil : son nom, son numéro, son solde.
• Faire un dépôt, un retrait, un transfert, une question par écran — numéro, montant — et lire le message de l'opérateur en entier avant de taper votre code.
• Lire chaque SMS de l'opérateur en entier, tel que la carte l'a reçu, et les retrouver par date.
• Garder un reçu PDF de chaque opération, fabriqué par le boîtier, prêt à partager.
• Être prévenu dès qu'un message arrive sur une carte.

FAIT POUR UN RÉSEAU QUI TOMBE

Sans réseau, l'application montre les chiffres de votre dernier passage, et dit qu'ils datent. Quand un message d'opérateur ne peut pas être lu avec certitude, TOTEM le dit plutôt que de deviner.

Votre code secret Mobile Money ne sert qu'au moment de l'opération : il n'est jamais affiché, jamais gardé.

Vous pouvez supprimer votre compte à tout moment, dans l'application : Réglages, puis Supprimer mon compte.

CE QUE TOTEM N'EST PAS

Ni une banque, ni un portefeuille, ni un service de paiement. TOTEM ne détient aucun argent et aucun argent n'y transite : vos opérations passent par le menu de votre opérateur, sur votre propre compte, comme sur votre téléphone.

En français et en anglais.`;

const descriptionEn = `Your Mobile Money accounts, wherever you are.

Your Mobile Money account lives on a SIM card. Far from home, abroad, out of coverage, or simply without that SIM in your phone, you can no longer reach it. TOTEM gives it back to you.

HOW IT WORKS

Your SIM card sits in a TOTEM box connected to the Internet. The app is the screen of that box: you see your cards there, and you do what you would do on the phone that holds them, from anywhere.

GETTING STARTED

• Create your account in the app. It opens right away.
• Add your card: send your SIM card to TOTEM, which places it in a box, or plug in your own TOTEM box at home. No Mobile Money account yet? TOTEM can help you open one with the operator.
• TOTEM links the card to your account, and it appears in the app. You see only your cards; only the TOTEM team, which runs the boxes, has access to them.

WHAT YOU CAN DO

• See every card at a glance: its name, its number, its balance.
• Make a deposit, a withdrawal or a transfer, one question per screen — number, amount — and read the operator's full message before you type your code.
• Read every operator SMS in full, exactly as the card received it, and find them by date.
• Keep a PDF receipt for each operation, made by the box, ready to share.
• Get notified as soon as a message reaches a card.

BUILT FOR A NETWORK THAT DROPS

Offline, the app shows the figures from your last visit and says how old they are. When an operator message cannot be read with certainty, TOTEM says so rather than guessing.

Your Mobile Money PIN is used only at the moment of an operation: it is never shown, never kept.

You can delete your account at any time, in the app: Settings, then Delete my account.

WHAT TOTEM IS NOT

It is not a bank, a wallet or a payment service. TOTEM holds no money and no money passes through it: your operations go through your operator's own menu, on your own account, just as on your phone.

English and French.`;

// La note pour l'examinateur. Apple l'a demandée EN ENTIER à la première
// soumission (« Guideline 2.1 — Information Needed ») : un compte neuf doit
// tout dire — à quoi sert l'application, pour qui, comment y entrer, quels
// services elle appelle. Le texte vit dans docs/APPLE-REPONSE-2.1.md, le
// même qu'on envoie en réponse à Apple : écrit deux fois, il divergerait.
const notesExamen = (() => {
  const doc = require("fs").readFileSync(
    require("path").join(__dirname, "../docs/APPLE-REPONSE-2.1.md"), "utf8");
  const bloc = /```\n([\s\S]*?)```/.exec(doc);
  if (!bloc) throw new Error("docs/APPLE-REPONSE-2.1.md : le texte pour Apple est introuvable.");
  return bloc[1].trim();
})();

module.exports = {
  configVersion: 0,
  apple: {
    ...(env("APPLE_COPYRIGHT") ? { copyright: env("APPLE_COPYRIGHT") } : {}),
    // UTILITAIRES D'ABORD. Le propriétaire : « on n'est pas une application
    // financière », et TOTEM est l'écran d'un boîtier qui porte des cartes
    // SIM. « BUSINESS » disait « outil d'entreprise » — le contraire d'une
    // application grand public, et le motif 3.2 du premier arrêt : retiré.
    // « FINANCE » reste en SECONDE place, parce que c'est vrai : on y voit
    // des soldes et l'on y lance les opérations de l'opérateur. Le cacher
    // serait déclarer faux. Choix à confirmer par le propriétaire.
    categories: ["UTILITIES", "FINANCE"],
    info: {
      "fr-FR": {
        title: NOM_SUR_LE_MAGASIN,
        subtitle: "Votre Mobile Money, partout",
        description: descriptionFr,
        keywords: ["mobile money", "MoMo", "Orange Money", "MTN", "USSD", "SIM",
                   "solde", "transfert", "étranger", "diaspora"],
        promoText: "Vos comptes Mobile Money, d'où que vous soyez dans le monde. Créez votre compte, ajoutez votre carte SIM, et retrouvez solde, SMS et opérations.",
        supportUrl: CONFIDENTIALITE,
        privacyPolicyUrl: CONFIDENTIALITE,
        screenshots: captures("fr-FR"),
      },
      "en-US": {
        title: NOM_SUR_LE_MAGASIN,
        subtitle: "Your Mobile Money, anywhere",
        description: descriptionEn,
        keywords: ["mobile money", "MoMo", "Orange Money", "MTN", "USSD", "SIM",
                   "balance", "transfer", "abroad", "diaspora"],
        promoText: "Your Mobile Money accounts, from anywhere in the world. Create your account, add your SIM card, and get your balance, SMS and operations back.",
        supportUrl: CONFIDENTIALITE,
        privacyPolicyUrl: CONFIDENTIALITE,
        screenshots: captures("en-US"),
      },
    },
    // Aucune de ces rubriques ne concerne TOTEM : pas de violence, pas de
    // jeu d'argent, pas de contenu des utilisateurs, pas de navigateur ouvert
    // sur le web. « 4+ ».
    advisory: {
      alcoholTobaccoOrDrugUseOrReferences: "NONE",
      contests: "NONE",
      gamblingSimulated: "NONE",
      gunsOrOtherWeapons: "NONE",
      horrorOrFearThemes: "NONE",
      matureOrSuggestiveThemes: "NONE",
      medicalOrTreatmentInformation: "NONE",
      profanityOrCrudeHumor: "NONE",
      sexualContentGraphicAndNudity: "NONE",
      sexualContentOrNudity: "NONE",
      violenceCartoonOrFantasy: "NONE",
      violenceRealistic: "NONE",
      violenceRealisticProlongedGraphicOrSadistic: "NONE",
      gambling: false,
      unrestrictedWebAccess: false,
      kidsAgeBand: null,
      ageRatingOverride: "NONE",
      koreaAgeRatingOverride: "NONE",
      lootBox: false,
      advertising: false,
      messagingAndChat: false,
      userGeneratedContent: false,
      healthOrWellnessTopics: false,
      parentalControls: false,
      ageAssurance: false,
    },
    // Approuvée, l'application ne part pas seule : c'est le propriétaire
    // qui décide du jour.
    release: { automaticRelease: false },
    review: {
      firstName: env("APPLE_CONTACT_PRENOM") || CONTACT.prenom,
      lastName: env("APPLE_CONTACT_NOM") || CONTACT.nom,
      email: env("APPLE_CONTACT_COURRIEL") || CONTACT.courriel,
      phone: env("APPLE_CONTACT_TELEPHONE") || CONTACT.telephone,
      demoUsername: EXAMEN_COURRIEL,
      demoPassword: EXAMEN_MOTDEPASSE,
      demoRequired: true,
      notes: notesExamen,
    },
  },
};
