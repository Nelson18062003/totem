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
🗿 Session USSD · Orange
┌──────────────────────────┐
│ Orange Money             │
│ 1. Transfert d'argent    │
│ 2. Retrait               │
│ 3. Paiement facture      │
│ 4. Credit                │
│ 5. Mon compte            │
│ 6. Quitter               │
└──────────────────────────┘
[1. Transfert d'argent] [2. Retrait]
[3. Paiement facture]   [4. Credit]
[5. Mon compte]         [6. Quitter]
[❌ Annuler]
```

Le texte complet du menu reste affiché **en plus** des boutons, dans son
cadre à chasse fixe. C'est volontaire : si l'opérateur présente une ligne que
le découpage ne reconnaît pas, elle reste lisible et vous pouvez répondre par
un message. Le filet compte plus que l'économie de place.

Quand l'opérateur pose une **question libre** (numéro du bénéficiaire, montant),
il n'y a pas de bouton : vous répondez par un message normal.

**Une seule carte, qui se met à jour.** La session USSD n'empile plus vingt
messages : la même carte est réécrite à chaque étape, comme l'écran d'un
téléphone. La conversation reste lisible, et l'historique complet reste dans le
journal SQLite (et dans l'export CSV).

**Aucun message intermédiaire.** Ouvrir un menu ne coûte qu'un seul
aller-retour : le menu arrive directement, sans carte d'attente préalable.

Le robot ne s'inflige d'ailleurs plus d'attente inutile : il attendait
auparavant 1,2 s après **chaque** étape « au cas où » le message ne serait pas
fini, et gelait le modem 5,6 s toutes les minutes pour vérifier la carte SIM.
Tout cela a disparu — reste la seule latence du réseau de l'opérateur, sur
laquelle personne n'a la main.

## 2. Le code PIN ne passe plus jamais dans la conversation

Dès que l'opérateur demande le code, un **pavé numérique en boutons** s'affiche :

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

Si vous préférez taper le code à la main, cela marche toujours : le message est
alors supprimé du chat immédiatement.

**Le pavé ne s'ouvre que sur une vraie demande de saisie.** Un menu comme
`5) Gerer mon code secret` *parle* du code sans rien demander : il porte des
options numérotées, donc c'est une navigation. Le robot le voit et affiche des
boutons, pas le pavé. Seule une invite sans aucune option numérotée
(« Confirmez avec votre code secret : ») déclenche la saisie.

## 3. Plusieurs opérateurs : un modem par réseau

Le robot détecte tout seul les modems branchés et en fait un **compte** par
opérateur. Chacun écoute son réseau en permanence : aucun paiement ne peut
passer inaperçu, quel que soit l'opérateur du client.

- `/comptes` liste les comptes et permet de basculer.
- `mtn *126#` vise un compte sans changer de compte courant.
- `/statut` et `/rapport` agrègent tous les comptes.
- `python3 -m totem --modems` dit ce que le Pi détecte réellement.

Chaque ligne du journal porte son compte d'origine : les encaissements MTN et
Orange ne se mélangent jamais, ni dans `/sms`, ni dans l'export.

> **Limite connue** : les raccourcis (section suivante) sont communs à tous les
> comptes. Avec deux opérateurs dont les menus diffèrent, il faut aujourd'hui
> composer le code du second à la main.

## 4. Un bouton = une opération complète (raccourcis)

Consulter le solde demandait `*126#`, puis `5`, puis `1`. Cela devient **un seul
bouton** :

```ini
[raccourcis]
solde = 💰 Solde | *126#, 5, 1
transactions = 🧾 Dernières opérations | *126#, 5, 2
```

Le robot joue les touches à votre place sur le compte courant, et **s'arrête
tout seul dès qu'un code secret est demandé** — vous gardez toujours la main
sur l'argent qui sort.

Pour trouver les bons chiffres : déroulez le menu une fois à la main en notant
les touches, puis recopiez-les. ⚠️ Vérifiez les codes auprès de votre agence :
ils changent selon les pays et les offres.

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

## 8. Plusieurs SIM : chaque compte a son journal

Chaque SMS, chaque échange USSD est rattaché au **compte** qui l'a reçu.
`/sms`, `/rapport` et l'export distinguent donc MTN d'Orange sans ambiguïté.

Le robot lit aussi l'**ICCID** de chaque carte — le numéro de série gravé sur
la puce, unique et stable, indépendant de l'opérateur. Il est affiché dans
`/diagnostic` : c'est lui qui permet de savoir *quelle* carte est réellement
en place, y compris si vous remplacez une SIM Orange par une autre SIM Orange.

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
