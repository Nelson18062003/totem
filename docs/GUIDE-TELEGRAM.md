# TOTEM dans Telegram — l'expérience au quotidien

> Ce guide décrit ce que vous voyez et faites dans Telegram. Rien ici n'exige
> de toucher au Raspberry Pi : tout se règle dans `totem.conf`.

## 1. Le principe : on ne tape plus, on appuie

Un menu Mobile Money arrive dans Telegram sous forme de **boutons cliquables**.
Le robot lit les lignes numérotées du menu de l'opérateur et fabrique un bouton
pour chacune — qu'elles soient écrites `1. Transfert`, `1) Transfert`,
`1-Transfert` ou `01 : Transfert`, car MTN et Orange ne les numérotent pas
pareil.

```
🗿 Orange Money
Orange Money
Bienvenue. Choisissez :

[1. Transfert d'argent]
[2. Retrait d'argent]
[3. Paiement marchand]
[4. Mon compte]
[5. Gerer mon code secret]
[6. Quitter]
[❌ Fermer]
```

**Les options ne sont plus recopiées en texte au-dessus des boutons.** Avant,
le menu apparaissait deux fois — une fois en bloc gris à chasse fixe (ce petit
cadre avec un bouton « copier »), une fois en boutons. Sur téléphone les lignes
longues débordaient et l'écran devenait illisible. Le bloc gris a disparu : il
ne reste que le texte d'introduction de l'opérateur, puis les boutons.

Quand les libellés sont longs, les boutons passent automatiquement à **un par
ligne** au lieu de deux, pour ne pas être tronqués.

Quand l'opérateur pose une **question libre** (numéro du bénéficiaire, montant),
il n'y a pas de bouton : vous répondez par un message normal, comme avant.

**Une seule carte, qui se met à jour.** La session USSD n'empile plus vingt
messages : la même carte est réécrite à chaque étape, comme l'écran d'un
téléphone. La conversation reste lisible, et l'historique complet reste dans le
journal SQLite (et dans l'export CSV).

**Une réponse immédiate, même quand le réseau traîne.** Dès que vous envoyez un
code ou appuyez sur une option, la carte affiche aussitôt
« ⏳ Composition de `*126#`… », puis se transforme en menu à l'arrivée de la
réponse. L'écran ne reste plus figé sans rien dire.

Le robot ne s'inflige d'ailleurs plus d'attente inutile : il attendait
auparavant 1,2 s après **chaque** étape « au cas où » le message ne serait pas
fini, et gelait le modem 5,6 s toutes les minutes pour vérifier la carte SIM.
Tout cela a disparu — reste la seule latence du réseau de l'opérateur, sur
laquelle personne n'a la main.

## 2. Le code secret ne passe plus jamais dans la conversation

Dès que l'opérateur demande le code, un **pavé numérique en boutons** s'affiche :

```
🔐 Code secret
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

Si vous préférez taper le code à la main, cela marche toujours : le message est
alors supprimé du chat immédiatement.

**Le pavé ne s'ouvre que sur une vraie demande de saisie.** Un menu comme
`5) Gerer mon code secret` *parle* du code sans rien demander : il porte des
options numérotées, donc c'est une navigation. Le robot le voit et affiche des
boutons, pas le pavé. Seule une invite sans aucune option numérotée
(« Confirmez avec votre code secret : ») déclenche la saisie.

## 3. Plusieurs opérateurs : MTN, Orange, et les autres

Rien n'est écrit en dur pour MTN. Chaque opérateur est décrit dans
`totem.conf`, et **le robot choisit tout seul le bon profil** d'après le réseau
que le modem voit réellement dans la SIM présente :

```ini
[operateur.mtn]
nom = MTN MoMo
detection = MTN          ; cherché dans le nom du réseau vu par le modem
menu = *126#

[operateur.orange]
nom = Orange Money
detection = Orange
menu = #148#
```

Résultat : vous n'avez plus à vous souvenir si c'est `*126#` ou `#148#`.
L'écran d'accueil affiche un bouton **📱 Menu Orange Money** ou **📱 Menu MTN
MoMo** selon la carte en place, et un seul appui ouvre le bon menu.

> ⚠️ Vérifiez les codes auprès de votre agence : ils changent selon les pays et
> les offres. Ceux du fichier d'exemple sont des points de départ.

Un opérateur non décrit n'empêche rien : le robot affiche son nom réel et vous
composez le code vous-même.

## 4. Un bouton = une opération complète (raccourcis)

Consulter le solde demandait `*126#`, puis `5`, puis `1`. Cela devient **un seul
bouton**. Les raccourcis appartiennent à un opérateur, puisque les touches ne
sont pas les mêmes :

```ini
[raccourcis.mtn]
solde = 💰 Solde | *126#, 5, 1

[raccourcis.orange]
solde = 💰 Solde | #148#, 4, 1
```

Le bouton **💰 Solde** est le même pour vous ; derrière, le robot joue la
séquence de l'opérateur en place. Il **s'arrête tout seul dès qu'un code secret
est demandé** — vous gardez toujours la main sur l'argent qui sort.

Pour trouver les bons chiffres : déroulez le menu une fois à la main en notant
les touches, puis recopiez-les.

## 5. Le mode groupe : travailler à plusieurs

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

## 6. Les sujets (forum) : un fil par nature d'information

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

