# Ce que vous avez à faire, vous

Le code de la phase 0 est écrit, testé et poussé. Il ne devient réel que
lorsque trois gestes sont faits sur vos comptes — la base et Vercel — et ces
gestes-là, je ne peux pas les faire à votre place : je n'ai accès ni à votre
projet Supabase, ni à vos variables Vercel.

**Faites-les dans cet ordre.** Le deuxième sans le premier casse le site.

---

## 1 · Dérouler les migrations dans Supabase — dix minutes

Sans elles, les tables `personnes`, `sessions`, `commerces`, `acces`,
`invitations`, `preuves` et `entrees` n'existent pas, et **plus personne ne
peut se connecter** : la garde cherche une session en base et n'en trouve
aucune.

**Trois fichiers, dans cet ordre.** Pour chacun :

1. Supabase → votre projet → **SQL Editor** → **New query**.
2. Coller **tout** le contenu du fichier.
3. **Run**.
4. Relancer une seconde fois : il ne doit y avoir aucune erreur. Les fichiers
   sont rejouables, et cette seconde exécution est la façon de le vérifier.

| Ordre | Fichier | Ce qu'il apporte |
|---|---|---|
| 1 | `sql/migration-identite.sql` | les personnes, les accès, les invitations, les sessions |
| 2 | `sql/migration-code-entree.sql` | les six chiffres envoyés par mail |
| 3 | `sql/migration-cles.sql` | entrer avec le verrouillage du téléphone |

> **Si vous aviez déjà lancé le premier fichier avant le 8 août**, il visait un
> numéro de téléphone là où il vise maintenant une adresse mail. Le relancer
> **renomme** la colonne au lieu d'en créer une seconde : rien à faire de
> particulier, et rien ne se perd. C'est vérifié sur un vrai PostgreSQL —
> `tests/test_sql_execute.py`.

Ce que ça touche à vos données existantes : **rien**. Aucune table n'est
modifiée, sauf `commandes` qui reçoit deux colonnes vides (`demandee_par`,
`commerce`). J'ai déroulé exactement ce chemin sur un PostgreSQL 16 avec un
terminal, une carte et une commande dedans — les trois lignes étaient
intactes après. C'est `tests/test_sql_execute.py`, il tourne à chaque batterie.

---

## 2 · Poser les variables sur Vercel — deux minutes

Settings → **Environment Variables**, puis **redéployer**.

| Variable | Ce que c'est | Obligatoire ? |
|---|---|---|
| `SESSION_SECRET` | une longue phrase au hasard, différente par environnement | **oui, sinon 503** |
| `TOTEM_PROPRIETAIRE` | votre nom dans le journal (« Nelson ») | non, mais utile |
| `TOTEM_ORIGINE` | l'adresse exacte du site, `https://…` sans barre finale | non, mais recommandée |

`TOTEM_ORIGINE` sert au verrouillage du téléphone : c'est l'adresse pour
laquelle le téléphone accepte de signer, et c'est ce qui rend un faux site
inopérant. Sans elle, TOTEM la déduit de l'adresse servie, ce qui marche —
mais la figer coûte une ligne et ferme la question.

**Le changement important, et il peut vous surprendre :** `SESSION_SECRET`
était facultative. Sans elle, le site s'ouvrait à tout le monde — pratique en
développement, et une porte en production. Un aperçu Vercel déployé sans cette
variable servait la comptabilité complète à qui devinait l'adresse.

Maintenant, **sans elle, le site répond 503** et affiche le nom de la variable
qui manque. Si vous voyez ce message après déploiement, c'est exactement ça, et
c'est réparable en une minute.

Posez-la **sur chaque environnement**, aperçus compris, et avec une **valeur
différente à chaque fois** : un secret partagé entre préproduction et
production ferait qu'un jeton signé sur l'une ouvrirait l'autre.

---

## 3 · Vous reconnecter — trente secondes

