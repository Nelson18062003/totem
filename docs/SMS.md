# Les SMS dans TOTEM

La plateforme sert d'abord à **piloter une SIM depuis n'importe où**. Or une
SIM, ce qu'elle reçoit, ce sont des **SMS**. Le SMS est donc l'objet central de
TOTEM — pas le paiement. Un paiement n'est qu'une *lecture* de certains SMS.

Ce document décrit ce qu'est un SMS, ce qu'on en garde, et comment la
plateforme les présente.

## Ce qu'est un SMS (rappel technique)

Un SMS voyage en **PDU** (format défini par la norme 3GPP TS 23.040). Le
réseau (2G, 4G, 5G) ne change que le *transport* : la structure du message,
elle, est la même partout. Un SMS reçu (SMS-DELIVER) porte :

| Champ PDU | Sens | Ce qu'on en fait |
|-----------|------|------------------|
| TP-OA | L'expéditeur : un numéro, ou un nom court (« OrangeMoney », « MTN ») | `expediteur` |
| TP-SCTS | L'horodatage **du réseau** : quand le centre SMS a émis le message | `emis_le` |
| TP-DCS | L'encodage : GSM-7 (accents perdus) ou UCS2 (Unicode) | sert au décodage |
| TP-UDH | L'en-tête de découpe des longs messages (référence, position, total) | recollage |
| TP-UD | Le texte lui-même | `texte` |

Le robot lit les SMS en **mode PDU** (`AT+CMGL=4`), le seul qui livre
l'horodatage réseau et l'en-tête de découpe. Le mode texte n'est qu'un repli
quand le firmware du modem refuse le PDU.

Deux heures existent donc pour un SMS, et il faut les distinguer :

- **`emis_le`** — l'heure du réseau (TP-SCTS). C'est l'heure « vraie » du SMS.
- **`recu_le`** — l'heure où le Pi a relevé le message. Après une coupure, le
  Pi peut relever d'un coup des SMS vieux de plusieurs heures : les deux
  divergent alors, et c'est `emis_le` qui fait foi pour l'ordre des opérations.

## Ce qu'on garde de chaque SMS

Tout. Un SMS ne se jette jamais : le texte d'origine fait foi en cas de litige
avec un client. On garde donc, pour **chaque** SMS reçu :

- l'**expéditeur** (tel que le téléphone l'afficherait) ;
- le **texte complet**, intact ;
- la **SIM** qui l'a reçu (son ICCID) — c'est elle qui rattache l'argent au bon
  solde quand plusieurs cartes se succèdent ;
- `emis_le` (réseau) **et** `recu_le` (Pi) ;
- la **catégorie** détectée automatiquement (voir plus bas) ;
- quand le SMS est un mouvement d'argent, son **interprétation** : sens,
  montant, tiers, référence, solde, frais, commission… — jamais inventée, et
  toujours à côté du texte, jamais à sa place.

## Les catégories d'un SMS

Un SMS reçu par la SIM peut être bien des choses. La plateforme les range en
catégories, détectées à partir du texte (`analyse_sms.py`) :

| Catégorie | Exemple | Reçu possible |
|-----------|---------|---------------|
| `encaissement` | « Vous avez reçu 25 000 FCFA de … » | oui |
| `envoi` | « Vous avez envoyé 10 000 FCFA à … » | oui |
| `transfert` | « Transfert de X vers Y réussi » | oui |
| `depot` | « Dépôt vers … réussi » | oui |
| `retrait` | « Retrait de … » | oui |
| `solde` | « Le solde de votre compte est de … » | oui |
| `echec` | « Transfert … échoué », « Opération annulée » | non — rien ne s'est passé |
| `code` | « Le code de … est : 515318 » | non — pas de reçu, mais le SMS se lit en entier |
| `publicite` | « 2 millions à gagner avec Orange Money ! » | non |
| `illisible` | parle d'argent, mais le robot n'a pas tout compris | non — à classer à la main |
| `message` | un SMS de n'importe qui, sans rapport | non |
| `inconnu` | compris à moitié : on l'affiche tel quel | non |

