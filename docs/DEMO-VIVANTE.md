# La démo vivante : TOTEM pour de faux, en entier

> Des testeurs se connectent au VRAI TOTEM (le site, l'application du
> téléphone) avec un compte de démo. Ils y ont leurs cartes MTN et Orange —
> fausses —, de l'argent — faux —, et ils font tout ce qu'on fait avec TOTEM :
> dépôts, retraits, transferts, soldes, SMS, reçus. Un administrateur de la
> démo crée les comptes et fabrique les francs. Et l'argent de démo peut
> entrer chez Glisil (XAFe) et en ressortir, comme le vrai.
>
> **La maison réelle n'en voit rien, et la démo ne voit rien de la maison.**

---

## 1. Ce qui existe déjà, et pourquoi ce n'est pas assez

La **vitrine** (`lib/demonstration.ts`) est le compte des examinateurs d'Apple
et de Google : un seul compte, des identifiants publics, un jeu de données
inventé en mémoire, et des opérations « jouées » qui ne bougent rien. Elle
montre l'application ; on ne peut pas s'en SERVIR. Elle reste telle quelle.

La démo vivante est autre chose : des comptes personnels, des soldes qui
bougent, des SMS qui arrivent, de l'argent qui passe d'un testeur à l'autre.

## 2. Le principe : un monde à part, dans la même base

Chaque table où vit l'argent a son **double** : `demo_cartes`, `demo_comptes`,
`demo_paiements`, `demo_commandes`, `demo_utilisateurs`, `demo_attributions`…
Mêmes colonnes, mêmes index (`create table … (like … including all)`).

Un compte de démo ouvre une session dont le sujet est `d:<numéro>` (un vrai
compte : `c:<numéro>`). **Toute lecture et toute écriture faite pendant une
requête `d:` va dans les doubles** : c'est le point d'accès unique à la base
(`lib/serveur.ts`) qui choisit la table, d'après la session de la requête.

Pourquoi ainsi, et pas « un drapeau démo sur les vraies lignes » :

- **Il n'y a pas de filtre à oublier.** Avec un drapeau, chaque écran, chaque
  export, chaque notification du propriétaire devrait écarter les lignes de
  démo — et le jour où l'un l'oublie, le bilan comptable de Bonzini porte de
  faux millions. Ici, le propriétaire ne lit jamais une table de démo, et un
  testeur ne lit jamais une vraie table. C'est la même leçon que la vitrine :
  « pas de filtre à oublier, puisqu'il n'y a pas de requête ».
- **Le vrai boîtier ne voit jamais une demande de démo** : il relève
  `commandes`, la démo écrit dans `demo_commandes`.
- **Tous les écrans marchent sans être réécrits** : ils lisent `cartes`,
  `paiements`… et la plateforme sert les doubles.

Ce qui ne passe PAS dans le monde de démo, et refuse : la console, le journal
du boîtier (`lib/base.ts`) — ils ne parlent que de la maison réelle.

## 3. Les rôles

| Qui | Dans le monde de démo |
|---|---|
| **L'administrateur de la démo** | le « propriétaire » du monde de démo : il voit toutes les cartes de démo, crée les comptes des testeurs, **fabrique des francs** sur n'importe quelle carte, tient les cartes de la trésorerie de test de Glisil. Créé une fois par le vrai propriétaire. |
| **Un testeur** | reçoit à sa création deux cartes, une MTN et une Orange, à son nom, avec un numéro de démo. Il y travaille comme sur des vraies. |

Les cartes de démo ne peuvent être celles de personne : leur ICCID porte
l'émetteur « 99 » (`89 237 99…`), qu'aucun opérateur camerounais n'a, et leur
numéro commence par **600**, une tranche que personne n'attribue (600 0x xx xx
pour MTN, 600 9x xx xx pour Orange).

Le vrai propriétaire de TOTEM n'est PAS l'administrateur de la démo : ce sont
deux comptes, deux mots de passe. Mélanger les deux, c'est risquer un geste
réel dans un écran qu'on croyait de démo.

