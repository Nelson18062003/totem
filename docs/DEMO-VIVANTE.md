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

## 7. Ce qui est vérifié

- `sql/verifier-les-regles.sh` : chaque double a exactement les colonnes de
  sa table ; un virement ne fait jamais de solde négatif, même en rafale ;
  la somme des soldes égale la somme fabriquée ; un numéro hors démo est
  refusé ; le code faux ne paie rien ; une seule fois par demande.
- `web/scripts/verifier-la-demo-vivante.mjs` : un testeur ne voit AUCUNE
  vraie carte, aucun vrai SMS, ni la console ; le propriétaire ne voit AUCUNE
  carte de démo ; un transfert entre deux testeurs, joué par l'écran, arrive
  chez l'autre avec son SMS ; le vrai boîtier ne reçoit aucune demande.

## 8. Mettre en service

1. Jouer `migrations/20261019_demo_vivante.sql` dans l'éditeur SQL de
   Supabase (comme les autres migrations).
2. Console → Démo → **Créer l'administrateur de la démo** (courriel, mot de
   passe). Puis se connecter avec ce compte.
3. Réglages → Qui peut se connecter → **Créer un compte** pour chaque testeur :
   ses deux cartes naissent avec lui.
4. Sur une carte, **Fabriquer des francs**.
5. Pour Glisil : déclarer deux cartes de l'administrateur « float XAFe »,
   inscrire le terminal `totem-demo` chez Glisil (sa clé dans
   `XAFE_DEMO_CLE` sur Vercel), et ses deux numéros comme floats de test.
