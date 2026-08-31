# Consignes de travail sur TOTEM

## Avant toute pull request

Dans cet ordre, **sans exception** :

1. **Aller voir `main`.** `git fetch origin main`, puis regarder où il en est.
2. **Lire ce qui s'y est passé** depuis la dernière fois : les commits, les
   fichiers touchés, ce que ça change pour le travail en cours.
3. **Vérifier les conflits.** Quels fichiers sont modifiés des deux côtés ?
   Rebaser, puis **relire le résultat** — un rebase « réussi » peut très bien
   avoir avalé un des deux côtés sans rien signaler.
4. **Regarder les pull requests** : lesquelles sont ouvertes, lesquelles ont
   été fusionnées, à quel niveau on se trouve.
5. **Rejouer les vérifications à ce niveau-là** : les tests, la compilation.
   Le compte de tests d'il y a une heure ne vaut plus rien.

**Seulement ensuite, créer la pull request.**

Une PR ouverte avant cette vérification est à refaire : elle décrit un état du
dépôt qui n'existe plus. La fermer et en ouvrir une propre, sur une base
vérifiée.

## Le dépôt parle français

Code, commentaires, noms de fonctions, messages de commit, documentation,
descriptions de PR : tout est en français.

On nomme **l'objet, pas la technique**. « Le robot » plutôt que « le daemon ».
« Le terminal est actif » plutôt que « heartbeat OK ». Le propriétaire n'est
pas informaticien.

## Branche de travail

Développer sur la branche indiquée par la session. Ne jamais pousser sur une
autre branche sans autorisation explicite.

## Vérifier avant d'annoncer

```sh
python3 -m unittest discover -s tests     # la batterie complète
cd web && npx next build                  # l'application web
cd web && npm test                        # les règles partagées (noyau)
node recus/maquette.mjs                   # les reçus PDF
python3 brand/generer.py                  # les fichiers de la marque
python3 outils/attaquer-le-lecteur.py     # le lecteur de SMS, attaqué
cd web && node scripts/verifier-le-verrou.mjs   # le verrou, vraiment attaqué
cd web && node scripts/verifier-les-comptes.mjs # les comptes, vraiment essayés
cd web && node scripts/verifier-le-parcours.mjs # une opération, jouée en entier
cd web && node scripts/verifier-le-bilan.mjs    # le bilan comptable, sur des mois
cd web && node scripts/verifier-la-politique.mjs # rien d'étranger ne s'exécute
sh sql/verifier-les-regles.sh                   # les règles de la BASE, exécutées
cd mobile && npx tsc --noEmit                   # l'application du téléphone
cd mobile && node scripts/verifier-le-clavier.mjs # le clavier ne cache rien
cd mobile && node scripts/verifier-les-ecrans.mjs # la panne se dit partout
cd mobile && node scripts/verifier-le-paquet.mjs # ce que l'application emporte
cd mobile && node scripts/verifier-les-formats.mjs /tmp/apercu # huit écrans
#   (l'export doit porter EXPO_PUBLIC_APERCU=1 — voir l'en-tête du script)
```

`verifier-le-verrou` lance un vrai serveur et essaie d'entrer : sans jeton,
avec un jeton forgé, avec une échéance repoussée. « Ça compile » ne dit rien
d'un verrou. À relancer dès qu'on touche au middleware, aux sessions ou au
frein.

`attaquer-le-lecteur` envoie au lecteur de SMS des dizaines de milliers de
messages qu'on n'a PAS imaginés — de vrais SMS d'opérateurs, mutés — et
vérifie ses quatre promesses : il ne lève jamais, il n'invente ni montant ni
solde, il range toujours dans une catégorie connue. C'est la surface la plus
exposée de TOTEM : quiconque connaît le numéro de la SIM peut lui écrire, et
ce qu'il écrit décide de ce qui entre au bilan. Le harnais a trouvé du premier
coup ce qu'aucun test n'avait vu : « Depot de 5٥٠٠٠0000 FCFA » se lisait
550 000 000 FCFA, parce que Python voit un chiffre dans « ٥ » comme dans « 5 »
— et le SMS s'affichant tel qu'il est arrivé, l'écart était invisible.

`verifier-les-comptes` déroule la vie entière d'un compte contre un vrai
serveur : la première inscription (celle du propriétaire), une deuxième qui
doit attendre, l'approbation, la fermeture, la clé de secours. Il cherche
surtout à prendre en défaut — un compte non approuvé qui entrerait, un invité
qui administrerait, un message qui dirait si un courriel a un compte ici.

Il lance aussi TROIS inscriptions ENSEMBLE sur une plateforme neuve. Elles
donnaient trois propriétaires : la plateforme comptait les comptes, voyait
zéro, puis créait — et entre les deux il s'écoule un aller-retour vers la base
plus le calcul de l'empreinte, lent à dessein. **Une vérification faite avant
une écriture ne garantit rien** : entre les deux, quelqu'un a pu écrire. Seule
tient une règle que la BASE fait respecter au moment de l'écriture (ici,
l'index `utilisateurs_un_seul_proprietaire`). Le faux nuage a dû apprendre la
règle pour que le harnais puisse voir la course.

