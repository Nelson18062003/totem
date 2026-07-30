# TOTEM dans Telegram — l'expérience au quotidien

> Ce guide décrit ce que vous voyez et faites dans Telegram. Rien ici n'exige
> de toucher au Raspberry Pi : tout se règle dans `totem.conf`.

## 1. Le principe : on ne tape plus, on appuie

Un menu MoMo arrive dans Telegram sous forme de **boutons cliquables**. Le
robot lit les lignes numérotées du menu de l'opérateur (`1. Transfert d'argent`,
`2. Retrait…`) et fabrique un bouton pour chacune.

```
🗿 Session USSD
┌────────────────────────────┐
│ MTN MoMo                   │
│ 1. Transfert d'argent      │
│ 2. Retrait d'argent        │
│ …                          │
└────────────────────────────┘
[1. Transfert d'argent] [2. Retrait d'argent]
[3. Paiements]          [4. Epargne]
[5. Mon compte]         [6. Quitter]
[❌ Annuler]
```

Quand l'opérateur pose une **question libre** (numéro du bénéficiaire, montant),
il n'y a pas de bouton : vous répondez par un message normal, comme avant.

**Une seule carte, qui se met à jour.** La session USSD n'empile plus vingt
messages : la même carte est réécrite à chaque étape, comme l'écran d'un
téléphone. La conversation reste lisible, et l'historique complet reste dans le
journal SQLite (et dans l'export CSV).

## 2. Le code PIN ne passe plus jamais dans la conversation

Dès que l'opérateur demande le PIN, un **pavé numérique en boutons** s'affiche :

```
🔐 Code PIN
Saisi : ••••
[1] [2] [3]
[4] [5] [6]
[7] [8] [9]
[⌫] [0] [✅ Valider]
```

Le code se compose bouton par bouton. Il n'existe à aucun moment comme message
Telegram : rien à effacer, rien qui traîne dans les sauvegardes de l'appareil,
rien de visible par les autres membres d'un groupe. Le journal n'enregistre que
`****`.

Si vous préférez taper le PIN à la main, cela marche toujours : le message est
alors supprimé du chat immédiatement, comme avant.

## 3. Un bouton = une opération complète (raccourcis)

Consulter le solde demandait `*126#`, puis `5`, puis `1`. Cela devient **un seul
bouton**. Dans `totem.conf` :

```ini
[raccourcis]
solde = 💰 Solde | *126#, 5, 1
transactions = 🧾 Dernières opérations | *126#, 5, 2
```

Le robot joue les touches à votre place, et **s'arrête tout seul dès qu'un PIN
est demandé** — vous gardez toujours la main sur l'argent qui sort. Les
raccourcis apparaissent en haut de `/menu`. Adaptez les chiffres à votre menu
opérateur (ils diffèrent entre MTN et Orange).

## 4. Le mode groupe : travailler à plusieurs

Jusqu'ici, un seul Telegram parlait au robot. Vous pouvez désormais brancher le
robot sur un **groupe d'équipe** (vous, l'associé, la comptable, la personne sur
place à Douala).

**Mise en place**

1. Créez un groupe Telegram, ajoutez-y le robot.
2. Passez-le **administrateur** du groupe (nécessaire pour qu'il puisse
   supprimer un PIN tapé à la main).
3. Demandez son identifiant à **@userinfobot** (il commence par `-100…`).
4. Dans `totem.conf` :

```ini
[telegram]
chat_id = 123456789          # vous : la conversation privée reste le poste de pilotage
groupe = -1001234567890      # le groupe d'équipe
admins = 123456789, 555000111  # ceux qui ont le droit d'agir sur la SIM
```

**Deux rôles, une seule règle simple**

| | Voir les encaissements, `/rapport`, `/sms`, `/statut`, `/export` | Composer un USSD, saisir un PIN, redémarrer le modem |
|---|---|---|
| **Administrateur** (`admins`) | ✅ | ✅ |
| **Observateur** (tout autre membre du groupe) | ✅ | 🔒 refusé, et la tentative est journalisée |

