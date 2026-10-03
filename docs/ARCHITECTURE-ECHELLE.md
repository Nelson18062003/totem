# TOTEM à grande échelle — ce qui tient, ce qui reste à bâtir

*Établi le 2 octobre 2026. Point de départ : deux personnes, deux cartes, le
même boîtier — et la seconde lisait « une autre opération est en cours sur le
terminal, sur une autre carte ».*

Ce refus n'était pas une panne isolée. C'était le symptôme d'une hypothèse
posée partout dans TOTEM depuis le premier jour : **il n'y en a qu'un**. Un
seul boîtier, un seul propriétaire, une seule session, un seul fil, une seule
caisse. `CARTE-DU-SYSTEME.md` l'écrit noir sur blanc : « une seule caisse, un
seul propriétaire ». Tant que c'était vrai, c'était juste. Le but est
maintenant d'avoir des milliers de boutiques, des milliers de boîtiers, des
dizaines de milliers de cartes.

Ce document fait l'inventaire de ces hypothèses, étage par étage, avec la
preuve dans le code, l'échelle à laquelle chacune casse, et la fondation qui
la remplace. Les deux premiers étages sont **construits et éprouvés**. Les
suivants sont **conçus** ; deux d'entre eux attendent une décision du
propriétaire.

**Le principe qui guide tout le reste** est déjà celui du dépôt : *une
vérification faite avant une écriture ne garantit rien ; seule tient une règle
imposée à l'endroit même où l'on écrit.* On l'a appliqué à la base
(le propriétaire unique, le frein). On l'applique ici au modem, à l'adressage,
et on l'appliquera aux boutiques.

---

## La limite qui ne se discute pas

**Une carte SIM ne tient qu'un menu USSD à la fois.** C'est une règle du
réseau, pas du robot. Une opération (solde, transfert) dure de 5 à 30
secondes ; une carte fait donc, au mieux, deux à six opérations par minute.

On ne rend pas une carte plus rapide. **On passe à l'échelle en ajoutant des
cartes, et en faisant en sorte qu'elles ne s'attendent JAMAIS les unes les
autres.** C'est exactement ce qui manquait : elles s'attendaient partout —
dans le robot, entre les boîtiers, dans la base.

Deux personnes sur la **même** carte attendront toujours leur tour. C'est
juste, et l'écran le dit maintenant en ces termes : « Quelqu'un d'autre
utilise cette carte en ce moment (une carte ne tient qu'un menu USSD à la
fois). Réessayez dans un instant. »

---

## Étage 1 — Dans le boîtier : un poste par carte ✅ construit

### Ce qui était

