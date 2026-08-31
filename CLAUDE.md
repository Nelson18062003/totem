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
- **Un SMS mal compris** vaut mieux qu'un SMS mal interprété : `analyse_sms.py`
  renvoie `None` dans le doute, et n'invente jamais un montant.