Un message venant d'une conversation qui n'est ni la vôtre ni le groupe déclaré
reste **ignoré en silence**, exactement comme avant.

> Note utile : le « mode confidentialité » que BotFather active par défaut fait
> qu'en groupe le robot ne voit que les commandes (`/statut`) et les réponses
> qui lui sont adressées. **Les appuis sur les boutons, eux, lui parviennent
> toujours.** C'est une raison de plus de piloter au bouton en groupe. Si vous
> voulez pouvoir répondre aux questions libres (montant, numéro) par un simple
> message dans le groupe, désactivez la confidentialité :
> @BotFather → `/setprivacy` → votre robot → *Disable*.

## 5. Les sujets (forum) : un fil par nature d'information

Si le groupe est passé en mode **Sujets** (Paramètres du groupe → *Sujets*),
chaque flux peut avoir son propre fil : les encaissements ne se mélangent plus
aux alertes techniques.

1. Créez deux sujets, par exemple *Encaissements* et *Alertes*.
2. Ouvrez un sujet → *Copier le lien* → le dernier nombre du lien est son
   identifiant.
3. Dans `totem.conf` :

```ini
sujet_encaissements = 12
sujet_alertes = 5
```

Répartition : les SMS de paiement et le rapport quotidien vont dans
*Encaissements* ; les pannes modem et les redémarrages dans *Alertes* ; les
sessions USSD restent dans la conversation où elles ont été lancées.
Si vous ne configurez rien, tout arrive dans le fil général — rien ne casse.

## 6. Notifications : ce qui sonne et ce qui ne sonne pas

- **Un encaissement sonne** : « 💰 Encaissement — 25 000 FCFA », en tête de
  message, montant en gras.
- Un SMS ordinaire (publicité de l'opérateur, expiration de forfait) arrive en
  **notification silencieuse** : il est là si vous le cherchez, il ne réveille
  personne à 2 h du matin.

## 7. Export comptable

`/export` (ou le bouton **📄 Export CSV**) envoie dans la conversation un
fichier `totem-AAAA-MM-JJ.csv` des 7 derniers jours : date, expéditeur, montant
déjà extrait en colonne, message complet. Il s'ouvre directement dans Excel
(accents compris) et s'importe dans un logiciel de comptabilité.

## 8. Les autres améliorations, invisibles mais utiles

- **Menu « / » natif** : les commandes sont déclarées auprès de Telegram, elles
  apparaissent dans le bouton *Menu* de l'application. Plus rien à retenir.
- **Aucune vieille commande rejouée** : après une coupure de courant, le robot
  jette le retard accumulé au lieu d'exécuter d'un coup ce qui a été envoyé
  pendant qu'il était éteint. C'était un vrai risque sur une SIM d'argent.
- **Session USSD expirée** : sans réponse pendant 3 minutes
  (`delai_session`), le robot referme la session et vous le dit — l'opérateur
  l'aurait fermée de son côté sans prévenir.
- **Messages longs découpés** : un relevé de transactions dépassant la limite
  Telegram n'est plus perdu.
- **Limites de débit respectées** : en cas de rafale de SMS, le robot attend le
  délai demandé par Telegram au lieu de perdre des messages.
- **Textes échappés** : un SMS contenant `<` ou `&` s'affiche correctement au
  lieu de casser la mise en forme.

## 9. Ce qui n'a pas changé (et ne doit pas changer)

- Aucun port ouvert sur le Pi : uniquement des connexions **sortantes**.
- Le PIN MoMo n'est **jamais** stocké.
- Seules les conversations déclarées sont écoutées.
- Le mode console (`python3 -m totem --console`) et la démo (`--demo`)
  fonctionnent toujours sans matériel : les boutons y sont affichés en texte.