## 7. Notifications : tous les SMS comptent

**Aucun SMS n'est mis en sourdine.** Tous arrivent de la même façon et
déclenchent la même notification, qu'il s'agisse d'un encaissement ou d'un
message de l'opérateur — un SMS peut annoncer une suspension de compte, une
expiration de ligne, une opération que vous n'avez pas faite : rien de tout
cela ne doit passer inaperçu.

La seule différence est **visuelle** : quand le robot reconnaît un montant reçu,
il l'affiche en tête (« 💰 Encaissement — 25 000 FCFA ») pour que vous le
lisiez sans ouvrir le message. Chaque SMS est signé de l'opérateur et de la
carte qui l'a reçu.

## 8. Plusieurs SIM : chaque carte a son journal

Le robot lit l'**ICCID** de la carte présente — le numéro de série gravé sur la
puce, unique et stable, indépendant de l'opérateur. Tout ce qui est enregistré
(SMS, transcriptions USSD, événements) est rattaché à cette carte.

Conséquences concrètes :

- `/sms`, `/rapport` et `/export` ne montrent **que** la carte en place. Deux
  SIM Orange différentes ne mélangent jamais leurs encaissements.
- Vous changez la carte dans le HAT : le robot s'en aperçoit tout seul (il
  vérifie chaque minute), vous prévient — **« 💳 Nouvelle carte SIM détectée »** —
  bascule sur le profil du bon opérateur, et referme proprement toute session
  USSD en cours.
- `/sims` liste toutes les cartes déjà passées dans le robot, avec le nombre de
  SMS et la date de dernière activité. La carte en place est marquée ▶️.
- Rien n'est perdu quand vous remettez une ancienne carte : son journal
  ressort intact.

Le jour où vous ajoutez un deuxième module HAT, cette base ne changera pas :
c'est déjà un journal par carte, il ne restera qu'à faire tourner deux modems.

> Le numéro de téléphone (MSISDN) n'est **pas** utilisé comme identifiant : la
> plupart des SIM prépayées ne l'inscrivent pas dans la puce. L'ICCID, lui, y
> est toujours.

## 9. Confirmation avant une sortie importante

Au-delà d'un montant que vous fixez, **le pavé du code secret ne s'affiche
plus directement**. Une carte s'intercale et rappelle ce que vous êtes sur le
point de valider :

```
⚠️ Confirmation demandée
Montant : 50 000 FCFA
Bénéficiaire : 677123456
Opérateur : MTN MoMo · carte …000011

[✅ Confirmer]
[❌ Annuler]
```

Dans `totem.conf` :

```ini
seuil_confirmation = 100000     ; 0 = désactivé
```

Le robot lit le montant et le bénéficiaire dans vos propres réponses au menu
de l'opérateur — il n'invente rien. Tant que vous n'avez pas confirmé, **le
code secret n'existe nulle part** : le pavé reste inerte, et taper le code à
la main ne contourne rien.

C'est le garde-fou si quelqu'un met la main sur votre téléphone déverrouillé :
consulter un solde reste possible, sortir de l'argent demande un geste
délibéré de plus.

## 10. Sauvegarde : Telegram garde votre journal

Le journal ne vit que sur la carte SD du Pi. Une carte morte, et tout
l'historique des encaissements disparaît.

**`/sauvegarde`** envoie une copie complète du journal dans la conversation.
Telegram conserve le fichier indéfiniment : pas de serveur à louer, pas
d'identifiant supplémentaire à gérer, et il est accessible depuis n'importe
quel appareil. Le fichier ne contient **aucun code secret** (le journal n'en
garde jamais).

C'est automatique chaque jour, juste après le bilan :

```ini
sauvegarde_quotidienne = oui
```

**Pour restaurer** : téléchargez le fichier depuis Telegram, arrêtez le robot
(`sudo systemctl stop totem`), remplacez `journal.db` par celui-ci, relancez.

## 11. Rien ne se perd pendant une coupure Internet

À Douala, la connexion tombe. Les paiements, eux, continuent d'arriver.

Les encaissements, alertes et bilans passent désormais par une **file
d'attente écrite sur disque** : si l'envoi échoue, le message est mis de côté
et repart tout seul au retour du réseau, **dans l'ordre d'origine**. Un
nouveau message ne double jamais la file — la chronologie des encaissements
est préservée.

Les échanges interactifs (menus USSD, réponses aux commandes) n'y passent
pas : ils n'ont d'intérêt qu'immédiatement, et vous voyez tout de suite s'ils
n'aboutissent pas.

## 12. Export comptable

`/export` (ou le bouton **📄 Export CSV**) envoie dans la conversation un
fichier `totem-AAAA-MM-JJ.csv` des 7 derniers jours : date, carte, expéditeur,
montant déjà extrait en colonne, message complet. Il s'ouvre directement dans
Excel (accents compris) et s'importe dans un logiciel de comptabilité.

## 13. Les autres améliorations, invisibles mais utiles

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

## 14. Ce qui n'a pas changé (et ne doit pas changer)

- Aucun port ouvert sur le Pi : uniquement des connexions **sortantes**.
- Le PIN MoMo n'est **jamais** stocké.
- Seules les conversations déclarées sont écoutées.
- Le mode console (`python3 -m totem --console`) et la démo (`--demo`)
  fonctionnent toujours sans matériel : les boutons y sont affichés en texte.