La catégorie n'est qu'une **aide** : le SMS reste toujours lisible en entier,
quelle que soit sa catégorie — **codes compris**. On a un temps masqué les
codes à usage unique (`••••••`) « pour la forme » ; personne ne l'avait
demandé, c'était une faute, retirée. Le message du propriétaire, sur sa carte,
s'affiche tel qu'il est arrivé — dans la liste, sur la fiche, et jusque dans la
notification (voir `docs/MOBILE.md`).

Deux catégories disent une lecture qui n'a pas abouti, et c'est voulu :

- **`echec`** — l'opération n'a pas eu lieu (échouée, annulée, remboursée).
  Elle n'est comptée nulle part : ni alerte d'encaissement, ni bilan, ni
  reçu. Avant, un paiement annulé passait pour un encaissement partout sauf
  au moment du reçu, qui le refusait sans dire pourquoi.
- **`illisible`** — le message porte les marques d'une opération (un geste,
  des montants, des parties numérotées) mais le robot n'a pas su le lire en
  entier. Il le **dit**, plutôt que de se déguiser en solde ou en message
  quelconque : c'est la leçon du transfert vers « GARANTIE EXCHANGE SARL 3 »
  (août 2026), qu'un chiffre dans le nom du client faisait passer pour une
  interrogation de solde. Le robot le signale aussi sur Telegram, pour que
  le propriétaire l'apprenne le jour même — et le SMS peut être **classé à
  la main** sur la plateforme pour obtenir son reçu.

## Choisir la nature d'un SMS, et en tirer un reçu

Le robot devine la catégorie, mais **c'est le propriétaire qui décide**. Sur la
plateforme, un SMS peut être marqué à la main :

- **dépôt**, **retrait**, **transfert**, ou **solde**.

Ce choix (`nature`) l'emporte sur la catégorie devinée, et **déclenche la
fabrication d'un reçu PDF** adapté à cette nature. Le reçu n'est jamais stocké :
il se refabrique à l'identique à partir du SMS, qui est juste à côté et fait
foi. Ce qui compte, c'est de ne l'établir qu'une fois par SMS.

La fabrication passe par le canal de commandes (`commandes`) : la plateforme
dépose la demande, le robot de Douala l'exécute et archive le PDF dans le
stockage cloud, d'où il redevient téléchargeable de partout.

## Le module SMS de la plateforme

Une **boîte de réception**, comme la messagerie d'un téléphone :

- tous les SMS, du plus récent au plus ancien, groupés par jour (heure réseau) ;
- pour chacun : l'**expéditeur**, l'heure, une **pastille de catégorie**
  (💰 encaissement, ↗️ envoi, 🔁 transfert, 📥 dépôt, 📤 retrait, 📊 solde,
  ✖️ échec, 🔑 code, 📢 pub, ✉️ illisible, 💬 message) et, s'il y a lieu,
  le montant ;
- une **recherche** (nom, numéro, montant, texte) et un **filtre par
  catégorie** et par SIM ;
- en ouvrant un SMS : son texte complet, le choix de sa **nature**, et le
  **téléchargement du reçu** quand il en a un.

## Le modèle de données

La table cloud s'appelle `sms` (et non plus `paiements`) : c'est un SMS qu'on
stocke, pas un paiement. Les colonnes d'interprétation (montant, sens…) restent
présentes mais **facultatives** — nulles pour une pub ou un message perso.

```
sms(
  id, terminal, source_id,        -- identité, rejouable sans doublon
  carte,                          -- ICCID de la SIM réceptrice
  expediteur, texte,              -- l'essentiel, jamais jeté
  emis_le, recu_le,               -- heure réseau et heure Pi
  categorie,                      -- devinée : encaissement, pub, code, message…
  nature,                         -- choisie par le propriétaire (pour le reçu)
  sens, montant, tiers, numero,   -- interprétation, quand c'est un mouvement
  reference, solde_apres, frais, commission, montant_brut,
  lu,                             -- lu / non lu, comme une messagerie
  cree_le
)
```

Pendant la transition, une **vue** `paiements` continue de renvoyer les SMS qui
sont des mouvements d'argent : l'application actuelle ne casse pas le temps
qu'elle migre vers `sms`.