## 4. Le faux réseau : ce qui remplace l'opérateur et le boîtier

Une opération faite sur une carte de démo ne part chez aucun boîtier : la
plateforme la joue tout de suite, dans la base (`demo_jouer`), comme le ferait
le réseau.

- **Les menus** imitent MTN (`*126#`) et Orange (`#150#`) : transfert,
  dépôt, retrait, solde. L'écran de TOTEM les déroule comme les vrais —
  numéro, montant, écran de confirmation, code secret.
- **Le code secret de démo est 1234** pour toutes les cartes de démo. Il
  n'est écrit nulle part (règle de TOTEM : un code ne se garde pas) ; il est
  comparé, puis effacé de la demande comme un vrai.
- **L'argent bouge pour de vrai, entre cartes de démo** : le solde de
  l'envoyeur baisse, celui du destinataire monte, dans la même écriture,
  lignes verrouillées (pas de double dépense). Un numéro qui n'est pas une
  carte de démo est refusé : la démo ne peut payer personne de réel.
- **Les SMS arrivent** : chaque mouvement écrit le SMS de l'opérateur des deux
  côtés, au format MTN ou Orange, avec la référence, le montant, le nom, le
  nouveau solde. Ils apparaissent dans la boîte de réception, les paiements,
  le bilan, le relevé de la carte.

## 5. Fabriquer des francs

L'administrateur choisit une carte et un montant : la carte reçoit un SMS
« Vous avez reçu … de BANQUE DÉMO », et son solde monte. C'est la seule source
d'argent de la démo ; tout le reste est un mouvement entre cartes. La somme
fabriquée est tenue dans un registre (`demo_emissions`) : à tout instant,
**la somme des soldes de démo égale la somme fabriquée** — c'est la parité de
la démo, et le harnais la vérifie.

## 6. Le pont vers Glisil (XAFe)

Les floats de test de Glisil sont des **cartes de démo de l'administrateur**,
déclarées « float XAFe ». Quand un testeur veut des XAFe :

1. Glisil lui montre le numéro du float de test ;
2. dans TOTEM démo, il fait un transfert vers ce numéro ;
3. la carte du float reçoit le SMS, et la plateforme le dépose chez Glisil
   par la même porte que le vrai boîtier (signée, ligne par ligne) — Glisil
   crédite des XAFe, frappés sur la blockchain de test ;
4. pour sortir, Glisil demande le remboursement ; l'administrateur paie
   depuis la carte du float (un transfert de démo) et tape le transaction
   ID dans l'administration de Glisil, comme pour de vrai.

La trésorerie de test de Glisil, c'est donc le solde des cartes de float de
l'administrateur.

**Le SMS part au moment du geste.** Chaque étape jouée par le faux réseau
vide aussitôt la file vers Glisil (`jouerDansLaDemo`), comme le vrai boîtier
pousse un SMS dès qu'il l'a lu. La première version ne la vidait que lorsque
l'administrateur ouvrait son écran ou fabriquait des francs : le premier
dépôt d'un vrai testeur est resté « SMS pas encore lu » chez Glisil. Le
harnais ne l'avait pas vu, parce qu'il visitait lui-même l'écran de
l'administrateur en attendant le SMS — il amenait ce qu'il vérifiait. Il
attend maintenant sans personne, et l'ancien code y échoue.

## 7. Ce qui est vérifié

- `sql/verifier-les-regles.sh` : chaque double a exactement les colonnes de
  sa table ; un virement ne fait jamais de solde négatif, même en rafale ;
  la somme des soldes égale la somme fabriquée ; un numéro hors démo est
  refusé ; le code faux ne paie rien ; une seule fois par demande.