| Hypothèse | Preuve | Ce qui cassait |
|---|---|---|
| Une seule session web pour tout le boîtier | `pilotage.py`, ancien `self._session` | **Dès 2 personnes** : la seconde refusée, sur un modem libre |
| Un seul fil pour toutes les demandes web | `pilotage.py`, ancienne `_boucle` | La consultation de l'un faisait attendre l'opération de l'autre, plusieurs secondes |
| Un seul fil pour relever les SMS de toutes les cartes | `app.py`, `_tour_de_surveillance` | Une carte en menu USSD (jusqu'à 30 s) retardait les encaissements de **toutes** les autres |
| Trois registres pour dire qui tient le menu d'une carte | `pilotage._session`, `Robot.session_compte`, `Compte.session_ouverte`, synchronisés par `ceder()` | Une réponse — peut-être un code secret — pouvait tomber dans le menu d'un autre |
| « Le web » comme un seul titulaire | `pilotage.py` | **Deux personnes sur la même carte** : la seconde remplaçait le menu de la première |
| Telegram raccrochait la carte courante, quelle que soit la personne qui la tenait | `app.py`, `_annuler` | Un transfert mené depuis la plateforme coupé au moment du code secret |

### Ce qui est

- **La carte sait qui tient son menu** (`compte.py`, `titulaire`) : une
  *personne* (« c:12 »), pas un canal. Elle le vérifie **sous le verrou de son
  modem, au moment d'écrire**, et refuse (`SessionTenue`) la réponse de
  quelqu'un d'autre. Aucun registre ailleurs ne peut plus la contredire.
- **Dans le doute, personne ne répond** : un échange qui échoue laisse le menu
  sans titulaire ; la réponse suivante se recompose.
- **Une file de demandes par carte** (`pilotage.py`) : l'ordre est tenu dans
  une carte, rien ne lie deux cartes.
- **Un poste par carte** (`app.py`, `_poste`) : chaque carte relève ses SMS et
  relit sa puce dans son propre fil.

### La preuve

- `tests/test_titulaire.py` : huit personnes tapent **en rafale** sur la même
  carte, Telegram reprend la main au milieu, pendant 2 400 gestes. Le modem
  note qui tenait le menu à chaque écriture : **aucune réponse chez un autre**.
  Le témoin — l'ancienne façon, « vérifier puis écrire » — **cède** dans la
  même rafale. Règle aveuglée : cinq essais tombent.
- `tests/test_postes.py` : la carte Orange est tenue occupée trois secondes ;
  l'encaissement MTN est relevé en moins d'une seconde et demie. Le témoin à
  un seul fil, lui, reste planté devant l'Orange.

---

## Étage 2 — Entre les boîtiers : l'adressage ✅ construit

### Ce qui était

Une demande partait au terminal « le dernier à avoir donné signe de vie »
(`web/lib/serveur.ts`, `terminalVise`). **Dès deux boîtiers**, un transfert
sur une carte de Douala partait au boîtier d'Akwa, qui ne l'a pas.

### Ce qui est

**Une demande vise une carte, pas un boîtier.** Elle part au terminal qui a vu
la carte en dernier (`terminalDeLaCarte`, d'après `cartes.derniere_vue`,
rafraîchie à chaque relecture des puces). Une carte que personne ne porte
depuis dix minutes est refusée sur-le-champ, en clair, au lieu d'attendre cinq
minutes un abandon. Une carte déplacée d'un boîtier à l'autre suit d'elle-même.

La plateforme joint aussi **la personne** qui demande (le sujet de la session)
— elle le pose elle-même, jamais repris de l'écran.

L'application d'hier (1.0.0) ne nomme pas la carte dans ses réponses. Sa
réponse prend la carte de **la dernière ouverture de la même personne** —
plus « la dernière ouverture du terminal », qui, avec un menu par carte et
par personne, peut être celle de quelqu'un d'autre.

### La preuve

`web/scripts/verifier-l-adressage.mjs` monte une flotte dans le faux nuage :
deux boîtiers, celui qui n'a pas la carte ayant parlé le dernier, et une carte
retirée. L'ancienne route y échoue **neuf fois** ; la nouvelle passe.

### Ce qui reste à cet étage

- Les demandes **sans carte** (« actualiser », un bouton du carnet) gardent
  l'ancien chemin. « Actualiser » devrait partir à chaque boîtier qui porte une
  carte de la personne ; le carnet des boutons, à chaque boîtier qui porte une
  carte de cet opérateur.
- L'écran n'affiche qu'**un** terminal (`chargerTerminal`, `limit=1`). Il faut
  un écran de flotte — la console en a le début.
- Les boutons appris sont rangés **par boîtier** mais lus **tous ensemble**
  (`raccourcis?select=*`) : deux boîtiers, deux exemplaires de chaque bouton.
  Ils appartiennent à l'**opérateur**, pas au boîtier.

---

## Étage 3 — Dans la base : les boutiques 🔶 à décider, puis à bâtir

C'est l'étage le plus lourd, et le plus important. **Aujourd'hui, TOTEM est
une seule caisse.**

| Hypothèse | Preuve |
|---|---|
| Un seul propriétaire pour toute la plateforme | `sql/schema.sql`, index `utilisateurs_un_seul_proprietaire` |
| Le propriétaire voit tout l'argent | `web/lib/portee.ts`, `porteeDuCompte` : `proprietaire` → `TOUT` |
| La première inscription crée LE propriétaire, puis la porte se ferme | `docs/COMPTES.md`, `api/inscription` |
| Un téléphone sans compte est celui du propriétaire, et sonne pour tout | `totem/nuage.py`, `appareils()` |
| Le robot lit les téléphones de **toute** la base pour en faire sonner | `nuage.py`, `appareils?select=jeton,utilisateur&limit=100` |
| Les reçus se chargent sans filtre, 1 000 à la fois, puis se trient | `serveur.ts`, `recus?select=*&order=etabli_le.desc` |

Avec deux boutiques indépendantes sur la même plateforme, la seconde ne peut
**pas s'inscrire** (la porte est fermée), et si on l'y faisait entrer comme
« propriétaire », elle verrait l'argent de la première.

### La fondation proposée

**La caisse appartient à la CARTE, pas au boîtier.** C'est déjà vrai dans les
données : un paiement porte sa carte (`paiements.carte`), une personne voit
les cartes qu'on lui confie (`attributions`). Il manque l'étage du dessus.

```
  boutique ──< membres (personne, rôle : patron / vendeur)
     │
     └──< cartes de la boutique (ICCID)  ──< paiements, reçus, soldes,
                                            bénéficiaires, demandes
  boîtier ── héberge des cartes, de UNE ou de PLUSIEURS boutiques
```

- Une table `boutiques` ; chaque personne est **membre** d'une boutique, avec
  un rôle. **Un patron par boutique** — la règle unique devient
  `unique (boutique) where role = 'patron'`, tenue par la base comme
  aujourd'hui.
- Une carte appartient à **une** boutique (`cartes_de_boutique (iccid →
  boutique)`). Tout ce que la plateforme lit se filtre par les cartes de la
  boutique — dans la base, **et** revérifié ligne par ligne, comme la portée
  d'aujourd'hui.
- Le « propriétaire » d'aujourd'hui se dédouble : le **patron** d'une boutique
  (voit SES cartes), et **l'exploitant de TOTEM** (la console : la flotte, les
  versions, les alertes — jamais l'argent d'une boutique).