Votre session actuelle ne vaut plus rien : l'ancien jeton n'a pas la forme du
nouveau. Vous serez renvoyé à l'écran de connexion, vous entrerez le même
`TOTEM_MOT_DE_PASSE` qu'avant, et cette fois une ligne apparaîtra dans
`personnes` et une dans `sessions`.

À partir de là, chaque commande déposée portera votre numéro dans
`demandee_par`. Le journal cesse de dire « quelqu'un ».

---

## Ce qui change dans votre usage quotidien

**Vous vous reconnecterez une fois par jour.** La session passe de trente
jours à douze heures. Le NIST demande une nouvelle preuve au moins une fois par
jour au niveau AAL2 (SP 800-63B-4 §5.2), et trente jours plaçaient la
plateforme en dessous. C'est le seul inconfort de cette phase, et il est
assumé.

**Le reste ne bouge pas.** Le guichet, la console USSD, les encaissements, les
reçus, les réglages : tout fonctionne comme avant, avec les mêmes gestes.

> J'ai bien failli casser cela. En donnant au compte fondateur le rôle
> « admin » — au motif, juste en soi, qu'un administrateur ne doit pas déplacer
> d'argent — le guichet, la console USSD et les six genres de commande vous
> devenaient interdits. La plateforme se verrouillait pour la seule personne
> qui s'en sert. C'est corrigé, et `tests/test_acces_reel.py` vérifie
> désormais que le compte ouvert par le mot de passe atteint chaque écran et
> chaque commande.

---

## Ce qui n'est PAS encore opérationnel, et qu'il ne faut pas attendre

La phase 0 pose les fondations. Rien de ce qui suit n'existe encore à l'écran :

- **Inviter quelqu'un.** L'écran qui MONTRE l'invitation existe désormais
  (`/invitation/…`), mais celui qui vous permet d'en CRÉER une n'est pas
  encore là. C'est la suite de la phase 1.
- **Entrer avec votre doigt.** Le bouton est sur l'écran de connexion et il
  marche ; mais tant que vous entrez par `TOTEM_MOT_DE_PASSE`, l'écran qui
  vous propose de poser votre clé n'est pas encore accroché aux réglages.
  Le mécanisme est là, le geste pour l'installer vient juste après.
- **Voir vos appareils connectés, en fermer un.** Le registre existe et
  fonctionne ; l'écran qui le montre est en phase 2.
- **Les rôles au comptoir.** Tant qu'aucun `acces` n'est posé en base, tout le
  monde qui entre par le mot de passe est propriétaire. Les rôles ne mordent
  qu'à partir du moment où il y a plusieurs personnes.
- **Les 25 écrans dessinés.** Zéro est en service. La phase 0 n'a rien changé
  à ce que vous voyez, et c'est normal : c'est le seul moment du chantier où
  ça l'est.

---

## Trois choses que je ne peux pas régler, et que vous devez savoir

**Le code PIN traverse Internet.** Il passe en clair dans
`commandes.parametres` jusqu'à ce que le Pi le relève, une à trois secondes
plus tard. Le robot l'efface aussitôt, mais il aura traversé Vercel et
Supabase. La promesse « TOTEM ne demande jamais le PIN » est vraie au sens
« ne le stocke pas », fausse au sens du trajet. Le vrai remède est le SIM
Toolkit (`docs/USSD-OU-STK.md`), et c'est un chantier à part entière.

**La clé de service contourne les règles de la base.** Tant qu'elle est là,
les politiques de `sql/schema.sql` sont une protection en profondeur, pas la
protection principale — c'est l'application qui filtre. Le remplacement par la
clé publique est écrit dans `docs/PLAN-MISE-EN-OEUVRE.md`.

**Vous êtes seul.** Chaque recours humain du catalogue des cas limites pointe
vers vous, en France. Hôpital, avion, deuil — et pendant ce temps, aucune
invitation, aucune révocation, aucune succession débloquée, pour toute la
flotte. Ce n'est pas un problème d'écran : il faut un second
super-administrateur, et le décider est une décision, pas une tâche.
