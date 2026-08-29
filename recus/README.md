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
**vrais SMS** — Orange Money d'abord, MTN MoMo ensuite —, jamais sur des
exemples inventés. Les deux réseaux ne disent pas les mêmes choses, et le
document s'adapte à ce que chacun donne.

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

Aperçus dans [`apercus/`](apercus/) — un jeu par réseau, dans les deux
langues. Format actuel : **A3 paysage**.

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

## Le format réel des SMS MTN MoMo

Relevé sur les captures du propriétaire, août 2026. **MTN ne parle pas comme
Orange**, et c'est ce qui a cassé les premiers reçus.

### Transfert sortant

```
You have transferred 200000 XAF to PAYSELA TECHNOLOGIES SARL (237681026861)
from your mobile money account 93368555 at 2026-08-25 13:55:27 FEES 0 FCFA.
Your new balance: 1308910 XAF. Message from sender: . Message to receiver: .
Financial Transaction Id: 18496208804. Back-to-School is Here...
```

### Encaissement

```
You have received 10000 XAF from BABY FRANCIS NOUBI TCHASSEM (237678352223)
on your mobile money account at 2026-07-08 11:30:58. Message from sender: .
Your new balance:89255 XAF. Financial Transaction Id: 17848350682.
```

Quatre différences avec Orange, toutes structurantes :

| | Orange | MTN |
|---|---|---|
| Parties nommées | **les deux** | **une seule** — l'autre, c'est nous |
| Horodatage | absent | **écrit par le réseau** |
| Frais | Frais *et* Commission | **FEES seul**, jamais de commission |
| Numéros | locaux (`696103864`) | internationaux (`237681026861`) |

**Une seule partie nommée : le sens décide de son côté.** MTN écrit « to
PAYSELA… from your mobile money account » ou « from BABY FRANCIS… on your
mobile money account ». Le tiers cité est le destinataire dans un cas,
l'expéditeur dans l'autre. La règle qui mettait ce tiers unique en « De » quel
que soit le sens produisait, sur un envoi, un reçu qui **disait le contraire
de l'opération** : le bénéficiaire en émetteur, et « À » vide. Notre côté
vient des Réglages (le nom et le numéro inscrits pour la carte) ; s'il manque,
la colonne reste vide — mais du bon côté.

**L'horodatage du réseau prime, et se recopie À LA SECONDE.** C'est l'instant
qui figurera sur le relevé de MTN : le reçu le porte entier — « 13:55:27 »,
« 13 h 55 min 27 s ». Le terminal peut avoir reçu le SMS une minute plus tard,
ou l'avoir relu après une coupure. Quand le SMS se tait — Orange — l'heure de
réception reste la seule honnête, et elle s'arrête à la minute : la seconde où
un message est arrivé ne prouve rien, et l'afficher ferait croire à une
exactitude qu'on n'a pas.

**Les colonnes suivent l'opérateur.** Le bandeau des preuves ne montre que ce
que le réseau a dit : trois colonnes pour un transfert MTN, cinq pour un
Orange détaillé. Une colonne « Commission » vide vaudrait moins que pas de
colonne.

### Réclame en fin de message

MTN accroche sa publicité à la fin des SMS d'opération (« Back-to-School is
Here… », « Dial \*126\*6# »). Elle est ignorée : le rejet du bruit ne
s'applique qu'à la lecture simple d'un verbe et d'un montant, jamais aux
champs étiquetés d'une opération complète.

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
  caisse. MTN l'écrit pourtant à chaque message (« Your new balance: 1308910
  XAF »), et il serait facile de le reprendre — raison de plus pour que la
  règle soit écrite ici et gardée par un test.
- **Une approximation du logo.** Ce qui figure en tête est le **vrai logo**
  de l'opérateur — le carré au mot blanc d'Orange, l'ovale au sigle de MTN
  (charte 2022) — décrit une seule fois dans
  `brand/marques-operateurs.json`, en tracés relevés des fichiers publiés.
  Le robot les lit (`totem/marques.py`), la maquette aussi, et la plateforme
  en garde une copie que garde un test : deux logos qui divergent, c'est un
  reçu qui ne ressemble plus à l'écran. Rien n'est téléchargé à l'affichage.

  Le logo est **seul** : écrire « MTN MoMo » à côté du logo de MTN revenait à
  légender un logo. Un réseau se reconnaît, il ne se lit pas. Il était en bas
  de page, haut de onze points ; il monte en tête à trente-quatre, parce que
  sur un reçu qu'on tend à un client, le réseau est la première chose qu'on
  cherche. Un opérateur dont la marque n'est pas connue garde son nom écrit —
  mieux vaut un mot qu'un blanc, et on ne lui prête pas le logo d'un autre.

  C'est une marque de TIERS : elle dit factuellement de quel réseau vient
  l'opération, jamais que le document émane de l'opérateur. L'émetteur reste
  TOTEM, seul, à gauche.
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

- **Un transfert sortant Orange.** Jamais observé. Le format est probablement
  le même, ce n'est toujours pas vérifié.
- **Le code USSD du solde.** `#150*1#` reste au jugé.