- Les téléphones à faire sonner se cherchent **par carte** (membres de la
  boutique de la carte), plus jamais dans toute la base.

### La décision qu'il faut au propriétaire

Le modèle de données dépend d'une question commerciale :

1. **Chaque boutique a son boîtier** (elle achète ou loue un Raspberry Pi,
   ses SIM sont dedans, chez elle). Un boîtier = une boutique.
2. **Les boîtiers sont à TOTEM** et hébergent les SIM de plusieurs clients
   (une baie de cartes à Douala, les clients déposent leurs SIM). Un boîtier =
   plusieurs boutiques.

Le modèle ci-dessus tient les deux, parce qu'il rattache la caisse à la carte.
Mais la confiance (étage 4) et l'installation ne sont pas les mêmes : dans le
cas 2, un boîtier porte l'argent de plusieurs clients, et sa clé vaut
d'autant plus.

### Comment on le prouvera

Comme `verifier-les-cartes`, mais entre deux boutiques : deux patrons
s'inscrivent, chacun voit SES cartes et rien de l'autre — par l'application,
les pages, le bilan, la pastille, un reçu deviné, un lien signé réécrit, une
notification. Et `verifier-les-regles.sh` essaie de créer deux patrons dans la
même boutique.

---

## Étage 4 — La confiance : une clé par boîtier 🔶 à bâtir

