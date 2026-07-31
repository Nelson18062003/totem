# recus/ — les reçus PDF

État : **maquette validée, génération non branchée.**

Quand un SMS Mobile Money arrive sur une carte, TOTEM le lit, le comprend, et
prévient sur Telegram. L'étape suivante est de joindre un **reçu PDF** au
message — un document propre, présentable à un client, qui reprend ce que dit
le SMS.

Ce dossier contient la maquette de ces documents. Elle a été dessinée sur de
**vrais SMS Orange Money**, pas sur des exemples inventés.

```sh
node recus/maquette.mjs      # écrit apercus/recu-transfert.pdf et recu-solde.pdf
```

Le script télécharge DM Sans lui-même et l'incruste dans le PDF : le fichier
produit ne dépend d'aucune police installée sur la machine qui l'ouvre.

---

## Les deux documents

| Document | Déclencheur |
|---|---|
| **Reçu de transfert** | un SMS d'opération réussie |
| **Reçu de solde** | un SMS de solde, après une interrogation USSD |

Aperçus dans [`apercus/`](apercus/). Format actuel : **A3 paysage**.

---

## Le format réel des SMS Orange Money

Relevé sur les captures du propriétaire, juillet 2026.

### Transfert

```
Transfert de 656483918 PRIX MONO SARL vers 696103864 WONDER PHONE reussi.
Details: ID transaction: PP260731.1319.B45805, Montant Transaction: 184137FCFA,
Frais: 0 FCFA, Commission: 0 FCFA, Montant Net: 184137 FCFA,
Nouveau Solde: 2784137.6 FCFA
```

Ce que ça donne :

| Champ | Valeur |
|---|---|
| Expéditeur | `656483918` · PRIX MONO SARL |
| Bénéficiaire | `696103864` · WONDER PHONE |
| ID transaction | `PP260731.1319.B45805` |
| Montant Transaction | 184 137 |
| Frais | 0 |
| Commission | 0 |
| **Montant Net** | **184 137** |
| Nouveau Solde | 2 784 137,6 |

Trois choses à retenir :

- **Les deux parties sont nommées**, avec numéro *et* nom. C'est bien plus
  riche que ce que le parseur cherche aujourd'hui.
- **Orange fournit lui-même le « Montant Net ».** On ne le recalcule pas.
- **L'ID encode la date** : `PP` + `260731` (31/07/26) + `1319` (13 h 19) +
  code. Hypothèse cohérente sur l'échantillon, à confirmer.

### Solde

```
Le solde de votre compte est de 2784137.6FCFA.
```

Ni référence, ni horodatage. La seule date honnête est celle de **réception du
SMS** par le terminal.

### Code à usage unique — à ne jamais traiter

```
Le code de 696103864 est: 515318.Orange Money vous remercie.
```

---

## Trois défauts du code actuel, à corriger avant de brancher

Vérifiés sur `main`, avec `totem/analyse_sms.py`.

### 1. Bloquant — le SMS de transfert n'est pas reconnu

```python
>>> analyser("Transfert de 656483918 PRIX MONO SARL vers 696103864 …")
None
```

`RE_ENVOYE` cherche le verbe `transfere` ; Orange écrit le nom **`Transfert`**.
Aucune des deux expressions ne matche. Ces transferts ne deviennent donc pas
des paiements structurés — **rien ne peut déclencher un reçu tant que ce n'est
pas réparé.**

### 2. Le solde est lu dix fois trop grand

```python
>>> _nombre("2784137.6")
27841376        # attendu : 2784137,6
```

`_nombre()` retire tous les caractères non chiffrés. Le point est un séparateur
de milliers dans `1.250.000`, mais une **décimale** dans `2784137.6`. Règle à
appliquer : trois chiffres après le séparateur → milliers ; un ou deux →
décimale.

### 3. Le SMS de code n'est pas marqué sensible

`analyser()` renvoie bien `None` — il n'est pas pris pour un paiement, tant
mieux. Mais il échappe aussi à `RE_BRUIT` : rien ne le signale comme **code à
usage unique**. Il ne devrait ni être archivé en clair, ni relayé tel quel.

---

## Le dessin, et pourquoi

### Trois zones

1. **Qui émet** — logo, type de document, numéro de reçu. Un filet fin ferme
   l'en-tête.
2. **Ce qui s'est passé** — le montant en gros, puis `DE` et `À`, alignés sur
   la même ligne de base. La transaction se lit d'un seul balayage.
3. **Les preuves** — un bandeau sable qui regroupe ID, date, montants, frais,
   commission. Un aplat, pas un trait : ça groupe sans faire de barre.

### Les montants

C'est le point qui a demandé le plus de reprises.

Une **espace**, même insécable, garde toujours la même chasse quelle que soit
la taille du texte. À 74 pt, une espace prévue pour du corps 10 pt devient un
cheveu : `2 784 137` se lit `2784137`.

`maquette.mjs` n'utilise donc **aucune espace** comme séparateur. Chaque tranche
de trois chiffres est un élément à part, et l'écart est une **marge en `em`** —
proportionnelle au corps, identique partout.

| Entrée | Sortie |
|---|---|
| `0` | 0 |
| `184137` | 184 137 |
| `2784137.6` | 2 784 137,6 |
| `999.5` | 999,5 |

Les décimales ne s'affichent que si elles disent quelque chose.

### Deux montants, un seul en gros

Le SMS en porte deux. **Montant Net** en gros — ce qui a réellement changé de
main. **Montant Transaction** dans le bandeau, à côté des frais et de la
commission, pour que la chaîne reste vérifiable. Le même chiffre ne s'affiche
jamais deux fois en grand.

### Ce qu'on n'a pas mis, et pourquoi

- **Le nouveau solde.** Un reçu part chez un tiers : il n'a pas à y lire la
  caisse.
- **Le logo d'Orange.** Le document est établi par TOTEM *à partir* du SMS ; il
  n'émane pas d'Orange. Y mettre leur logo le ferait passer pour une pièce
  officielle de l'opérateur, ce qu'il n'est pas. « Orange Money » apparaît
  uniquement comme mention factuelle du réseau.
- **Le SMS reproduit, les mentions légales, les pastilles de sens.** Testés,
  puis retirés : trop de bruit pour un reçu.

Le mot **« Maquette »** en pied de page saute en production.

---

## Ce qui reste à décider

- **Le format.** L'A3 paysage fait 42 × 30 cm : parfait à l'écran, lourd pour
  WhatsApp. Le même gabarit se décline en petit format, seules les tailles
  changent.
- **Le sens.** La maquette montre un encaissement. Pour un envoi, il faut
  savoir de quel côté est la carte TOTEM — donc connaître son propre numéro et
  le comparer à ceux du SMS.
- **La fabrication.** Cette maquette passe par Chromium. Sur un Pi 4, c'est
  lourd pour un PDF par transaction : un générateur PDF en Python pur serait
  plus sage. Le dessin ne changerait pas, seulement la mécanique.
- **MTN.** Format inconnu à ce jour. On ignore même si l'expéditeur y figure.
