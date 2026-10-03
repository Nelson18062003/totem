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

const descriptionFr = `Vos cartes SIM Mobile Money restent où elles sont. Vous, non.

Qui tient une ligne Mobile Money connaît la manœuvre : *126#, attendre, taper 1, attendre, taper 4, se tromper, recommencer. Un menu à la fois, sur un petit écran, la carte SIM à la main.

TOTEM remplace tout cela par une vraie interface. Vos cartes SIM sont dans un terminal que vous gardez — à la boutique, à la maison. Vous les atteignez depuis votre téléphone, d'où que vous soyez.

CE QUE VOUS POUVEZ FAIRE

• Voir chaque carte d'un coup d'œil : son nom, son numéro, son solde.
• Lancer un dépôt, un retrait, un transfert en répondant à une question par écran — numéro, montant — et voir le message de l'opérateur en entier avant de taper votre code.
• Coller un numéro reçu par message : TOTEM le lit, et dit ce qui partira.
• Lire chaque SMS de l'opérateur en entier, tel que la carte l'a reçu.
• Garder un reçu PDF pour chaque opération, prêt à envoyer à un client.
• Confier une carte à un vendeur : il ne voit et ne manie que celle-là.
• Être prévenu dès que quelque chose se passe sur une carte.

FAIT POUR UN RÉSEAU QUI TOMBE

Sans réseau, l'application montre les chiffres du dernier passage, et dit qu'ils datent. Quand un message d'opérateur ne peut pas être lu avec certitude, TOTEM le dit plutôt que de deviner.

Votre code secret Mobile Money n'est jamais enregistré, jamais affiché, jamais conservé.

CE QUE TOTEM N'EST PAS

Ni un service de paiement, ni un portefeuille, ni une banque. Aucun argent n'y transite et il ne détient aucun fonds. C'est une interface sur des cartes SIM qui sont déjà les vôtres, pour la personne qui les possède.

En français et en anglais.`;

const descriptionEn = `Your Mobile Money SIM cards stay where they are. You do not.

Anyone who runs a Mobile Money line knows the drill: *126#, wait, press 1, wait, press 4, mistype, start over. One menu at a time, on a small screen, with the SIM card in your hand.

TOTEM replaces that with a proper interface. Your SIM cards sit in a terminal you keep — at the shop, at home. You reach them from your phone, from anywhere.

WHAT YOU CAN DO

• See every card at a glance: its name, its number, its balance.
• Run a deposit, a withdrawal or a transfer by answering one question per screen — number, amount — and read the operator's full message before you type your code.
• Paste a number you received in a message: TOTEM reads it and shows what will be sent.
• Read every operator SMS in full, exactly as the card received it.
• Keep a PDF receipt for each transaction, ready to send to a customer.
• Entrust a card to a seller: they see and run that card only.
• Get notified the moment something happens on a card.

BUILT FOR A NETWORK THAT DROPS

Offline, the app shows the figures from your last visit and says how old they are. When an operator message cannot be read with certainty, TOTEM says so rather than guessing.

Your Mobile Money PIN is never stored, never shown, never kept.

WHAT TOTEM IS NOT

It is not a payment service, a wallet, or a bank. No money moves through it and it holds no funds. It is an interface onto SIM cards you already own, for the person who owns them.

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
    categories: ["FINANCE", "BUSINESS"],
    info: {
      "fr-FR": {
        title: NOM_SUR_LE_MAGASIN,
        subtitle: "Vos cartes Mobile Money",
        description: descriptionFr,
        keywords: ["mobile money", "USSD", "SIM", "MoMo", "Orange Money", "MTN",
                   "caisse", "dépôt", "transfert", "reçu"],
        promoText: "Vos cartes SIM Mobile Money, d'où que vous soyez. Fini les codes USSD.",
        supportUrl: CONFIDENTIALITE,
        privacyPolicyUrl: CONFIDENTIALITE,
        screenshots: captures("fr-FR"),
      },
      "en-US": {
        title: NOM_SUR_LE_MAGASIN,
        subtitle: "Your Mobile Money SIM cards",
        description: descriptionEn,
        keywords: ["mobile money", "USSD", "SIM", "MoMo", "Orange Money", "MTN",
                   "agent", "deposit", "transfer", "receipt"],
        promoText: "Your Mobile Money SIM cards, from anywhere. No more USSD menus.",
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