Chaque Raspberry Pi porte **la clé maîtresse** de la base (`totem.conf`,
`[cloud] cle`), qui contourne toutes les règles (`CARTE-DU-SYSTEME.md`, F3 :
« un Pi compromis écrit ce qu'il veut dans le grand livre »).

Avec un boîtier, c'est un risque. Avec mille boîtiers posés dans mille
boutiques, c'est une certitude : **une seule carte mémoire volée ouvre l'argent
de toutes les boutiques**, et la seule parade est de changer la clé… sur les
mille boîtiers à la fois.

### La fondation proposée

Le boîtier ne parle plus à la base. Il parle à **un guichet des terminaux** sur
la plateforme (`/api/terminal/...`), avec **sa propre clé** :

- la plateforme n'en garde que l'empreinte, dans `terminaux` ;
- elle ne lui permet que ce qu'un boîtier fait : écrire SES SMS, SES cartes,
  SON état ; lire SES demandes ;
- elle se retire **pour ce boîtier seul**, depuis la console.

C'est le même choix que pour les téléphones aujourd'hui : *ni le navigateur ni
le téléphone ne parlent jamais à Supabase directement*. Le boîtier les rejoint.
La base garde sa règle actuelle — aucune porte, sauf la clé de service, qui ne
vit plus que sur la plateforme.

---

## Étage 5 — Le canal : prévenir au lieu de demander 🔶 à bâtir

Aujourd'hui, tout le monde **demande** : le boîtier demande « du travail ? »
toutes les 3 secondes (`pilotage.py`, `PAS_REPOS`), chaque onglet ouvert
demande « du neuf ? » toutes les 5 secondes (`web/app/veille.tsx`), chaque
écran qui attend une réponse USSD demande toutes les 1,2 seconde.

| | 1 boîtier | 1 000 boîtiers | 10 000 boîtiers |
|---|---|---|---|
| « Du travail ? » (au repos) | 0,3 req/s | 333 req/s | **3 333 req/s** |
| Signe de vie, état des cartes, boutons (chaque minute) | 0,05 req/s | 50 req/s | 500 req/s |

À 10 000 boîtiers, plus de 3 000 requêtes par seconde arrivent sur la base
pour entendre « rien ». C'est la base qui tombe, pas le réseau.

### La fondation proposée

Chaque boîtier tient **une connexion ouverte** vers le guichet des terminaux
(l'étage 4), et la demande lui est **poussée** quand elle arrive — en une
fraction de seconde au lieu de trois. Une relève lente (toutes les 30 à 60
secondes) reste en secours, parce qu'à Douala une connexion ouverte se coupe :
rien ne doit dépendre d'elle seule. L'écran qui attend une réponse USSD
l'attend de la même façon.

La réclamation conditionnelle d'aujourd'hui (`nuage.reclamer`) reste : c'est
elle qui garantit qu'une demande poussée deux fois n'est composée qu'une fois.

---

## Étage 6 — Le volume 🔶 à bâtir

- `paiements` grandit sans fin. À 10 000 cartes × 40 SMS/jour, c'est
  **146 millions de lignes par an**. Découpage par mois, et des index qui
  commencent par ce que la plateforme filtre réellement — la carte, puis la
  date (`paiements_carte_idx` commence par le *terminal*, alors que la portée
  filtre par *carte*).
- `commandes` et `evenements` ne se purgent jamais.
- Le bilan et les compteurs se calculent en relisant les lignes ; à cette
  échelle ils doivent se tenir à jour (des totaux par carte et par jour).

---

## Ce que Telegram devient

Un robot = un bot Telegram = une session à la fois, un verrou global
(`app.py`, `self.verrou`). C'est juste pour **l'administrateur d'un boîtier**.
Ce n'est pas un guichet pour des milliers de clients : à l'échelle, les
boutiques passent par l'application, et Telegram reste l'outil de
l'exploitant. Il respecte déjà la règle de l'étage 1 : il ne raccroche plus le
menu de quelqu'un d'autre.

---

## À vérifier avant d'aller loin

Automatiser l'USSD sur des milliers de SIM n'est pas neutre pour les
opérateurs. **À vérifier auprès de MTN et d'Orange Cameroun, pas à deviner** :
leurs règles sur l'usage automatisé des lignes Mobile Money, les plafonds par
carte, et le risque qu'une carte trop active soit suspendue. Pour les très
gros volumes, les opérateurs proposent des interfaces officielles (MTN MoMo,
Orange Money). L'architecture doit le permettre : le **guichet d'une carte**
(composer, répondre, raccrocher) est une seule interface — `Compte` — derrière
laquelle on peut un jour mettre autre chose qu'un modem.

---

## L'ordre de construction

1. ✅ Le poste par carte, et la règle du menu tenue par la carte.
2. ✅ L'adressage par carte.
3. **Les boutiques** — après la décision commerciale ci-dessus.
4. **Une clé par boîtier** — indispensable avant le deuxième client.
5. **Prévenir au lieu de demander** — avant quelques centaines de boîtiers.
6. **Le volume** — avant quelques milliers de cartes.

Les étages 3 et 4 se font **ensemble** : une boutique sans clé par boîtier
est une boutique qui peut lire les autres.
