# Publier sur Google Play

> Ce qu'il faut remplir, et ce qu'il faut y écrire. Les réponses sont
> déduites de ce que l'application fait **réellement** — pas de ce qu'une
> application de ce genre fait d'habitude.

---

## Avant tout : la politique de confidentialité

Google Play **refuse** une application financière sans politique de
confidentialité à une adresse publique.

Elle est en ligne : **https://totemlabs.app/confidentialite**

Elle s'ouvre sans compte — un examinateur y arrive depuis un lien collé dans
un formulaire, et une page derrière le verrou ferait refuser l'application
sans plus d'explication. Le script du verrou vérifie qu'elle reste ouverte.

> ⚠️ **Une chose à régler avant de coller ce lien.** Le courriel de contact
> vient de la variable d'environnement `CONTACT_COURRIEL` sur Vercel. Sans
> elle, la page affiche `contact@bonzinilabs.com`, qui n'est peut-être pas
> une adresse relevée. Posez la vôtre, puis redéployez.

---

## Informations de connexion (App access)

Google demande comment un examinateur passe le verrou. TOTEM est entièrement
derrière une connexion : il faut donc **lui donner un compte qui marche**.

**Ne donnez pas le vôtre.** Créez-en un pour l'examen :

**Réglages → Qui peut se connecter → Créer un compte**

Puis dans la Play Console, choisir « Toutes les fonctionnalités nécessitent
un accès spécial » et remplir :

| Champ | Valeur |
|---|---|
| Nom des identifiants | `Examen Google` |
| Nom d'utilisateur | le courriel créé |
| Mot de passe | celui choisi |
| Instructions | « Sign in with the email and password above. The app shows the Mobile Money SIM cards held in the owner's terminal. » |

⚠️ **Ce compte voit tout ce que voit le propriétaire** — le rattachement des
SIM à une personne n'existe pas encore. Supprimez-le une fois l'examen
terminé : même écran, bouton *Supprimer*.

---

## Sécurité des données (Data safety)

Le formulaire le plus piégeux du Play Store : il doit correspondre **au mot
près** à la politique de confidentialité. Une contradiction entre les deux
est un motif de refus, et elle se voit.

### Collecte et partage

| Question | Réponse | Pourquoi |
|---|---|---|
| L'app collecte-t-elle des données ? | **Oui** | Un seul élément, ci-dessous. |
| Les données sont-elles chiffrées en transit ? | **Oui** | Tout passe en HTTPS ; l'application refuse une adresse en `http` (sauf la machine locale). |
| Peut-on demander la suppression ? | **Oui** | Désinstaller retire tout ce qui est sur le téléphone ; le propriétaire vide la base quand il veut. |

### Le seul type de données à déclarer

| Champ | Réponse |
|---|---|
| Type | **Identifiants de l'appareil** (*Device or other IDs*) |
| Collecté | **Oui** |
| Partagé | **Oui** — avec Expo et Google (FCM), pour acheminer la notification |
| Facultatif ou obligatoire | **Facultatif** — refuser les notifications n'empêche rien d'autre |
| Finalité | **Notifications / messagerie de l'application** |

C'est le jeton de notification, et rien d'autre.

### Ce qu'il faut répondre NON, et ne pas cocher par excès de prudence

Cocher « au cas où » n'est pas prudent : c'est déclarer faux, et cela oblige à
justifier une collecte qui n'existe pas.

- ❌ Position — l'application n'y touche pas
- ❌ Informations personnelles (nom, courriel, téléphone)
- ❌ Informations financières — **elles ne quittent jamais le terminal du propriétaire** ; l'application les affiche, elle ne les collecte pas pour elle-même
- ❌ Messages (SMS, courriels) — **les SMS sont lus par le modem du terminal, pas par le téléphone.** L'application ne demande aucune autorisation SMS
- ❌ Photos, fichiers, contacts, calendrier, micro, appareil photo
- ❌ Activité dans l'application, historique de navigation, recherches
- ❌ Rapports de plantage, diagnostics — aucun outil de ce genre n'est installé

### Le courriel du compte

Le propriétaire crée un compte avec un courriel, qui vit dans **sa** base
Supabase. Il n'est envoyé à personne d'autre, jamais.

Google demande de déclarer ce que l'**application** collecte et transmet à
des tiers. Ici le courriel ne quitte pas l'infrastructure du propriétaire.
Dans le doute, on peut le déclarer — **Adresse e-mail**, collectée,
**non partagée**, obligatoire, finalité **Gestion du compte**. C'est
défendable, et déclarer plus que le strict nécessaire ne fait pas refuser une
application ; l'inverse, si.

---

## Fonctionnalités financières (Financial features)

L'application affiche des mouvements Mobile Money : la déclaration s'impose.

