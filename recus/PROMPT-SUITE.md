# Prompt de reprise — brancher les reçus PDF

À copier tel quel dans une nouvelle session Claude Code sur ce dépôt.

---

## Contexte

TOTEM héberge des SIM Mobile Money (Orange Money, MTN MoMo) sur un Raspberry
Pi 4 resté à Douala. Le propriétaire pilote tout depuis Telegram. Quand un SMS
arrive sur une carte, `totem/app.py` le lit, `totem/analyse_sms.py` l'analyse,
et une notification part sur Telegram.

**Ce que je veux :** que TOTEM joigne automatiquement un **reçu PDF** à cette
notification, une dizaine de secondes après le SMS. Un document propre,
présentable à un client, qui reprend ce que dit le SMS.

La **maquette est faite et validée**. Elle est dans `recus/` : lis d'abord
`recus/README.md`, qui contient le format exact des SMS Orange relevé sur de
vraies captures, le dessin retenu et les raisons de chaque choix. Les aperçus
sont dans `recus/apercus/`.

**Ne redessine pas les documents.** Le design est arrêté. Ton travail est de
faire fonctionner la chaîne.

---

## Étape 1 — réparer le parseur (bloquant)

Trois défauts sont documentés dans `recus/README.md`, vérifiés sur `main`.
Corrige-les dans `totem/analyse_sms.py`, avec les tests correspondants dans
`tests/test_analyse_sms.py`.

**1. Le SMS de transfert Orange n'est reconnu par rien.**

```
Transfert de 656483918 PRIX MONO SARL vers 696103864 WONDER PHONE reussi.
Details: ID transaction: PP260731.1319.B45805, Montant Transaction: 184137FCFA,
Frais: 0 FCFA, Commission: 0 FCFA, Montant Net: 184137 FCFA,
Nouveau Solde: 2784137.6 FCFA
```

`analyser()` renvoie `None` : les expressions cherchent le verbe `transfere`,
Orange écrit le nom `Transfert`. Il faut reconnaître cette forme et en extraire
**les deux parties avec numéro et nom**, l'ID de transaction, le montant
transaction, les frais, la commission et le **montant net** — qu'Orange fournit
lui-même, donc ne le recalcule pas.

Reste tolérant, comme le reste du fichier : les opérateurs changent leurs
formulations sans prévenir, et dans le doute il vaut mieux renvoyer `None` que
d'inventer un montant.

**2. Le solde est lu dix fois trop grand.**

