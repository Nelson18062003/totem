# recus/ — les reçus PDF

État : **maquette validée, génération branchée.**

Le robot fabrique et joint ces documents tout seul depuis `totem/recu.py`,
qui transcrit la maquette sans passer par un navigateur. Ce dossier reste la
**référence du dessin** : c'est ici qu'on vient vérifier à quoi un reçu doit
ressembler.

Quand un SMS Mobile Money arrive sur une carte, TOTEM le lit, le comprend, et
prévient sur Telegram. Une dizaine de secondes plus tard, il joint un **reçu
PDF** au message — un document propre, présentable à un client, qui reprend ce
que dit le SMS.

Ce dossier contient la maquette de ces documents. Elle a été dessinée sur de
**vrais SMS Orange Money**, pas sur des exemples inventés.

```sh
node recus/maquette.mjs      # la maquette de référence (Chromium)
```

Le script télécharge DM Sans lui-même et l'incruste dans le PDF : le fichier
produit ne dépend d'aucune police installée sur la machine qui l'ouvre. C'est
aussi ce que fait `totem/recu.py`, qui embarque la même police depuis
`totem/polices/`.

---

## Les deux documents

| Document | Déclencheur |
|---|---|
| **Reçu de transfert** | un SMS d'opération réussie |
| **Reçu de solde** | la réponse de l'opérateur à une interrogation de solde |

Le solde ne passe **pas** par un SMS : l'opérateur l'affiche dans la session
USSD, et nulle part ailleurs. Le déclencheur est donc la réponse elle-même —
celle qui clôt le parcours, pas les menus qui y mènent. Un écran d'options
numérotées ou une question (« Entrez le montant ») ne produit rien : il ne
s'est encore rien passé.

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

## Trois défauts du code, corrigés

Relevés sur `main`, puis réparés dans `totem/analyse_sms.py`. Chacun a son
test dans `tests/test_analyse_sms.py`.

### 1. Bloquant — le SMS de transfert n'était pas reconnu ✅

```python
>>> analyser("Transfert de 656483918 PRIX MONO SARL vers 696103864 …")
None
```

`RE_ENVOYE` cherchait le verbe `transfere` ; Orange écrit le nom
**`Transfert`**. Aucune des deux expressions ne matchait, et **rien ne pouvait
déclencher un reçu**.

`RE_TRANSFERT` reconnaît maintenant cette forme et en tire les deux parties
avec numéro *et* nom, l'ID de transaction, le montant transaction, les frais,
la commission et le montant net. Le mot de réussite est **exigé** : un
transfert échoué ne devient pas un paiement.

### 2. Le solde était lu dix fois trop grand ✅

```python
>>> _nombre("2784137.6")
27841376        # attendu : 2784137,6
```

`_nombre()` retirait tous les caractères non chiffrés. Le point est un
séparateur de milliers dans `1.250.000`, mais une **décimale** dans
`2784137.6`. La règle appliquée : trois chiffres après le dernier séparateur →
milliers ; un ou deux → décimale.

Un montant rond reste un entier, donc le bilan quotidien, l'export CSV et le
cloud voient exactement ce qu'ils voyaient. Côté Supabase, les colonnes de
montant passent de `bigint` à `numeric` — un solde à la décimale aurait été
refusé.

### 3. Le SMS de code n'était pas marqué sensible ✅

`analyser()` renvoyait bien `None` — il n'était pas pris pour un paiement,
tant mieux. Mais rien ne le signalait comme **code à usage unique**.

`code_a_usage_unique()` le reconnaît, `masquer_secrets()` remplace le code par
des points, et le robot applique ce masque **avant** le journal, la sauvegarde
et Telegram. Le verdict s'appuie sur celui d'`analyser()` : un encaissement qui
mentionne un « code marchand » reste lisible en entier.

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

## Ce qui a été décidé

- **Le format** reste l'**A3 paysage**, tel que validé.
- **Le sens** se lit dans la configuration. La section `[numeros]` de
  `totem.conf` porte le numéro de chaque puce ; `preciser_sens()` compare et
  tranche. Sans déclaration, l'étiquette devient « Montant net » — vraie dans
  les deux sens — au lieu d'un « Montant reçu » qui pourrait être un envoi.
- **La fabrication** ne passe plus par Chromium. `totem/pdf.py` écrit le PDF
  directement, polices TrueType embarquées comprises : **9 ms** pour une page
  contre 2,5 s pour deux avec un navigateur, et rien de plus à installer sur
  le Pi. Mesuré, pas supposé.
- **La conservation.** Aucun PDF ne reste sur la carte SD. Il est fabriqué en
  mémoire, envoyé sur Telegram, déposé dans le stockage Supabase, et se
  refabrique à l'identique depuis son SMS si besoin.

## Ce qui reste ouvert

- **MTN.** Format inconnu à ce jour. On ignore même si l'expéditeur y figure.
  Rien n'a été codé à l'aveugle : le jour où un SMS MTN sera relevé, il
  s'ajoutera comme la forme d'Orange s'est ajoutée.
- **Un transfert sortant Orange.** Jamais observé. Le format est probablement
  le même, ce n'est toujours pas vérifié.
- **Le code USSD du solde.** `#150*1#` reste au jugé.