| Question | Réponse |
|---|---|
| L'app propose-t-elle des prêts personnels ? | **Non** |
| Est-ce une app bancaire ? | **Non** |
| Gestion de portefeuille / cryptomonnaies ? | **Non** |
| Paiements ou virements ? | **Non** — l'application ne déplace aucun argent. Elle affiche ce que l'opérateur a fait, et dépose des demandes que le propriétaire exécute lui-même sur sa propre SIM |
| Assurances, placements, jeux d'argent ? | **Non** |

**La phrase qui résume, et elle est vraie** : TOTEM est une interface de
gestion pour le propriétaire de ses propres cartes SIM — il remplace les
menus USSD par des écrans. Aucun fonds ne transite, aucun compte de tiers
n'est touché, aucun service financier n'est proposé à qui que ce soit.

---

## La fiche du magasin

### Nom (30 caractères max)

```
TOTEM
```

### Description courte (80 caractères max)

**Anglais**
```
Manage your Mobile Money SIM cards from anywhere. No more USSD menus.
```
*(69 caractères)*

**Français**
```
Gérez vos cartes SIM Mobile Money d'où que vous soyez. Fini les codes USSD.
```
*(74 caractères)*

### Description complète (4000 caractères max)

> **Deux règles de cadrage, et elles comptent toutes les deux.**
>
> 1. **On ne suit pas l'argent.** TOTEM n'en déplace pas et n'en détient
>    pas : il rend gérables des cartes SIM que les menus USSD rendent
>    pénibles. Le produit, c'est l'interface. Dire « suivre l'argent »
>    ferait poser des questions de service financier auxquelles la réponse
>    est non.
> 2. **On ne nomme aucun pays.** Le Mobile Money, le réseau qui tombe et les
>    menus USSD ne sont pas une particularité camerounaise : c'est le
>    quotidien du Nigeria, de la Côte d'Ivoire, du Ghana, du Sénégal, du
>    Kenya. Écrire « au Cameroun » enfermerait la fiche dans un seul marché
>    — et ferait croire à tous les autres que ce n'est pas pour eux.
>    On cite les opérateurs à titre d'exemple, jamais comme une liste
>    fermée.

**Anglais**
```
Your Mobile Money SIM cards stay where they are. You do not.

Anyone who runs a Mobile Money line knows the drill: *126#, wait, press 1,
wait, press 4, mistype, start over. One menu at a time, on a small screen,
with the SIM card physically in your hand. And when the network drops, you
start again from the beginning.

TOTEM replaces that with a proper interface.

Your SIM cards sit in a terminal you keep — at the shop, at home, wherever
you like. You reach them from your phone, from anywhere in the world.

WHAT YOU CAN DO

• Run every card from one screen. MTN, Orange, Moov, Airtel, Wave, and
  whatever your country uses — each SIM keeps its own name, its own history,
  its own balance.
• Turn a USSD sequence into a button. Show TOTEM the path once, and it
  becomes a button you press. It learns your operator's menus; nothing is
  hard-coded for one network.
• Read every operator message in full, exactly as the SIM received it.
• Keep a PDF receipt for each transaction, ready to send to a customer.
• Share a card's details — name, number, network — in one gesture, or as a
  proper PDF document.
• Get a notification the moment something happens on a card.

BUILT FOR A NETWORK THAT DROPS

Internet goes down; the cards keep working. The terminal keeps its own
journal and catches up when the network returns. Nothing is lost, and
nothing is invented: when an operator message cannot be read with certainty,
TOTEM says so rather than guessing.

Your Mobile Money PIN is never stored, never logged, never put in a message.
It is typed at the moment of an operation and kept nowhere afterwards. A
one-time code arriving by SMS never appears in a notification — your locked
screen says "a code arrived", without a single digit.

WHAT TOTEM IS NOT

It is not a payment service, a wallet, or a bank. No money moves through it
and it holds no funds. It is an interface onto SIM cards you already own,
for the person who owns them.

English and French, both complete.
```

**Français**
```
Vos cartes SIM Mobile Money restent où elles sont. Vous, non.

Qui tient une ligne Mobile Money connaît la manœuvre : *126#, attendre,
taper 1, attendre, taper 4, se tromper, recommencer. Un menu à la fois, sur
un petit écran, la carte SIM à la main. Et quand le réseau lâche, on reprend
depuis le début.

TOTEM remplace tout cela par une vraie interface.

Vos cartes SIM sont dans un terminal que vous gardez — à la boutique, à la
maison, où vous voulez. Vous les atteignez depuis votre téléphone, d'où que
vous soyez dans le monde.

CE QUE VOUS POUVEZ FAIRE

• Piloter chaque carte depuis un seul écran. MTN, Orange, Moov, Airtel,
  Wave, et ce que votre pays utilise — chaque SIM garde son nom, son
  historique, son solde.
• Transformer un parcours USSD en bouton. Montrez le chemin une fois à
  TOTEM, et il devient un bouton. Il apprend les menus de votre opérateur ;
  rien n'est écrit d'avance pour un seul réseau.
• Lire chaque message de l'opérateur en entier, tel que la SIM l'a reçu.
• Garder un reçu PDF pour chaque opération, prêt à envoyer à un client.
• Partager les coordonnées d'une carte — nom, numéro, réseau — d'un geste,
  ou en vrai document PDF.
• Être prévenu à la seconde où quelque chose se passe sur une carte.

FAIT POUR UN RÉSEAU QUI TOMBE

Internet lâche ; les cartes, elles, continuent de fonctionner. Le terminal
tient son propre journal et rattrape son retard au retour du réseau. Rien ne
se perd, et rien ne s'invente : quand un message d'opérateur ne peut pas
être lu avec certitude, TOTEM le dit plutôt que de deviner.

Votre code PIN Mobile Money n'est jamais enregistré, jamais journalisé,
jamais mis dans un message. Il se saisit au moment d'une opération et n'est
conservé nulle part ensuite. Un code à usage unique reçu par SMS n'apparaît
jamais dans une notification — votre écran verrouillé affiche « un code est
arrivé », sans un chiffre.

CE QUE TOTEM N'EST PAS

Ni un service de paiement, ni un portefeuille, ni une banque. Aucun argent
n'y transite et il ne détient aucun fonds. C'est une interface sur des
cartes SIM qui sont déjà les vôtres, pour la personne qui les possède.

En français et en anglais, entièrement.
```

