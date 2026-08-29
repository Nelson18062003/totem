# Publier sur Google Play

> Ce qu'il faut remplir, et ce qu'il faut y écrire. Les réponses sont
> déduites de ce que l'application fait **réellement** — pas de ce qu'une
> application de ce genre fait d'habitude.

---

## Avant tout : la politique de confidentialité

Google Play **refuse** une application financière sans politique de
confidentialité à une adresse publique.

Elle est en ligne : **`https://VOTRE-ADRESSE.vercel.app/confidentialite`**

Elle s'ouvre sans compte — un examinateur y arrive depuis un lien collé dans
un formulaire, et une page derrière le verrou ferait refuser l'application
sans plus d'explication. Le script du verrou vérifie qu'elle reste ouverte.

> ⚠️ **Une chose à régler avant de coller ce lien.** Le courriel de contact
> vient de la variable d'environnement `CONTACT_COURRIEL` sur Vercel. Sans
> elle, la page affiche `contact@bonzinilabs.com`, qui n'est peut-être pas
> une adresse relevée. Posez la vôtre, puis redéployez.

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
- ❌ Messages (SMS, courriels) — **les SMS sont lus par le modem de Douala, pas par le téléphone.** L'application ne demande aucune autorisation SMS
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

**La phrase qui résume, et elle est vraie** : TOTEM est un outil de suivi pour
le propriétaire de ses propres cartes SIM. Aucun fonds ne transite, aucun
compte de tiers n'est touché, aucun service financier n'est proposé à qui que
ce soit.

---

## La fiche du magasin

### Nom (30 caractères max)

```
TOTEM
```

### Description courte (80 caractères max)

**Anglais**
```
Follow the money on your Mobile Money SIMs, from anywhere in the world.
```
*(70 caractères)*

**Français**
```
Suivez l'argent de vos SIM Mobile Money, d'où que vous soyez.
```
*(60 caractères)*

### Description complète (4000 caractères max)

**Anglais**
```
Your Mobile Money SIM cards stay in the country. You do not.

TOTEM is a window onto the terminal that holds your MTN Mobile Money and
Orange Money SIMs. From anywhere in the world, you see the money arriving,
read every message the operator sends, and keep a receipt for each payment.

WHAT YOU GET

• Every incoming payment, the moment it lands — with a notification that
  names the amount and who sent it.
• Every operator message, in full, exactly as the SIM received it.
• A PDF receipt for each payment, ready to send to a customer.
• Your balances per card, announced by the operator itself — never a figure
  we calculated.
• Your card's details — name, number, network — copied in one gesture or
  downloaded as a proper PDF, to share with whoever is paying you.

BUILT FOR HOW IT REALLY WORKS

The internet in Douala goes down; payments keep coming. The terminal keeps
its own journal and catches up when the network returns. Nothing is lost,
and nothing is invented: when a message cannot be read with certainty, TOTEM
says so rather than guessing an amount.

Your Mobile Money PIN is never stored, never logged, never put in a message.
It is typed at the moment of an operation and kept nowhere afterwards. A
one-time code arriving by SMS is never shown in a notification — your locked
screen says "a code arrived", without a single digit.

FOR ONE OWNER

TOTEM is not a payment service and holds no funds. It is a tool for the
person who owns the SIM cards, to follow their own money.
```

**Français**
```
Vos cartes SIM Mobile Money restent au pays. Vous, non.

TOTEM est une fenêtre sur le terminal qui héberge vos SIM MTN Mobile Money
et Orange Money. D'où que vous soyez dans le monde, vous voyez l'argent
arriver, vous lisez chaque message de l'opérateur, et vous gardez un reçu
pour chaque paiement.

CE QUE VOUS AVEZ

• Chaque encaissement, à la seconde où il tombe — avec une notification qui
  dit le montant et qui l'a envoyé.
• Chaque message de l'opérateur, en entier, tel que la SIM l'a reçu.
• Un reçu PDF pour chaque paiement, prêt à envoyer à un client.
• Vos soldes par carte, annoncés par l'opérateur lui-même — jamais un chiffre
  que nous aurions calculé.
• Les coordonnées de votre carte — nom, numéro, réseau — copiées d'un geste
  ou téléchargées en vrai PDF, à donner à qui vous paie.

FAIT POUR LA RÉALITÉ DU TERRAIN

À Douala, Internet tombe ; les paiements, eux, continuent d'arriver. Le
terminal tient son propre journal et rattrape son retard au retour du réseau.
Rien ne se perd, et rien ne s'invente : quand un message ne peut pas être lu
avec certitude, TOTEM le dit plutôt que de deviner un montant.

Votre code PIN Mobile Money n'est jamais enregistré, jamais journalisé,
jamais mis dans un message. Il se saisit au moment d'une opération et n'est
conservé nulle part ensuite. Un code à usage unique reçu par SMS n'apparaît
jamais dans une notification — votre écran verrouillé affiche « un code est
arrivé », sans un chiffre.

POUR UN PROPRIÉTAIRE

TOTEM n'est pas un service de paiement et ne détient aucun fonds. C'est un
outil pour la personne qui possède les cartes SIM, afin de suivre son propre
argent.
```

---

## Les images

| Élément | Exigence | D'où il sort |
|---|---|---|
| Icône | 512 × 512, PNG 32 bits | `brand/png/totem-icone-app.png` |
| Image de présentation | 1024 × 500 | à fabriquer |
| Captures téléphone | 2 à 8, min. 320 px de côté | l'aperçu web, aux tailles du harnais |

Les captures se prennent avec la plateforme d'essai (le faux nuage), **jamais
avec de vraies données** : un montant réel ou un nom de client n'a rien à
faire dans une fiche publique.

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