`_nombre("2784137.6")` renvoie `27841376`. Le point est un séparateur de
milliers dans `1.250.000` mais une décimale dans `2784137.6`. Règle : trois
chiffres après le séparateur → milliers ; un ou deux → décimale. Attention,
`Paiement.montant` est aujourd'hui un entier — décide si tu passes en décimal
et vérifie ce que ça casse ailleurs (`storage.py`, les rapports, l'export CSV).

**3. Le SMS de code à usage unique n'est pas marqué sensible.**

```
Le code de 696103864 est: 515318.Orange Money vous remercie.
```

Il n'est heureusement pas pris pour un paiement, mais rien ne le signale comme
secret. Il ne doit **jamais** produire de reçu, ni être archivé en clair, ni
être relayé tel quel sur Telegram.

---

## Étape 2 — décider quels SMS produisent un reçu

Un reçu ne se déclenche que sur un fait comptable établi. La règle doit être
**explicite et testée**, pas implicite.

| SMS | Reçu ? |
|---|---|
| Transfert réussi (entrant ou sortant) | **oui** — reçu de transfert |
| Solde, après interrogation USSD | **oui** — reçu de solde |
| Transfert échoué / annulé / rejeté | non |
| Code à usage unique | **jamais** |
| Promotion, forfait, bonus, publicité | non |
| Message non compris (`analyser()` → `None`) | non |

En cas de doute, **pas de reçu** : le SMS reste consultable en clair sur
Telegram, comme aujourd'hui. Un reçu faux vaut moins que pas de reçu.

Il faut aussi décider du **sens** de l'opération. Le SMS nomme les deux parties
mais ne dit pas laquelle est nous. Il faut comparer aux numéros des cartes en
place — vois `totem/carte.py`, qui porte déjà l'identité des SIM. Si le numéro
propre n'est pas connu, dis-le plutôt que de deviner : le libellé « Montant
reçu » devient faux si le sens est inversé.

Enfin, **pas de doublon** : un même SMS ne doit produire qu'un reçu, même si le
modem le relit après un redémarrage. L'ID de transaction est un bon garde-fou.

---

## Étape 3 — fabriquer le PDF

La maquette actuelle (`recus/maquette.mjs`) passe par Chromium. **Sur un Pi 4,
c'est trop lourd** pour un PDF par transaction.

Étudie le passage à un générateur PDF en **Python pur**, cohérent avec le reste
du projet (seule dépendance réelle aujourd'hui : `pyserial`). Le dessin ne doit
pas changer : reporte-toi aux aperçus.

Deux points qui ont demandé du travail et qu'il ne faut pas perdre :

- **Le séparateur de milliers.** Une espace garde la même chasse quelle que
  soit la taille du texte : à 74 pt, `2 784 137` se lit `2784137`. La maquette
  n'utilise donc aucune espace, mais un écart proportionnel au corps. Reproduis
  ce comportement.
- **Le logo.** Le symbole « La Tresse » est décrit une seule fois dans
  `brand/generer.py`. Ne le redessine pas, réutilise ce tracé.

Si tu conclus qu'un générateur Python pur coûte trop cher, dis-le et propose
autre chose — mais mesure d'abord, ne suppose pas.

---

## Étape 4 — envoyer le reçu

Le PDF part **sur Telegram**, en pièce jointe à la notification du SMS.
`totem/telegram.py` sait déjà envoyer des fichiers.

Contraintes :

- **Hors ligne d'abord.** Le lien de Douala tombe. Si l'envoi échoue, le reçu
  doit être mis en file d'attente et repartir tout seul — regarde comment
  `totem/nuage.py` gère déjà ce cas, et fais pareil plutôt qu'autrement.
- **Le PDF ne bloque pas la notification.** Le message Telegram doit partir
  immédiatement ; le reçu suit quelques secondes après. Un échec de génération
  ne doit jamais faire perdre l'alerte.
- **Où sont stockés les PDF**, et pendant combien de temps ? La carte SD du Pi
  n'est pas grande. Propose une règle.

Le propriétaire a évoqué **l'envoi par courriel** en plus de Telegram.
Traite-le comme une option à part, après que Telegram fonctionne — ne
l'implémente pas tant que le reste n'est pas en place.

---

## Étape 5 — les tests

Le dépôt a 166 tests qui passent. Ajoute au moins :

- l'analyse du vrai SMS de transfert, champ par champ ;
- `2784137.6` lu comme 2 784 137,6 et non 27 841 376 ;
- le SMS de code : aucun reçu, aucun archivage en clair ;
- un SMS incompris : aucun reçu ;
- le même SMS traité deux fois : un seul reçu ;
- le formatage des montants : `0`, `184137`, `2784137.6`, `999.5`.

---

## Ce qu'on ne sait pas encore

- **MTN.** Format des SMS inconnu. On ignore même si l'expéditeur y figure.
  Ne code rien pour MTN à l'aveugle ; prévois seulement que ça viendra.
- **Un transfert sortant Orange.** On n'en a pas encore vu. Le format est
  probablement le même, ce n'est pas vérifié.
- **Le code USSD du solde.** `#150*1#` a été mis au jugé dans la maquette, il
  n'est pas confirmé.
- **Le format du document.** L'A3 paysage est validé, mais il est lourd pour
  WhatsApp. Un petit format se décline sans rien changer d'autre que l'échelle.
  À voir avec le propriétaire.

Sur ces quatre points : **demande plutôt que de supposer.**

---

## Comment travailler

- Le dépôt est **en français** — code, commentaires, commits, documentation.
  Tiens ce registre : on nomme l'objet, pas la technique.
- Fais les choses **dans l'ordre** : sans l'étape 1, rien ne se déclenche.
- **Montre ce qui marche** : après l'étape 1, fais tourner l'analyse sur le
  vrai SMS et affiche le résultat avant d'aller plus loin.
- Si un choix engage le produit (le sens d'une opération, la durée de
  conservation des PDF, le passage des montants en décimal), **pose la question
  au lieu de trancher seul.**