- `web/scripts/verifier-la-demo-vivante.mjs` — contre un VRAI PostgreSQL
  (schéma et toutes les migrations) derrière un VRAI PostgREST, la vraie
  plateforme compilée devant : un testeur ne voit AUCUNE vraie carte, aucun
  vrai SMS, ni la console ; le propriétaire ne voit AUCUNE carte de démo ; un
  transfert entre deux testeurs, joué par l'écran, arrive chez l'autre avec
  son SMS ; le vrai boîtier ne reçoit aucune demande ; le SMS d'un float part
  chez un faux Glisil qui vérifie la signature. Le faux nuage ne pouvait pas
  le faire : la démo vit dans du PL/pgSQL, qu'une imitation n'exécute pas.
  Son témoin — la redirection des tables retirée — le fait échouer trente
  fois, et montre ce qu'on craignait : l'administrateur de la démo écrit dans
  la VRAIE table des comptes.

### Comment la plateforme choisit le monde

`lib/monde.ts`. Le monde se déduit du jeton de session, **vérifié** — jamais
d'un en-tête ou d'un paramètre : `d:` est la démo, tout le reste la maison.
Chaque appel à la base passe par `appeler` (`lib/serveur.ts`), qui récrit la
table : dans la démo, `paiements` devient `demo_paiements`. Une table sans
double y est **refusée**, pas lue dans la maison ; la maison, elle, ne touche
jamais une table `demo_…`. Le seul passage d'un monde à l'autre est
`dansLaDemoVivante` / `dansLaMaison`, qu'empruntent la connexion (qui cherche
le courriel dans les deux, ENSEMBLE, pour que la durée ne dise rien) et la
création de l'administrateur.

**Les reçus PDF existent dans la démo**, comme dans la vraie vie. Sans boîtier
pour les fabriquer, c'est la PLATEFORME qui les dessine, à l'ouverture, depuis
la ligne du paiement : `web/lib/recu-pdf.ts` transcrit `totem/recu.py` règle
pour règle, et `tests/test_recu_de_la_plateforme.py` compare les deux au pixel
près (six reçus, MTN et Orange, deux langues, un témoin qui doit voir un franc
de différence). La base n'en garde que la fiche (`demo_recus`) : chaque SMS
d'argent naît avec la sienne, et « Établir le reçu » répond « prêt » tout de
suite (`migrations/20261020_demo_recus.sql`). Le lien de partage du téléphone
porte son monde : sa signature est d'un autre genre (`recu-demo`), un lien de
la maison ne s'y réécrit pas, et l'inverse non plus.

Ce qui ne marche PAS dans la démo, et le dit : le nom appris d'une carte, les
boutons appris (`raccourci`), les liens signés des coordonnées et du bilan (un
lien s'ouvre sans session, donc dans la maison, où la carte de démo n'existe
pas — le harnais vérifie qu'il n'y montre rien).

`DEMO_VIVANTE=non` ferme tout : plus personne n'entre, et les jetons déjà
émis tombent dans le middleware.

## 8. Mettre en service

1. Jouer `migrations/20261019_demo_vivante.sql`, puis
   `migrations/20261020_demo_recus.sql`, dans l'éditeur SQL de Supabase
   (comme les autres migrations).
2. Réglages → **La démo vivante** → **Créer l'administrateur de la démo**
   (prénom, nom, courriel, mot de passe — un compte à part, jamais le vôtre).
   Puis se connecter avec ce compte.
3. Réglages → Qui peut se connecter → **Créer un compte** pour chaque testeur :
   ses deux cartes naissent avec lui.
4. Réglages → La démo vivante → sur une carte, **Fabriquer**.
5. Pour Glisil : sur le même écran, déclarer deux cartes de l'administrateur
   « float Glisil » ; inscrire chez Glisil le terminal `totem-demo` et ses
   deux numéros comme floats de test ; poser sur Vercel :
   - `XAFE_DEMO_URL` — l'adresse du projet Supabase de Glisil ;
   - `XAFE_DEMO_CLE` — la clé du terminal `totem-demo` chez Glisil ;
   - `XAFE_DEMO_ANON` — la clé publique de ce projet, si sa passerelle
     l'exige.
   Sans elles, la file attend : rien ne se perd, rien ne part.

Le code secret de toutes les cartes de démo est **1234** ; l'écran de
l'administrateur le rappelle.