---

## Les images

**Tout est fabriqué et rangé dans `boutique/`.** Il n'y a plus qu'à
téléverser.

| Élément | Fichier | Taille |
|---|---|---|
| Icône | `brand/png/totem-icone-app.png` | 1024 × 1024 |
| Image de présentation | `boutique/presentation-1024x500.png` | 1024 × 500 |
| Captures téléphone | `boutique/captures/1-caisses.png` … `4-cartes.png` | 1080 × 1920 |

Les captures se refabriquent d'une commande, jamais à la main :

```sh
node web/scripts/faux-nuage.mjs &
cd web && SUPABASE_URL=http://127.0.0.1:4999 SUPABASE_CLE=x \
  SESSION_SECRET=essai npx next start -p 3180 &
cd mobile && EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3180 EXPO_PUBLIC_APERCU=1 \
  npx expo export --platform web --output-dir /tmp/apercu
node scripts/captures-boutique.mjs /tmp/apercu
```

**Avec le faux nuage, jamais avec de vraies données.** Une capture part sur
une fiche publique, visible de la terre entière et archivée par des gens
qu'on ne connaît pas. Un montant réel, un nom de client, un numéro de
téléphone n'ont rien à y faire — et une fois publiés, ils ne se reprennent
pas. Le script s'arrête d'ailleurs s'il retombe sur l'écran de connexion :
une capture de l'écran de connexion sur une fiche de magasin serait ridicule.

L'image de présentation **sera rognée** par Google selon les emplacements :
la marque et la phrase tiennent donc dans le tiers central, et les bords ne
portent que le motif.

## Le numéro de version, et le piège qui attendait

Le Play Store refuse un paquet dont le `versionCode` a **déjà servi**, sur
n'importe quelle piste. Le message est sec — « Version code 1 has already
been used » — et ne dit pas où le corriger.

`eas.json` porte `appVersionSource: "remote"` : le compteur vit chez EAS, et
il ne monte QUE pour les profils marqués `autoIncrement`. Le profil `essai`
ne l'était pas. La première mise en ligne serait passée ; la deuxième aurait
été refusée, sans qu'on sache pourquoi.

Les deux profils qui vont au magasin — `essai` et `production` — l'ont
maintenant, et partagent le même compteur : un paquet d'essai ne peut donc
pas entrer en collision avec un paquet public.

`apercu` ne l'a pas, et n'en a pas besoin : c'est un APK qu'on s'installe
soi-même, il ne passe jamais par le magasin.

> `eas.json` **refuse les commentaires**. C'est pour cela que cette
> explication est ici et pas dans le fichier — une compilation entière a
> déjà échoué sur une clé `"//"` ajoutée par habitude.

---

## Classification du contenu

Questionnaire à remplir. Toutes les réponses sont **Non** : pas de violence,
pas de contenu sexuel, pas de jeu d'argent, pas de substances, pas de
contenu généré par les utilisateurs, pas de partage de position.

Catégorie : **Finance**.

---

## L'ordre des choses

1. Poser `CONTACT_COURRIEL` sur Vercel, redéployer, vérifier la page.
2. Créer l'application dans la Play Console (nom, langue par défaut anglais).
3. Coller le lien de la politique de confidentialité.
4. Remplir *Sécurité des données* — les réponses sont ci-dessus.
5. Remplir *Fonctionnalités financières*.
6. Remplir la classification du contenu.
7. Fiche du magasin : descriptions, icône, captures.
8. Compiler un paquet `essai` (AAB), le téléverser sur la **piste d'essai
   interne**.
9. L'installer soi-même, l'utiliser quelques jours.
10. Puis la production.

Le compte d'organisation BONZINILABS est **dispensé** de la règle des 12
testeurs pendant 14 jours, qui s'applique aux comptes personnels.