`verifier-le-parcours` déroule ce que le propriétaire FAIT : il se connecte,
compose un code complet, le réseau réclame le code secret, il le tape. Le
harnais écoute alors CE QUI PART SUR LE RÉSEAU — pas seulement l'écran — et
exige cinq choses : le pavé s'ouvre, le code ne s'affiche jamais en clair, il
part avec son drapeau « secret » (sans quoi le robot ne l'efface pas de la
base), l'ouverture porte une clé d'intention (sans quoi un geste rejoué
composerait le transfert deux fois), et quitter l'écran raccroche la session.
Il RECOMPILE avant de mesurer : `next start` sert « .next », pas le disque —
sans cela le parcours passerait en vert contre du code d'hier.

`verifier-le-bilan` sème quatre mois de caisse dans le faux nuage — 2 400
encaissements — et redemande le bilan CSV. C'est le seul chiffre de TOTEM qui
SORT de TOTEM : il part chez un comptable, il se rapproche d'un solde, il
justifie un impôt. Un écran faux se corrige au rechargement suivant ; un bilan
faux est déjà dans un classeur. Il exige que « la semaine » du fichier soit
exactement les jours du graphe, qu'un trimestre demandé rende un trimestre, et
que le fichier DISE quand il est coupé. Pour qu'il puisse prendre en défaut, le
faux nuage a d'abord dû apprendre à mentir comme la vraie base : il rendait le
total APRÈS avoir appliqué la limite — « mille lignes sur mille » quand elle en
avait deux mille quatre cents.

`verifier-la-politique` ouvre un vrai Chromium et GLISSE un script dans le
HTML de la page, comme le ferait un nom d'expéditeur piégé. Une politique de
contenu se lit très bien et ne prouve rien : elle peut être parfaite et la
page ne plus s'afficher, ou avoir l'air stricte et ne rien bloquer. Le premier
essai écrit ici posait le script avec `document.createElement` : il s'est
exécuté alors que l'en-tête était juste. Ce n'était pas la politique qui
cédait — « strict-dynamic » autorise délibérément un script créé par du code
déjà en confiance, c'est ainsi que Next charge ses morceaux. Il fallait
l'injecter là où une vraie faille l'injecte : dans le HTML, pour que
l'analyseur de la page le rencontre.

`verifier-les-regles.sh` monte un PostgreSQL neuf, y joue le schéma et TOUTES
les migrations dans l'ordre, puis attaque : il essaie vraiment de créer un
second propriétaire, de promouvoir un invité, d'effacer le propriétaire, de
déposer deux fois la même intention. Les règles les plus importantes de TOTEM
ne sont pas dans le code — ce sont des index et des déclencheurs — et elles
n'avaient jamais été EXÉCUTÉES : tous les autres harnais parlent au faux
nuage, une imitation écrite ici même, qui ne peut pas prendre en défaut du SQL
qu'elle n'exécute pas. Retirer l'index du propriétaire unique fait échouer la
migration elle-même, qui refuse de se déclarer en place.

**Un contrôle qui passe sans rien regarder est pire que pas de contrôle : il
rassure.** Le harnais des formats a mesuré l'écran de connexion aux huit
tailles, en vert, sans jamais voir un écran de l'application — la session ne
pouvait pas se ranger sur un export web de production. Il vérifie maintenant
qu'il est bien connecté ET que la boîte de réception montre un SMS connu,
sans quoi il s'arrête en montrant ce qu'il avait sous les yeux.

**Ces scripts refusent de démarrer si leur port est déjà pris.** Ce n'est pas
un caprice : un essai précédent resté ouvert a déjà fait passer toute une
batterie, en vert, contre du vieux code. Un harnais qui peut mesurer autre
chose que ce qu'on lui donne ne sert à rien.

Une mise à jour à distance arrive sur des téléphones EN SERVICE, en quelques
secondes, sans que personne ne l'installe ni ne la relise. Un écran cassé
poussé ainsi est cassé partout, tout de suite : la batterie se lance AVANT de
publier, jamais après.

`verifier-le-paquet` compile le paquet Android et regarde ce qu'il y a
DEDANS : le noyau partagé doit y être, aucun secret ne doit y être. Une
application installée se démonte — tout ce qui entre dans ce fichier est
public, pour toujours. À relancer avant toute compilation destinée au
magasin.

Ne jamais annoncer qu'une chose fonctionne sans l'avoir lancée. Si un test
échoue, le dire avec sa sortie.

## Ce qui ne s'improvise pas

- **Le symbole de la marque** est décrit une seule fois, dans
  `brand/generer.py`. Tout le reste en découle. Voir `docs/IDENTITE.md`.
- **Le code PIN** n'est jamais stocké, jamais écrit dans un message, jamais
  journalisé autrement que `****`.
- **Un SMS appartient au propriétaire, codes compris** — il se lit ENTIER
  dans son chat privé, sur la plateforme, au journal. Mais un GROUPE Telegram
  n'est pas le propriétaire : ce qui y part est lu par tous ses membres, et le
  robot y annonçait chaque SMS tout seul, « Votre code de confirmation est
  483921 » compris. Vers un groupe, ou vers l'écran verrouillé d'un téléphone,
  les chiffres du code s'en vont (`masquer_le_code`) — et rien d'autre.
- **Un SMS mal compris** vaut mieux qu'un SMS mal interprété : `analyse_sms.py`
  renvoie `None` dans le doute, et n'invente jamais un montant.
